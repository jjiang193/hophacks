# Calibration

Two separate calibrations. They are often confused, and doing only the first is
the most common reason a salinity number is confidently wrong.

---

## 1. EC probe calibration (voltage → mS/cm)

This is the DFRobot library's own routine. It teaches the library how your
specific probe's voltage maps to conductivity.

**You need:** the 1413 µS/cm and 12.88 mS/cm standard solutions that ship with
the DFR0300.

1. Open the Serial Monitor at 115200 baud.
2. Rinse the probe in distilled water, shake off the drops.
3. Put it in the **1413 µS/cm** solution, wait for the reading to settle.
4. Type `enterec`, then `calec`, then `exitec`.
5. Rinse again, repeat in the **12.88 mS/cm** solution.

The library recognises which standard it is in on its own, so the order does not
matter, and it stores the result in EEPROM — you only redo this if the probe is
replaced or badly fouled.

**Recalibrate if** readings drift between sessions, the probe has been in
anything oily, or you have changed the ADC path (internal ↔ ADS1115). The ADS1115
switch in particular invalidates the stored calibration — the voltages the
library sees are measured by different hardware.

---

## 2. Salinity curve calibration (mS/cm → g/L NaCl)

**This is the one people skip, and it is the one that decides whether your sodium
number means anything.**

Conductivity is not salt. Generic TDS meters multiply EC by a constant around
0.5 and call it ppm, which is a rough approximation for tap water and a poor one
for soup. Soup also contains potassium, glutamate, and dissolved organics that
conduct — so the honest framing is **"salinity as NaCl equivalent"**, not "salt
content".

### The protocol

Make up known solutions by mass, in distilled water, and record the EC your
system reports at a stable temperature:

| Target | NaCl | Water | Roughly |
|---|---|---|---|
| 0.25 % | 2.5 g | 1000 mL | weak broth |
| 0.50 % | 5.0 g | 1000 mL | typical homemade soup |
| 0.75 % | 7.5 g | 1000 mL | typical canned soup |
| 1.00 % | 10.0 g | 1000 mL | salty restaurant soup |

Use a kitchen scale with 0.1 g resolution. For each, dip the spoon, let it
settle, and record `ec25_ms` from the serial output or the dashboard.

Then fit `g/L = A·EC + B·EC²` to your four points (any spreadsheet's polynomial
trendline through the origin will do) and put the coefficients in **both**:

- `firmware/spoon/config.h` → `SALINITY_COEFF_A`, `SALINITY_COEFF_B`
- `backend/app/salinity.py` → `COEFF_A`, `COEFF_B`

The shipped defaults are fitted to reference NaCl conductivity tables. They are a
reasonable starting point and they are **not** a calibration of your probe.

### Why a quadratic and not a straight line

NaCl conductivity is slightly sublinear over this range — ions start interfering
with each other as concentration rises. A single multiplier fitted at 0.5 % will
over-read at 1 %, which is exactly where the interesting soups live.

### Watch the top of the range

The DFR0300 tops out at **20 mS/cm**, and 1 % NaCl is around 17.5 mS/cm at 25 °C.
A salty restaurant soup can brush the ceiling. The firmware drops `quality` hard
when a reading is within 5 % of the maximum, so an over-range sample is visibly
untrusted rather than silently clipped.

If you routinely need to measure above ~1.2 %, dilute a known volume — 1 part
soup to 1 part distilled water, then double the result.

---

## 3. Validating the whole chain

Once both calibrations are in, measure a solution you did **not** use in the fit —
0.6 % is a good choice. If the dashboard reports within ±0.05 % of that, the
chain is trustworthy end to end.

Do this before the demo. It takes five minutes and it is the difference between
"our sensor says 0.72 %" and "our sensor says 0.72 %, and we checked."
