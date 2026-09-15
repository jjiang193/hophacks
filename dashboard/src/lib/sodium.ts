// Mirrors backend/app/salinity.py. The backend is authoritative for stored
// sessions; this exists so the live tile can update at 5 Hz without a round trip.

export const SODIUM_FRACTION_OF_NACL = 0.3934;
export const FDA_DAILY_LIMIT_MG = 2300;
export const AHA_IDEAL_LIMIT_MG = 1500;
export const DEFAULT_SERVING_ML = 240;

export function sodiumMgForServing(gPerLitre: number, volumeMl = DEFAULT_SERVING_ML): number {
  return gPerLitre * SODIUM_FRACTION_OF_NACL * volumeMl;
}

export type Verdict = 'low' | 'moderate' | 'high' | 'very high';

export function verdictFor(sodiumMg: number): Verdict {
  const pct = (sodiumMg / FDA_DAILY_LIMIT_MG) * 100;
  if (pct < 10) return 'low';
  if (pct < 20) return 'moderate';
  if (pct < 35) return 'high';
  return 'very high';
}

/** Status role, not a series color. Always shipped with an icon and a label. */
export const VERDICT_STATUS: Record<Verdict, { role: string; icon: string }> = {
  low: { role: 'good', icon: '●' },
  moderate: { role: 'good', icon: '●' },
  high: { role: 'warning', icon: '▲' },
  'very high': { role: 'critical', icon: '■' },
};
