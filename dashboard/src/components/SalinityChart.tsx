import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartPoint } from '../types';
import { clockTime, relativeTick } from '../lib/time';

function SaltTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  const trusted = p.trusted_salt_pct !== null;
  return (
    <div className="tip">
      <div className="tip-t">{clockTime(label)}</div>
      <div className="tip-row">
        <span className="swatch" style={{ background: 'var(--series-salinity)' }} />
        {p.salt_pct.toFixed(3)}% salt
      </div>
      <div className="tip-note">
        {trusted ? `settled · quality ${(p.quality * 100).toFixed(0)}%`
                 : p.submerged ? `not settled (${p.motion}) · excluded`
                               : 'out of the soup · excluded'}
      </div>
    </div>
  );
}

/**
 * One measure, one axis. Temperature lives in its own chart below - a second
 * y-scale here would let the eye read a crossing as a relationship.
 *
 * The line is drawn twice: a ghost pass over every sample, and a solid pass
 * over trusted samples only. Gaps in the solid line are the honest picture of
 * when the spoon was being moved.
 */
export function SalinityChart({ points }: { points: ChartPoint[] }) {
  const hasData = points.length > 1;
  const now = points.length ? points[points.length - 1].t : Date.now();

  return (
    <section className="card">
      <h2>Live salinity</h2>
      <p className="caption">
        Rolling 2-minute window · solid where the spoon was settled · faint while stirring ·
        blank where it left the soup
      </p>

      {!hasData ? (
        <p className="empty">Waiting for samples…</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />

            {/* Context band, not a target: most commercial soup sits above it. */}
            <ReferenceArea
              y1={0.3} y2={0.6}
              fill="var(--band-fill)" stroke="none"
              label={{ value: 'lower-sodium range', position: 'insideTopLeft',
                       fill: 'var(--text-muted)', fontSize: 10 }}
            />

            <XAxis
              dataKey="t" type="number" domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => relativeTick(t, now)}
              stroke="var(--axis)" tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={48}
            />
            <YAxis
              stroke="var(--axis)" tickLine={false} axisLine={false} width={48}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, (max: number) => Math.max(1, Math.ceil(max * 10) / 10)]}
            />
            <Tooltip content={<SaltTip />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />

            <Line
              type="monotone" dataKey="measured_salt_pct" dot={false}
              isAnimationActive={false} connectNulls={false}
              stroke="var(--series-salinity)" strokeWidth={2} strokeOpacity={0.25}
            />
            <Line
              type="monotone" dataKey="trusted_salt_pct" dot={false} isAnimationActive={false}
              stroke="var(--series-salinity)" strokeWidth={2} connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
