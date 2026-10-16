import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { LEVEL_STOPS, fillPercentFor, severityColorVar, bombaDoDiaLabel, waterColorForPercent } from '../../utils/pumpLevel.js';

// Caminho ondulado (não uma linha reta) pra simular a superfície da água se
// movendo — alternando curvas pra cima/baixo em torno de baseY. Começa uma
// "wavelength" antes de `left` e termina uma depois de `right` de propósito:
// deslizar exatamente uma wavelength via CSS (ver .pump-tank-wave) fica sem
// costura, porque o padrão se repete.
function wavePath(baseY, amplitude, wavelength, left, right, bottom) {
  const half = wavelength / 2;
  let d = `M${left - wavelength},${baseY}`;
  let x = left - wavelength;
  let up = true;
  const end = right + wavelength;
  while (x < end) {
    const nx = x + half;
    const cy = baseY + (up ? -amplitude : amplitude);
    d += ` Q${x + half / 2},${cy} ${nx},${baseY}`;
    x = nx;
    up = !up;
  }
  d += ` L${end},${bottom} L${left - wavelength},${bottom} Z`;
  return d;
}

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
// Rótulo curto por sensor (sem o "Nível" repetido) — usado nos pares de
// fronteira do histórico de enchimento/esvaziamento.
const BOUNDARY_LABEL = { nivelMinimo: 'Mínimo', nivelMedio: 'Médio', nivelMaximo: 'Máximo', nivelSeguranca: 'Segurança' };
const PUMP_POINTS = [
  { key: 'bomba1', label: 'Bomba 1' },
  { key: 'bomba2', label: 'Bomba 2' },
];
// À parte de PUMP_POINTS de propósito — na tela de status isso vira UM
// indicador só ("Bomba do dia: Bomba 1"), não duas linhas sim/não
// separadas (ver bombaDoDiaLabel). Continuam aqui só pra aparecerem no
// formulário de configuração (endereço/tipo/inverter de cada um).
const BOMBA_DO_DIA_POINTS = [
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

  // Card detalhado (sim/não ponto a ponto) é só pra quem mexe na
  // configuração — pra usuário comum, o desenho do tanque + alarme (ver
  // TankVisualization, sempre visível) já cobre o que importa: nível,
  // bomba ligada, bomba do dia, alarme ativo.
  if (!canEditConfig) return null;

  const points = status?.points || {};
  const customPoints = status?.customPoints || [];

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
          <div className="service-row">
            <span>Bomba do dia</span>
            {bombaDoDiaLabel(points) ? (
              <span className="badge badge-neutral">
                <span className="badge-dot" /> {bombaDoDiaLabel(points)}
              </span>
            ) : (
              <span className="field-hint">não identificada</span>
            )}
          </div>
        </div>
        <div className="status-col">
          <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
            Alarmes
          </div>
          {ALARM_POINTS.map((p) => (
            <PointBadge key={p.key} label={p.label} value={points[p.key]} />
          ))}
        </div>
        {customPoints.length > 0 && (
          <div className="status-col">
            <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
              Pontos customizados
            </div>
            {customPoints.map((p) => (
              <PointBadge key={p.id} label={p.name} value={p.value} />
            ))}
          </div>
        )}
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
  // Analógico de verdade assim que tiver amostra histórica suficiente pra
  // essa fronteira (ver getFillEstimate no backend) — até lá, cai pro
  // degrau fixo das 4 boias, sem precisar de nenhuma troca manual.
  const estimate = status?.fillEstimate;
  const fillPercent = estimate?.percent ?? fillPercentFor(points);
  // Cor da água em degrade contínuo conforme o %, não os 4 degraus de
  // severidade (esses continuam só nos pontinhos/texto das boias ao lado).
  const waterColor = waterColorForPercent(fillPercent);
  const bombaDoDia = bombaDoDiaLabel(points);
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
  const WAVELENGTH = 40;
  // Coordenadas locais com "linha d'água" em y=0 — o grupo inteiro desliza
  // pra cima/baixo via translateY (anima liso, diferente de `d`, que não dá
  // pra fazer CSS animar suavemente). `bottom` só precisa ser generoso: o
  // clipPath corta o excesso.
  const waveBack = wavePath(-2, 5, WAVELENGTH, 14, 106, 260);
  const waveFront = wavePath(1, 4, WAVELENGTH, 14, 106, 260);

  return (
    <div className="surface" style={{ padding: 24 }}>
      <style>{`
        .pump-tank-wave-level { transition: transform 2.5s var(--ease, ease); }
        .pump-tank-wave-back { animation: pump-tank-wave-move 4.4s linear infinite reverse; }
        .pump-tank-wave-front { animation: pump-tank-wave-move 2.6s linear infinite; }
        @keyframes pump-tank-wave-move { from { transform: translateX(0); } to { transform: translateX(${WAVELENGTH}px); } }
        .pump-icon-on { animation: pump-icon-pulse 1.1s ease-in-out infinite; }
        @keyframes pump-icon-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
        <Icon name="droplet" size={17} />
        Nível do poço
        {estimate && (
          <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
            ~{estimate.percent}% {estimate.direction}
          </span>
        )}
      </div>
      <div className="field-hint" style={{ marginBottom: 16 }}>
        {estimate
          ? `Estimativa baseada no histórico de quanto tempo leva pra ${estimate.direction} entre as boias (${estimate.sampleCount} ciclos registrados) — o sistema só tem 4 sensores discretos, sem medição contínua de verdade.`
          : 'O sistema só tem 4 boias (sem sensor contínuo) — a animação mostra a boia mais alta ativa agora, suavizada entre as marcas. Assim que tiver histórico suficiente de quanto tempo leva pra encher/esvaziar entre as boias, a estimativa fica mais precisa sozinha.'}
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
            <g className="pump-tank-wave-level" style={{ transform: `translateY(${waterY}px)` }}>
              <path className="pump-tank-wave-back" d={waveBack} fill={waterColor} opacity="0.35" />
              <path className="pump-tank-wave-front" d={waveFront} fill={waterColor} opacity="0.65" />
            </g>
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
              <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                Bomba 1
                {bombaDoDia === 'Bomba 1' && <span className="badge badge-neutral">do dia</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pump1On ? 'ligada agora' : 'desligada'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="droplet" size={20} className={pump2On ? 'pump-icon-on' : ''} style={{ color: pump2On ? 'var(--chart-series-2)' : 'var(--text-tertiary)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                Bomba 2
                {bombaDoDia === 'Bomba 2' && <span className="badge badge-neutral">do dia</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{pump2On ? 'ligada agora' : 'desligada'}</div>
            </div>
          </div>
          {anyAlarm && (
            <div className="badge badge-danger" style={{ width: 'fit-content' }}>
              <span className="badge-dot" /> alarme ativo
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
function PointField({ label, point, showAdvanced, showPriority, onChange }) {
  const invertRow = (
    <label className="checkbox-row" style={{ marginTop: 4 }}>
      <input type="checkbox" checked={Boolean(point.invert)} onChange={(e) => onChange({ ...point, invert: e.target.checked })} />
      <span className="field-hint">Inverter valor lido (contato normalmente fechado — vem "ligado" em repouso)</span>
    </label>
  );
  // Só pros 7 sinais de alarme (ver PRIORITY_KEYS no backend) — "prioridade"
  // faz o alerta via Telegram insistir (reenviar) até alguém reconhecer, em
  // vez de mandar uma mensagem só (ver Configurações → Alertas via Telegram).
  const priorityRow = showPriority && (
    <label className="checkbox-row" style={{ marginTop: 4 }}>
      <input type="checkbox" checked={Boolean(point.priority)} onChange={(e) => onChange({ ...point, priority: e.target.checked })} />
      <span className="field-hint">Prioridade — Telegram insiste até reconhecer (ver Configurações)</span>
    </label>
  );
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
        {invertRow}
        {priorityRow}
      </div>
    );
  }
  return (
    <div className="field">
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
      {invertRow}
      {priorityRow}
    </div>
  );
}

const EMPTY_POINT = { addr: null, type: 'coil', invert: false, priority: false };
const ALARM_POINT_KEYS = new Set(ALARM_POINTS.map((p) => p.key));
const ALL_POINT_KEYS = [...LEVEL_POINTS, ...PUMP_POINTS, ...BOMBA_DO_DIA_POINTS, ...ALARM_POINTS].map((p) => p.key);

function ConfigCard({ configId }) {
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState('Casa de bombas');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(502);
  const [unitId, setUnitId] = useState(1);
  const [pollSeconds, setPollSeconds] = useState(10);
  const [points, setPoints] = useState({});
  const [customPoints, setCustomPoints] = useState([]);
  const [newPointName, setNewPointName] = useState('');
  const [newPointAddr, setNewPointAddr] = useState('');
  const [addingPoint, setAddingPoint] = useState(false);
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
      setCustomPoints(c.customPoints || []);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function handleAddCustomPoint() {
    if (!newPointName.trim()) return;
    setAddingPoint(true);
    try {
      await api.pumpStation.addCustomPoint({ name: newPointName.trim(), addr: newPointAddr === '' ? null : Number(newPointAddr), type: 'coil', invert: false });
      setNewPointName('');
      setNewPointAddr('');
      load();
      toast('Ponto customizado adicionado.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAddingPoint(false);
    }
  }

  function handleUpdateCustomPoint(point, changes) {
    const updated = { ...point, ...changes };
    setCustomPoints((list) => list.map((p) => (p.id === point.id ? updated : p)));
    api.pumpStation.saveCustomPoint(point.id, updated).catch((err) => toast(err.message, 'error'));
  }

  async function handleDeleteCustomPoint(point) {
    try {
      await api.pumpStation.deleteCustomPoint(point.id);
      setCustomPoints((list) => list.filter((p) => p.id !== point.id));
      toast(`"${point.name}" removido.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

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
            const meta = [...LEVEL_POINTS, ...PUMP_POINTS, ...BOMBA_DO_DIA_POINTS, ...ALARM_POINTS].find((p) => p.key === key);
            return (
              <PointField
                key={key}
                label={meta.label}
                point={points[key] || EMPTY_POINT}
                showAdvanced={showAdvanced}
                showPriority={ALARM_POINT_KEYS.has(key)}
                onChange={(v) => setPoint(key, v)}
              />
            );
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Pontos customizados</div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Sinal novo no CLP que ainda não tem um campo fixo aqui (ex.: uma entrada nova do LOGO) — cadastre o nome e o
          endereço (LB da IHM) e ele passa a aparecer, de forma simples (nome + sim/não), na tela de status. Sem
          desenho específico ainda — fica pra depois.
        </div>
        {customPoints.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {customPoints.map((p) => (
              <div key={p.id} className="field" style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 10, alignItems: 'end' }}>
                  <div className="field">
                    <label className="field-label">Nome</label>
                    <input className="input" value={p.name} onChange={(e) => handleUpdateCustomPoint(p, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label">Endereço</label>
                    <input
                      className="input"
                      type="number"
                      value={p.addr ?? ''}
                      placeholder="ex.: 120"
                      onChange={(e) => handleUpdateCustomPoint(p, { addr: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDeleteCustomPoint(p)}>
                    Remover
                  </button>
                </div>
                <label className="checkbox-row" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={Boolean(p.invert)} onChange={(e) => handleUpdateCustomPoint(p, { invert: e.target.checked })} />
                  <span className="field-hint">Inverter valor lido (contato normalmente fechado)</span>
                </label>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label className="field-label">Nome do ponto novo</label>
            <input className="input" value={newPointName} onChange={(e) => setNewPointName(e.target.value)} placeholder="ex.: Bomba reserva" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label className="field-label">Endereço</label>
            <input className="input" type="number" value={newPointAddr} onChange={(e) => setNewPointAddr(e.target.value)} placeholder="ex.: 120" />
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleAddCustomPoint} disabled={addingPoint || !newPointName.trim()}>
            {addingPoint ? <span className="spinner spinner-dark" /> : '+ Adicionar ponto'}
          </button>
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

// Duas linhas (minutos de bomba 1 e bomba 2 ligada, por dia) — SVG desenhado
// à mão, igual ao resto do Portal (sem biblioteca de gráficos). Trocado de
// barra empilhada pra linha a pedido do Rodrigo ("acho que é melhor
// visualizado") — com linha dá pra ver a TENDÊNCIA dia a dia de cada bomba
// separada, que ficava escondida uma atrás da outra na pilha. Cores já
// validadas (--chart-series-1/2, ver skill de dataviz).
function PumpHistoryChart({ activations, days }) {
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
  const maxMinutes = Math.max(5, ...dayKeys.map((k) => Math.max(perDay[k].bomba1, perDay[k].bomba2)));

  const W = 640;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 22, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const stepX = dayKeys.length > 1 ? plotW / (dayKeys.length - 1) : 0;
  const [selectedIdx, setSelectedIdx] = useState(dayKeys.length - 1);

  // Sempre que o período muda (30/45/60 dias), recalcula o dia selecionado:
  // o último com alguma ativação, senão o último do período — assim sempre
  // tem um resumo legível embaixo do gráfico sem precisar tocar em nada
  // primeiro (no celular "passar o mouse" não existe, por isso trocamos
  // hover por toque/clique com resumo fixo, não flutuante).
  useEffect(() => {
    const lastWithData = [...dayKeys].reverse().find((k) => perDay[k].bomba1 > 0 || perDay[k].bomba2 > 0);
    const idx = dayKeys.indexOf(lastWithData ?? dayKeys[dayKeys.length - 1]);
    setSelectedIdx(idx === -1 ? dayKeys.length - 1 : idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  function xFor(i) {
    return PAD.left + i * stepX;
  }
  function yFor(min) {
    return PAD.top + plotH - (min / maxMinutes) * plotH;
  }

  function lineFor(series) {
    return dayKeys.map((k, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(perDay[k][series])}`).join(' ');
  }

  // Mostra no máximo ~6 marcações de data no eixo X — com 60 dias, uma
  // etiqueta por dia ficaria ilegível, principalmente no celular (tela
  // estreita).
  const labelEvery = Math.max(1, Math.ceil(dayKeys.length / 6));

  const selectedKey = dayKeys[selectedIdx];
  const selected = selectedKey ? { key: selectedKey, ...perDay[selectedKey] } : null;

  return (
    <div>
      <div className="field-hint" style={{ marginBottom: 8 }}>
        Quantos minutos cada bomba ficou ligada em cada dia, nos últimos {days} dias — toque num ponto do gráfico pra
        ver o dia exato.
      </div>
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
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }} role="img" aria-label="Minutos de bomba ligada por dia">
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--border-subtle)" strokeWidth="1" />
        <path d={lineFor('bomba1')} fill="none" stroke="var(--chart-series-1)" strokeWidth="2" />
        <path d={lineFor('bomba2')} fill="none" stroke="var(--chart-series-2)" strokeWidth="2" />
        {dayKeys.map((k, i) => (
          <g key={k} onClick={() => setSelectedIdx(i)} style={{ cursor: 'pointer' }}>
            <rect x={xFor(i) - stepX / 2} y={PAD.top} width={Math.max(stepX, 4)} height={plotH} fill="transparent" />
            {i % labelEvery === 0 && (
              <text x={xFor(i)} y={PAD.top + plotH + 14} fontSize="10.5" textAnchor="middle" fill="var(--text-tertiary)">
                {new Date(k).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </text>
            )}
            {selectedIdx === i && <line x1={xFor(i)} x2={xFor(i)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2,3" />}
            {perDay[k].bomba1 > 0 && <circle cx={xFor(i)} cy={yFor(perDay[k].bomba1)} r={selectedIdx === i ? 5 : 2.5} fill="var(--chart-series-1)" />}
            {perDay[k].bomba2 > 0 && <circle cx={xFor(i)} cy={yFor(perDay[k].bomba2)} r={selectedIdx === i ? 5 : 2.5} fill="var(--chart-series-2)" />}
          </g>
        ))}
      </svg>
      {selected && (
        <div className="surface" style={{ marginTop: 10, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {new Date(selected.key).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
          </span>
          <span style={{ fontSize: 13, color: 'var(--chart-series-1)' }}>● Bomba 1: {Math.round(selected.bomba1)} min</span>
          <span style={{ fontSize: 13, color: 'var(--chart-series-2)' }}>● Bomba 2: {Math.round(selected.bomba2)} min</span>
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

// Linha de "tempo médio entre boias" com os ciclos reais por trás,
// expansível — pedido direto do Rodrigo ("onde você tirou esse número?").
// Cada ciclo mostra data/hora de início e fim, não só o número final.
function TransitionRow({ label, stat }) {
  const [open, setOpen] = useState(false);
  if (!stat) {
    return (
      <div className="service-row">
        <span style={{ fontSize: 12.5 }}>{label}</span>
        <span className="field-hint">ainda sem ciclos suficientes registrados</span>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}
      >
        <span style={{ fontSize: 12.5 }}>{label}</span>
        <span className="field-hint">
          ~{formatDuration(stat.avgSeconds)} em média ({stat.sampleCount} ciclos) {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 8px', maxHeight: 220, overflowY: 'auto' }}>
          {stat.samples.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              <span>{formatDateTime(s.startAt)} → {formatDateTime(s.endAt)}</span>
              <span>{formatDuration(s.seconds)}</span>
            </div>
          ))}
          {stat.sampleCount > stat.samples.length && (
            <span className="field-hint">+ {stat.sampleCount - stat.samples.length} ciclo(s) mais antigo(s), não mostrados</span>
          )}
        </div>
      )}
    </div>
  );
}

function LEVELS_ACTIVE_LABEL(levelsAtStart) {
  const active = LEVEL_POINTS.filter((p) => levelsAtStart?.[p.key]).map((p) => p.label.replace('Nível ', ''));
  return active.length ? active.join(' + ') : '—';
}

const SNAPSHOT_LABEL = {
  ...BOUNDARY_LABEL,
  bomba1: 'Bomba 1',
  bomba2: 'Bomba 2',
  ...Object.fromEntries(ALARM_POINTS.map((p) => [p.key, p.label])),
};

function HistoryCard({ canEditConfig }) {
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [snapshots, setSnapshots] = useState(null);

  useEffect(() => {
    setHistory(null);
    setError('');
    api.pumpStation
      .history(days)
      .then(setHistory)
      .catch((err) => setError(err.message));
  }, [days]);

  // Fotos automáticas tiradas no instante em que uma bomba liga — só pra
  // quem edita config (mesmo público de /config), pra comparar com o
  // painel físico sem precisar estar lá esperando.
  useEffect(() => {
    if (!canEditConfig) return;
    api.pumpStation.activationSnapshots().then(setSnapshots).catch(() => setSnapshots([]));
  }, [canEditConfig]);

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
            <StatTile label="Bomba 1 — quantas vezes ligou" value={history.stats.bomba1.count} sub={`ficou ligada ${formatDuration(history.stats.bomba1.totalSeconds)} no total`} />
            <StatTile label="Bomba 2 — quantas vezes ligou" value={history.stats.bomba2.count} sub={`ficou ligada ${formatDuration(history.stats.bomba2.totalSeconds)} no total`} />
          </div>

          {history.levelTransitions && (
            <div style={{ marginBottom: 20 }}>
              <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
                Tempo médio entre boias
              </div>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                Quanto tempo o poço leva, em média, pra subir (encher) ou descer (esvaziar) de uma boia pra outra —
                calculado a partir de TODO o histórico já registrado, não só os {days} dias escolhidos acima. Ajuda a
                notar se alguma bomba está demorando mais que o normal pra baixar o nível, por exemplo.
              </div>
              <div className="grid-2">
                <div className="surface" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Enchendo (nível subindo)</div>
                  {history.levelTransitions.map((t) => (
                    <TransitionRow key={`rising-${t.from}`} label={`${BOUNDARY_LABEL[t.from]} → ${BOUNDARY_LABEL[t.to]}`} stat={t.rising} />
                  ))}
                </div>
                <div className="surface" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Esvaziando (nível baixando)</div>
                  {history.levelTransitions.map((t) => (
                    <TransitionRow key={`falling-${t.from}`} label={`${BOUNDARY_LABEL[t.to]} → ${BOUNDARY_LABEL[t.from]}`} stat={t.falling} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <PumpHistoryChart activations={history.activations} days={days} />

          <div style={{ marginTop: 20 }}>
            <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
              Últimas ativações
            </div>
            <div className="field-hint" style={{ marginBottom: 8 }}>
              Cada linha é uma vez que uma bomba ligou — "Níveis ativos" mostra quais boias já estavam acionadas
              naquele momento (ex.: "Mínimo + Médio" quer dizer que o poço já tinha passado do nível médio quando essa
              bomba entrou).
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
                        {a.pointKey === 'bomba1' ? 'Bomba 1' : 'Bomba 2'} ligou em {formatDateTime(a.startedAt)}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Níveis ativos no momento: {LEVELS_ACTIVE_LABEL(a.levelsAtStart)}</span>
                    </div>
                    <span className="field-hint">{a.endedAt ? `ficou ligada ${formatDuration(a.durationSeconds)}` : 'ainda ligada agora'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canEditConfig && snapshots && snapshots.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="nav-subitem-label" style={{ marginBottom: 4 }}>
                Fotos automáticas ao ligar uma bomba
              </div>
              <div className="field-hint" style={{ marginBottom: 8 }}>
                Toda vez que a bomba 1 ou a bomba 2 liga, o Portal tira sozinho uma "foto" de todos os sinais naquele
                exato instante — serve pra comparar com o que o painel físico mostrava nessa mesma hora, sem precisar
                estar presente esperando a bomba ligar.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {snapshots.map((s) => (
                  <div key={s.id} className="surface" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>{formatDateTime(s.createdAt)}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(s.points)
                        .filter(([key]) => SNAPSHOT_LABEL[key])
                        .map(([key, value]) => (
                          <span
                            key={key}
                            className="field-hint"
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: value === true ? 'var(--chart-series-1)' : 'transparent',
                              color: value === true ? '#fff' : undefined,
                              border: value === true ? 'none' : '1px solid var(--border)',
                            }}
                          >
                            {SNAPSHOT_LABEL[key]}: {value === true ? 'sim' : value === false ? 'não' : '—'}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      <HistoryCard canEditConfig={canEditConfig} />

      {canEditConfig && <ConfigCard configId={configId} />}
    </>
  );
}
