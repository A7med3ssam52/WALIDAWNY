import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getProfileById } from '../../data/rpc';
import { getSupabaseClient } from '../../lib/supabase';
import type { Profile, UserRole } from '../../types/database';

interface AuthContextValue {
  loading: boolean;
  bootstrapError: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  profileError: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  retryBootstrap: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_REFRESH_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED']);

export const AUTH_BOOTSTRAP_TIMEOUT_MS = { value: 20_000 };

const PROFILE_FETCH_ATTEMPTS = 3;
const PROFILE_RETRY_DELAY_MS = 180;
const BOOTSTRAP_FETCH_ATTEMPTS = 3;
const BOOTSTRAP_RETRY_DELAY_MS = 80;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('bootstrap_timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: unknown }).message ?? '').toLowerCase();
  const code = String((error as { code?: unknown }).code ?? '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('bootstrap_timeout') ||
    code === 'network_error' ||
    code === 'internal_error'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  const refreshProfile = useCallback(async () => {
    setProfileError(false);
    setProfileLoading(true);
    try {
      const client = getSupabaseClient();
      const { data } = await client.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        setProfile(null);
        setRole(null);
        return;
      }
      let nextProfile: Profile | null = null;
      let lastError: unknown = new Error('profile_fetch_failed');
      for (let attempt = 0; attempt < PROFILE_FETCH_ATTEMPTS; attempt += 1) {
        try {
          nextProfile = await withTimeout(
            getProfileById(userId),
            AUTH_BOOTSTRAP_TIMEOUT_MS.value,
          );
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          const shouldRetry = isNetworkError(error) && attempt < PROFILE_FETCH_ATTEMPTS - 1;
          if (shouldRetry) {
            await new Promise((resolve) =>
              setTimeout(resolve, PROFILE_RETRY_DELAY_MS * (attempt + 1)),
            );
          } else if (attempt < PROFILE_FETCH_ATTEMPTS - 1) {
            // for non-network errors wait before retry as well (RLS transient)
            await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAY_MS));
          }
        }
      }
      if (lastError !== null) {
        throw lastError;
      }
      setProfile(nextProfile);
      setRole(nextProfile?.role ?? null);
    } catch {
      setProfile(null);
      setRole(null);
      setProfileError(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();

    const bootstrap = async () => {
      for (let attempt = 0; attempt < BOOTSTRAP_FETCH_ATTEMPTS; attempt += 1) {
        try {
          const { data } = await withTimeout(
            client.auth.getSession(),
            AUTH_BOOTSTRAP_TIMEOUT_MS.value,
          );
          if (!active) return;
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setLoading(false);
          setBootstrapError(false);
          if (data.session?.user) {
            void refreshProfile();
          }
          return;
        } catch (error) {
          if (attempt < BOOTSTRAP_FETCH_ATTEMPTS - 1 && isNetworkError(error)) {
            await new Promise((resolve) =>
              setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS * (attempt + 1)),
            );
            if (!active) return;
          } else if (attempt < BOOTSTRAP_FETCH_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
            if (!active) return;
          }
        }
      }
      if (active) {
        setLoading(false);
        setBootstrapError(true);
      }
    };

    void bootstrap();

    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        if (PROFILE_REFRESH_EVENTS.has(event)) {
          void refreshProfile();
        }
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [refreshProfile, bootstrapAttempt]);

  const retryBootstrap = useCallback(() => {
    setBootstrapError(false);
    setProfileError(false);
    setLoading(true);
    setProfileLoading(false);
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw error;
      }
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setProfileError(false);
      setBootstrapError(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      loading,
      bootstrapError,
      session,
      user,
      profile,
      role,
      profileError,
      profileLoading,
      refreshProfile,
      retryBootstrap,
      signIn,
      signOut,
    }),
    [
      loading,
      bootstrapError,
      session,
      user,
      profile,
      role,
      profileError,
      profileLoading,
      refreshProfile,
      retryBootstrap,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
