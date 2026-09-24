import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';

// Interfone é só consulta no Portal, igual o Rede — cadastro de ramal e
// configurações continuam no painel de Interfone original.

const POLL_MS = 10000;

const EXTENSION_STATE_META = {
  free: { label: 'livre', badge: 'badge-success' },
  in_call: { label: 'em chamada', badge: 'badge-warning' },
  ringing: { label: 'tocando', badge: 'badge-warning' },
  offline: { label: 'offline', badge: 'badge-neutral' },
};

function ExtensionStatusBadge({ state }) {
  const meta = EXTENSION_STATE_META[state] || { label: state || 'desconhecido', badge: 'badge-neutral' };
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

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}min ${secs}s`;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

const HISTORY_PAGE_SIZE = 10;

function CallHistorySection() {
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.interfone
      .callHistory({ q, page, pageSize: HISTORY_PAGE_SIZE })
      .then((r) => !cancelled && setResult(r))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  const rows = result?.data || [];
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / HISTORY_PAGE_SIZE));

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico de chamadas</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Consulta — cadastro de ramal e configurações continuam no painel de Interfone original.</p>

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <input
        className="input"
        style={{ marginBottom: 12, maxWidth: 320 }}
        placeholder="Buscar por ramal/número..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />

      {result === null ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />
      ) : rows.length === 0 ? (
        <div className="field-hint">Nenhuma chamada encontrada.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Quando</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>De</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Para</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Sentido</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Resultado</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Duração</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDateTime(c.at)}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.src}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.dst}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{c.direction === 'made' ? 'realizada' : 'recebida'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{c.disposition}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDuration(c.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <span className="field-hint">
                Página {page} de {totalPages} · {result.total} chamada(s)
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InterfoneDashboard() {
  const [summary, setSummary] = useState(null);
  const [today, setToday] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [missed, setMissed] = useState([]);
  const [extFilter, setExtFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([api.interfone.extensionsSummary(), api.interfone.todaySummary(), api.interfone.extensions(), api.interfone.activeCalls(), api.interfone.missedToday()])
        .then(([s, t, ext, calls, miss]) => {
          if (cancelled) return;
          setSummary(s);
          setToday(t);
          setExtensions(ext || []);
          setActiveCalls(calls || []);
          setMissed(miss || []);
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

  const filteredExtensions = extensions.filter((e) => {
    const needle = extFilter.trim().toLowerCase();
    if (!needle) return true;
    return e.number.toLowerCase().includes(needle) || (e.name || '').toLowerCase().includes(needle);
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Interfone</h1>
          <p>Ramais e chamadas do PBX, direto aqui no Portal — só consulta.</p>
        </div>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)', color: 'var(--danger-500)' }}>
          {error}
        </div>
      )}

      {!summary || !today ? (
        <div className="skeleton" style={{ height: 130, borderRadius: 20 }} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryCard icon="phone" title="Ramais online" value={summary.online || 0} tone="success" sub={`de ${summary.configured || 0} configurados`} />
            <SummaryCard icon="phone" title="Ramais offline" value={summary.offline || 0} tone={summary.offline > 0 ? 'danger' : undefined} />
            <SummaryCard icon="phone" title="Chamadas ativas" value={activeCalls.length} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryCard icon="phone" title="Recebidas hoje" value={today.received || 0} />
            <SummaryCard icon="phone" title="Realizadas hoje" value={today.made || 0} />
            <SummaryCard icon="phone" title="Perdidas hoje" value={today.missed || 0} tone={today.missed > 0 ? 'warning' : undefined} />
          </div>
        </>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas ativas agora</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {activeCalls.length === 0 ? 'Nenhuma chamada em andamento.' : `${activeCalls.length} chamada(s) em andamento.`}
        </p>
        {activeCalls.map((c, i) => (
          <div className="service-row" key={i}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || c.ext} → {c.destination}</div>
              <div className="field-hint">{c.direction === 'made' ? 'realizada' : 'recebida'} · {formatDuration(c.durationSeconds)}</div>
            </div>
            <ExtensionStatusBadge state={c.state} />
          </div>
        ))}
      </div>

      {missed.length > 0 && (
        <div className="surface" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas perdidas hoje</div>
          {missed.map((m, i) => (
            <div className="service-row" key={i}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.number}</div>
                <div className="field-hint">Última: {formatDateTime(m.lastAt)}</div>
              </div>
              <span className="badge badge-warning">{m.total}x</span>
            </div>
          ))}
        </div>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Ramais</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          Consulta — cadastro de ramal é feito no painel de Interfone original.
        </p>
        {extensions.length === 0 ? (
          <div className="field-hint">Nenhum ramal configurado.</div>
        ) : (
          <>
            <input
              className="input"
              style={{ marginBottom: 12, maxWidth: 320 }}
              placeholder="Buscar por ramal ou nome..."
              value={extFilter}
              onChange={(e) => setExtFilter(e.target.value)}
            />
            {filteredExtensions.length === 0 ? (
              <div className="field-hint">Nenhum ramal encontrado para "{extFilter}".</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Ramal</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nome</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '8px 12px', fontWeight: 600 }}>Última atividade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExtensions.map((e) => (
                      <tr key={e.number} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.number}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{e.name || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <ExtensionStatusBadge state={e.state} />
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDateTime(e.lastActivity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <CallHistorySection />
    </>
  );
}
