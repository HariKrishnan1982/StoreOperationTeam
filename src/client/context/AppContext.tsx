import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchCurrentUser, login as apiLogin, logout as apiLogout } from '../api';
import type { ToastMessage } from '../components';
import { ToastRegion } from '../components';
import type { AuthUser } from '../types';

export type ThemeMode = 'light' | 'dark';

interface AppContextValue {
  user: AuthUser | null;
  authChecked: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  loginUser: (username: string, password: string) => Promise<AuthUser>;
  logoutUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
  pushToast: (tone: ToastMessage['tone'], text: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const THEME_STORAGE_KEY = 'store_ops_theme';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark') {
      document.documentElement.dataset.theme = 'dark';
      return 'dark';
    }
    return 'light';
  } catch {
    return 'light';
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }, [theme]);

  const refreshUser = useCallback(async () => {
    try {
      const session = await fetchCurrentUser();
      setUser(session?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchCurrentUser()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const loginUser = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    setUser(res.user);
    setAuthChecked(true);
    return res.user;
  }, []);

  const logoutUser = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((tone: ToastMessage['tone'], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        authChecked,
        theme,
        setTheme,
        toggleTheme,
        loginUser,
        logoutUser,
        refreshUser,
        pushToast,
      }}
    >
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
