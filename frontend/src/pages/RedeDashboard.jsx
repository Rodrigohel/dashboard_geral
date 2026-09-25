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

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        {children}
      </span>
      {action}
    </div>
  );
}

function LatencySparkline({ checks }) {
  const points = (checks || []).filter((c) => c.latencyMs != null);
  if (points.length < 2) return <div className="field-hint">Sem dados de latência recentes.</div>;
  const w = 480;
  const h = 60;
  const max = Math.max(...points.map((p) => p.latencyMs), 1);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - Math.min(1, p.latencyMs / max) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <path d={path} fill="none" stroke="var(--accent-500)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function uptimeCellColor(pct) {
  if (pct == null) return 'var(--border-subtle)';
  if (pct >= 99) return 'var(--success-500)';
  if (pct >= 95) return 'var(--warning-500)';
  return 'var(--danger-500)';
}

function UptimeHeatmap({ data }) {
  if (!data || data.length === 0) return <div className="field-hint">Sem histórico suficiente ainda.</div>;
  const first = new Date(`${data[0].date}T00:00:00Z`);
  const firstDow = first.getUTCDay();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gridAutoColumns: '12px', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.uptimePercent != null ? `${d.uptimePercent}%` : 'sem dados'}`}
            style={{ width: 12, height: 12, borderRadius: 3, background: uptimeCellColor(d.uptimePercent) }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--success-500)', marginRight: 5 }} />≥ 99%</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--warning-500)', marginRight: 5 }} />≥ 95%</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--danger-500)', marginRight: 5 }} />&lt; 95%</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--border-subtle)', marginRight: 5 }} />sem dados</span>
      </div>
    </>
  );
}

function CopyButton({ value }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(value || '');
        toast('Copiado.');
      }}
      aria-label="Copiar"
    >
      <Icon name="copy" size={14} />
    </button>
  );
}

// Todos os dados do equipamento, para consulta — nenhum campo aqui é
// editável (cadastro/edição são feitos no painel de Rede original). Usado
// tanto na lista de Equipamentos quanto ao clicar num pino na planta baixa.
function DeviceDetailModal({ deviceId, onClose }) {
  const [device, setDevice] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [heatmapDays, setHeatmapDays] = useState(90);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.rede.device(deviceId).then(setDevice).catch((err) => setError(err.message));
  }, [deviceId]);

  useEffect(() => {
    api.rede.uptimeHeatmap(deviceId, heatmapDays).then((r) => setHeatmap(r.data || [])).catch(() => setHeatmap([]));
  }, [deviceId, heatmapDays]);

  return (
    <Modal
      title={device?.name || 'Equipamento'}
      onClose={onClose}
      width={560}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {error && <div className="login-error">{error}</div>}
      {!device ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StatusBadge status={device.status} />
            <span className="field-hint">{device.ip}</span>
            {device.uptime7d != null && <span className="field-hint">· Uptime 7 dias: <strong style={{ color: 'var(--text-primary)' }}>{device.uptime7d}%</strong></span>}
          </div>

          <div>
            <SectionLabel>Latência recente</SectionLabel>
            <LatencySparkline checks={device.recentChecks} />
          </div>

          <div>
            <SectionLabel
              action={
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={`btn btn-sm ${heatmapDays === 30 ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setHeatmapDays(30)}>
                    30 dias
                  </button>
                  <button className={`btn btn-sm ${heatmapDays === 90 ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setHeatmapDays(90)}>
                    90 dias
                  </button>
                </div>
              }
            >
              Disponibilidade por dia
            </SectionLabel>
            {heatmap === null ? <div className="skeleton" style={{ height: 100, borderRadius: 8 }} /> : <UptimeHeatmap data={heatmap} />}
          </div>

          <div>
            <SectionLabel>Identificação</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <DetailRow label="MAC" value={device.mac} />
              <DetailRow label="Fabricante" value={device.vendor} />
              <DetailRow label="Modelo" value={device.model} />
            </div>
          </div>

          <div>
            <SectionLabel
              action={
                <a className="field-hint" href={`http://${device.ip}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-500)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="externalLink" size={13} /> Abrir interface web
                </a>
              }
            >
              Acesso do equipamento
            </SectionLabel>
            {device.username ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="field-hint">Usuário</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{device.username}</span>
                    <CopyButton value={device.username} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="field-hint">Senha</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{showPassword ? device.password || '—' : '••••••'}</span>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPassword((v) => !v)} aria-label="Mostrar senha">
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={14} />
                    </button>
                    <CopyButton value={device.password} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="field-hint">Nenhuma credencial cadastrada.</div>
            )}
          </div>

          <div>
            <SectionLabel>Cadastro</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <DetailRow label="Tipo" value={device.type} />
              <DetailRow label="Local" value={device.location} />
              <DetailRow label="Portas TCP" value={device.ports?.length ? device.ports.join(', ') : null} />
              <DetailRow label="Notas" value={device.notes} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="field-hint">Monitoramento</span>
                <span className={`badge ${device.enabled ? 'badge-success' : 'badge-neutral'}`}>
                  <span className="badge-dot" /> {device.enabled ? 'ativo' : 'desativado'}
                </span>
              </div>
              <DetailRow label="Última checagem" value={device.lastCheckAt ? new Date(device.lastCheckAt).toLocaleString('pt-BR') : null} />
              <DetailRow label="Em manutenção até" value={device.maintenanceUntil ? new Date(device.maintenanceUntil).toLocaleString('pt-BR') : null} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Overlay cobrindo a tela inteira — não é o Modal.jsx padrão (esse é um
// cartão centralizado, pequeno demais pra planta baixa). Imagem em
// max-width/max-height 100% pra sempre caber, com os pinos por cima na
// mesma posição relativa.
function FullscreenFloorViewer({ floor, imageUrl, pins, onViewDevice, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 16, 0.94)',
        zIndex: 90, // abaixo do .modal-overlay padrão (z-index 100) — o modal de
        // detalhe do equipamento, aberto por cima ao clicar num pino, precisa
        // ficar visível e não atrás da planta em tela cheia.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{ position: 'absolute', top: 16, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'white', fontWeight: 700 }}>{floor.name}</div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar" style={{ color: 'white' }}>
          <Icon name="x" size={22} />
        </button>
      </div>
      {!imageUrl ? (
        <span className="spinner" />
      ) : (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '95vw', maxHeight: '88vh' }}>
          <img src={imageUrl} alt={floor.name} style={{ maxWidth: '95vw', maxHeight: '88vh', display: 'block', borderRadius: 8 }} />
          {pins.map((d) => (
            <div
              key={d.id}
              title={`${d.name} (${d.status}) — clique para ver detalhes`}
              onClick={() => onViewDevice(d.id)}
              style={{
                position: 'absolute',
                left: `${d.floorX * 100}%`,
                top: `${d.floorY * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
                cursor: 'pointer',
                background: d.status === 'online' ? 'var(--success-500)' : d.status === 'degraded' ? 'var(--warning-500)' : 'var(--danger-500)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FloorPlanSection({ onViewDevice }) {
  const [floors, setFloors] = useState(null);
  const [devices, setDevices] = useState([]);
  const [openFloorId, setOpenFloorId] = useState(null);
  const [openImageUrl, setOpenImageUrl] = useState(null);

  useEffect(() => {
    Promise.all([api.rede.floors(), api.rede.devices()])
      .then(([f, d]) => {
        setFloors(f.data || []);
        setDevices(d.data || []);
      })
      .catch(() => setFloors([]));
  }, []);

  async function openFloor(floor) {
    setOpenFloorId(floor.id);
    setOpenImageUrl(null);
    try {
      // Imagem precisa de fetch autenticado (vira blob) — <img src> puro não
      // manda o Authorization exigido pelo gateway, ver client.js.
      const url = await api.rede.getFloorImageBlobUrl(floor.imageUrl);
      setOpenImageUrl(url);
    } catch {
      // erro ao carregar — o overlay mostra só o spinner parado; fechar e tentar de novo é a saída
    }
  }

  function closeFloor() {
    if (openImageUrl) URL.revokeObjectURL(openImageUrl);
    setOpenFloorId(null);
    setOpenImageUrl(null);
  }

  const openFloor_ = floors?.find((f) => f.id === openFloorId);

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Planta baixa</div>
      <p className="field-hint" style={{ marginBottom: 16 }}>
        Posição dos equipamentos por pavimento — consulta. Pavimentos e posições são gerenciados no painel de Rede original.
      </p>

      {floors === null ? (
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      ) : floors.length === 0 ? (
        <div className="field-hint">Nenhum pavimento cadastrado ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {floors.map((floor) => {
            const pinCount = devices.filter((d) => d.floorId === floor.id && d.floorX != null && d.floorY != null).length;
            return (
              <button
                key={floor.id}
                className="service-row"
                onClick={() => openFloor(floor)}
                style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', background: 'none' }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{floor.name}</div>
                  <div className="field-hint">{pinCount} disp.</div>
                </div>
                <span style={{ color: 'var(--accent-500)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 13.5 }}>
                  Ver planta <Icon name="chevronRight" size={15} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openFloor_ && (
        <FullscreenFloorViewer
          floor={openFloor_}
          imageUrl={openImageUrl}
          pins={devices.filter((d) => d.floorId === openFloor_.id && d.floorX != null && d.floorY != null)}
          onViewDevice={onViewDevice}
          onClose={closeFloor}
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
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api.rede.networkHistory(24), api.rede.flappiest()])
      .then(([nh, fl]) => {
        const rows = nh.data || [];
        setSnapshot(rows[rows.length - 1] || null);
        setFlappiest(fl.data || []);
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
  );
}

const HISTORY_PAGE_SIZE = 10;

function HistoricoSection() {
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.rede.history().then((hi) => setHistory(hi.data || [])).catch(() => setHistory([]));
  }, []);

  const totalPages = Math.max(1, Math.ceil((history?.length || 0) / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageHistory = (history || []).slice((safePage - 1) * HISTORY_PAGE_SIZE, safePage * HISTORY_PAGE_SIZE);

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Histórico de eventos</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Últimas quedas e recuperações registradas.</p>
      {history === null ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 12 }} />
      ) : history.length === 0 ? (
        <div className="field-hint">Nenhum evento registrado ainda.</div>
      ) : (
        <>
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
                {pageHistory.map((e) => (
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
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <span className="field-hint">
                Página {safePage} de {totalPages} · {history.length} evento(s)
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
    </div>
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
  const PAGE_SIZE = 10;

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
        <div className="skeleton" style={{ height: 130, borderRadius: 20 }} />
      ) : (
        // Sempre 4 colunas fixas (nunca empilha, nem no celular) — são os
        // quatro números que precisam ficar lado a lado pra comparar de
        // relance.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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
                          onClick={() => setViewingDevice(d.id)}
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

      {canSeeAnalise && <HistoricoSection />}

      {viewingDevice && <DeviceDetailModal deviceId={viewingDevice} onClose={() => setViewingDevice(null)} />}
    </>
  );
}
