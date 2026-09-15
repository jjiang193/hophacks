import { IntakeToday } from '../types';

/**
 * A meter, not a chart: one value against one threshold. The AHA's stricter
 * 1,500 mg ideal is marked on the track so the FDA limit isn't read as a target.
 */
export function DailyMeter({ intake }: { intake: IntakeToday | null }) {
  if (!intake) {
    return (
      <section className="card">
        <h2>Today's sodium</h2>
        <p className="empty">No completed measurements yet.</p>
      </section>
    );
  }

  const pct = Math.min(intake.pct_of_fda_limit, 100);
  const idealMarkerPct = (intake.aha_ideal_limit_mg / intake.fda_daily_limit_mg) * 100;

  const role =
    intake.pct_of_fda_limit >= 100 ? 'critical'
    : intake.pct_of_fda_limit >= 75 ? 'warning'
    : 'good';
  const icon = role === 'critical' ? '■' : role === 'warning' ? '▲' : '●';
  const fillColor = `var(--status-${role})`;

  return (
    <section className="card">
      <h2>Today's sodium</h2>
      <p className="caption">
        {intake.session_count} measurement{intake.session_count === 1 ? '' : 's'} logged
      </p>

      <div className="readouts">
        <div className="readout">
          <div className="label">Consumed</div>
          <div className="value">
            {Math.round(intake.total_sodium_mg).toLocaleString()} <small>mg</small>
          </div>
        </div>
        <div className="readout">
          <div className="label">Remaining</div>
          <div className="value">
            {Math.max(0, Math.round(intake.fda_daily_limit_mg - intake.total_sodium_mg)).toLocaleString()}{' '}
            <small>mg</small>
          </div>
        </div>
      </div>

      <div className="meter">
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${pct}%`, background: fillColor }} />
          <div
            className="meter-marker"
            style={{ left: `${idealMarkerPct}%` }}
            title={`AHA ideal limit: ${intake.aha_ideal_limit_mg} mg`}
          />
        </div>
        <div className="meter-legend">
          <span>0</span>
          <span>AHA ideal 1,500</span>
          <span>FDA limit 2,300</span>
        </div>
      </div>

      <div className="pill-row" style={{ marginTop: 14 }}>
        <span className="pill" data-status={role}>
          <span className="dot">{icon}</span>
          {intake.pct_of_fda_limit.toFixed(0)}% of daily limit
        </span>
      </div>
    </section>
  );
}
