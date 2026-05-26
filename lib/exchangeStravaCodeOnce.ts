/**
 * Strava auth codes are single-use. openAuthSessionAsync and the strava-auth
 * deep-link route can both fire for the same redirect — dedupe exchanges here.
 */

const usedCodes = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export async function runStravaCodeOnce(
  code: string,
  exchange: () => Promise<void>,
): Promise<void> {
  const key = code.trim();
  if (!key) throw new Error('Missing Strava authorization code');

  if (usedCodes.has(key)) return;

  const pending = inFlight.get(key);
  if (pending) {
    await pending;
    return;
  }

  const promise = (async () => {
    try {
      await exchange();
      usedCodes.add(key);
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  await promise;
}
