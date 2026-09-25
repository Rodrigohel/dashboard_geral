import { useEffect, useRef, useState } from 'react';
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

// Cores categóricas (identidade da série), de propósito DIFERENTES das
// cores de status (--success/--warning/--danger) usadas no resto do
// Portal — reaproveitar a cor de "alerta" pra série "perdidas" faria ela
// parecer sempre um problema, mesmo quando é só uma categoria entre
// outras. Ordem fixa (nunca reordenar por filtro) — mantém o contraste
// entre séries vizinhas mesmo pra quem tem daltonismo.
const TREND_SERIES = [
  { key: 'recebidas', label: 'Recebidas', color: 'var(--chart-series-1)' },
  { key: 'realizadas', label: 'Realizadas', color: 'var(--chart-series-2)' },
  { key: 'perdidas', label: 'Perdidas', color: 'var(--chart-series-3)' },
  { key: 'falhas', label: 'Falhas', color: 'var(--chart-series-4)' },
];

// Maior "número redondo" >= valor, com uns 4 degraus até lá (0, step, 2·step,
// ..., niceMax) — evita eixo Y tipo "0, 7, 14, 21" difícil de ler de relance.
function niceStep(maxValue, targetTicks = 4) {
  const rough = maxValue / targetTicks || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / magnitude;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * magnitude;
}

function CallsTrendChart({ data }) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || !data.categories || data.categories.length === 0) {
    return <div className="field-hint">Sem dados suficientes ainda.</div>;
  }
  const { categories } = data;
  const n = categories.length;

  const W = 680;
  const H = 210;
  const pad = { top: 10, right: 54, bottom: 26, left: 30 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const rawMax = Math.max(1, ...TREND_SERIES.flatMap((s) => data[s.key] || []));
  const step = niceStep(rawMax);
  const niceMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let t = 0; t <= niceMax; t += step) ticks.push(t);

  const xAt = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (value) => pad.top + plotH - (value / niceMax) * plotH;

  const seriesPoints = TREND_SERIES.map((s) => {
    const values = data[s.key] || [];
    const points = categories.map((_, i) => ({ x: xAt(i), y: yAt(values[i] || 0), value: values[i] || 0 }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x},${pad.top + plotH} L${points[0].x},${pad.top + plotH} Z`;
    return { ...s, points, linePath, areaPath };
  });

  // Rótulo do valor final de cada série (obrigatório com 4 séries — cor
  // sozinha não basta) — quando os valores ficam próximos e as etiquetas
  // colidiriam, empurra pra baixo na ordem certa em vez de sobrepor.
  const endLabels = seriesPoints
    .map((s) => ({ key: s.key, color: s.color, value: s.points[n - 1].value, y: s.points[n - 1].y }))
    .sort((a, b) => a.y - b.y);
  const MIN_LABEL_GAP = 13;
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < MIN_LABEL_GAP) {
      endLabels[i].y = endLabels[i - 1].y + MIN_LABEL_GAP;
    }
  }
  // Empurrar só pra baixo pode jogar o último rótulo pra fora da área do
  // gráfico quando várias séries empatam perto de zero (bem comum com
  // "falhas"/"perdidas") — desloca o grupo inteiro pra cima o quanto for
  // preciso pra caber, mantendo o espaçamento entre eles.
  const overflow = endLabels[endLabels.length - 1].y - (pad.top + plotH);
  if (overflow > 0) {
    for (const l of endLabels) l.y -= overflow;
  }

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = plotW === 0 ? 0 : (localX - pad.left) / plotW;
    const idx = Math.round(ratio * (n - 1));
    setHoverIndex(Math.min(n - 1, Math.max(0, idx)));
  }

  const hovered = hoverIndex !== null;
  const tooltipLeftPct = hovered ? (xAt(hoverIndex) / W) * 100 : 0;
  const tooltipOnRight = tooltipLeftPct > 60;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {ticks.map((t) => {
          const y = yAt(t);
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--text-tertiary)">
                {t}
              </text>
            </g>
          );
        })}

        {categories.map((cat, i) => (
          <text key={cat} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
            {cat}
          </text>
        ))}

        {seriesPoints.map((s) => (
          <g key={s.key}>
            <path d={s.areaPath} fill={s.color} opacity="0.1" stroke="none" />
            <path d={s.linePath} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={s.points[n - 1].x} cy={s.points[n - 1].y} r="4" fill={s.color} stroke="var(--bg-surface)" strokeWidth="2" />
          </g>
        ))}

        {endLabels.map((l) => (
          <text key={l.key} x={W - pad.right + 8} y={l.y + 3} fontSize="10.5" fontWeight="700" fill="var(--text-secondary)">
            {l.value}
          </text>
        ))}

        {hovered && (
          <g>
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
            {seriesPoints.map((s) => (
              <circle
                key={s.key}
                cx={xAt(hoverIndex)}
                cy={s.points[hoverIndex].y}
                r="4"
                fill={s.color}
                stroke="var(--bg-surface)"
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: `${tooltipLeftPct}%`,
            transform: tooltipOnRight ? 'translateX(-100%)' : 'translateX(8px)',
            background: 'var(--bg-surface-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            padding: '8px 10px',
            pointerEvents: 'none',
            minWidth: 130,
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {categories[hoverIndex]}
          </div>
          {seriesPoints.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '1px 0' }}>
              <span style={{ width: 10, height: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{s.label}</span>
              <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{s.points[hoverIndex].value}</strong>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        {TREND_SERIES.map((s) => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span style={{ width: 12, height: 2, background: s.color, display: 'inline-block' }} />
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
