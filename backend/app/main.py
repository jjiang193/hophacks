"""Salinity Spoon backend.

    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

--host 0.0.0.0 matters: the ESP32 connects from another machine on the network,
so binding to localhost makes the spoon invisible.
"""

import json
from datetime import datetime, time, timezone

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from . import salinity, store
from .hub import Hub, SessionTracker
from .schema import SCHEMA_VERSION, Sample
from .store import utcnow

app = FastAPI(title="Salinity Spoon")

# The Vite dev server runs on a different port; without this the dashboard's
# fetch calls die at the browser before they reach us.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

hub = Hub()
tracker = SessionTracker(hub)


@app.on_event("startup")
def _startup() -> None:
    store.init_db()


# --- Ingest ------------------------------------------------------------------
@app.websocket("/ws/ingest")
async def ws_ingest(ws: WebSocket) -> None:
    """The spoon (or tools/mock_spoon.py) connects here."""
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                payload = json.loads(raw)
                sample = Sample.model_validate(payload)
            except (json.JSONDecodeError, ValidationError) as exc:
                await ws.send_text(json.dumps({"type": "error", "detail": str(exc)}))
                continue

            if sample.v != SCHEMA_VERSION:
                await ws.send_text(
                    json.dumps({
                        "type": "error",
                        "detail": f"schema v{sample.v}, backend expects v{SCHEMA_VERSION}",
                    })
                )
                continue

            session_id = await tracker.feed(sample)
            store.insert_sample(session_id, payload)

            message = {
                "type": "sample",
                "received_at": utcnow(),
                "session_id": session_id,
                "data": payload,
            }
            hub.last_sample = message
            await hub.broadcast(message)
    except WebSocketDisconnect:
        pass


# --- Live feed ---------------------------------------------------------------
@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    """The dashboard connects here."""
    await ws.accept()
    await hub.register(ws)
    try:
        # Prime a freshly-opened tab so it is not staring at an empty chart.
        if hub.last_sample:
            await ws.send_text(json.dumps(hub.last_sample))
        while True:
            await ws.receive_text()  # keepalive / future client commands
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(ws)


# --- REST --------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "schema_version": SCHEMA_VERSION,
        "active_session": tracker.session_id,
        "spoon_seen": hub.last_sample is not None,
    }


@app.get("/api/sessions")
def sessions(limit: int = 50) -> list[dict]:
    return store.list_sessions(limit)


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: int) -> dict:
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    return {"session": session, "samples": store.get_session_samples(session_id)}


@app.post("/api/sessions/close")
async def close_session() -> dict:
    """Manual override when auto-detection misfires."""
    await tracker.force_close()
    return {"ok": True}


class ServingConfig(BaseModel):
    serving_ml: float


@app.post("/api/serving")
def set_serving(cfg: ServingConfig) -> dict:
    if cfg.serving_ml <= 0:
        raise HTTPException(400, "serving_ml must be positive")
    tracker.serving_ml = cfg.serving_ml
    return {"serving_ml": tracker.serving_ml}


@app.get("/api/intake/today")
def intake_today() -> dict:
    """Sodium consumed today, in the only units that mean anything to a person."""
    midnight = datetime.combine(datetime.now(timezone.utc).date(), time.min, timezone.utc)
    totals = store.sodium_since(midnight.isoformat())
    ctx = salinity.contextualise(totals["total_sodium_mg"])
    return {
        **totals,
        "fda_daily_limit_mg": salinity.FDA_DAILY_LIMIT_MG,
        "aha_ideal_limit_mg": salinity.AHA_IDEAL_LIMIT_MG,
        "pct_of_fda_limit": ctx.pct_of_fda_limit,
        "pct_of_aha_ideal": ctx.pct_of_aha_ideal,
        "verdict": ctx.verdict,
    }
