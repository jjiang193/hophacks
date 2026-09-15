import { Sample, SessionSummary } from '../types';
import {
  DEFAULT_SERVING_ML, FDA_DAILY_LIMIT_MG, sodiumMgForServing,
  verdictFor, VERDICT_STATUS,
} from '../lib/sodium';

interface Props {
  latest: Sample | null;
  lastSummary: SessionSummary | null;
  activeSessionId: number | null;
  servingMl?: number;
}

/**
 * The headline. A single number with a comparison is a better answer than any
 * chart here - "how much salt is in this bowl" has one value, not a shape.
 *
 * While a session is live this tracks the current reading; once the spoon comes
 * out it locks to the session's median, which is the number worth trusting.
 */
export function SodiumHero({ latest, lastSummary, activeSessionId, servingMl = DEFAULT_SERVING_ML }: Props) {
  const live = activeSessionId !== null;

  const gPerL = live
    ? latest?.salinity_g_l ?? 0
    : lastSummary?.salinity_g_l ?? latest?.salinity_g_l ?? 0;

  const sodiumMg = sodiumMgForServing(gPerL, servingMl);
  const saltPct = gPerL / 10;
  const pctOfLimit = (sodiumMg / FDA_DAILY_LIMIT_MG) * 100;

  const verdict = verdictFor(sodiumMg);
  const status = VERDICT_STATUS[verdict];

  // Untrusted readings stay visible but visibly provisional - blanking the
  // number mid-demo is worse than dimming it.
  const trusted = live ? (latest?.quality ?? 0) >= 0.6 : true;
  const hasData = latest !== null || lastSummary !== null;

  return (
    <section className="card">
      <h2>Sodium in this bowl</h2>
      <p className="caption">
        {live ? 'Live reading' : lastSummary ? 'Final reading, session median' : 'Waiting for the spoon'}
        {' · '}{servingMl} mL serving
      </p>

      <p className={`hero-value${trusted ? '' : ' hero-dim'}`}>
        {hasData ? Math.round(sodiumMg).toLocaleString() : '—'}
        <span className="unit">mg</span>
      </p>

      <div className="pill-row" style={{ marginTop: 14 }}>
        <span className="pill" data-status={status.role}>
          <span className="dot">{status.icon}</span>
          {verdict} sodium
        </span>
        <span className="pill">
          {pctOfLimit.toFixed(0)}% of the 2,300 mg daily limit
        </span>
      </div>

      <p className="hero-sub">
        {hasData
          ? <>Soup measures <strong style={{ color: 'var(--text-primary)' }}>{saltPct.toFixed(2)}% salt</strong> by weight.
              {' '}Canned soup typically runs 0.6–0.9%.</>
          : 'Dip the spoon in and hold it still for two seconds.'}
      </p>
      {!trusted && live && (
        <p className="hero-sub">Hold the spoon still — this reading is not settled yet.</p>
      )}
    </section>
  );
}
