import { create } from 'zustand';
import { UserItem } from '@oraculo/shared';

interface AuthState {
  user: UserItem | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

const TOKEN_KEY = 'oraculo_spn_jwt_token';
const USER_KEY = 'oraculo_spn_user_info';

export const useAuthStore = create<AuthState>((set, get) => {
  // Inicialização síncrona a partir do localStorage
  const savedToken = localStorage.getItem(TOKEN_KEY);
  const savedUserRaw = localStorage.getItem(USER_KEY);
  let initialUser: UserItem | null = null;

  if (savedUserRaw) {
    try {
      initialUser = JSON.parse(savedUserRaw);
    } catch (_) {}
  }

  return {
    user: initialUser,
    token: savedToken,
    isAuthenticated: !!savedToken && !!initialUser,
    isAdmin: initialUser?.role === 'ADMINISTRADOR',
    isLoading: false,
    error: null,

    clearError: () => set({ error: null }),

    login: async (username: string, password: string) => {
      set({ isLoading: true, error: null });

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Falha na autenticação do Active Directory.');
        }

        const { token, user } = data;

        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === 'ADMINISTRADOR',
          isLoading: false,
          error: null,
        });

        return true;
      } catch (err: any) {
        set({
          isLoading: false,
          error: err.message || 'Erro de rede ou servidor indisponível.',
        });
        return false;
      }
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isAdmin: false,
        error: null,
      });
    },

    checkSession: async () => {
      const { token } = get();
      if (!token) return;

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          get().logout();
          return;
        }

        const data = await response.json();
        if (data.success && data.user) {
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          set({
            user: data.user,
            isAuthenticated: true,
            isAdmin: data.user.role === 'ADMINISTRADOR',
          });
        }
      } catch (_) {
        // Em caso de falha temporária de rede, mantém a sessão offline se existir
      }
    },
  };
});
