import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartPoint } from '../types';
import { clockTime, relativeTick } from '../lib/time';

function TempTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p: ChartPoint = payload[0].payload;
  if (p.temp_c === null) return null;
  return (
    <div className="tip">
      <div className="tip-t">{clockTime(label)}</div>
      <div className="tip-row">
        <span className="swatch" style={{ background: 'var(--series-temp)' }} />
        {p.temp_c.toFixed(1)} °C
      </div>
    </div>
  );
}

/**
 * Its own chart on its own axis, deliberately. Temperature is not a second
 * series on the salinity plot - it is a different measure in different units,
 * and overlaying them would invent a correlation the data does not claim.
 *
 * It earns its place twice over: it is the input to the EC library's
 * compensation, and it is what tells you the soup is cool enough to eat.
 */
export function TemperatureChart({ points }: { points: ChartPoint[] }) {
  const withTemp = points.filter((p) => p.temp_c !== null);
  const now = withTemp.length ? withTemp[withTemp.length - 1].t : Date.now();

  return (
    <section className="card">
      <h2>Probe temperature</h2>
      <p className="caption">
        Drives the EC temperature compensation · DS18B20 · drops to room temperature
        when the spoon leaves the soup
      </p>

      {withTemp.length < 2 ? (
        <p className="empty">Waiting for the DS18B20…</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={withTemp} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="t" type="number" domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => relativeTick(t, now)}
              stroke="var(--axis)" tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }} minTickGap={48}
            />
            <YAxis
              stroke="var(--axis)" tickLine={false} axisLine={false} width={48}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v) => `${v}°`} domain={['auto', 'auto']}
            />
            <Tooltip content={<TempTip />} cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} />
            <Line
              type="monotone" dataKey="temp_c" dot={false} isAnimationActive={false}
              stroke="var(--series-temp)" strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
