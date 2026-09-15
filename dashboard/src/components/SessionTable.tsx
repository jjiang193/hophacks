import { Session } from '../types';
import { FDA_DAILY_LIMIT_MG, verdictFor, VERDICT_STATUS } from '../lib/sodium';

const when = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * The table view is also the accessibility fallback for the charts above:
 * every measurement is readable as text, not only as color and position.
 */
export function SessionTable({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter((s) => s.ended_at && s.sodium_mg != null);

  return (
    <section className="card">
      <h2>Measurement history</h2>
      <p className="caption">Each row is one bowl, scored on the median of its settled samples</p>

      {completed.length === 0 ? (
        <p className="empty">No completed measurements yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Verdict</th>
              <th className="num">Salt</th>
              <th className="num">Temp</th>
              <th className="num">Serving</th>
              <th className="num">Sodium</th>
              <th className="num">% limit</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((s) => {
              const sodium = s.sodium_mg!;
              const verdict = verdictFor(sodium);
              const status = VERDICT_STATUS[verdict];
              return (
                <tr key={s.id}>
                  <td className="primary">{when(s.started_at)}</td>
                  <td>
                    <span className="pill" data-status={status.role}>
                      <span className="dot">{status.icon}</span>
                      {verdict}
                    </span>
                  </td>
                  <td className="num">{s.salt_pct!.toFixed(2)}%</td>
                  <td className="num">{s.temp_c != null ? `${s.temp_c.toFixed(0)}°C` : '—'}</td>
                  <td className="num">{s.serving_ml} mL</td>
                  <td className="num primary">{Math.round(sodium).toLocaleString()} mg</td>
                  <td className="num">{((sodium / FDA_DAILY_LIMIT_MG) * 100).toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
