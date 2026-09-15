"""Telemetry contract. See docs/telemetry-schema.md."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1

# Samples below this are charted but never counted toward a salinity estimate.
QUALITY_THRESHOLD = 0.6


class IMU(BaseModel):
    ax: float = 0.0
    ay: float = 0.0
    az: float = 0.0
    gx: float = 0.0
    gy: float = 0.0
    gz: float = 0.0


class Sample(BaseModel):
    v: int = SCHEMA_VERSION
    device_id: str = "spoon-01"
    seq: int = 0
    uptime_ms: int = 0

    temp_c: Optional[float] = None
    ec_raw_ms: float = 0.0
    ec25_ms: float = 0.0
    salinity_g_l: float = 0.0
    salt_pct: float = 0.0
    sodium_mg_per_100ml: float = 0.0

    imu: IMU = Field(default_factory=IMU)
    motion: Literal["still", "stirring", "moving", "unknown"] = "unknown"
    submerged: bool = False
    quality: float = 0.0
    calibrated: bool = False

    @property
    def trustworthy(self) -> bool:
        return self.submerged and self.quality >= QUALITY_THRESHOLD
