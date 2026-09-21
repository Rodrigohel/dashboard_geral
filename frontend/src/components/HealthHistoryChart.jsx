import { useMemo, useRef, useState } from 'react';

// Gráfico de linha (CPU x Memória ao longo do tempo) — SVG desenhado à mão,
// sem biblioteca de gráficos (o Portal não usa nenhuma). Duas séries
// categóricas (identidade, não magnitude), cores escolhidas e validadas
// (script validate_palette.js da skill de dataviz) contra as superfícies
// reais do Portal — não são as cores de nenhum módulo, de propósito, pra
// não confundir com o Rede/Interfone/Acesso que já usam azul-céu/âmbar/violeta.
const W = 640;
const H = 200;
const PAD = { top: 12, right: 44, bottom: 22, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const TICKS = [0, 25, 50, 75, 100];

function xAt(i, n) {
  return PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * PLOT_W);
}
function yAt(value) {
  return PAD.top + PLOT_H - (Math.min(100, Math.max(0, value)) / 100) * PLOT_H;
}
function pathFor(samples, key, n) {
  return samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i, n).toFixed(1)} ${yAt(s[key]).toFixed(1)}`).join(' ');
}
function formatTime(t) {
  return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const SERIES = [
  { key: 'cpu', label: 'Processador', var: '--viz-cpu' },
  { key: 'memory', label: 'Memória', var: '--viz-mem' },
];

export default function HealthHistoryChart({ samples }) {
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const n = samples.length;

  function handleMove(e) {
    if (n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = PLOT_W === 0 ? 0 : (relX - PAD.left) / PLOT_W;
    const idx = Math.round(ratio * (n - 1));
    setHoverIndex(Math.min(n - 1, Math.max(0, idx)));
  }

  const hovered = hoverIndex !== null ? samples[hoverIndex] : null;
  const tooltipLeft = hovered ? (xAt(hoverIndex, n) / W) * 100 : 0;
  const flipTooltip = tooltipLeft > 62;

  const lastPoint = n > 0 ? samples[n - 1] : null;

  if (n < 2) {
    return (
      <div className="viz-root" style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
        Coletando amostras — o histórico aparece depois de alguns minutos com o Portal no ar.
      </div>
    );
  }

  return (
    <div className="viz-root" style={{ position: 'relative' }}>
      <style>{`
        .viz-root { --viz-cpu: #2a78d6; --viz-mem: #eb6834; }
        :root[data-theme='dark'] .viz-root { --viz-cpu: #3987e5; --viz-mem: #d95926; }
      `}</style>

      <div style={{ display: 'flex', gap: 20, marginBottom: 8, fontSize: 12.5 }}>
        {SERIES.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
            <svg width="16" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" stroke={`var(${s.var})`} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {s.label}
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label="Histórico de processador e memória"
      >
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={PAD.left - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize="10.5" fill="var(--text-tertiary)">
              {t}%
            </text>
          </g>
        ))}

        {SERIES.map((s) => (
          <path key={s.key} d={pathFor(samples, s.key, n)} fill="none" stroke={`var(${s.var})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {lastPoint &&
          SERIES.map((s) => (
            <g key={s.key}>
              <circle cx={xAt(n - 1, n)} cy={yAt(lastPoint[s.key])} r="6" fill="var(--bg-surface)" />
              <circle cx={xAt(n - 1, n)} cy={yAt(lastPoint[s.key])} r="4" fill={`var(${s.var})`} />
              <text x={xAt(n - 1, n) + 9} y={yAt(lastPoint[s.key])} dominantBaseline="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">
                {Math.round(lastPoint[s.key])}%
              </text>
            </g>
          ))}

        {hovered && (
          <line x1={xAt(hoverIndex, n)} x2={xAt(hoverIndex, n)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2,3" />
        )}
      </svg>

      {hovered && (
        <div
          className="surface"
          style={{
            position: 'absolute',
            top: PAD.top,
            left: `${tooltipLeft}%`,
            transform: flipTooltip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            padding: '8px 12px',
            minWidth: 130,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-md)',
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{formatTime(hovered.t)}</div>
          {SERIES.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <svg width="10" height="8" aria-hidden="true" style={{ flexShrink: 0 }}>
                <line x1="0" y1="4" x2="10" y2="4" stroke={`var(${s.var})`} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              <strong style={{ marginLeft: 'auto', color: 'var(--text-primary)' }}>{Math.round(hovered[s.key])}%</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
