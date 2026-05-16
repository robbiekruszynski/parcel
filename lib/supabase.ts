import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(rawUrl && rawKey);

/**
 * Supabase requires non-empty URL/key at construction time.
 * When env vars are missing (common before `.env` exists), we pass valid-shaped
 * placeholders so the app can boot; all writes/queries fail until you configure a real project.
 */
const FALLBACK_URL = 'https://preview-placeholder.supabase.co';
const FALLBACK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24ifQ.placeholder-not-a-real-key';

export const supabase = createClient(rawUrl || FALLBACK_URL, rawKey || FALLBACK_KEY);

if (__DEV__ && !isSupabaseConfigured) {
  console.warn(
    '[parcel] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example → .env and restart Expo (npx expo start --clear).'
  );
}
