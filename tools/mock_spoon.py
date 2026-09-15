#!/usr/bin/env python3
"""Mock spoon - emits the real telemetry schema over the real WebSocket path.

This exists so dashboard work never blocks on hardware. It is not a stub: it
walks the same state machine a real tasting does, with plausible noise, so the
dashboard's quality gating and session detection get exercised properly.

    pip install websockets
    python tools/mock_spoon.py --target 0.6

Options let you drive the demo by hand:
    --target 0.9        simulate a saltier soup (% w/v)
    --scenario cooling  watch a hot soup cool while salinity holds steady
    --noise 0.3         crank ADC noise to see the quality gate reject samples
"""

import argparse
import asyncio
import json
import math
import random
import time

import websockets

SCHEMA_VERSION = 1

# Inverse of the backend's quadratic fit: given a target salinity, what EC would
# the probe actually read? Solves B*x^2 + A*x - g_l = 0 for x.
COEFF_A = 0.49078
COEFF_B = 0.004608


def g_per_litre_to_ec25(g_l: float) -> float:
    if g_l <= 0:
        return 0.0
    disc = COEFF_A**2 + 4 * COEFF_B * g_l
    return (-COEFF_A + math.sqrt(disc)) / (2 * COEFF_B)


class MockSpoon:
    """States: resting -> dipping -> stirring -> settling -> reading -> lifting"""

    PHASES = [
        ("resting", 3.0),
        ("dipping", 1.5),
        ("stirring", 4.0),
        ("settling", 2.5),
        ("reading", 6.0),
        ("lifting", 6.0),
    ]

    def __init__(self, target_pct: float, noise: float, scenario: str, ambient: float):
        self.target_g_l = target_pct * 10.0
        self.noise = noise
        self.scenario = scenario
        self.ambient = ambient
        self.seq = 0
        self.t0 = time.time()
        self.phase_idx = 0
        self.phase_start = time.time()
        self.soup_temp = 72.0
        self.still_run = 0

    @property
    def phase(self) -> str:
        return self.PHASES[self.phase_idx][0]

    def advance(self) -> None:
        name, duration = self.PHASES[self.phase_idx]
        if time.time() - self.phase_start >= duration:
            self.phase_idx = (self.phase_idx + 1) % len(self.PHASES)
            self.phase_start = time.time()
            print(f"  -> {self.phase}")

    def sample(self) -> dict:
        self.advance()
        phase = self.phase
        submerged = phase in ("dipping", "stirring", "settling", "reading")

        # Newton cooling, so the temperature curve looks like a real bowl.
        if self.scenario == "cooling":
            self.soup_temp += (self.ambient - self.soup_temp) * 0.004

        temp_c = self.soup_temp if submerged else self.ambient + random.gauss(0, 0.1)

        # --- EC ---
        if not submerged:
            ec25 = max(0.0, random.gauss(0.05, 0.03))       # air: near zero
        else:
            ec25 = g_per_litre_to_ec25(self.target_g_l)
            if phase == "dipping":
                ec25 *= random.uniform(0.3, 0.9)             # probe not fully wetted
            elif phase == "stirring":
                ec25 *= random.uniform(0.75, 1.25)           # bubbles and turbulence
            elif phase == "settling":
                ec25 *= random.uniform(0.95, 1.05)
            ec25 += random.gauss(0, self.noise)
            ec25 = max(0.0, ec25)

        # --- IMU ---
        if phase == "stirring":
            gyro = [random.gauss(0, 2.2) for _ in range(3)]
            accel = [random.gauss(0, 1.5), random.gauss(0, 1.5), 9.81 + random.gauss(0, 1.5)]
            motion = "stirring"
        elif phase in ("dipping", "lifting"):
            gyro = [random.gauss(0, 0.5) for _ in range(3)]
            accel = [random.gauss(0, 0.4), random.gauss(0, 0.4), 9.81 + random.gauss(0, 0.6)]
            motion = "moving"
        else:
            gyro = [random.gauss(0, 0.04) for _ in range(3)]  # a human hand is
            accel = [random.gauss(0, 0.05), random.gauss(0, 0.05), 9.81 + random.gauss(0, 0.05)]
            motion = "still"                                  # never perfectly still

        self.still_run = self.still_run + 1 if motion == "still" else 0

        # --- Quality, mirroring the firmware's logic ---
        if not submerged:
            quality = 0.0
        else:
            settle = min(self.still_run / 10.0, 1.0)
            stability = 1.0 - min(max((self.noise - 0.05) / 0.45, 0.0), 1.0)
            if phase == "stirring":
                stability *= 0.2
            quality = round(settle * 0.5 + stability * 0.5, 3)

        g_l = COEFF_A * ec25 + COEFF_B * ec25**2
        self.seq += 1

        return {
            "v": SCHEMA_VERSION,
            "device_id": "spoon-mock",
            "seq": self.seq,
            "uptime_ms": int((time.time() - self.t0) * 1000),
            "temp_c": round(temp_c, 2),
            "ec_raw_ms": round(ec25 * (1 + 0.02 * (temp_c - 25)), 3),
            "ec25_ms": round(ec25, 3),
            "salinity_g_l": round(g_l, 3),
            "salt_pct": round(g_l / 10.0, 4),
            "sodium_mg_per_100ml": round(g_l * 0.3934 * 100, 2),
            "imu": {
                "ax": round(accel[0], 3), "ay": round(accel[1], 3), "az": round(accel[2], 3),
                "gx": round(gyro[0], 4), "gy": round(gyro[1], 4), "gz": round(gyro[2], 4),
            },
            "motion": motion,
            "submerged": submerged,
            "quality": quality,
            "calibrated": True,
        }


async def run(args: argparse.Namespace) -> None:
    spoon = MockSpoon(args.target, args.noise, args.scenario, args.ambient)
    url = f"ws://{args.host}:{args.port}/ws/ingest"
    interval = 1.0 / args.rate

    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"connected to {url}  (target {args.target}% salt)")
                while True:
                    await ws.send(json.dumps(spoon.sample()))
                    await asyncio.sleep(interval)
        except Exception as exc:
            print(f"connection lost ({exc}); retrying in 2s")
            await asyncio.sleep(2)


def main() -> None:
    p = argparse.ArgumentParser(description="Mock salinity spoon")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--rate", type=float, default=5.0, help="samples per second")
    p.add_argument("--target", type=float, default=0.6, help="soup salinity, %% w/v")
    p.add_argument("--noise", type=float, default=0.08, help="EC noise sigma, mS/cm")
    p.add_argument("--ambient", type=float, default=22.0, help="room temperature, C")
    p.add_argument("--scenario", default="steady", choices=["steady", "cooling"])
    args = p.parse_args()

    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()
