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

const PROFILE_FETCH_ATTEMPTS = 2;
const PROFILE_RETRY_DELAY_MS = 1_500;

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
          if (attempt < PROFILE_FETCH_ATTEMPTS - 1) {
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

    void withTimeout(client.auth.getSession(), AUTH_BOOTSTRAP_TIMEOUT_MS.value)
      .then(({ data }) => {
        if (!active) {
          return;
        }
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLoading(false);
        if (data.session?.user) {
          void refreshProfile();
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setBootstrapError(true);
        }
      });

    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
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
    setLoading(true);
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
