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

const POINT_META = [
  { key: 'pronto', label: 'Pronto (standby)' },
  { key: 'falha', label: 'Falha ativa' },
  { key: 'emOperacao', label: 'Em operação (gerando energia)' },
];

function usePumpStyleStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [pollMs, setPollMs] = useState(DEFAULT_POLL_MS);

  useEffect(() => {
    function load() {
      api.generator
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
  if (!loaded) return <div className="skeleton" style={{ height: 180, borderRadius: 20 }} />;

  if (error) {
    return (
      <div className="surface" style={{ padding: 24, borderLeft: '3px solid var(--warning-500)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="zap" size={17} />
          Gerador
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
  const falha = points.falha === true;
  const emOperacao = points.emOperacao === true;
  const pronto = points.pronto === true;

  const badge = falha
    ? { cls: 'badge-danger', label: 'falha ativa' }
    : emOperacao
    ? { cls: 'badge-success', label: 'gerando energia' }
    : pronto
    ? { cls: 'badge-success', label: 'pronto (standby)' }
    : { cls: 'badge-neutral', label: 'não pronto' };

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <Icon name="zap" size={17} />
          {status?.name || 'Gerador'}
        </div>
        <span className={`badge ${badge.cls}`}>
          <span className="badge-dot" /> {badge.label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {POINT_META.map((p) => {
          const value = points[p.key];
          return (
            <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="field-hint">{p.label}</span>
              {value === null || value === undefined ? (
                <span className="field-hint">não configurado</span>
              ) : typeof value === 'object' && value.error ? (
                <span className="badge badge-danger" title={value.error}>
                  <span className="badge-dot" /> erro de leitura
                </span>
              ) : (
                <span className={`badge ${value ? 'badge-success' : 'badge-neutral'}`}>
                  <span className="badge-dot" /> {value ? 'sim' : 'não'}
                </span>
              )}
            </div>
          );
        })}
        {(status?.customPoints || []).map((p) => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="field-hint">{p.name}</span>
            <span className={`badge ${p.value ? 'badge-success' : 'badge-neutral'}`}>
              <span className="badge-dot" /> {p.value ? 'sim' : 'não'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}

// Histórico de transições (liga/desliga pronto/falha/emOperacao) — mesma
// ideia do histórico de Bombas, simplificado: Gerador não tem "nível", só
// lista crua das mudanças, mais recente primeiro.
function HistoryCard() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.generator.history(30).then(setEvents).catch((err) => setError(err.message));
  }, []);

  if (error) return null; // módulo pode não estar habilitado ainda — não é erro pra mostrar aqui
  if (events === null) return <div className="skeleton" style={{ height: 120, borderRadius: 20 }} />;

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Histórico (últimos 30 dias)</div>
      {events.length === 0 ? (
        <span className="field-hint">Nenhuma transição registrada ainda.</span>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Sinal</th>
                <th>Transição</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 50).map((e, i) => (
                <tr key={i}>
                  <td>{formatDateTime(e.createdAt)}</td>
                  <td>{POINT_META.find((p) => p.key === e.pointKey)?.label || e.pointKey}</td>
                  <td>
                    <span className={`badge ${e.state ? 'badge-success' : 'badge-neutral'}`}>
                      <span className="badge-dot" /> {e.state ? 'entrou' : 'saiu'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PointField({ label, point, showAdvanced, onChange }) {
  const invertRow = (
    <label className="checkbox-row" style={{ marginTop: 4 }}>
      <input type="checkbox" checked={Boolean(point.invert)} onChange={(e) => onChange({ ...point, invert: e.target.checked })} />
      <span className="field-hint">Inverter valor lido (contato normalmente fechado — vem "ligado" em repouso)</span>
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
          placeholder="ex.: 10"
          onChange={(e) => onChange({ ...point, addr: e.target.value === '' ? null : Number(e.target.value) })}
        />
        {invertRow}
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
            placeholder="ex.: 10"
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
    </div>
  );
}

const EMPTY_POINT = { addr: null, type: 'coil', invert: false };

function ConfigCard({ configId }) {
  const [enabled, setEnabled] = useState(false);
  const [name, setName] = useState('Gerador');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(502);
  const [unitId, setUnitId] = useState(1);
  const [pollSeconds, setPollSeconds] = useState(10);
  const [points, setPoints] = useState({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customPoints, setCustomPoints] = useState([]);
  const [newPointName, setNewPointName] = useState('');
  const [newPointAddr, setNewPointAddr] = useState('');
  const [addingPoint, setAddingPoint] = useState(false);
  const toast = useToast();

  function load() {
    api.generator.getConfig().then((c) => {
      setEnabled(c.enabled);
      setName(c.name);
      setHost(c.host);
      setPort(c.port);
      setUnitId(c.unitId);
      setPollSeconds(c.pollSeconds);
      setPoints(c.points);
      setUsername(c.username || '');
      setHasPassword(c.hasPassword);
      setCustomPoints(c.customPoints || []);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function handleAddCustomPoint() {
    setAddingPoint(true);
    try {
      const created = await api.generator.addCustomPoint({
        name: newPointName.trim(),
        addr: newPointAddr === '' ? null : Number(newPointAddr),
        type: 'coil',
        invert: false,
      });
      setCustomPoints((list) => [...list, created]);
      setNewPointName('');
      setNewPointAddr('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAddingPoint(false);
    }
  }

  function handleUpdateCustomPoint(point, changes) {
    const updated = { ...point, ...changes };
    setCustomPoints((list) => list.map((p) => (p.id === point.id ? updated : p)));
    api.generator.saveCustomPoint(point.id, updated).catch((err) => toast(err.message, 'error'));
  }

  async function handleDeleteCustomPoint(point) {
    try {
      await api.generator.deleteCustomPoint(point.id);
      setCustomPoints((list) => list.filter((p) => p.id !== point.id));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function setPoint(key, value) {
    setPoints((p) => ({ ...p, [key]: value }));
  }

  function buildPayload() {
    return {
      enabled,
      name,
      host,
      port: Number(port),
      unitId: Number(unitId),
      pollSeconds: Number(pollSeconds),
      points,
      username,
      // Senha nunca é obrigatória nem exigida de novo a cada "Salvar" — só
      // manda quando a pessoa digitou algo novo, igual senha de porteiro.
      password: password || undefined,
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.generator.saveConfig(buildPayload());
      setPassword('');
      toast('Configuração do gerador salva.');
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
      await api.generator.saveConfig(buildPayload());
      await api.generator.testConnection({ host, port: Number(port), unitId: Number(unitId) });
      toast('Conexão Modbus TCP com o controlador funcionando.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 360, borderRadius: 20 }} />;

  const canTest = Boolean(host);

  return (
    <div id={configId} className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Configuração</div>
          <div className="field-hint">
            O Portal lê os valores direto do controlador por Modbus TCP, sem login — o controlador ComAp (ou
            equivalente) precisa ter o módulo de rede/Ethernet instalado e configurado com esse IP.
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
        Ativar leitura do gerador
      </label>

      <div className="field">
        <label className="field-label">Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gerador" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 12 }}>
        <div className="field">
          <label className="field-label">IP do controlador</label>
          <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.253" />
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
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Usuário</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="opcional" />
        </div>
        <div className="field">
          <label className="field-label">Senha</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? 'já salva — deixe em branco pra manter' : 'opcional'}
          />
        </div>
      </div>
      <span className="field-hint">
        O Modbus TCP em si não pede login — deixe em branco se não souber. Preencha só se descobrir que o controlador
        precisa disso por algum outro caminho (ex.: tela web própria do ComAp).
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || saving || !canTest}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar conexão'}
        </button>
      </div>
      {!canTest && <span className="field-hint">Preencha o IP do controlador para poder testar.</span>}

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>Endereços dos sinais</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? 'Esconder tipo de registrador' : 'Mostrar tipo de registrador (avançado)'}
          </button>
        </div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Deixe endereço em branco pra um sinal que ainda não quer monitorar — ele aparece como "não configurado" na
          tela de status, sem dar erro. Ainda não sabemos os endereços certos do ComAp AMF-9 — preencha aqui assim
          que descobrir (documentação do controlador, ou testando endereços como fizemos com a IHM das Bombas).
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {POINT_META.map((meta) => (
            <div key={meta.key}>
              <PointField
                label={meta.label}
                point={points[meta.key] || EMPTY_POINT}
                showAdvanced={showAdvanced}
                onChange={(v) => setPoint(meta.key, v)}
              />
              {meta.key === 'falha' && (
                <label className="checkbox-row" style={{ marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(points.falha?.priority)}
                    onChange={(e) => setPoint('falha', { ...(points.falha || EMPTY_POINT), priority: e.target.checked })}
                  />
                  <span className="field-hint">
                    Prioridade — insiste via Telegram (e liga por telefone, se configurado) até alguém reconhecer.
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Pontos customizados</div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Sinal novo no controlador que ainda não tem um campo fixo aqui — cadastre o nome e o endereço e ele passa a
          aparecer (nome + sim/não) na tela de status.
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
                      placeholder="ex.: 10"
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
            <input className="input" value={newPointName} onChange={(e) => setNewPointName(e.target.value)} placeholder="ex.: Bateria" />
          </div>
          <div className="field" style={{ width: 120 }}>
            <label className="field-label">Endereço</label>
            <input className="input" type="number" value={newPointAddr} onChange={(e) => setNewPointAddr(e.target.value)} placeholder="ex.: 10" />
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleAddCustomPoint} disabled={addingPoint || !newPointName.trim()}>
            {addingPoint ? <span className="spinner spinner-dark" /> : '+ Adicionar ponto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Generator({ isOwner, can }) {
  const configId = 'gerador-config';
  const canEditConfig = isOwner || can('gerador.editar');
  const { status, error, loaded } = usePumpStyleStatus();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Gerador</h1>
          <p>Grupo gerador diesel — status lido direto do controlador por Modbus TCP.</p>
        </div>
      </div>

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
