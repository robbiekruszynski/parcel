import type { StravaTokens } from '@/lib/strava';
import { runStravaCodeOnce } from '@/lib/exchangeStravaCodeOnce';
import { readSupabaseFunctionError } from '@/lib/stravaErrors';
import { retryQueuedStravaUpload } from '@/lib/stravaUploadQueue';
import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

type StravaSignInPayload = {
  email: string;
  token_hash: string;
  strava?: StravaTokens;
};

export async function completeStravaSignIn(code: string, redirectUri: string): Promise<void> {
  await runStravaCodeOnce(code, async () => {
    const { data, error } = await supabase.functions.invoke('strava-sign-in', {
      body: { code, redirect_uri: redirectUri },
    });

    if (error) {
      throw new Error(await readSupabaseFunctionError(error as { message: string; context?: Response }));
    }

    const payload = data as StravaSignInPayload;
    if (!payload?.token_hash) {
      throw new Error('Strava sign-in returned an invalid session payload');
    }

    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: payload.token_hash,
      type: 'magiclink',
    });

    if (otpError) {
      throw new Error(otpError.message);
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (payload.strava?.access_token && session?.user?.id) {
      useStravaStore.getState().setStravaTokens(payload.strava, session.user.id);
      await retryQueuedStravaUpload();
    }
  });
}
