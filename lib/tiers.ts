export type TierName = 'micro' | 'block' | 'district' | 'zone' | 'landmark';

export function tierFromAreaKm2(areaKm2: number): TierName {
  if (areaKm2 < 0.1) return 'micro';
  if (areaKm2 < 0.5) return 'block';
  if (areaKm2 < 2) return 'district';
  if (areaKm2 < 10) return 'zone';
  return 'landmark';
}

export function ptsPerMinuteForAreaKm2(areaKm2: number): number {
  return ptsPerMinuteForTier(tierFromAreaKm2(areaKm2));
}

export function ptsPerMinuteForTier(tier: TierName): number {
  switch (tier) {
    case 'micro':
      return 1;
    case 'block':
      return 3;
    case 'district':
      return 8;
    case 'zone':
      return 20;
    case 'landmark':
      return 50;
  }
}
