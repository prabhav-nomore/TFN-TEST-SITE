import { create } from 'zustand';

interface AuthState {
  teamToken: string | null;
  adminToken: string | null;
  teamId: string | null;
  teamName: string | null;
  setTeamAuth: (token: string, teamId: string, teamName: string) => void;
  setAdminAuth: (token: string) => void;
  logoutTeam: () => void;
  logoutAdmin: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  teamToken: localStorage.getItem('teamToken'),
  adminToken: localStorage.getItem('adminToken'),
  teamId: localStorage.getItem('teamId'),
  teamName: localStorage.getItem('teamName'),
  setTeamAuth: (token, teamId, teamName) => {
    localStorage.setItem('teamToken', token);
    localStorage.setItem('teamId', teamId);
    localStorage.setItem('teamName', teamName);
    set({ teamToken: token, teamId, teamName });
  },
  setAdminAuth: (token) => {
    localStorage.setItem('adminToken', token);
    set({ adminToken: token });
  },
  logoutTeam: () => {
    localStorage.removeItem('teamToken');
    localStorage.removeItem('teamId');
    localStorage.removeItem('teamName');
    set({ teamToken: null, teamId: null, teamName: null });
  },
  logoutAdmin: () => {
    localStorage.removeItem('adminToken');
    set({ adminToken: null });
  },
}));
