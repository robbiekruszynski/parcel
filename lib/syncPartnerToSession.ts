import { addSessionParticipant } from '@/lib/sessionParticipants';
import { useSessionStore } from '@/stores/sessionStore';

/** When paired mid-session, register partner for point splits on this session only. */
export async function syncPartnerToActiveSession(partnerUserId: string): Promise<void> {
  const sessionId = useSessionStore.getState().sessionId;
  if (!sessionId) return;
  await addSessionParticipant(sessionId, partnerUserId);
}
