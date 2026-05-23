import { syncStravaConnectionForUser } from '@/lib/syncStravaConnection';
import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

export async function disconnectStravaForCurrentUser(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id) {
    const { error } = await supabase
      .from('strava_connections')
      .delete()
      .eq('user_id', session.user.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  useStravaStore.getState().disconnectStrava();
  await syncStravaConnectionForUser(session?.user?.id ?? null);
}
