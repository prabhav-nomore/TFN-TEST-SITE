import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { readDB, writeDB, Database, supabase } from '../db.js';
import { notifyAdmin, notifyTeam } from '../socket.js';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Middleware to verify JWT
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = decoded;
    next();
  });
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Auth Routes
router.post('/auth/login', async (req, res) => {
  const { teamId, password } = req.body;
  
  try {
    const { data: team, error } = await supabase
      .from('teams')
      .select('*')
      .eq('team_id', teamId)
      .single();

    if (error || !team) return res.status(401).json({ error: 'Invalid credentials' });
    if (team.is_banned) return res.status(403).json({ error: 'Team is disqualified' });

    const isValid = await bcrypt.compare(password, team.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ teamId, role: 'team' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, teamId, teamName: team.team_name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/admin-login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'ADMIN' && password === 'admin123') {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
  }
});

// Team Routes
router.get('/team/status', authenticate, async (req: any, res: any) => {
  const teamId = req.user.teamId;
  
  try {
    let { data: assignment } = await supabase
      .from('assignments')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .maybeSingle();

    let { data: lifeline } = await supabase
      .from('lifelines')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();

    if (!lifeline) {
      const { data: newLifeline } = await supabase
        .from('lifelines')
        .insert([{ team_id: teamId, lifeline_remaining: 3, lifeline_used: 0 }])
        .select()
        .single();
      lifeline = newLifeline;
    }

    // If no active assignment, assign a random puzzle
    if (!assignment) {
      const { data: completedSubmissions } = await supabase
        .from('submissions')
        .select('puzzle_id')
        .eq('team_id', teamId)
        .eq('result', 'correct');

      const completedPuzzles = completedSubmissions?.map(s => s.puzzle_id) || [];
      
      let query = supabase.from('puzzles').select('*');
      if (completedPuzzles.length > 0) {
        query = query.not('puzzle_id', 'in', `(${completedPuzzles.join(',')})`);
      }
      
      const { data: availablePuzzles } = await query;
      
      if (availablePuzzles && availablePuzzles.length > 0) {
        const randomPuzzle = availablePuzzles[Math.floor(Math.random() * availablePuzzles.length)];
        assignment = {
          team_id: teamId,
          puzzle_id: randomPuzzle.puzzle_id,
          start_time: Date.now(),
          status: 'active'
        };
        
        const { data: newAssignment, error } = await supabase
          .from('assignments')
          .insert([assignment])
          .select()
          .single();
          
        if (!error && newAssignment) {
          assignment = newAssignment;
          notifyAdmin('assignment_created', assignment);
        }
      }
    }

    if (assignment) {
      const { data: puzzle } = await supabase
        .from('puzzles')
        .select('puzzle_id, puzzle_text, reference_type')
        .eq('puzzle_id', assignment.puzzle_id)
        .single();
        
      res.json({
        assignment,
        puzzle,
        lifeline,
        serverNow: Date.now()
      });
    } else {
      res.json({ message: 'No more puzzles available', completed: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/team/submit', authenticate, async (req: any, res: any) => {
  const { answer } = req.body;
  const teamId = req.user.teamId;
  
  try {
    const { data: assignment } = await supabase
      .from('assignments')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .single();

    if (!assignment) return res.status(400).json({ error: 'No active puzzle' });

    const { data: puzzle } = await supabase
      .from('puzzles')
      .select('*')
      .eq('puzzle_id', assignment.puzzle_id)
      .single();

    if (!puzzle) return res.status(400).json({ error: 'Puzzle not found' });

    let isCorrect = false;
    let output = '';

    if (puzzle.reference_type === 'python' || puzzle.reference_type === 'javascript') {
      // Execute code
      const tempDir = path.join(__dirname, '../../temp', teamId);
      await fs.ensureDir(tempDir);
      const ext = puzzle.reference_type === 'python' ? '.py' : '.js';
      const filePath = path.join(tempDir, `submission${ext}`);
      await fs.writeFile(filePath, answer);

      try {
        const cmd = puzzle.reference_type === 'python' ? `python3 ${filePath}` : `node ${filePath}`;
        const { stdout } = await execAsync(cmd, { timeout: 5000 });
        output = stdout.trim();
        isCorrect = output === puzzle.correct_answer;
      } catch (err: any) {
        output = err.stderr || err.message;
        isCorrect = false;
      } finally {
        await fs.remove(tempDir);
      }
    } else {
      isCorrect = puzzle.correct_answer.toLowerCase() === answer.toLowerCase().trim();
    }

    const submission = {
      team_id: teamId,
      puzzle_id: assignment.puzzle_id,
      answer_submitted: answer,
      timestamp: Date.now(),
      result: isCorrect ? 'correct' : 'incorrect' as 'correct' | 'incorrect'
    };

    await supabase.from('submissions').insert([submission]);
    
    if (isCorrect) {
      await supabase
        .from('assignments')
        .update({ status: 'completed' })
        .eq('id', assignment.id);
    }

    notifyAdmin('submission', submission);

    res.json({ correct: isCorrect, output: puzzle.reference_type !== 'text' ? output : undefined });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/team/lifeline', authenticate, async (req: any, res: any) => {
  const teamId = req.user.teamId;
  
  try {
    let { data: lifeline } = await supabase
      .from('lifelines')
      .select('*')
      .eq('team_id', teamId)
      .maybeSingle();

    if (!lifeline) {
      const { data: newLifeline } = await supabase
        .from('lifelines')
        .insert([{ team_id: teamId, lifeline_remaining: 3, lifeline_used: 0 }])
        .select()
        .single();
      lifeline = newLifeline;
    }

    if (lifeline && lifeline.lifeline_remaining > 0) {
      await supabase
        .from('lifelines')
        .update({
          lifeline_remaining: lifeline.lifeline_remaining - 1,
          lifeline_used: lifeline.lifeline_used + 1
        })
        .eq('team_id', teamId);
        
      notifyAdmin('lifeline_used', { teamId, remaining: lifeline.lifeline_remaining - 1 });
      res.json({ success: true, remaining: lifeline.lifeline_remaining - 1 });
    } else {
      res.status(400).json({ error: 'No lifelines remaining' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/team/violation', authenticate, async (req: any, res: any) => {
  const teamId = req.user.teamId;
  const { type } = req.body;
  
  try {
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    let isBanned = team?.is_banned;

    if (team && !isBanned && (type === 'tab_switch' || type === 'exited_fullscreen' || type === 'tab_closed')) {
      isBanned = true;
      await supabase
        .from('teams')
        .update({ is_banned: true })
        .eq('team_id', teamId);
    }

    notifyAdmin('violation', { teamId, type, timestamp: Date.now() });
    
    if (isBanned) {
      notifyTeam(teamId, 'banned', { reason: type });
    }

    res.json({ success: true, banned: isBanned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Routes
router.post('/admin/team/register', authenticate, isAdmin, async (req, res) => {
  const { teamId, teamName, password } = req.body;
  if (!teamId || !teamName || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from('teams').insert([{
      team_id: teamId,
      team_name: teamName,
      password_hash,
      is_banned: false
    }]);

    if (error) throw error;

    // Initialize lifelines
    await supabase.from('lifelines').insert([{
      team_id: teamId,
      lifeline_remaining: 3,
      lifeline_used: 0
    }]);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/overview', authenticate, isAdmin, async (req, res) => {
  const db = await readDB();
  res.json(db);
});

router.get('/admin/leaderboard', authenticate, isAdmin, async (req, res) => {
  const db = await readDB();
  const leaderboard = db.teams.map(team => {
    const correctSubmissions = db.submissions.filter(s => s.team_id === team.team_id && s.result === 'correct');
    return {
      team_id: team.team_id,
      team_name: team.team_name,
      score: correctSubmissions.length,
      is_banned: team.is_banned || false
    };
  }).sort((a, b) => b.score - a.score);
  
  res.json(leaderboard);
});

router.post('/admin/team/:teamId/skip', authenticate, isAdmin, async (req, res) => {
  const { teamId } = req.params;
  
  try {
    const { data: assignment } = await supabase
      .from('assignments')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .single();
    
    if (assignment) {
      await supabase
        .from('assignments')
        .update({ status: 'expired' })
        .eq('id', assignment.id);
        
      notifyTeam(teamId, 'puzzle_skipped', { puzzleId: assignment.puzzle_id });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'No active assignment' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/team/:teamId/unban', authenticate, isAdmin, async (req, res) => {
  const { teamId } = req.params;
  
  try {
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    if (team) {
      await supabase
        .from('teams')
        .update({ is_banned: false })
        .eq('team_id', teamId);
        
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Team not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/sync-puzzle-bank', authenticate, isAdmin, async (req, res) => {
  const { folderPath } = req.body;
  try {
    const puzzleBankPath = path.resolve(folderPath || path.join(__dirname, '../../server/puzzle_bank'));
    
    if (!await fs.pathExists(puzzleBankPath)) {
      return res.status(400).json({ error: 'Puzzle bank path does not exist' });
    }

    const folders = await fs.readdir(puzzleBankPath);
    const newPuzzles = [];

    for (const folder of folders) {
      const folderStat = await fs.stat(path.join(puzzleBankPath, folder));
      if (folderStat.isDirectory()) {
        const readmePath = path.join(puzzleBankPath, folder, 'README.md');
        let puzzleText = folder;
        if (await fs.pathExists(readmePath)) {
          puzzleText = await fs.readFile(readmePath, 'utf8');
        }

        let correctAnswer = 'unknown';
        let referenceType: 'python' | 'javascript' | 'text' = 'text';

        const files = await fs.readdir(path.join(puzzleBankPath, folder));
        const solutionFile = files.find(f => f.startsWith('solution.') || f.startsWith('answer.'));

        if (solutionFile) {
          const solutionPath = path.join(puzzleBankPath, folder, solutionFile);
          if (solutionFile.endsWith('.py')) {
            referenceType = 'python';
            const { stdout } = await execAsync(`python3 ${solutionPath}`);
            correctAnswer = stdout.trim();
          } else if (solutionFile.endsWith('.js')) {
            referenceType = 'javascript';
            const { stdout } = await execAsync(`node ${solutionPath}`);
            correctAnswer = stdout.trim();
          } else {
            referenceType = 'text';
            correctAnswer = (await fs.readFile(solutionPath, 'utf8')).trim();
          }
        }

        newPuzzles.push({
          puzzle_id: folder,
          puzzle_text: puzzleText,
          correct_answer: correctAnswer,
          reference_type: referenceType
        });
      }
    }

    // Upsert puzzles into Supabase
    const { error } = await supabase.from('puzzles').upsert(newPuzzles);
    if (error) throw error;

    res.json({ success: true, puzzles: newPuzzles.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
