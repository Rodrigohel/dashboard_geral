import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';

const POLL_MS = 8000;

function levelFor(percent, { warn = 60, danger = 85 } = {}) {
  if (percent === null || percent === undefined) return 'ok';
  if (percent >= danger) return 'danger';
  if (percent >= warn) return 'warn';
  return 'ok';
}

function levelBadge(level) {
  if (level === 'danger') return <span className="badge badge-danger"><span className="badge-dot" /> alto</span>;
  if (level === 'warn') return <span className="badge badge-warning"><span className="badge-dot" /> atenção</span>;
  return <span className="badge badge-success"><span className="badge-dot" /> normal</span>;
}

function Meter({ percent, level }) {
  return (
    <div className="meter">
      <div className={`meter-fill level-${level}`} style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
    </div>
  );
}

function MetricCard({ icon, title, value, sub, percent, level }) {
  return (
    <div className="metric-card surface">
      <div className="metric-card-head">
        <div className="metric-card-title">
          <Icon name={icon} size={16} />
          {title}
        </div>
        {level && levelBadge(level)}
      </div>
      <div className="metric-card-value">{value}</div>
      {percent !== undefined && <Meter percent={percent} level={level} />}
      {sub && <div className="metric-card-sub">{sub}</div>}
    </div>
  );
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

const SERVICE_LABELS = {
  'portal-backend': 'Portal',
  'ip-dashboard-backend': 'Painel de Rede',
  'pbx-dashboard-backend': 'Painel de Interfone',
  asterisk: 'Asterisk (PBX)',
};

function ServiceStatusBadge({ status }) {
  if (status === 'active') return <span className="badge badge-success"><span className="badge-dot" /> rodando</span>;
  if (status === 'unknown') return <span className="badge badge-neutral">não detectado</span>;
  return <span className="badge badge-danger"><span className="badge-dot" /> {status}</span>;
}

export default function ServerHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.system
        .health()
        .then((d) => !cancelled && (setData(d), setError('')))
        .catch((err) => !cancelled && setError(err.message));
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Saúde do servidor</h1>
          <p>Esta máquina também roda o FreePBX — de olho aqui para garantir que nada sobrecarrega a central.</p>
        </div>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)', color: 'var(--danger-500)' }}>
          {error}
        </div>
      )}

      {!data ? (
        <div className="stat-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 130, borderRadius: 20 }} />
          ))}
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <MetricCard
              icon="cpu"
              title="Processador"
              value={`${data.cpu.loadPercent}%`}
              percent={data.cpu.loadPercent}
              level={levelFor(data.cpu.loadPercent)}
              sub={`${data.cpu.count} núcleos · carga 1min: ${data.cpu.loadAverage['1m']}`}
            />
            <MetricCard
              icon="server"
              title="Memória RAM"
              value={`${data.memory.usedPercent}%`}
              percent={data.memory.usedPercent}
              level={levelFor(data.memory.usedPercent)}
              sub={`${data.memory.usedGb} GB de ${data.memory.totalGb} GB`}
            />
            {data.disk && (
              <MetricCard
                icon="server"
                title="Disco"
                value={`${data.disk.usedPercent}%`}
                percent={data.disk.usedPercent}
                level={levelFor(data.disk.usedPercent, { warn: 70, danger: 90 })}
                sub={`${data.disk.usedGb} GB de ${data.disk.totalGb} GB`}
              />
            )}
            <MetricCard
              icon="thermometer"
              title="Temperatura"
              value={data.cpu.temperatureCelsius !== null ? `${data.cpu.temperatureCelsius}°C` : 'indisponível'}
              level={data.cpu.temperatureCelsius !== null ? levelFor(data.cpu.temperatureCelsius, { warn: 70, danger: 85 }) : undefined}
              sub={data.cpu.temperatureCelsius === null ? 'Sensor não exposto pelo sistema' : 'Aproximado — varia por hardware'}
            />
          </div>

          <div className="surface" style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Serviços nesta máquina</div>
            <p className="field-hint" style={{ marginBottom: 8 }}>
              Só leitura de status — o Portal nunca inicia, para ou reinicia nada aqui.
            </p>
            {data.services.map((s) => (
              <div className="service-row" key={s.unit}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{SERVICE_LABELS[s.unit] || s.unit}</div>
                  <div className="field-hint">{s.unit}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {s.memoryMb !== null && <span className="field-hint">{s.memoryMb} MB</span>}
                  <ServiceStatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>

          <div className="surface" style={{ padding: 20, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--text-secondary)' }}>
            <span><strong style={{ color: 'var(--text-primary)' }}>Host:</strong> {data.hostname}</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>Sistema:</strong> {data.platform}</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>No ar há:</strong> {formatUptime(data.systemUptimeSeconds)}</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>Node.js:</strong> {data.nodeVersion}</span>
          </div>
        </>
      )}
    </>
  );
}
