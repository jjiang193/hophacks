"""Live fan-out plus automatic session detection."""

import asyncio
import json
import statistics
from typing import Any, Optional

from fastapi import WebSocket

from . import salinity, store
from .schema import QUALITY_THRESHOLD, Sample


class Hub:
    """Fans every ingested sample out to every connected dashboard."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.last_sample: Optional[dict[str, Any]] = None

    async def register(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.add(ws)

    async def unregister(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        text = json.dumps(message)
        async with self._lock:
            targets = list(self._clients)

        dead = []
        for ws in targets:
            try:
                await ws.send_text(text)
            except Exception:
                # A dashboard tab closing mid-send is normal, not an error.
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)


class SessionTracker:
    """Turns a continuous sample stream into discrete 'bowls of soup'.

    Nobody wants to press Start before tasting. Dipping the spoon opens a
    session; lifting it out for a few seconds closes one. The session's salinity
    is the median of its trustworthy samples - median, not mean, because one
    bubble against the probe should not move the sodium number.
    """

    SAMPLES_TO_OPEN = 5    # ~1 s at 5 Hz
    SAMPLES_TO_CLOSE = 25  # ~5 s out of the soup

    def __init__(self, hub: Hub, serving_ml: float = salinity.DEFAULT_SERVING_ML) -> None:
        self.hub = hub
        self.serving_ml = serving_ml
        self.session_id: Optional[int] = None
        self._good_run = 0
        self._dry_run = 0
        self._salinities: list[float] = []
        self._temps: list[float] = []

    async def feed(self, sample: Sample) -> Optional[int]:
        if sample.trustworthy:
            self._good_run += 1
            self._dry_run = 0
        else:
            self._dry_run += 1
            self._good_run = 0

        if self.session_id is None and self._good_run >= self.SAMPLES_TO_OPEN:
            await self._open(sample)

        if self.session_id is not None:
            if sample.trustworthy:
                self._salinities.append(sample.salinity_g_l)
                if sample.temp_c is not None:
                    self._temps.append(sample.temp_c)
            if self._dry_run >= self.SAMPLES_TO_CLOSE:
                await self._close()

        return self.session_id

    async def _open(self, sample: Sample) -> None:
        self.session_id = store.start_session(sample.device_id, self.serving_ml)
        self._salinities.clear()
        self._temps.clear()
        await self.hub.broadcast(
            {"type": "session_started", "session_id": self.session_id}
        )

    async def _close(self) -> None:
        if self.session_id is None:
            return

        summary: dict[str, Any] = {"sample_count": len(self._salinities)}
        if self._salinities:
            g_l = statistics.median(self._salinities)
            sodium_mg = salinity.sodium_mg_for_serving(g_l, self.serving_ml)
            summary.update(
                salinity_g_l=g_l,
                salt_pct=salinity.g_per_litre_to_salt_percent(g_l),
                sodium_mg=sodium_mg,
                temp_c=statistics.median(self._temps) if self._temps else None,
            )

        store.end_session(self.session_id, summary)
        closed_id = self.session_id
        self.session_id = None
        self._salinities.clear()
        self._temps.clear()

        await self.hub.broadcast(
            {"type": "session_ended", "session_id": closed_id, "summary": summary}
        )

    async def force_close(self) -> None:
        """Manual override for when the auto-detector gets it wrong on stage."""
        await self._close()
