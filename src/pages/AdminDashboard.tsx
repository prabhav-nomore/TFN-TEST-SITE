import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store';
import { io, Socket } from 'socket.io-client';
import { LogOut, Users, RefreshCw, AlertTriangle, CheckCircle, Clock, ShieldAlert } from 'lucide-react';

export default function AdminDashboard() {
  const { adminToken: token, logoutAdmin: logout } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  
  const [newTeamId, setNewTeamId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamPassword, setNewTeamPassword] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    fetchData();

    socketRef.current = io('/', {
      auth: { token }
    });

    socketRef.current.emit('join_admin');

    socketRef.current.on('assignment_created', (data) => {
      addEvent(`Team ${data.team_id} assigned puzzle ${data.puzzle_id}`, 'info');
      fetchData();
    });

    socketRef.current.on('submission', (data) => {
      addEvent(`Team ${data.team_id} submitted ${data.result} answer for ${data.puzzle_id}`, data.result === 'correct' ? 'success' : 'warning');
      fetchData();
    });

    socketRef.current.on('lifeline_used', (data) => {
      addEvent(`Team ${data.teamId} used a lifeline (${data.remaining} remaining)`, 'warning');
      fetchData();
    });

    socketRef.current.on('violation', (data) => {
      addEvent(`Team ${data.teamId} violation: ${data.type}`, 'error');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [overviewRes, leaderboardRes] = await Promise.all([
        fetch('/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/leaderboard', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setOverview(await overviewRes.json());
      setLeaderboard(await leaderboardRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  const addEvent = (message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    setEvents(prev => [{ id: Date.now(), message, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync-puzzle-bank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ folderPath })
      });
      const data = await res.json();
      if (res.ok) {
        addEvent(`Synced ${data.puzzles} puzzles from bank`, 'success');
        fetchData();
      } else {
        addEvent(`Sync failed: ${data.error}`, 'error');
      }
    } catch (err) {
      addEvent('Sync request failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const skipPuzzle = async (teamId: string) => {
    if (!confirm(`Skip current puzzle for Team ${teamId}?`)) return;
    try {
      const res = await fetch(`/api/admin/team/${teamId}/skip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addEvent(`Skipped puzzle for Team ${teamId}`, 'info');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unbanTeam = async (teamId: string) => {
    if (!confirm(`Unban Team ${teamId}?`)) return;
    try {
      const res = await fetch(`/api/admin/team/${teamId}/unban`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addEvent(`Unbanned Team ${teamId}`, 'success');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const registerTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamId || !newTeamName || !newTeamPassword) return;
    
    setRegistering(true);
    try {
      const res = await fetch('/api/admin/team/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId: newTeamId,
          teamName: newTeamName,
          password: newTeamPassword
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        addEvent(`Registered new team: ${newTeamName} (${newTeamId})`, 'success');
        setNewTeamId('');
        setNewTeamName('');
        setNewTeamPassword('');
        fetchData();
      } else {
        addEvent(`Registration failed: ${data.error}`, 'error');
      }
    } catch (err) {
      addEvent('Registration request failed', 'error');
    } finally {
      setRegistering(false);
    }
  };

  if (!overview) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="bg-neutral-900 border-b border-neutral-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <ShieldAlert className="text-red-500" />
          <h1 className="text-xl font-bold tracking-tight">Admin Dashboard</h1>
        </div>
        <button onClick={logout} className="text-neutral-400 hover:text-white transition-colors">
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto w-full">
        {/* Left Column: Leaderboard & Controls */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2"><Users size={20} /> Leaderboard</h2>
              <button onClick={fetchData} className="text-neutral-400 hover:text-white transition-colors">
                <RefreshCw size={18} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-500 border-b border-neutral-800">
                  <tr>
                    <th className="pb-3 font-medium">Rank</th>
                    <th className="pb-3 font-medium">Team</th>
                    <th className="pb-3 font-medium">Score</th>
                    <th className="pb-3 font-medium">Active Puzzle</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {leaderboard.map((team, index) => {
                    const activeAssignment = overview.assignments.find((a: any) => a.team_id === team.team_id && a.status === 'active');
                    return (
                      <tr key={team.team_id} className="hover:bg-neutral-800/50 transition-colors">
                        <td className="py-4 font-mono text-neutral-400">#{index + 1}</td>
                        <td className="py-4 font-medium">
                          {team.team_name} <span className="text-neutral-500 text-xs ml-1">({team.team_id})</span>
                          {team.is_banned && <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-500 text-xs rounded border border-red-500/50">Banned</span>}
                        </td>
                        <td className="py-4 font-mono text-blue-400">{team.score}</td>
                        <td className="py-4 font-mono text-xs text-neutral-400">{activeAssignment ? activeAssignment.puzzle_id : 'None'}</td>
                        <td className="py-4 flex gap-2">
                          <button
                            onClick={() => skipPuzzle(team.team_id)}
                            disabled={!activeAssignment}
                            className="text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded transition-colors"
                          >
                            Skip Puzzle
                          </button>
                          {team.is_banned && (
                            <button
                              onClick={() => unbanTeam(team.team_id)}
                              className="text-xs bg-green-900/50 hover:bg-green-800 text-green-400 px-3 py-1 rounded transition-colors border border-green-800"
                            >
                              Unban
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><RefreshCw size={20} /> Sync Puzzle Bank</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="Path to puzzle_bank folder (leave empty for default)"
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
              <button
                onClick={handleSync}
                disabled={syncing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-800 disabled:text-neutral-500 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {syncing ? 'Syncing...' : 'Sync Puzzles'}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-3">
              Reads folders from the specified path. Each folder should contain a README.md and solution.txt.
            </p>
          </div>

          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Users size={20} /> Register New Team</h2>
            <form onSubmit={registerTeam} className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-xs text-neutral-500 mb-1">Team ID</label>
                <input
                  type="text"
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  placeholder="e.g. T004"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-neutral-500 mb-1">Team Name</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Delta"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-neutral-500 mb-1">Password</label>
                <input
                  type="password"
                  value={newTeamPassword}
                  onChange={(e) => setNewTeamPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={registering}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-800 disabled:text-neutral-500 px-6 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                {registering ? 'Registering...' : 'Register'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Event Feed */}
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 flex flex-col h-[calc(100vh-8rem)]">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><Clock size={20} /> Live Events</h2>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {events.length === 0 ? (
              <div className="text-neutral-500 text-sm text-center py-8">No events yet</div>
            ) : (
              events.map(event => (
                <div key={event.id} className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/50 flex gap-3 items-start">
                  <div className="mt-0.5">
                    {event.type === 'info' && <Clock size={14} className="text-blue-400" />}
                    {event.type === 'success' && <CheckCircle size={14} className="text-green-400" />}
                    {event.type === 'warning' && <AlertTriangle size={14} className="text-yellow-400" />}
                    {event.type === 'error' && <ShieldAlert size={14} className="text-red-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-300">{event.message}</p>
                    <span className="text-xs text-neutral-600 font-mono mt-1 block">{event.time}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
