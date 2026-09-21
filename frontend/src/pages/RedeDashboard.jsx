import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';

// Rede é só consulta no Portal — cadastro, edição, exclusão de
// equipamento e tudo de planta baixa (criar pavimento, posicionar) são
// feitos no painel de Rede original, e chegam aqui automaticamente (mesmo
// backend por trás do gateway). Aqui só existe visualização + as
// permissões que controlam O QUE cada usuário pode ver.

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

function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span className="field-hint">{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// Todos os dados do equipamento, para consulta — nenhum campo aqui é
// editável. Usado tanto na lista de Equipamentos quanto ao clicar num
// pino na planta baixa.
function DeviceDetailModal({ device, onClose }) {
  return (
    <Modal
      title={device.name}
      onClose={onClose}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="field-hint">Status</span>
          <StatusBadge status={device.status} />
        </div>
        <DetailRow label="IP" value={<strong>{device.ip}</strong>} />
        <DetailRow label="Tipo" value={device.type} />
        <DetailRow label="Local" value={device.location} />
        <DetailRow label="MAC" value={device.mac} />
        <DetailRow label="Fabricante" value={device.vendor} />
        <DetailRow label="Modelo" value={device.model} />
        <DetailRow label="Notas" value={device.notes} />
        <DetailRow label="Latência" value={device.latencyMs != null ? `${Math.round(device.latencyMs)} ms` : null} />
        <DetailRow label="Última checagem" value={device.lastCheckAt ? new Date(device.lastCheckAt).toLocaleString('pt-BR') : null} />
        <DetailRow label="Uptime (7 dias)" value={device.uptime7d != null ? `${device.uptime7d}%` : null} />
        <DetailRow label="Em manutenção até" value={device.maintenanceUntil ? new Date(device.maintenanceUntil).toLocaleString('pt-BR') : null} />
      </div>
    </Modal>
  );
}

function FloorPlanSection({ onViewDevice }) {
  const [floors, setFloors] = useState(null);
  const [devices, setDevices] = useState([]);
  const [imageUrls, setImageUrls] = useState({});

  useEffect(() => {
    Promise.all([api.rede.floors(), api.rede.devices()])
      .then(([f, d]) => {
        setFloors(f.data || []);
        setDevices(d.data || []);
      })
      .catch(() => setFloors([]));
  }, []);

  // Imagem precisa de fetch autenticado (vira blob) — <img src> puro não
  // manda o Authorization exigido pelo gateway, ver client.js.
  useEffect(() => {
    if (!floors) return;
    let cancelled = false;
    const urls = {};
    Promise.all(
      floors.map(async (floor) => {
        try {
          urls[floor.id] = await api.rede.getFloorImageBlobUrl(floor.imageUrl);
        } catch {
          // uma imagem específica falhou — segue sem ela, não trava as outras
        }
      })
    ).then(() => {
      if (!cancelled) setImageUrls(urls);
    });
    return () => {
      cancelled = true;
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [floors]);

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Planta baixa</div>
      <p className="field-hint" style={{ marginBottom: 16 }}>
        Posição dos equipamentos por pavimento — consulta. Pavimentos e posições são gerenciados no painel de Rede original.
      </p>

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
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{floor.name}</div>
                <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  {imageUrls[floor.id] ? (
                    <img src={imageUrls[floor.id]} alt={floor.name} style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <div className="skeleton" style={{ height: 240, borderRadius: 0 }} />
                  )}
                  {pins.map((d) => (
                    <div
                      key={d.id}
                      title={`${d.name} (${d.status}) — clique para ver detalhes`}
                      onClick={() => onViewDevice(d)}
                      style={{
                        position: 'absolute',
                        left: `${d.floorX * 100}%`,
                        top: `${d.floorY * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        border: '2px solid white',
                        boxShadow: '0 0 0 1px rgba(0,0,0,.3)',
                        cursor: 'pointer',
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
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

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

  async function handleDownloadReport() {
    setDownloading(true);
    try {
      const blob = await api.rede.executiveReportBlob(7);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio-executivo-rede.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <div className="surface" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>Análise de rede</div>
          <button className="btn btn-secondary btn-sm" onClick={handleDownloadReport} disabled={downloading}>
            {downloading ? <span className="spinner spinner-dark" /> : <Icon name="copy" size={14} />} Relatório executivo (PDF)
          </button>
        </div>
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

export default function RedeDashboard({ can }) {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [viewingDevice, setViewingDevice] = useState(null);
  const PAGE_SIZE = 25;

  const canSeeFloorPlan = can('rede.plantaBaixa');
  const canSeeAnalise = can('rede.analise');

  useEffect(() => {
    let cancelled = false;
    function load() {
      Promise.all([api.rede.summary(), api.rede.devices(), api.rede.alerts()])
        .then(([s, d, a]) => {
          if (cancelled) return;
          setSummary(s);
          setDevices(d.data || []);
          setAlerts((a.data || []).filter((x) => x.status === 'active'));
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

  const filteredDevices = devices.filter((d) => {
    const needle = deviceFilter.trim().toLowerCase();
    if (!needle) return true;
    return d.name.toLowerCase().includes(needle) || d.ip.includes(needle) || (d.location || '').toLowerCase().includes(needle);
  });
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDevices = filteredDevices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Rede</h1>
          <p>Monitoramento dos equipamentos de rede, direto aqui no Portal — só consulta.</p>
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
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Equipamentos</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          Consulta — clique num equipamento para ver todos os dados. Cadastro, edição e exclusão são feitos no painel de Rede original.
        </p>
        {devices.length === 0 ? (
          <div className="field-hint">Nenhum equipamento cadastrado ainda.</div>
        ) : (
          <>
            <input
              className="input"
              style={{ marginBottom: 12, maxWidth: 320 }}
              placeholder="Buscar por nome, IP ou local..."
              value={deviceFilter}
              onChange={(e) => {
                setDeviceFilter(e.target.value);
                setPage(1);
              }}
            />
            {filteredDevices.length === 0 ? (
              <div className="field-hint">Nenhum equipamento encontrado para "{deviceFilter}".</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nome</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>IP</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Local</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Tipo</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageDevices.map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => setViewingDevice(d)}
                          style={{ borderTop: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.name}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.ip}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.location || '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{d.type}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <StatusBadge status={d.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                    <span className="field-hint">
                      Página {safePage} de {totalPages} · {filteredDevices.length} equipamento(s)
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

      {canSeeAnalise && <AnaliseSection />}

      {canSeeFloorPlan && <FloorPlanSection onViewDevice={setViewingDevice} />}

      {viewingDevice && <DeviceDetailModal device={viewingDevice} onClose={() => setViewingDevice(null)} />}
    </>
  );
}
