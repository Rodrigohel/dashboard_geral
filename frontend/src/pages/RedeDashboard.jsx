import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';

const POLL_MS = 10000;

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

const DEVICE_TYPES = ['nvr', 'camera', 'porteiro', 'interfone', 'switch', 'ap', 'servidor', 'outro'];

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

function DeviceFormModal({ device, onClose, onSave }) {
  const [form, setForm] = useState({
    name: device?.name || '',
    ip: device?.ip || '',
    type: device?.type || 'outro',
    location: device?.location || '',
    notes: device?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.ip.trim()) {
      setError('IP é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={device ? 'Editar equipamento' : 'Novo equipamento'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Salvar'}
          </button>
        </>
      }
    >
      <form className="modal-body" onSubmit={handleSubmit}>
        {error && <div className="login-error">{error}</div>}

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Nome</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="NVR Torre A" />
          </div>
          <div className="field">
            <label className="field-label">IP</label>
            <input className="input" value={form.ip} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.1.10" />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Tipo</label>
            <select className="select" value={form.type} onChange={(e) => set('type', e.target.value)}>
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Local</label>
            <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Torre A - Térreo" />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Notas</label>
          <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opcional" />
        </div>
      </form>
    </Modal>
  );
}

function FloorFormModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !imageFile) {
      setError('Nome e imagem são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ name, imageFile });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Novo pavimento"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Salvar'}
          </button>
        </>
      }
    >
      <form className="modal-body" onSubmit={handleSubmit}>
        {error && <div className="login-error">{error}</div>}
        <div className="field">
          <label className="field-label">Nome do pavimento</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Térreo, Torre A" />
        </div>
        <div className="field">
          <label className="field-label">Imagem da planta baixa</label>
          <input className="input" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
        </div>
      </form>
    </Modal>
  );
}

function FloorPlanSection({ isOwner }) {
  const [floors, setFloors] = useState(null);
  const [devices, setDevices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [deletingFloor, setDeletingFloor] = useState(null);
  const toast = useToast();

  function reload() {
    Promise.all([api.rede.floors(), api.rede.devices()])
      .then(([f, d]) => {
        setFloors(f.data || []);
        setDevices(d.data || []);
      })
      .catch(() => setFloors([]));
  }
  useEffect(reload, []);

  async function handleCreateFloor(payload) {
    await api.rede.createFloor(payload);
    setShowForm(false);
    toast('Pavimento adicionado.');
    reload();
  }

  async function handleDeleteFloor() {
    try {
      await api.rede.deleteFloor(deletingFloor.id);
      toast('Pavimento removido.');
      setDeletingFloor(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 700 }}>Planta baixa</div>
        {isOwner && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Novo pavimento
          </button>
        )}
      </div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Posição dos equipamentos por pavimento — leitura.</p>

      {floors === null ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      ) : floors.length === 0 ? (
        <div className="field-hint">Nenhum pavimento cadastrado ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {floors.map((floor) => {
            const pins = devices.filter((d) => d.floorId === floor.id && d.floorX != null && d.floorY != null);
            return (
              <div key={floor.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{floor.name}</div>
                  {isOwner && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setDeletingFloor(floor)} style={{ color: 'var(--danger-500)' }}>
                      <Icon name="trash" size={14} /> Excluir
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  <img src={`/gateway/rede${floor.imageUrl}`} alt={floor.name} style={{ width: '100%', display: 'block' }} />
                  {pins.map((d) => (
                    <div
                      key={d.id}
                      title={`${d.name} (${d.status})`}
                      style={{
                        position: 'absolute',
                        left: `${d.floorX * 100}%`,
                        top: `${d.floorY * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        border: '2px solid white',
                        boxShadow: '0 0 0 1px rgba(0,0,0,.3)',
                        background:
                          d.status === 'online' ? 'var(--success-500)' : d.status === 'degraded' ? 'var(--warning-500)' : 'var(--danger-500)',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <FloorFormModal onClose={() => setShowForm(false)} onSave={handleCreateFloor} />}
      {deletingFloor && (
        <ConfirmDialog
          title="Excluir pavimento"
          message={`Excluir "${deletingFloor.name}"? Os equipamentos posicionados nele perdem a posição.`}
          confirmLabel="Excluir"
          danger
          onConfirm={handleDeleteFloor}
          onCancel={() => setDeletingFloor(null)}
        />
      )}
    </div>
  );
}

function formatDuration(ms) {
  if (!ms) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function AnaliseSection() {
  const [snapshot, setSnapshot] = useState(null);
  const [flappiest, setFlappiest] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    Promise.all([api.rede.networkHistory(24), api.rede.flappiest(), api.rede.history()])
      .then(([nh, fl, hi]) => {
        const rows = nh.data || [];
        setSnapshot(rows[rows.length - 1] || null);
        setFlappiest(fl.data || []);
        setHistory(hi.data || []);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Análise de rede</div>
        <p className="field-hint" style={{ marginBottom: 16 }}>Latência da última rodada de checagem e equipamentos mais instáveis (24h).</p>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div className="field-hint">Latência média</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{snapshot?.avgLatencyMs != null ? `${Math.round(snapshot.avgLatencyMs)} ms` : '—'}</div>
          </div>
          <div>
            <div className="field-hint">Latência p95</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{snapshot?.p95LatencyMs != null ? `${Math.round(snapshot.p95LatencyMs)} ms` : '—'}</div>
          </div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Mais instáveis</div>
        {flappiest.length === 0 ? (
          <div className="field-hint">Nenhuma queda registrada nas últimas 24h.</div>
        ) : (
          flappiest.map((d) => (
            <div className="service-row" key={d.id}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                <div className="field-hint">{d.location || d.ip}</div>
              </div>
              <span className="badge badge-warning">{d.drops} queda(s)</span>
            </div>
          ))
        )}
      </div>

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico de eventos</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>Últimas quedas e recuperações registradas.</p>
        {history.length === 0 ? (
          <div className="field-hint">Nenhum evento registrado ainda.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Quando</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Equipamento</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Evento</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Durou</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{new Date(e.at).toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.device?.name}</td>
                    <td style={{ padding: '10px 12px' }}>{e.eventLabel}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{formatDuration(e.durationMs)}</td>
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

export default function RedeDashboard({ can, isOwner }) {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [editingDevice, setEditingDevice] = useState(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [deletingDevice, setDeletingDevice] = useState(null);
  const toast = useToast();

  const canManageDevices = can('rede.dispositivos');
  const canSeeFloorPlan = can('rede.plantaBaixa');
  const canSeeAnalise = can('rede.analise');

  function load() {
    Promise.all([api.rede.summary(), api.rede.devices(), api.rede.alerts()])
      .then(([s, d, a]) => {
        setSummary(s);
        setDevices(d.data || []);
        setAlerts((a.data || []).filter((x) => x.status === 'active'));
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    let cancelled = false;
    function poll() {
      if (cancelled) return;
      load();
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleSaveDevice(form) {
    if (editingDevice) {
      await api.rede.updateDevice(editingDevice.id, form);
      toast('Equipamento atualizado.');
      setEditingDevice(null);
    } else {
      await api.rede.createDevice(form);
      toast('Equipamento cadastrado.');
      setShowAddDevice(false);
    }
    load();
  }

  async function handleDeleteDevice() {
    try {
      await api.rede.deleteDevice(deletingDevice.id);
      toast('Equipamento excluído.');
      setDeletingDevice(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>Equipamentos</div>
          {canManageDevices && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDevice(true)}>
              <Icon name="plus" size={14} /> Novo equipamento
            </button>
          )}
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {canManageDevices ? 'Cadastro completo — criar, editar e excluir.' : 'Lista de leitura.'}
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
                  {canManageDevices && <th style={{ padding: '8px 12px', fontWeight: 600 }}></th>}
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
                    {canManageDevices && (
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingDevice(d)} aria-label="Editar">
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setDeletingDevice(d)}
                          aria-label="Excluir"
                          style={{ color: 'var(--danger-500)' }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canSeeAnalise && <AnaliseSection />}

      {canSeeFloorPlan && <FloorPlanSection isOwner={isOwner} />}

      {(showAddDevice || editingDevice) && (
        <DeviceFormModal
          device={editingDevice}
          onClose={() => {
            setShowAddDevice(false);
            setEditingDevice(null);
          }}
          onSave={handleSaveDevice}
        />
      )}
      {deletingDevice && (
        <ConfirmDialog
          title="Excluir equipamento"
          message={`Excluir "${deletingDevice.name}"? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          onConfirm={handleDeleteDevice}
          onCancel={() => setDeletingDevice(null)}
        />
      )}
    </>
  );
}
