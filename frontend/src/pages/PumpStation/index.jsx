import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { LEVEL_STOPS, fillPercentFor, currentLevelStop, severityColorVar } from '../../utils/pumpLevel.js';

const DEFAULT_POLL_MS = 10000;

const REG_TYPES = [
  { value: 'coil', label: 'Bobina / saída digital (FC1 — Coil)' },
  { value: 'discrete', label: 'Entrada digital (FC2 — Discrete Input)' },
  { value: 'holding', label: 'Registrador de retenção (FC3 — Holding Register)' },
  { value: 'input', label: 'Registrador de entrada (FC4 — Input Register)' },
];

// Ordem e rótulos usados tanto no card de status quanto no formulário de
// configuração — uma lista só, pra não divergir entre os dois.
const LEVEL_POINTS = [
  { key: 'nivelMinimo', label: 'Nível mínimo' },
  { key: 'nivelMedio', label: 'Nível médio' },
  { key: 'nivelMaximo', label: 'Nível máximo' },
  { key: 'nivelSeguranca', label: 'Nível de segurança' },
];
const PUMP_POINTS = [
  { key: 'bomba1', label: 'Bomba 1' },
  { key: 'bomba2', label: 'Bomba 2' },
  { key: 'bomba1DoDia', label: 'Bomba 1 é a "do dia"' },
  { key: 'bomba2DoDia', label: 'Bomba 2 é a "do dia"' },
];
const ALARM_POINTS = [
  { key: 'termico1', label: 'Térmico bomba 1 desarmado' },
  { key: 'termico2', label: 'Térmico bomba 2 desarmado' },
  { key: 'modoManual', label: 'Modo manual (não automático)' },
  { key: 'emergencia', label: 'Emergência acionada' },
  { key: 'faltaFase', label: 'Falta de fase na rede elétrica' },
  { key: 'painelDesligado', label: 'Painel de bombas desligado' },
  { key: 'falhaBoias', label: 'Falha nas boias de nível' },
];

function PointBadge({ label, value }) {
  if (value === null || value === undefined) {
    return (
      <div className="service-row">
        <span>{label}</span>
        <span className="field-hint">não configurado</span>
      </div>
    );
  }
  if (typeof value === 'object' && value.error) {
    return (
      <div className="service-row">
        <span>{label}</span>
        <span className="badge badge-danger" title={value.error}>
          <span className="badge-dot" /> erro de leitura
        </span>
      </div>
    );
  }
  return (
    <div className="service-row">
      <span>{label}</span>
      <span className={`badge ${value ? 'badge-success' : 'badge-neutral'}`}>
        <span className="badge-dot" /> {value ? 'sim' : 'não'}
      </span>
    </div>
  );
}

// Um poll só, reaproveitado pelo card de status E pela animação do tanque —
// cada um pedindo status sozinho dobraria o tanto de leitura Modbus na IHM
// sem necessidade nenhuma.
function usePumpStationStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  // Intervalo vem do próprio /status (config salva em "Bombas →
  // Configuração") — começa no padrão e se ajusta sozinho assim que a
  // primeira resposta chegar dizendo o valor real.
  const [pollMs, setPollMs] = useState(DEFAULT_POLL_MS);

  useEffect(() => {
    function load() {
      api.pumpStation
        .status()
        .then((s) => {
          setStatus(s);
          setError('');
          if (s.pollSeconds) setPollMs(Math.max(1, s.pollSeconds) * 1000);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoaded(true));
    }
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return { status, error, loaded };
}

function StatusCard({ status, error, loaded, canEditConfig, onGoToConfig }) {
  if (!loaded) return <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />;

  if (error) {
    return (
      <div className="surface" style={{ padding: 24, borderLeft: '3px solid var(--warning-500)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="droplet" size={17} />
          Casa de bombas
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>{error}</p>
        {canEditConfig && (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={onGoToConfig}>
            Ir para configuração
          </button>
        )}
      </div>
    );
  }

  const points = status?.points || {};

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 16 }}>
        <Icon name="droplet" size={17} />
        {status?.name || 'Casa de bombas'}
      </div>
      <div className="status-cols-grid">
        <div className="status-col">
          <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
            Nível da água
          </div>
          {LEVEL_POINTS.map((p) => (
            <PointBadge key={p.key} label={p.label} value={points[p.key]} />
          ))}
        </div>
        <div className="status-col">
          <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
            Bombas
          </div>
          {PUMP_POINTS.map((p) => (
            <PointBadge key={p.key} label={p.label} value={points[p.key]} />
          ))}
        </div>
        <div className="status-col">
          <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
            Alarmes
          </div>
          {ALARM_POINTS.map((p) => (
            <PointBadge key={p.key} label={p.label} value={points[p.key]} />
          ))}
        </div>
      </div>
    </div>
  );
}

// O LOGO só manda 4 pontos discretos (boia chegou ou não no mínimo/médio/
// máximo/segurança) — não existe sensor de nível contínuo nesse sistema.
// Então "o nível exato" não é uma coisa que dá pra saber; o que dá é: qual
// foi a boia mais alta que já disparou agora. A animação interpola
// suavemente ENTRE essas 4 marcas conhecidas quando o estado muda (via
// transição CSS), pra parecer um tanque enchendo de verdade em vez de pular
// de degrau em degrau — mas continua sendo uma aproximação entre 4 pontos
// conhecidos, não uma medição contínua de verdade (por isso a legenda com
// as 4 marcas fica sempre visível, não escondida).
function TankVisualization({ status, error, loaded }) {
  if (!loaded || error) return null;
  const points = status?.points || {};
  const fillPercent = fillPercentFor(points);
  const activeStop = currentLevelStop(points);
  const waterColorVar = activeStop ? severityColorVar(activeStop.severity) : 'var(--text-tertiary)';
  const pump1On = points.bomba1 === true;
  const pump2On = points.bomba2 === true;
  const anyAlarm =
    points.termico1 === true ||
    points.termico2 === true ||
    points.emergencia === true ||
    points.faltaFase === true ||
    points.painelDesligado === true ||
    points.falhaBoias === true;

  const tankTop = 20;
  const tankBottom = 220;
  const tankHeight = tankBottom - tankTop;
  const waterY = tankBottom - (fillPercent / 100) * tankHeight;

  return (
    <div className="surface" style={{ padding: 24 }}>
      <style>{`
        .pump-tank-water { transition: y 2.5s var(--ease, ease), height 2.5s var(--ease, ease); }
        .pump-tank-wave { animation: pump-tank-wave-move 3.2s linear infinite; }
        @keyframes pump-tank-wave-move { from { transform: translateX(0); } to { transform: translateX(-40px); } }
        .pump-icon-on { animation: pump-icon-pulse 1.1s ease-in-out infinite; }
        @keyframes pump-icon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
        <Icon name="droplet" size={17} />
        Nível do poço
      </div>
      <div className="field-hint" style={{ marginBottom: 16 }}>
        O sistema só tem 4 boias (sem sensor contínuo) — a animação mostra a boia mais alta ativa agora, suavizada
        entre as marcas.
      </div>

      <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg width="140" height="240" viewBox="0 0 140 240" role="img" aria-label="Nível de água do poço">
          <defs>
            <clipPath id="pump-tank-clip">
              <rect x={14} y={tankTop} width={92} height={tankHeight} rx={8} />
            </clipPath>
          </defs>
          <rect x={14} y={tankTop} width={92} height={tankHeight} rx={8} fill="none" stroke="var(--border-strong)" strokeWidth="2" />
          <g clipPath="url(#pump-tank-clip)">
            <rect className="pump-tank-water" x={14} y={waterY} width={92} height={tankBottom - waterY} fill={waterColorVar} opacity="0.55" />
            <rect className="pump-tank-water pump-tank-wave" x={0} y={waterY - 3} width={200} height={8} fill={waterColorVar} opacity="0.8" />
          </g>
          {LEVEL_STOPS.map((stop) => {
            const y = tankBottom - (stop.percent / 100) * tankHeight;
            const active = points[stop.key] === true;
            return (
              <g key={stop.key}>
                <line x1={10} x2={110} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="2,3" />
                <circle cx={10} cy={y} r="3.5" fill={active ? severityColorVar(stop.severity) : 'var(--text-tertiary)'} />
                <text x={114} y={y} dominantBaseline="middle" fontSize="10.5" style={{ fill: active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: active ? 700 : 400 }}>
                  {stop.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="droplet" size={20} className={pump1On ? 'pump-icon-on' : ''} style={{ color: pump1On ? 'var(--chart-series-1)' : 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Bomba 1</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pump1On ? 'ligada agora' : 'desligada'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="droplet" size={20} className={pump2On ? 'pump-icon-on' : ''} style={{ color: pump2On ? 'var(--chart-series-2)' : 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Bomba 2</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pump2On ? 'ligada agora' : 'desligada'}</div>
            </div>
          </div>
          {anyAlarm && (
            <div className="badge badge-danger" style={{ width: 'fit-content' }}>
              <span className="badge-dot" /> alarme de térmico ativo
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Na prática, quase toda instalação usa sempre o mesmo tipo (Coil — é o que
// um "LB" da IHM vira no Modbus) — por isso o seletor de tipo fica escondido
// por padrão (só endereço) e só aparece se a pessoa pedir "avançado" (ver
// showAdvanced em ConfigCard). Sem isso, ninguém de fora de TI tinha ideia
// do que "FC1/FC3/holding register" significava.
function PointField({ label, point, showAdvanced, onChange }) {
  if (!showAdvanced) {
    return (
      <div className="field">
        <label className="field-label">{label} — endereço</label>
        <input
          className="input"
          type="number"
          value={point.addr ?? ''}
          placeholder="ex.: 103"
          onChange={(e) => onChange({ ...point, addr: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </div>
    );
  }
  return (
    <div className="grid-2">
      <div className="field">
        <label className="field-label">{label} — endereço</label>
        <input
          className="input"
          type="number"
          value={point.addr ?? ''}
          placeholder="ex.: 103"
          onChange={(e) => onChange({ ...point, addr: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <label className="field-label">{label} — tipo de registrador</label>
        <select className="select" value={point.type} onChange={(e) => onChange({ ...point, type: e.target.value })}>
          {REG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const EMPTY_POINT = { addr: null, type: 'coil' };
const ALL_POINT_KEYS = [...LEVEL_POINTS, ...PUMP_POINTS, ...ALARM_POINTS].map((p) => p.key);

function ConfigCard({ configId }) {
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState('Casa de bombas');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(502);
  const [unitId, setUnitId] = useState(1);
  const [pollSeconds, setPollSeconds] = useState(10);
  const [points, setPoints] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const toast = useToast();

  function load() {
    api.pumpStation.getConfig().then((c) => {
      setEnabled(c.enabled);
      setName(c.name);
      setHost(c.host);
      setPort(c.port);
      setUnitId(c.unitId);
      setPollSeconds(c.pollSeconds);
      setPoints(c.points);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  function setPoint(key, value) {
    setPoints((p) => ({ ...p, [key]: value }));
  }

  function buildPayload() {
    return { enabled, name, host, port: Number(port), unitId: Number(unitId), pollSeconds: Number(pollSeconds), points };
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.pumpStation.saveConfig(buildPayload());
      toast('Configuração da casa de bombas salva.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await api.pumpStation.saveConfig(buildPayload());
      await api.pumpStation.testConnection({ host, port: Number(port), unitId: Number(unitId) });
      toast('Conexão Modbus TCP com a IHM funcionando.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 400, borderRadius: 20 }} />;

  const canTest = Boolean(host);

  return (
    <div id={configId} className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Configuração</div>
          <div className="field-hint">
            O Portal lê os valores direto da IHM por Modbus TCP — não fala com o LOGO, não precisa da senha dele.
            Ative o "MODBUS TCP/IP Server" na IHM antes de preencher aqui.
          </div>
        </div>
        {enabled ? (
          <span className="badge badge-success">
            <span className="badge-dot" /> ativado
          </span>
        ) : (
          <span className="badge badge-warning">
            <span className="badge-dot" /> desativado
          </span>
        )}
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Ativar leitura da casa de bombas
      </label>

      <div className="field">
        <label className="field-label">Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa de bombas" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 12 }}>
        <div className="field">
          <label className="field-label">IP da IHM</label>
          <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.x" />
        </div>
        <div className="field">
          <label className="field-label">Porta Modbus</label>
          <input className="input" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Unit ID</label>
          <input className="input" type="number" value={unitId} onChange={(e) => setUnitId(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Atualizar a cada (segundos)</label>
        <input
          className="input"
          type="number"
          min={1}
          max={3600}
          style={{ maxWidth: 140 }}
          value={pollSeconds}
          onChange={(e) => setPollSeconds(e.target.value)}
        />
        <span className="field-hint">Quanto menor, mais rápido a tela de status atualiza — mas mais pedidos pra IHM.</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || saving || !canTest}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar conexão'}
        </button>
      </div>
      {!canTest && <span className="field-hint">Preencha o IP da IHM para poder testar.</span>}
      <span className="field-hint">"Testar conexão" salva os campos preenchidos e tenta abrir a conexão Modbus de verdade.</span>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>Endereços dos sinais</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? 'Esconder tipo de registrador' : 'Mostrar tipo de registrador (avançado)'}
          </button>
        </div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Deixe endereço em branco pra um sinal que ainda não quer monitorar — ele aparece como "não configurado" na
          tela de status, sem dar erro. Pra quase toda instalação, só o número do endereço já basta — o tipo de
          registrador abaixo é sempre "Bobina/Coil" por padrão, só mude se souber que a sua IHM expõe diferente.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ALL_POINT_KEYS.map((key) => {
            const meta = [...LEVEL_POINTS, ...PUMP_POINTS, ...ALARM_POINTS].find((p) => p.key === key);
            return (
              <PointField
                key={key}
                label={meta.label}
                point={points[key] || EMPTY_POINT}
                showAdvanced={showAdvanced}
                onChange={(v) => setPoint(key, v)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const DAY_RANGES = [30, 45, 60];

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dayKey(iso) {
  return iso.slice(0, 10);
}

// Barras empilhadas (minutos de bomba 1 + bomba 2 por dia) — SVG desenhado à
// mão, igual ao resto do Portal (sem biblioteca de gráficos). Cores já
// validadas (--chart-series-1/2, ver skill de dataviz) e já usadas em outros
// lugares do Portal, mantendo a paleta categórica em ordem fixa.
function PumpHistoryChart({ activations, days }) {
  const todayKey = dayKey(new Date().toISOString());
  const dayKeys = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return dayKey(d.toISOString());
  });

  const perDay = Object.fromEntries(dayKeys.map((k) => [k, { bomba1: 0, bomba2: 0 }]));
  for (const a of activations) {
    const k = dayKey(a.startedAt);
    if (perDay[k]) perDay[k][a.pointKey] += a.durationSeconds / 60;
  }
  const maxMinutes = Math.max(5, ...dayKeys.map((k) => perDay[k].bomba1 + perDay[k].bomba2));

  const W = 640;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 22, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const barGap = 2;
  const barW = Math.max(2, plotW / dayKeys.length - barGap);
  const [hoverIdx, setHoverIdx] = useState(null);

  function yFor(min) {
    return PAD.top + plotH - (min / maxMinutes) * plotH;
  }

  const hovered = hoverIdx !== null ? { key: dayKeys[hoverIdx], ...perDay[dayKeys[hoverIdx]] } : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 8, fontSize: 12.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-series-1)', display: 'inline-block' }} />
          Bomba 1
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--chart-series-2)', display: 'inline-block' }} />
          Bomba 2
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Minutos de bomba ligada por dia">
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--border-subtle)" strokeWidth="1" />
        {dayKeys.map((k, i) => {
          const x = PAD.left + i * (barW + barGap);
          const b1 = perDay[k].bomba1;
          const b2 = perDay[k].bomba2;
          const y1 = yFor(b1);
          const y2 = yFor(b1 + b2);
          return (
            <g key={k} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx((v) => (v === i ? null : v))}>
              <rect x={x} y={PAD.top} width={barW} height={plotH} fill="transparent" />
              {b1 > 0 && <rect x={x} y={y1} width={barW} height={PAD.top + plotH - y1} rx="2" fill="var(--chart-series-1)" />}
              {b2 > 0 && <rect x={x} y={y2} width={barW} height={y1 - y2 - (b1 > 0 ? 2 : 0)} rx="2" fill="var(--chart-series-2)" />}
              {k === todayKey && <circle cx={x + barW / 2} cy={PAD.top + plotH + 10} r="2" fill="var(--text-tertiary)" />}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="surface"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            padding: '8px 12px',
            minWidth: 150,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            {new Date(hovered.key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--chart-series-1)' }}>Bomba 1: {Math.round(hovered.bomba1)} min</div>
          <div style={{ fontSize: 12.5, color: 'var(--chart-series-2)' }}>Bomba 2: {Math.round(hovered.bomba2)} min</div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="surface" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function LEVELS_ACTIVE_LABEL(levelsAtStart) {
  const active = LEVEL_POINTS.filter((p) => levelsAtStart?.[p.key]).map((p) => p.label.replace('Nível ', ''));
  return active.length ? active.join(' + ') : '—';
}

function HistoryCard() {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setHistory(null);
    setError('');
    api.pumpStation
      .history(days)
      .then(setHistory)
      .catch((err) => setError(err.message));
  }, [days]);

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <Icon name="activity" size={17} />
          Histórico de ativações
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DAY_RANGES.map((d) => (
            <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDays(d)}>
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {error && <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>{error}</p>}
      {!error && !history && <div className="skeleton" style={{ height: 300, borderRadius: 12 }} />}

      {history && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatTile label="Bomba 1 — ativações" value={history.stats.bomba1.count} sub={formatDuration(history.stats.bomba1.totalSeconds)} />
            <StatTile label="Bomba 2 — ativações" value={history.stats.bomba2.count} sub={formatDuration(history.stats.bomba2.totalSeconds)} />
            <StatTile
              label="Tempo médio mínimo → médio"
              value={history.stats.avgMinimoToMedioSeconds !== null ? formatDuration(history.stats.avgMinimoToMedioSeconds) : '—'}
              sub={history.stats.minimoToMedioSampleCount ? `${history.stats.minimoToMedioSampleCount} ciclos` : 'sem dados ainda'}
            />
          </div>

          <PumpHistoryChart activations={history.activations} days={days} />

          <div style={{ marginTop: 20 }}>
            <div className="nav-subitem-label" style={{ marginBottom: 8 }}>
              Últimas ativações
            </div>
            {history.activations.length === 0 ? (
              <p className="field-hint">Nenhuma ativação registrada nesse período ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflowY: 'auto' }}>
                {history.activations.slice(0, 100).map((a, i) => (
                  <div key={i} className="service-row">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        <span style={{ color: a.pointKey === 'bomba1' ? 'var(--chart-series-1)' : 'var(--chart-series-2)' }}>●</span>{' '}
                        {a.pointKey === 'bomba1' ? 'Bomba 1' : 'Bomba 2'} — {formatDateTime(a.startedAt)}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Níveis ativos: {LEVELS_ACTIVE_LABEL(a.levelsAtStart)}</span>
                    </div>
                    <span className="field-hint">{a.endedAt ? formatDuration(a.durationSeconds) : 'em andamento'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function PumpStation({ isOwner, can }) {
  const configId = 'bombas-config';
  const canEditConfig = isOwner || can('bombas.editar');
  const { status, error, loaded } = usePumpStationStatus();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bombas</h1>
          <p>Nível de água do subsolo e status das bombas — lido direto da IHM por Modbus TCP.</p>
        </div>
      </div>

      <TankVisualization status={status} error={error} loaded={loaded} />

      <StatusCard
        status={status}
        error={error}
        loaded={loaded}
        canEditConfig={canEditConfig}
        onGoToConfig={() => document.getElementById(configId)?.scrollIntoView({ behavior: 'smooth' })}
      />

      <HistoryCard />

      {canEditConfig && <ConfigCard configId={configId} />}
    </>
  );
}
