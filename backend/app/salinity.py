"""EC -> NaCl -> sodium.

Mirror of firmware/spoon/salinity.h. These two must agree; the firmware reports
derived values so the spoon is useful over bare serial, and the backend
recomputes them so a recalibration does not require reflashing.
"""

from dataclasses import dataclass

# g/L NaCl = A * ec25 + B * ec25^2
# Defaults fitted to reference NaCl conductivity at 25 C:
#   2.0 mS/cm -> 1.0 g/L,  17.5 mS/cm -> 10.0 g/L
# Replace with your own fit - see docs/calibration.md.
COEFF_A = 0.49078
COEFF_B = 0.004608

SODIUM_FRACTION_OF_NACL = 0.3934

# Daily sodium reference intakes, milligrams.
FDA_DAILY_LIMIT_MG = 2300
AHA_IDEAL_LIMIT_MG = 1500

DEFAULT_SERVING_ML = 240.0  # one cup


def ec_to_g_per_litre(ec25_ms: float) -> float:
    if ec25_ms <= 0:
        return 0.0
    return COEFF_A * ec25_ms + COEFF_B * ec25_ms * ec25_ms


def g_per_litre_to_salt_percent(g_l: float) -> float:
    return g_l / 10.0


def g_per_litre_to_sodium_mg_per_100ml(g_l: float) -> float:
    return g_l * SODIUM_FRACTION_OF_NACL * 100.0


def sodium_mg_for_serving(g_l: float, volume_ml: float = DEFAULT_SERVING_ML) -> float:
    """Total sodium in a serving of this soup, in milligrams."""
    return g_l * SODIUM_FRACTION_OF_NACL * (volume_ml / 1000.0) * 1000.0


@dataclass
class SodiumContext:
    """What a number like '472 mg' actually means to a person."""

    sodium_mg: float
    pct_of_fda_limit: float
    pct_of_aha_ideal: float
    verdict: str


def contextualise(sodium_mg: float) -> SodiumContext:
    pct_fda = sodium_mg / FDA_DAILY_LIMIT_MG * 100.0
    pct_aha = sodium_mg / AHA_IDEAL_LIMIT_MG * 100.0

    # Thresholds are per-serving fractions of the daily limit, not medical
    # advice. Tune the wording, not the physics.
    if pct_fda < 10:
        verdict = "low"
    elif pct_fda < 20:
        verdict = "moderate"
    elif pct_fda < 35:
        verdict = "high"
    else:
        verdict = "very high"

    return SodiumContext(
        sodium_mg=sodium_mg,
        pct_of_fda_limit=pct_fda,
        pct_of_aha_ideal=pct_aha,
        verdict=verdict,
    )
