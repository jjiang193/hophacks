#pragma once
#include <Arduino.h>
#include "config.h"

// ---------------------------------------------------------------------------
// EC (mS/cm @ 25 C) -> NaCl concentration -> sodium
//
// This mirrors backend/app/salinity.py. If you change the curve here, change it
// there too, or the dashboard and the spoon will disagree about dinner.
// ---------------------------------------------------------------------------

namespace salinity {

// NaCl solutions are slightly sublinear in conductivity over our range, so a
// quadratic beats a single multiplier. Reference points the defaults hit:
//   2.0 mS/cm -> 1.0 g/L (0.1%)      17.5 mS/cm -> 10.0 g/L (1.0%)
inline float ecToGramsPerLitre(float ec25_ms) {
  if (ec25_ms <= 0.0f) return 0.0f;
  return SALINITY_COEFF_A * ec25_ms + SALINITY_COEFF_B * ec25_ms * ec25_ms;
}

inline float gramsPerLitreToSaltPercent(float g_l) {
  return g_l / 10.0f;   // 10 g/L == 1 % w/v
}

// Volume-independent, so the firmware can report it without knowing bowl size.
// The dashboard multiplies by the user's serving volume.
inline float gramsPerLitreToSodiumMgPer100ml(float g_l) {
  return g_l * SODIUM_FRACTION_OF_NACL * 100.0f;
}

}  // namespace salinity
