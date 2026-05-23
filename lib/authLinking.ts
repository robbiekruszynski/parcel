import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export function getEmailRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

export async function createSessionFromUrl(url: string): Promise<void> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  if (params.error_description || params.error) {
    throw new Error(String(params.error_description ?? params.error));
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  const tokenHash = params.token_hash;
  const type = params.type;

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: String(accessToken),
      refresh_token: String(refreshToken),
    });
    if (error) throw error;
    return;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: String(tokenHash),
      type: type as 'signup' | 'email' | 'recovery' | 'invite' | 'magiclink',
    });
    if (error) throw error;
    return;
  }

  throw new Error('This confirmation link is missing session tokens.');
}

export function isAuthCallbackUrl(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('token_hash=') ||
    url.includes('type=signup')
  );
}
