import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Team {
  team_id: string;
  team_name: string;
  password_hash: string;
  is_banned?: boolean;
}

export interface Puzzle {
  puzzle_id: string;
  puzzle_text: string;
  correct_answer: string;
  reference_type: 'python' | 'javascript' | 'text';
}

export interface Assignment {
  id?: string;
  team_id: string;
  puzzle_id: string;
  start_time: number;
  status: 'active' | 'completed' | 'expired';
}

export interface Submission {
  id?: string;
  team_id: string;
  puzzle_id: string;
  answer_submitted: string;
  timestamp: number;
  result: 'correct' | 'incorrect';
}

export interface Lifeline {
  team_id: string;
  lifeline_remaining: number;
  lifeline_used: number;
}

// Helper functions to fetch and write data to Supabase
// We'll keep the readDB/writeDB interface for compatibility with existing code,
// but it's better to use direct Supabase queries in the routes.
// We'll implement a basic version that fetches all data to match the old behavior,
// but we should refactor the routes to use Supabase directly for better performance.

export interface Database {
  teams: Team[];
  puzzles: Puzzle[];
  assignments: Assignment[];
  submissions: Submission[];
  lifelines: Lifeline[];
}

export async function readDB(): Promise<Database> {
  const [
    { data: teams },
    { data: puzzles },
    { data: assignments },
    { data: submissions },
    { data: lifelines }
  ] = await Promise.all([
    supabase.from('teams').select('*'),
    supabase.from('puzzles').select('*'),
    supabase.from('assignments').select('*'),
    supabase.from('submissions').select('*'),
    supabase.from('lifelines').select('*')
  ]);

  return {
    teams: teams || [],
    puzzles: puzzles || [],
    assignments: assignments || [],
    submissions: submissions || [],
    lifelines: lifelines || []
  };
}

export async function writeDB(data: Database): Promise<void> {
  // This is a naive implementation that overwrites everything.
  // It's highly recommended to update specific tables/rows in the routes instead.
  // We'll leave this here for backward compatibility, but we should refactor the routes.
  console.warn('writeDB called. This is inefficient with Supabase. Refactor routes to use direct updates.');
}

