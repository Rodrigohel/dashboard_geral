import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

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
];
const ALARM_POINTS = [
  { key: 'termico1', label: 'Térmico bomba 1 desarmado' },
  { key: 'termico2', label: 'Térmico bomba 2 desarmado' },
  { key: 'modoManual', label: 'Modo manual (não automático)' },
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

function StatusCard({ isOwner, onGoToConfig }) {
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

  if (!loaded) return <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />;

  if (error) {
    return (
      <div className="surface" style={{ padding: 24, borderLeft: '3px solid var(--warning-500)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="droplet" size={17} />
          Casa de bombas
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>{error}</p>
        {isOwner && (
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

export default function PumpStation({ isOwner }) {
  const configId = 'bombas-config';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bombas</h1>
          <p>Nível de água do subsolo e status das bombas — lido direto da IHM por Modbus TCP.</p>
        </div>
      </div>

      <StatusCard isOwner={isOwner} onGoToConfig={() => document.getElementById(configId)?.scrollIntoView({ behavior: 'smooth' })} />

      {isOwner && <ConfigCard configId={configId} />}
    </>
  );
}
