import { useEffect, useRef, useState } from 'react';
import {
  ChartPoint, IntakeToday, LiveMessage, QUALITY_THRESHOLD,
  Sample, Session, SessionSummary, SCHEMA_VERSION,
} from '../types';

/** ~2 minutes of history at 5 Hz. Older points scroll off the chart. */
const MAX_POINTS = 600;

/** The spoon streams at 5 Hz; React repaints at 5 Hz too if we let it.
 *  Buffer incoming samples and flush on an interval instead. */
const FLUSH_MS = 200;

export interface TelemetryState {
  connected: boolean;
  latest: Sample | null;
  points: ChartPoint[];
  activeSessionId: number | null;
  lastSummary: SessionSummary | null;
  sessions: Session[];
  intake: IntakeToday | null;
  schemaMismatch: boolean;
}

function toPoint(msg: Extract<LiveMessage, { type: 'sample' }>): ChartPoint {
  const d = msg.data;
  const trusted = d.submerged && d.quality >= QUALITY_THRESHOLD;
  return {
    t: new Date(msg.received_at).getTime(),
    salinity_g_l: d.salinity_g_l,
    salt_pct: d.salt_pct,
    temp_c: d.temp_c,
    quality: d.quality,
    submerged: d.submerged,
    motion: d.motion,
    measured_salt_pct: d.submerged ? d.salt_pct : null,
    trusted_salt_pct: trusted ? d.salt_pct : null,
  };
}

export function useTelemetry(): TelemetryState {
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState<Sample | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [intake, setIntake] = useState<IntakeToday | null>(null);
  const [schemaMismatch, setSchemaMismatch] = useState(false);

  const buffer = useRef<ChartPoint[]>([]);
  const pendingLatest = useRef<Sample | null>(null);

  async function refreshHistory() {
    try {
      const [s, i] = await Promise.all([
        fetch('/api/sessions?limit=25').then((r) => r.json()),
        fetch('/api/intake/today').then((r) => r.json()),
      ]);
      setSessions(s);
      setIntake(i);
    } catch {
      // A dead backend already shows up as a disconnected socket; no need to
      // shout about it twice.
    }
  }

  useEffect(() => {
    refreshHistory();

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/live`);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (ev) => {
        const msg: LiveMessage = JSON.parse(ev.data);
        switch (msg.type) {
          case 'sample':
            if (msg.data.v !== SCHEMA_VERSION) { setSchemaMismatch(true); return; }
            pendingLatest.current = msg.data;
            buffer.current.push(toPoint(msg));
            setActiveSessionId(msg.session_id);
            break;
          case 'session_started':
            setActiveSessionId(msg.session_id);
            setLastSummary(null);
            break;
          case 'session_ended':
            setActiveSessionId(null);
            setLastSummary(msg.summary);
            refreshHistory();
            break;
          case 'error':
            console.warn('backend:', msg.detail);
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };

    connect();

    const flush = setInterval(() => {
      if (pendingLatest.current) {
        setLatest(pendingLatest.current);
        pendingLatest.current = null;
      }
      if (buffer.current.length) {
        const incoming = buffer.current;
        buffer.current = [];
        setPoints((prev) => [...prev, ...incoming].slice(-MAX_POINTS));
      }
    }, FLUSH_MS);

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(flush);
      ws?.close();
    };
  }, []);

  return {
    connected, latest, points, activeSessionId,
    lastSummary, sessions, intake, schemaMismatch,
  };
}
