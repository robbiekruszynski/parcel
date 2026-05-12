import type { Activity } from '@/stores/sessionStore';

/** Sustained caps (km/h); brief spikes allowed above sustained — server validates duration. */
export const SPEED_LIMITS_KMH: Record<
  Activity,
  { sustained: number; spike: number }
> = {
  walking: { sustained: 10, spike: 15 },
  running: { sustained: 25, spike: 32 },
  skating: { sustained: 30, spike: 38 },
  rollerblading: { sustained: 30, spike: 38 },
  cycling: { sustained: 60, spike: 75 },
};

/** Client preview only; edge function `speed-check` is authoritative. */
export function speedExceedsSustained(activity: Activity, speedKmh: number): boolean {
  return speedKmh > SPEED_LIMITS_KMH[activity].sustained;
}
