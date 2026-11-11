import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, SESSION_EXPIRED_EVENT, unwrap, type Role, type Schemas } from '../api/client';

type Me = Schemas['Me'];

interface AuthState {
  /** undefined = still checking, null = not logged in */
  me: Me | null | undefined;
  notice: string;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  hasRole(...roles: Role[]): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // also makes the server send the CSRF cookie that the login request needs
    api.GET('/api/auth/me').then(({ data, response }) => setMe(response.ok && data ? data : null))
      .catch(() => setMe(null));
    const expired = () => {
      setMe(null);
      setNotice('Your session has ended. Please log in again.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const user = await unwrap(api.POST('/api/auth/login', { body: { username, password } }));
    setNotice('');
    setMe(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.POST('/api/auth/logout');
    } finally {
      setMe(null);
      setNotice('You have been logged out.');
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ me, notice, login, logout, hasRole: (...roles) => !!me && roles.includes(me.role) }),
    [me, notice, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The logged-in user, for pages that are only shown after login. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Not logged in');
  return me;
}
