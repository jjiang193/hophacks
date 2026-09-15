// Mirrors docs/telemetry-schema.md. Keep in sync with backend/app/schema.py.

export const SCHEMA_VERSION = 1;

/** Samples below this are charted but excluded from any salinity estimate. */
export const QUALITY_THRESHOLD = 0.6;

export type Motion = 'still' | 'stirring' | 'moving' | 'unknown';

export interface IMU {
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
}

export interface Sample {
  v: number;
  device_id: string;
  seq: number;
  uptime_ms: number;
  temp_c: number | null;
  ec_raw_ms: number;
  ec25_ms: number;
  salinity_g_l: number;
  salt_pct: number;
  sodium_mg_per_100ml: number;
  imu: IMU;
  motion: Motion;
  submerged: boolean;
  quality: number;
  calibrated: boolean;
}

export interface SessionSummary {
  sample_count: number;
  salinity_g_l?: number;
  salt_pct?: number;
  sodium_mg?: number;
  temp_c?: number | null;
}

export interface Session {
  id: number;
  device_id: string;
  label: string | null;
  started_at: string;
  ended_at: string | null;
  serving_ml: number;
  salinity_g_l: number | null;
  salt_pct: number | null;
  sodium_mg: number | null;
  temp_c: number | null;
  sample_count: number;
}

export interface IntakeToday {
  total_sodium_mg: number;
  session_count: number;
  fda_daily_limit_mg: number;
  aha_ideal_limit_mg: number;
  pct_of_fda_limit: number;
  pct_of_aha_ideal: number;
  verdict: 'low' | 'moderate' | 'high' | 'very high';
}

export type LiveMessage =
  | { type: 'sample'; received_at: string; session_id: number | null; data: Sample }
  | { type: 'session_started'; session_id: number }
  | { type: 'session_ended'; session_id: number; summary: SessionSummary }
  | { type: 'error'; detail: string };

/** A sample with the wall-clock stamp the backend added, ready to chart. */
export interface ChartPoint {
  t: number;
  salinity_g_l: number;
  salt_pct: number;
  temp_c: number | null;
  quality: number;
  submerged: boolean;
  motion: Motion;
  /** Null when the probe is in air - there is no soup measurement to plot. */
  measured_salt_pct: number | null;
  /** Null when untrusted, so the solid line breaks instead of lying. */
  trusted_salt_pct: number | null;
}
