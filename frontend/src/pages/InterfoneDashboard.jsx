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

function MiniStat({ icon, title, value, tone }) {
  return (
    <div className="mini-stat-card surface">
      <div className="mini-stat-card-title">
        <Icon name={icon} size={13} />
        {title}
      </div>
      <div className="mini-stat-card-value" style={tone ? { color: `var(--${tone}-500)` } : undefined}>
        {value}
      </div>
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

// Vem cru do Asterisk (CDR), sempre em inglês — traduz pra exibir.
const DISPOSITION_LABELS = {
  ANSWERED: 'Atendida',
  'NO ANSWER': 'Não atendida',
  BUSY: 'Ocupado',
  FAILED: 'Falhou',
  CONGESTION: 'Congestionamento',
};
function formatDisposition(disposition) {
  if (!disposition) return '—';
  return DISPOSITION_LABELS[disposition.toUpperCase()] || disposition;
}

// Cores fixas por série (não por posição) — a mesma paleta de status usada
// no resto do Portal, então "perdidas"/"falhas" já leem como alerta.
const TREND_SERIES = [
  { key: 'recebidas', label: 'Recebidas', color: 'var(--success-500)' },
  { key: 'realizadas', label: 'Realizadas', color: 'var(--accent-500)' },
  { key: 'perdidas', label: 'Perdidas', color: 'var(--warning-500)' },
  { key: 'falhas', label: 'Falhas', color: 'var(--danger-500)' },
];

function CallsTrendChart({ data }) {
  if (!data || !data.categories || data.categories.length === 0) {
    return <div className="field-hint">Sem dados suficientes ainda.</div>;
  }
  const { categories } = data;
  const w = 700;
  const h = 160;
  const maxValue = Math.max(1, ...TREND_SERIES.flatMap((s) => data[s.key] || []));
  const groupWidth = w / categories.length;
  const gap = 2;
  const barWidth = Math.max(1, (groupWidth - gap * (TREND_SERIES.length + 1)) / TREND_SERIES.length);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h + 22}`} width="100%" height={h + 22} preserveAspectRatio="none">
        {categories.map((cat, ci) => (
          <g key={cat}>
            {TREND_SERIES.map((s, si) => {
              const value = (data[s.key] || [])[ci] || 0;
              const barH = (value / maxValue) * h;
              const x = ci * groupWidth + gap + si * (barWidth + gap);
              return (
                <rect key={s.key} x={x} y={h - barH} width={barWidth} height={barH} rx={2.5} fill={s.color}>
                  <title>{`${cat} · ${s.label}: ${value}`}</title>
                </rect>
              );
            })}
            <text x={ci * groupWidth + groupWidth / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
              {cat}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
        {TREND_SERIES.map((s) => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
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
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDisposition(c.disposition)}</td>
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

const EXTENSIONS_PAGE_SIZE = 10;

function ExtensionsSection({ extensions }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const filtered = extensions.filter((e) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return e.number.toLowerCase().includes(needle) || (e.name || '').toLowerCase().includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / EXTENSIONS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageExtensions = filtered.slice((safePage - 1) * EXTENSIONS_PAGE_SIZE, safePage * EXTENSIONS_PAGE_SIZE);

  return (
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
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
          {filtered.length === 0 ? (
            <div className="field-hint">Nenhum ramal encontrado para "{filter}".</div>
          ) : (
            <>
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
                    {pageExtensions.map((e) => (
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
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <span className="field-hint">
                    Página {safePage} de {totalPages} · {filtered.length} ramal(is)
                  </span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                    Anterior
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
                    Próxima
                  </button>
                </div>
              )}
            </>
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
  const [trend, setTrend] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([
        api.interfone.extensionsSummary(),
        api.interfone.todaySummary(),
        api.interfone.extensions(),
        api.interfone.activeCalls(),
        api.interfone.missedToday(),
        api.interfone.callsSummary('7d'),
      ])
        .then(([s, t, ext, calls, miss, tr]) => {
          if (cancelled) return;
          setSummary(s);
          setToday(t);
          setExtensions(ext || []);
          setActiveCalls(calls || []);
          setMissed(miss || []);
          setTrend(tr);
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
        <div className="skeleton" style={{ height: 100, borderRadius: 20 }} />
      ) : (
        <div className="mini-stat-grid">
          <MiniStat icon="phone" title="Ramais online" value={summary.online || 0} tone="success" />
          <MiniStat icon="phone" title="Ramais offline" value={summary.offline || 0} tone={summary.offline > 0 ? 'danger' : undefined} />
          <MiniStat icon="phone" title="Chamadas ativas" value={activeCalls.length} />
          <MiniStat icon="phone" title="Recebidas hoje" value={today.received || 0} />
          <MiniStat icon="phone" title="Realizadas hoje" value={today.made || 0} />
          <MiniStat icon="phone" title="Perdidas hoje" value={today.missed || 0} tone={today.missed > 0 ? 'warning' : undefined} />
        </div>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas nos últimos 7 dias</div>
        <p className="field-hint" style={{ marginBottom: 16 }}>Recebidas, realizadas, perdidas e falhas por dia.</p>
        {trend === null ? <div className="skeleton" style={{ height: 160, borderRadius: 12 }} /> : <CallsTrendChart data={trend} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="surface" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas ativas agora</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {activeCalls.length === 0 ? 'Nenhuma chamada em andamento.' : `${activeCalls.length} chamada(s) em andamento.`}
          </p>
          {activeCalls.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Ramal</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Destino</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Duração</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalls.map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name || c.ext}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{c.destination}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDuration(c.durationSeconds)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <ExtensionStatusBadge state={c.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="surface" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas perdidas hoje</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {missed.length === 0 ? 'Nenhuma chamada perdida hoje.' : `${missed.length} número(s) com chamada perdida.`}
          </p>
          {missed.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Número</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Última</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {missed.map((m, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{m.number}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDateTime(m.lastAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="badge badge-warning">{m.total}x</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ExtensionsSection extensions={extensions} />

      <CallHistorySection />
    </>
  );
}
