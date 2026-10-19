'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type User = {
  id: string; name: string; email: string; role: 'doctor' | 'patient'; birthDate: string;
  phone: string; specialty: string; clinic: string; bio: string; contactEmail: string;
  schedule: string; isDemo: boolean;
};
const SESSION_EVENT = 'compass-session-changed';
const CHANGED_MESSAGE = 'Аккаунт изменился в другой вкладке. Кабинет обновлён.';

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function request(path: string, method = 'GET', data?: unknown, userId?: string) {
  const response = await fetch('/api/' + path, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(userId ? { 'X-Compass-User': userId } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result: any = await response.json();
  if (!response.ok) throw new ApiError(response.status, result.error || 'Не удалось выполнить действие. Попробуйте ещё раз.', result.code);
  return result;
}

type Session = {
  user: User | null;
  loading: boolean;
  notice: string;
  setUser(user: User | null): void;
  api(path: string, method?: string, data?: unknown): Promise<any>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const current = useRef<User | null>(null);
  const initialized = useRef(false);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const synchronize = useCallback(async () => {
    const attempt = ++sequence.current;
    try {
      let next: User | null;
      try { next = (await request('me')).user; }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        next = null;
      }
      if (attempt !== sequence.current) return;
      if (initialized.current && current.current?.id !== next?.id) {
        setNotice(next
          ? CHANGED_MESSAGE + (next.role === 'patient' ? ' Для приглашения пациента войдите как врач.' : '')
          : 'Сессия завершена или выполнен выход в другой вкладке. Войдите снова.');
      }
      current.current = next;
      initialized.current = true;
      updateUser(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    } catch {
      // A temporary network failure must not sign out the current user.
      if (attempt === sequence.current) setNotice('Не удалось проверить сессию. Проверьте соединение и обновите страницу.');
    } finally {
      if (attempt === sequence.current) setLoading(false);
    }
  }, []);

  const setUser = useCallback((next: User | null) => {
    sequence.current++; // Discard /me responses started before this login/logout.
    current.current = next;
    initialized.current = true;
    updateUser(next);
    setLoading(false);
    setNotice('');
    channel.current?.postMessage('changed');
    // Fallback for browsers without BroadcastChannel. No account data is stored.
    try { localStorage.setItem(SESSION_EVENT, crypto.randomUUID()); } catch { /* Storage may be disabled. */ }
  }, []);

  useEffect(() => {
    const check = () => { void synchronize(); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const stored = (event: StorageEvent) => { if (event.key === SESSION_EVENT) check(); };
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel(SESSION_EVENT);
      channel.current.onmessage = check;
    }
    window.addEventListener('focus', check);
    window.addEventListener('storage', stored);
    document.addEventListener('visibilitychange', visible);
    check();
    return () => {
      sequence.current++;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', stored);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [synchronize]);

  const api = useCallback(async (path: string, method = 'GET', data?: unknown) => {
    const expectedId = user?.id;
    try {
      const result = await request(path, method, data, expectedId);
      if (current.current?.id !== expectedId) throw new ApiError(409, CHANGED_MESSAGE, 'SESSION_CHANGED');
      return result;
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'SESSION_CHANGED' || error.status === 401 || error.status === 403)) {
        await synchronize();
      }
      throw error;
    }
  }, [user?.id, synchronize]);

  return <SessionContext.Provider value={{ user, loading, notice, setUser, api }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is missing');
  return session;
}
