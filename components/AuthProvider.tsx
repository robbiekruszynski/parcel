import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { createSessionFromUrl, getEmailRedirectUrl, isAuthCallbackUrl } from '@/lib/authLinking';
import { EmailConfirmationRequiredError } from '@/lib/authErrors';
import { appStorage } from '@/lib/storage';
import { syncStravaConnectionForUser } from '@/lib/syncStravaConnection';
import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      void syncStravaConnectionForUser(session?.user?.id ?? null);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      useStravaStore.getState().disconnectStrava();
      setSession(nextSession);
      void syncStravaConnectionForUser(nextSession?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      if (!isAuthCallbackUrl(url)) return;
      try {
        await createSessionFromUrl(url);
      } catch (e) {
        if (__DEV__) {
          console.warn('[auth] deep link failed', e);
        }
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) void handleDeepLink(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onEmailCallback = segments[0] === 'auth' && segments[1] === 'callback';

    if (!session && !inAuthGroup && !onEmailCallback) {
      router.replace('/(auth)');
      return;
    }

    if (session && (inAuthGroup || onEmailCallback)) {
      router.replace('/(tabs)/map');
    }
  }, [session, initializing, segments, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      signUp: async (email, password, username, displayName) => {
        const normalizedUsername = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
          throw new Error('Username must be 3–24 characters: lowercase letters, numbers, underscore.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: getEmailRedirectUrl(),
            data: {
              username: normalizedUsername,
              display_name: displayName?.trim() || null,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          throw new EmailConfirmationRequiredError();
        }
      },
      signOut: async () => {
        useStravaStore.getState().disconnectStrava();
        await appStorage.removeItem('strava-storage');
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
