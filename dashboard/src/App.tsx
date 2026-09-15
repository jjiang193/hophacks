import { useTelemetry } from './hooks/useTelemetry';
import { SodiumHero } from './components/SodiumHero';
import { DailyMeter } from './components/DailyMeter';
import { SalinityChart } from './components/SalinityChart';
import { TemperatureChart } from './components/TemperatureChart';
import { SensorStatus } from './components/SensorStatus';
import { SessionTable } from './components/SessionTable';
import { SCHEMA_VERSION } from './types';

export default function App() {
  const {
    connected, latest, points, activeSessionId,
    lastSummary, sessions, intake, schemaMismatch,
  } = useTelemetry();

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Salinity Spoon</h1>
          <p className="sub">Conductivity, temperature and motion → sodium you can act on</p>
        </div>
        <span className="pill" data-status={connected ? 'good' : 'critical'}>
          <span className="dot">{connected ? '●' : '■'}</span>
          {connected ? 'Live' : 'Offline'}
        </span>
      </header>

      {schemaMismatch && (
        <div className="banner">
          <strong>Schema mismatch.</strong> The spoon is sending a telemetry version this
          dashboard does not understand (expects v{SCHEMA_VERSION}). Reflash the firmware
          or update <code>docs/telemetry-schema.md</code> across all four components.
        </div>
      )}

      <div className="grid hero">
        <SodiumHero
          latest={latest}
          lastSummary={lastSummary}
          activeSessionId={activeSessionId}
        />
        <div className="stack">
          <SensorStatus connected={connected} latest={latest} activeSessionId={activeSessionId} />
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <SalinityChart points={points} />
        <TemperatureChart points={points} />
      </div>

      <div className="grid two" style={{ marginTop: 16 }}>
        <DailyMeter intake={intake} />
        <SessionTable sessions={sessions} />
      </div>
    </div>
  );
}
