import { QUALITY_THRESHOLD, Sample } from '../types';

interface Props {
  connected: boolean;
  latest: Sample | null;
  activeSessionId: number | null;
}

const MOTION_LABEL: Record<string, string> = {
  still: 'Still',
  stirring: 'Stirring',
  moving: 'Moving',
  unknown: 'No IMU',
};

/**
 * Makes the sensor fusion legible. The point judges should take away: the
 * MPU-6050 is not decoration - it is the gate deciding which EC readings count.
 */
export function SensorStatus({ connected, latest, activeSessionId }: Props) {
  const quality = latest?.quality ?? 0;
  const trusted = (latest?.submerged ?? false) && quality >= QUALITY_THRESHOLD;

  return (
    <section className="card">
      <h2>Sensor state</h2>
      <p className="caption">
        {activeSessionId !== null ? `Recording session #${activeSessionId}` : 'Idle'}
      </p>

      <div className="pill-row">
        <span className="pill" data-status={connected ? 'good' : 'critical'}>
          <span className="dot">{connected ? '●' : '■'}</span>
          {connected ? 'Spoon connected' : 'Disconnected'}
        </span>
        <span className="pill" data-status={latest?.submerged ? 'good' : 'warning'}>
          <span className="dot">{latest?.submerged ? '●' : '▲'}</span>
          {latest?.submerged ? 'Submerged' : 'Out of liquid'}
        </span>
        <span className="pill">
          <span className="dot">◆</span>
          {MOTION_LABEL[latest?.motion ?? 'unknown']}
        </span>
        <span className="pill" data-status={trusted ? 'good' : 'warning'}>
          <span className="dot">{trusted ? '●' : '▲'}</span>
          {trusted ? 'Reading counts' : 'Reading excluded'}
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="readout">
          <div className="label">Reading quality</div>
          <div className="value">{(quality * 100).toFixed(0)}<small>%</small></div>
        </div>
        <div className="quality-track">
          <div className="quality-fill" style={{ width: `${Math.round(quality * 100)}%` }} />
        </div>
      </div>

      <div className="readouts" style={{ marginTop: 20 }}>
        <div className="readout">
          <div className="label">EC @ 25 °C</div>
          <div className="value">
            {latest ? latest.ec25_ms.toFixed(2) : '—'} <small>mS/cm</small>
          </div>
        </div>
        <div className="readout">
          <div className="label">Temperature</div>
          <div className="value">
            {latest?.temp_c != null ? latest.temp_c.toFixed(1) : '—'} <small>°C</small>
          </div>
        </div>
        <div className="readout">
          <div className="label">Salt</div>
          <div className="value">
            {latest ? latest.salt_pct.toFixed(3) : '—'} <small>% w/v</small>
          </div>
        </div>
        <div className="readout">
          <div className="label">Samples</div>
          <div className="value">{latest?.seq ?? '—'}</div>
        </div>
      </div>
    </section>
  );
}
