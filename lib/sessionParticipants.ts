import { supabase } from '@/lib/supabase';

/** Register a user as an active participant for this recording session. */
export async function addSessionParticipant(
  sessionId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('session_participants').insert({
    session_id: sessionId,
    user_id: userId,
  });
  if (error && !error.message.includes('duplicate')) {
    if (__DEV__) console.warn('[session_participants] insert', error.message);
  }
}

/** All user IDs eligible for points on this session (owner + paired partners). */
export async function fetchSessionParticipantIds(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('session_participants')
    .select('user_id')
    .eq('session_id', sessionId);

  if (error) {
    if (__DEV__) console.warn('[session_participants] fetch', error.message);
    return [];
  }
  return (data ?? []).map((r) => r.user_id as string);
}
