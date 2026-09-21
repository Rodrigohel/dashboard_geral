import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';

const POLL_MS = 10000;

// Primeira tela nativa do módulo Rede dentro do próprio Portal — sem
// iframe: consome a API real do painel de Rede (via /gateway/rede) e
// desenha com os componentes do Portal, igual à tela de Saúde do servidor.
// Cadastro de equipamentos e planta baixa (gated por rede.dispositivos /
// rede.plantaBaixa) ainda não têm tela nativa própria — chegam depois.

const STATUS_META = {
  online: { label: 'online', badge: 'badge-success' },
  degraded: { label: 'degradado', badge: 'badge-warning' },
  offline: { label: 'offline', badge: 'badge-danger' },
  unknown: { label: 'desconhecido', badge: 'badge-neutral' },
};

const SEVERITY_META = {
  critical: { label: 'crítico', badge: 'badge-danger' },
  warning: { label: 'atenção', badge: 'badge-warning' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span className={`badge ${meta.badge}`}>
      <span className="badge-dot" /> {meta.label}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const meta = SEVERITY_META[severity] || { label: severity, badge: 'badge-neutral' };
  return (
    <span className={`badge ${meta.badge}`}>
      <span className="badge-dot" /> {meta.label}
    </span>
  );
}

function SummaryCard({ icon, title, value, sub, tone }) {
  return (
    <div className="metric-card surface">
      <div className="metric-card-head">
        <div className="metric-card-title">
          <Icon name={icon} size={16} />
          {title}
        </div>
      </div>
      <div className="metric-card-value" style={tone ? { color: `var(--${tone}-500)` } : undefined}>
        {value}
      </div>
      {sub && <div className="metric-card-sub">{sub}</div>}
    </div>
  );
}

export default function RedeDashboard() {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([api.rede.summary(), api.rede.devices(), api.rede.alerts()])
        .then(([s, d, a]) => {
          if (cancelled) return;
          setSummary(s);
          setDevices(d.data || []);
          setAlerts((a.data || []).filter((x) => x.status === 'active'));
          setError('');
        })
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
          <h1>Rede</h1>
          <p>Monitoramento dos equipamentos de rede, direto aqui no Portal.</p>
        </div>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)', color: 'var(--danger-500)' }}>
          {error}
        </div>
      )}

      {!summary ? (
        <div className="stat-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 130, borderRadius: 20 }} />
          ))}
        </div>
      ) : (
        <div className="stat-grid">
          <SummaryCard icon="network" title="Equipamentos" value={summary.total} sub="monitorados" />
          <SummaryCard icon="wifi" title="Online" value={summary.online || 0} tone="success" />
          <SummaryCard icon="wifi" title="Degradado" value={summary.degraded || 0} tone="warning" />
          <SummaryCard icon="wifi" title="Offline" value={summary.offline || 0} tone="danger" />
        </div>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Alertas ativos</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {alerts.length === 0 ? 'Nada em aberto no momento.' : `${alerts.length} alerta(s) em aberto.`}
        </p>
        {alerts.slice(0, 10).map((a) => (
          <div className="service-row" key={a.id}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.message}</div>
              <div className="field-hint">{new Date(a.createdAt).toLocaleString('pt-BR')}</div>
            </div>
            <SeverityBadge severity={a.severity} />
          </div>
        ))}
      </div>

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Equipamentos</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          Lista de leitura — cadastro, edição e importação de equipamentos ainda chegam em uma próxima entrega.
        </p>
        {devices.length === 0 ? (
          <div className="field-hint">Nenhum equipamento cadastrado ainda.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nome</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>IP</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Local</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.ip}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.location || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.type}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <StatusBadge status={d.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
