import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store';
import { io, Socket } from 'socket.io-client';
import { LogOut, ShieldAlert, Clock, CheckCircle2, XCircle } from 'lucide-react';

export default function TeamDashboard() {
  const { teamToken: token, teamId, teamName, logoutTeam: logout } = useAuthStore();
  const [status, setStatus] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [restrictionsDisabled, setRestrictionsDisabled] = useState(false);
  const [showLifelineConfirm, setShowLifelineConfirm] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [lifelineTimeLeft, setLifelineTimeLeft] = useState<number | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleBan = () => {
    logout();
    showNotification('You have been disqualified for violating the rules.');
    setTimeout(() => {
      window.close();
      window.location.href = 'about:blank';
    }, 3000);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lifelineTimeLeft !== null && lifelineTimeLeft > 0) {
      if (lifelineTimeLeft === 30000) {
        showNotification('Only 30 seconds remaining for your Lifeline!');
      }
      interval = setInterval(() => {
        setLifelineTimeLeft(prev => prev !== null ? prev - 1000 : null);
      }, 1000);
    } else if (lifelineTimeLeft !== null && lifelineTimeLeft <= 0) {
      setLifelineTimeLeft(null);
      setRestrictionsDisabled(false);
      showNotification('Lifeline expired. Browser restrictions re-enabled.');
    }
    return () => clearInterval(interval);
  }, [lifelineTimeLeft]);

  useEffect(() => {
    fetchStatus();

    socketRef.current = io('/', {
      auth: { token }
    });

    socketRef.current.emit('join_team', teamId);

    socketRef.current.on('puzzle_skipped', () => {
      fetchStatus();
    });

    socketRef.current.on('banned', () => {
      handleBan();
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (restrictionsDisabled) return;

    // Anti-cheat: tab visibility
    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation('tab_switch');
      }
    };

    // Anti-cheat: copy/paste
    const handleCopyPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('copy_paste');
    };

    // Anti-cheat: fullscreen
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportViolation('exited_fullscreen');
      }
    };

    // Anti-cheat: tab close / exit
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      reportViolation('tab_closed');
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [restrictionsDisabled]);

  const enterFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    }
  };

  useEffect(() => {
    if (status?.assignment?.start_time && status?.serverNow) {
      const clientNow = Date.now();
      const offset = clientNow - status.serverNow;
      
      const interval = setInterval(() => {
        const currentServerTime = Date.now() - offset;
        const startTime = Number(status.assignment.start_time);
        const elapsed = currentServerTime - startTime;
        const remaining = Math.max(0, 3600000 - elapsed); // 1 hour per puzzle
        setTimeLeft(remaining);
        if (remaining === 0) {
          fetchStatus(); // Refresh if expired
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/team/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStatus(data);
      setResult(null);
      setAnswer('');
    } catch (err) {
      console.error(err);
    }
  };

  const reportViolation = async (type: string) => {
    try {
      const res = await fetch('/api/team/violation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ type }),
        keepalive: true
      });
      const data = await res.json();
      if (data.banned) {
        handleBan();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/team/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ answer })
      });
      const data = await res.json();
      setResult(data.correct ? 'correct' : 'incorrect');
      if (data.output !== undefined) {
        setStatus((prev: any) => ({ ...prev, output: data.output }));
      }
      if (data.correct) {
        setTimeout(() => {
          fetchStatus();
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipClick = () => {
    setShowSkipConfirm(true);
  };

  const confirmSkip = async () => {
    setShowSkipConfirm(false);
    setSubmitting(true);
    try {
      await fetch('/api/team/skip', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const useLifelineClick = () => {
    setShowLifelineConfirm(true);
  };

  const confirmLifeline = async () => {
    setShowLifelineConfirm(false);
    try {
      const res = await fetch('/api/team/lifeline', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification('Lifeline activated! Browser restrictions disabled for 5 minutes.');
        setRestrictionsDisabled(true);
        setLifelineTimeLeft(5 * 60 * 1000); // 5 minutes
        fetchStatus();
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to activate lifeline');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!status) return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">Loading...</div>;

  if (status.completed) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <div className="bg-neutral-900 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-neutral-800 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Congratulations!</h1>
          <p className="text-neutral-400 text-lg mb-8">You have completed all available puzzles.</p>
          <button onClick={logout} className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-2 rounded-lg transition-colors">
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="bg-neutral-900 border-b border-neutral-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">Team {teamName} <span className="text-neutral-500 text-sm font-normal ml-2">({teamId})</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-neutral-300">
            <button
              onClick={enterFullscreen}
              className="bg-neutral-800 hover:bg-neutral-700 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              Fullscreen
            </button>
            <ShieldAlert size={18} className="text-yellow-500 ml-2" />
            <span className="text-sm">Lifelines: {status.lifeline?.lifeline_remaining || 0}</span>
            <button 
              onClick={useLifelineClick}
              disabled={!status.lifeline || status.lifeline.lifeline_remaining === 0 || restrictionsDisabled}
              className="ml-2 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              {restrictionsDisabled ? 'Active' : 'Use'}
            </button>
          </div>
          <div className="flex items-center gap-2 text-blue-400 font-mono text-lg">
            <Clock size={20} />
            {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
          </div>
          <button onClick={logout} className="text-neutral-400 hover:text-white transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col gap-8">
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-8 flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Current Puzzle</h2>
            <span className="bg-neutral-800 text-neutral-400 px-3 py-1 rounded-full text-sm font-mono">
              ID: {status.puzzle?.puzzle_id}
            </span>
          </div>
          
          <div className="bg-neutral-950 rounded-lg p-6 border border-neutral-800 flex-1 mb-8 overflow-auto font-mono text-sm text-neutral-300 whitespace-pre-wrap">
            {status.puzzle?.puzzle_text || 'Loading puzzle content...'}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {status.puzzle?.reference_type === 'text' ? (
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your answer..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                disabled={submitting || result === 'correct'}
              />
            ) : (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={`Write your ${status.puzzle?.reference_type} code here...`}
                className="w-full h-64 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono resize-none"
                disabled={submitting || result === 'correct'}
              />
            )}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={handleSkipClick}
                disabled={submitting || result === 'correct'}
                className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
              >
                Skip Puzzle
              </button>
              <button
                type="submit"
                disabled={submitting || !answer.trim() || result === 'correct'}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium px-8 py-3 rounded-lg transition-colors flex items-center gap-2"
              >
                {submitting ? 'Checking...' : 'Submit'}
              </button>
            </div>
          </form>

          {status.output && (
            <div className="mt-4 p-4 rounded-lg bg-neutral-950 border border-neutral-800 font-mono text-sm">
              <div className="text-neutral-500 mb-2">Execution Output:</div>
              <pre className="text-neutral-300 whitespace-pre-wrap">{status.output}</pre>
            </div>
          )}

          {result && (
            <div className={`mt-4 p-4 rounded-lg flex items-center gap-3 ${result === 'correct' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {result === 'correct' ? <CheckCircle2 /> : <XCircle />}
              <span className="font-medium">
                {result === 'correct' ? 'Correct! Loading next puzzle...' : 'Incorrect answer. Try again.'}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Lifeline Confirmation Modal */}
      {showLifelineConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <ShieldAlert className="text-yellow-500" /> Use Lifeline?
            </h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to use a lifeline? This will temporarily disable browser restrictions (tab switching, copy/paste, fullscreen exit) for 5 minutes.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowLifelineConfirm(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmLifeline}
                className="px-4 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
              >
                Activate Lifeline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skip Confirmation Modal */}
      {showSkipConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Skip Puzzle?</h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to skip this puzzle? You will receive a new random puzzle and won't get points for this one.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowSkipConfirm(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmSkip}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Skip Puzzle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 bg-neutral-800 border border-neutral-700 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50">
          <ShieldAlert size={18} className="text-blue-400" />
          <span>{notification}</span>
        </div>
      )}
    </div>
  );
}
