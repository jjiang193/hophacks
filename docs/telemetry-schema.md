# Telemetry Schema (v1)

This is the **contract** between firmware, the mock spoon, the backend, and the
dashboard. Change it here first, then update all four.

One JSON object per sample, sent as a WebSocket text frame to `/ws/ingest`.

```json
{
  "v": 1,
  "device_id": "spoon-01",
  "seq": 412,
  "uptime_ms": 128400,
  "temp_c": 68.4,
  "ec_raw_ms": 11.2,
  "ec25_ms": 9.81,
  "salinity_g_l": 5.12,
  "salt_pct": 0.512,
  "sodium_mg_per_100ml": 201.4,
  "imu": { "ax": 0.02, "ay": -0.11, "az": 9.78, "gx": 0.01, "gy": 0.00, "gz": 0.03 },
  "motion": "still",
  "submerged": true,
  "quality": 0.93,
  "calibrated": true
}
```

## Fields

| Field | Type | Units | Notes |
|---|---|---|---|
| `v` | int | — | Schema version. Reject mismatches loudly. |
| `device_id` | string | — | Lets two spoons share one backend. |
| `seq` | int | — | Monotonic per boot. Gaps = dropped frames. |
| `uptime_ms` | int | ms | Since boot. Backend stamps wall-clock on arrival. |
| `temp_c` | float | °C | DS18B20. `null` if the probe is missing. |
| `ec_raw_ms` | float | mS/cm | Uncompensated, at `temp_c`. Kept for debugging. |
| `ec25_ms` | float | mS/cm | Temperature-compensated to 25 °C. **This is the real measurement.** |
| `salinity_g_l` | float | g/L NaCl | Derived from `ec25_ms` via the calibration curve. |
| `salt_pct` | float | % w/v | `salinity_g_l / 10`. Convenience for the UI. |
| `sodium_mg_per_100ml` | float | mg | `salinity_g_l * 39.34` — volume-independent. |
| `imu.a*` | float | m/s² | Accelerometer. |
| `imu.g*` | float | rad/s | Gyroscope. |
| `motion` | enum | — | `still` \| `stirring` \| `moving` \| `unknown` |
| `submerged` | bool | — | Fused from EC floor + temperature rise. |
| `quality` | float | 0–1 | Trust score. See below. |
| `calibrated` | bool | — | False until a 2-point EC calibration is stored. |

## Why `quality` exists

An EC probe waved through the air reads ~0 mS/cm, and a probe in a soup being
stirred reads garbage because turbulence and bubbles break the conduction path.
Charting those values as "salinity" produces a graph that looks like noise and a
sodium estimate that is simply wrong.

So the dashboard **never averages a raw sample stream**. It only accumulates
samples where:

- `submerged` is true, and
- `motion == "still"` for a sustained window, and
- the rolling standard deviation of `ec25_ms` is low.

`quality` collapses those three into one number. Samples below
`QUALITY_THRESHOLD` (0.6) are drawn on the live chart in a muted style but
excluded from the session's salinity estimate.

This is the single most important idea in the project: **the MPU-6050 is not a
decoration, it is the gate that decides which EC readings are allowed to count.**

## Sodium math

NaCl is 39.34 % sodium by mass.

```
sodium_mg = salinity_g_l * 0.3934 * 1000 * volume_litres
```

A 240 mL bowl at 0.5 % salt is `5.0 * 0.3934 * 1000 * 0.24` ≈ **472 mg sodium**,
or about 20 % of the FDA's 2,300 mg/day limit (31 % of the AHA's ideal 1,500 mg).

## Backend → dashboard

The backend rebroadcasts each sample on `/ws/live` wrapped with server context:

```json
{ "type": "sample", "received_at": "2026-09-15T18:56:03.114Z", "session_id": 7, "data": { ...above... } }
```

Other `/ws/live` message types: `session_started`, `session_ended`, `status`.
