import { create } from 'zustand';
import { http, refreshAccess, setAuthLostHandler, tokens } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  /** true tant que la session stockée n'a pas été vérifiée au démarrage */
  initializing: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  initializing: true,

  async init() {
    if (!tokens.refresh) { set({ initializing: false }); return; }
    try {
      await refreshAccess();
      const { data } = await http.get<User>('/auth/me/');
      set({ user: data, initializing: false });
    } catch {
      tokens.clear();
      set({ user: null, initializing: false });
    }
  },

  async login(username, password) {
    const { data } = await http.post<{ access: string; refresh: string; user: User }>('/auth/login/', { username, password });
    tokens.set(data.access, data.refresh);
    set({ user: data.user });
  },

  async logout() {
    const refresh = tokens.refresh;
    try { if (refresh && tokens.access) await http.post('/auth/logout/', { refresh }); } catch { /* révocation au mieux */ }
    tokens.clear();
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));

// Si le rafraîchissement échoue (session révoquée/expirée), on déconnecte proprement.
setAuthLostHandler(() => useAuth.setState({ user: null }));
