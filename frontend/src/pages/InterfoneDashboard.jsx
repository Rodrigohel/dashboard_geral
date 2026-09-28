import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../api/client.js';
import { downloadCsv } from '../utils/csv.js';
import { useToast } from '../hooks/useToast.jsx';

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

// Clicável de propósito — rola até a seção com o detalhe daquele número
// (ex.: "Perdidas hoje" leva pro card "Chamadas perdidas hoje" mais abaixo
// na mesma tela), em vez de deixar o usuário procurar rolando manualmente.
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function MiniStat({ icon, title, value, tone, onClick }) {
  const style = tone ? { '--card-accent': `var(--${tone}-500)` } : undefined;
  return (
    <div className="mini-stat-card surface" style={{ ...style, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
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

const DISPOSITION_BADGE = {
  ANSWERED: 'badge-success',
  'NO ANSWER': 'badge-warning',
  BUSY: 'badge-warning',
  FAILED: 'badge-danger',
  CONGESTION: 'badge-danger',
};
function DispositionBadge({ disposition }) {
  if (!disposition) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  const badge = DISPOSITION_BADGE[disposition.toUpperCase()] || 'badge-neutral';
  return (
    <span className={`badge ${badge}`}>
      <span className="badge-dot" /> {formatDisposition(disposition)}
    </span>
  );
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
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} style={{ stroke: 'var(--border-subtle)' }} strokeWidth="1" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-tertiary)' }}>
                {t}
              </text>
            </g>
          );
        })}

        {categories.map((cat, i) => (
          <text key={cat} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-tertiary)' }}>
            {cat}
          </text>
        ))}

        <defs>
          {seriesPoints.map((s) => (
            <linearGradient key={s.key} id={`trend-area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: s.color }} stopOpacity="0.28" />
              <stop offset="100%" style={{ stopColor: s.color }} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {seriesPoints.map((s) => (
          <g key={s.key}>
            <path d={s.areaPath} fill={`url(#trend-area-${s.key})`} stroke="none" />
            <path d={s.linePath} fill="none" style={{ stroke: s.color }} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={s.points[n - 1].x} cy={s.points[n - 1].y} r="4" style={{ fill: s.color, stroke: 'var(--bg-surface)' }} strokeWidth="2" />
          </g>
        ))}

        {endLabels.map((l) => (
          <text key={l.key} x={W - pad.right + 8} y={l.y + 3} fontSize="10.5" fontWeight="700" style={{ fill: 'var(--text-secondary)' }}>
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
              style={{ stroke: 'var(--border-strong)' }}
              strokeWidth="1"
            />
            {seriesPoints.map((s) => (
              <circle
                key={s.key}
                cx={xAt(hoverIndex)}
                cy={s.points[hoverIndex].y}
                r="4"
                style={{ fill: s.color, stroke: 'var(--bg-surface)' }}
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

const CALL_HISTORY_CSV_COLUMNS = [
  { header: 'Quando', get: (c) => formatDateTime(c.at) },
  { header: 'De', get: (c) => c.src },
  { header: 'Para', get: (c) => c.dst },
  { header: 'Sentido', get: (c) => (c.direction === 'made' ? 'realizada' : 'recebida') },
  { header: 'Resultado', get: (c) => c.disposition || '' },
  { header: 'Duração (s)', get: (c) => c.durationSeconds ?? '' },
];

function CallHistorySection() {
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

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

  // Exporta um lote maior que a paginação normal da tela (até 500, igual o
  // teto já usado na Auditoria) em vez de só as 10 linhas da página atual
  // — busca à parte, sob demanda, só quando clica no botão.
  async function handleExport() {
    setExporting(true);
    try {
      const full = await api.interfone.callHistory({ q, page: 1, pageSize: 500 });
      downloadCsv('chamadas-interfone.csv', full?.data || [], CALL_HISTORY_CSV_COLUMNS);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24 }} id="call-history-section">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico de chamadas</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>Consulta — cadastro de ramal e configurações continuam no painel de Interfone original.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <span className="spinner spinner-dark" /> : <Icon name="copy" size={14} />} Exportar CSV
        </button>
      </div>

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
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>De</th>
                  <th>Para</th>
                  <th className="hide-mobile">Sentido</th>
                  <th>Resultado</th>
                  <th className="hide-mobile">Duração</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i} className={c.disposition && c.disposition.toUpperCase() !== 'ANSWERED' ? 'row-tone-warning' : ''}>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDateTime(c.at)}</td>
                    <td style={{ fontWeight: 600 }}>{c.src}</td>
                    <td style={{ fontWeight: 600 }}>{c.dst}</td>
                    <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{c.direction === 'made' ? 'realizada' : 'recebida'}</td>
                    <td><DispositionBadge disposition={c.disposition} /></td>
                    <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{formatDuration(c.durationSeconds)}</td>
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

// Endpoint já existia no client (api.interfone.extensionDetail) mas nunca
// tinha sido chamado por nenhuma tela — não sabemos de antemão todo campo
// que o painel de Interfone original devolve aqui, então em vez de supor
// nomes específicos e arriscar mostrar tudo como "—", listamos o que vier
// de verdade na resposta.
function ExtensionDetailModal({ number, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.interfone
      .extensionDetail(number)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [number]);

  const rows = detail
    ? Object.entries(detail).filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    : [];

  return (
    <Modal
      title={`Ramal ${number}`}
      onClose={onClose}
      width={480}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {error && <div className="login-error">{error}</div>}
      {!detail && !error && <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />}
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
          {rows.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span className="field-hint" style={{ textTransform: 'capitalize' }}>
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <span style={{ textAlign: 'right' }}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const EXTENSIONS_PAGE_SIZE = 10;

function ExtensionsSection({ extensions }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [viewingExtension, setViewingExtension] = useState(null);

  const filtered = extensions.filter((e) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return e.number.toLowerCase().includes(needle) || (e.name || '').toLowerCase().includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / EXTENSIONS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageExtensions = filtered.slice((safePage - 1) * EXTENSIONS_PAGE_SIZE, safePage * EXTENSIONS_PAGE_SIZE);

  return (
    <div className="surface" style={{ padding: 24 }} id="extensions-section">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Ramais</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Consulta — clique num ramal para ver mais detalhes. Cadastro é feito no painel de Interfone original.
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
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ramal</th>
                      <th>Nome</th>
                      <th>Status</th>
                      <th className="hide-mobile">Última atividade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageExtensions.map((e) => (
                      <tr
                        key={e.number}
                        className={e.state === 'offline' ? 'row-tone-warning' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setViewingExtension(e.number)}
                      >
                        <td style={{ fontWeight: 600 }}>{e.number}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{e.name || '—'}</td>
                        <td>
                          <ExtensionStatusBadge state={e.state} />
                        </td>
                        <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{formatDateTime(e.lastActivity)}</td>
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
      {viewingExtension && <ExtensionDetailModal number={viewingExtension} onClose={() => setViewingExtension(null)} />}
    </div>
  );
}

// Perdidas hoje muito acima do normal — compara contra a média dos 6 dias
// anteriores da mesma série de 7 dias (o último dia da série é hoje, por
// isso fica de fora do cálculo da "normalidade"). Só acusa com um mínimo
// de 3 perdidas hoje E pelo menos o dobro da média, pra não marcar como
// anomalia uma variação pequena tipo "1 perdida hoje, 0.5 de média".
function detectMissedAnomaly(today, trend, minCount = 3, multiplier = 2) {
  if (!today || !trend?.perdidas || trend.perdidas.length < 7) return null;
  const missedToday = today.missed || 0;
  const baseline = trend.perdidas.slice(0, -1);
  if (baseline.length < 6 || missedToday < minCount) return null;
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  if (missedToday < mean * multiplier) return null;
  return { current: missedToday, mean: Math.round(mean * 10) / 10 };
}

// Barras de 0h a 23h — mesma ideia usada na Rede pra "horário de pico de
// queda", aqui pra "horário de pico de chamada". Duplicado em vez de
// compartilhado entre os dois arquivos de painel de propósito — cada
// painel já é autocontido no resto do código (StatusBadge, MiniStat/
// SummaryCard etc. também existem em cópias próprias), então manter esse
// padrão em vez de criar um módulo novo só pra isso.
function PeakHoursChart({ hourCounts, gradId, unitLabel }) {
  const max = Math.max(...hourCounts);
  if (max === 0) return <div className="field-hint">Sem dados suficientes ainda.</div>;
  const peakHour = hourCounts.indexOf(max);
  const w = 480;
  const h = 70;
  const gap = 2;
  const barWidth = (w - gap * 23) / 24;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${gradId}-hot`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--viz-call-hot-1)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--viz-call-hot-2)' }} />
          </linearGradient>
          <linearGradient id={`${gradId}-dim`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--viz-call-dim-1)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--viz-call-dim-2)' }} />
          </linearGradient>
        </defs>
        {hourCounts.map((c, hour) => {
          const barH = c === 0 ? 0 : Math.max((c / max) * h, 3);
          return (
            <rect
              key={hour}
              x={hour * (barWidth + gap)}
              y={h - barH}
              width={barWidth}
              height={barH}
              rx={3}
              fill={hour === peakHour ? `url(#${gradId}-hot)` : `url(#${gradId}-dim)`}
            >
              <title>{`${String(hour).padStart(2, '0')}h: ${c} ${unitLabel}`}</title>
            </rect>
          );
        })}
      </svg>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          marginTop: 2,
        }}
      >
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      <div className="field-hint" style={{ marginTop: 8 }}>
        Horário de pico: <strong style={{ color: 'var(--text-primary)' }}>{String(peakHour).padStart(2, '0')}h</strong> ({max}{' '}
        {unitLabel}).
      </div>
    </div>
  );
}

function countByHour(items, getDate) {
  const counts = new Array(24).fill(0);
  for (const item of items) {
    const d = getDate(item);
    if (!d || Number.isNaN(d.getTime())) continue;
    counts[d.getHours()] += 1;
  }
  return counts;
}

export default function InterfoneDashboard() {
  const [summary, setSummary] = useState(null);
  const [today, setToday] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [missed, setMissed] = useState([]);
  const [trend, setTrend] = useState(null);
  const [trendRange, setTrendRange] = useState('7d');
  const [trend30, setTrend30] = useState(null);
  const [callHourCounts, setCallHourCounts] = useState(null);
  const [anomalyParams, setAnomalyParams] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.settings.getAnomaly().then(setAnomalyParams).catch(() => {});
  }, []);

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

  // Buscado sob demanda só quando o usuário troca pra "30 dias" — o de 7
  // dias já vem sempre (é usado também na detecção de anomalia de perdidas).
  useEffect(() => {
    if (trendRange === '30d' && trend30 === null) {
      api.interfone
        .callsSummary('30d')
        .then(setTrend30)
        .catch(() => setTrend30({ categories: [] }));
    }
  }, [trendRange, trend30]);

  // Horário de pico de chamada — calculado aqui a partir do histórico já
  // existente (não é um endpoint novo/não confirmado), com uma amostra
  // maior que a paginação normal de 10 por página pra ter um padrão
  // minimamente confiável.
  useEffect(() => {
    api.interfone
      .callHistory({ pageSize: 500 })
      .then((res) => setCallHourCounts(countByHour(res.data || [], (c) => new Date(c.at))))
      .catch(() => {});
  }, []);

  const missedAnomaly = detectMissedAnomaly(today, trend, anomalyParams?.interfoneMissedMinCount, anomalyParams?.interfoneMissedMultiplier);
  const displayedTrend = trendRange === '30d' ? trend30 : trend;

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
          <MiniStat icon="phone" title="Ramais online" value={summary.online || 0} tone="success" onClick={() => scrollToSection('extensions-section')} />
          <MiniStat
            icon="phone"
            title="Ramais offline"
            value={summary.offline || 0}
            tone={summary.offline > 0 ? 'danger' : undefined}
            onClick={() => scrollToSection('extensions-section')}
          />
          <MiniStat icon="phone" title="Chamadas ativas" value={activeCalls.length} onClick={() => scrollToSection('active-calls-section')} />
          <MiniStat icon="phone" title="Recebidas hoje" value={today.received || 0} onClick={() => scrollToSection('call-history-section')} />
          <MiniStat icon="phone" title="Realizadas hoje" value={today.made || 0} onClick={() => scrollToSection('call-history-section')} />
          <MiniStat
            icon="phone"
            title="Perdidas hoje"
            value={today.missed || 0}
            tone={missedAnomaly ? 'danger' : today.missed > 0 ? 'warning' : undefined}
            onClick={() => scrollToSection('missed-calls-section')}
          />
        </div>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>Chamadas nos últimos {trendRange === '30d' ? '30 dias' : '7 dias'}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={`btn btn-sm ${trendRange === '7d' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTrendRange('7d')}>
              7 dias
            </button>
            <button className={`btn btn-sm ${trendRange === '30d' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTrendRange('30d')}>
              30 dias
            </button>
          </div>
        </div>
        <p className="field-hint" style={{ marginBottom: 16 }}>Recebidas, realizadas, perdidas e falhas por dia.</p>

        {missedAnomaly && (
          <div className="service-row" style={{ '--card-accent': 'var(--danger-500)', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--danger-500)' }}>Perdidas hoje fora do normal</div>
              <div className="field-hint">
                {missedAnomaly.current} perdida(s) hoje, contra uma média de {missedAnomaly.mean} nos últimos 6 dias.
              </div>
            </div>
            <span className="badge badge-danger"><span className="badge-dot" /> anomalia</span>
          </div>
        )}

        {displayedTrend === null ? (
          <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />
        ) : (
          <CallsTrendChart data={displayedTrend} />
        )}

        <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 24, marginBottom: 8 }}>Horário de pico de chamadas</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>Em que horário do dia mais chamadas acontecem (últimas até 500 do histórico).</p>
        {callHourCounts === null ? (
          <div className="skeleton" style={{ height: 90, borderRadius: 8 }} />
        ) : (
          <PeakHoursChart hourCounts={callHourCounts} gradId="peak-calls" unitLabel="chamada(s)" />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="surface" style={{ padding: 24 }} id="active-calls-section">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas ativas agora</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {activeCalls.length === 0 ? 'Nenhuma chamada em andamento.' : `${activeCalls.length} chamada(s) em andamento.`}
          </p>
          {activeCalls.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ramal</th>
                    <th>Destino</th>
                    <th>Duração</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeCalls.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{c.name || c.ext}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.destination}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatDuration(c.durationSeconds)}</td>
                      <td>
                        <ExtensionStatusBadge state={c.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="surface" style={{ padding: 24 }} id="missed-calls-section">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Chamadas perdidas hoje</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {missed.length === 0 ? 'Nenhuma chamada perdida hoje.' : `${missed.length} número(s) com chamada perdida.`}
          </p>
          {missed.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Última</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {missed.map((m, i) => (
                    <tr key={i} className={m.total >= 3 ? 'row-tone-warning' : ''}>
                      <td style={{ fontWeight: 600 }}>{m.number}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatDateTime(m.lastAt)}</td>
                      <td>
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
