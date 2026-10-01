import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import Ring, { healthPercent } from '../components/Ring.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';
import { downloadCsv } from '../utils/csv.js';

// Rede é só consulta no Portal — cadastro, edição, exclusão de
// equipamento e tudo de planta baixa (criar pavimento, posicionar) são
// feitos no painel de Rede original, e chegam aqui automaticamente (mesmo
// backend por trás do gateway). Aqui só existe visualização + as
// permissões que controlam O QUE cada usuário pode ver.

const POLL_MS = 10000;

// Mesmo espírito do que o painel de Rede acabou de implementar na própria
// planta baixa dele: ícone automático pelo "Tipo de equipamento" (campo
// `type`, já existia e já chegava aqui, só não era usado no pino). Sem
// acesso ao código-fonte de lá pra saber a grafia exata gravada (acento,
// maiúscula, "AP" vs "Ponto de acesso" etc.), comparamos normalizado
// (sem acento, minúsculo) contra palavras-chave — assim qualquer variação
// de escrita razoável cai no ícone certo, e o que não bater cai no
// pontinho genérico de sempre (mesmo comportamento de "Outro").
function normalizeDeviceType(type) {
  return (type || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const TYPE_ICON_KEYWORDS = [
  [/camera/, 'camera'],
  [/nvr|gravador/, 'server'],
  [/interfone/, 'phone'],
  [/porteiro/, 'shieldFace'],
  [/switch/, 'network'],
  [/access ?point|ponto de acesso|^ap$/, 'wifi'],
  [/servidor|server/, 'cpu'],
];

function iconForDeviceType(type) {
  const normalized = normalizeDeviceType(type);
  if (!normalized) return null;
  const match = TYPE_ICON_KEYWORDS.find(([re]) => re.test(normalized));
  return match ? match[1] : null;
}

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

// Clicável de propósito (rola até a lista de equipamentos logo abaixo).
function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id="latency-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--viz-trend-1)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--viz-trend-2)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--viz-trend-3)' }} />
        </linearGradient>
        <linearGradient id="latency-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--viz-trend-2)' }} stopOpacity="0.32" />
          <stop offset="100%" style={{ stopColor: 'var(--viz-trend-2)' }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#latency-area-grad)" stroke="none" />
      <path d={path} fill="none" stroke="url(#latency-line-grad)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
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
          {pins.map((d) => {
            const statusColor = d.status === 'online' ? 'var(--success-500)' : d.status === 'degraded' ? 'var(--warning-500)' : 'var(--danger-500)';
            const iconName = iconForDeviceType(d.type);
            const animationClass = d.status === 'offline' ? 'status-offline' : d.status === 'online' ? 'status-online' : '';
            return (
              <div
                key={d.id}
                title={`${d.name} (${d.status}) — clique para ver detalhes`}
                onClick={() => onViewDevice(d.id)}
                className={iconName ? `floor-pin-icon ${animationClass}` : ''}
                style={
                  iconName
                    ? {
                        position: 'absolute',
                        left: `${d.floorX * 100}%`,
                        top: `${d.floorY * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        border: '2px solid white',
                        boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
                        cursor: 'pointer',
                        background: statusColor,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    : {
                        // Sem tipo reconhecido (ex.: "Outro") — pontinho genérico de
                        // sempre, sem nenhuma mudança de comportamento.
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
                        background: statusColor,
                      }
                }
              >
                {iconName && <Icon name={iconName} size={14} strokeWidth={2.2} />}
              </div>
            );
          })}
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
    <div className="surface" style={{ padding: 24 }} id="floor-plan-section">
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

// Faixas genéricas de latência de rede local — não vêm de nenhuma
// configuração, é só uma régua razoável pra colorir o número (abaixo de
// 100ms é bom em qualquer rede local, acima de 300ms já é perceptível).
function latencyColor(ms) {
  if (ms == null) return 'var(--text-primary)';
  if (ms >= 300) return 'var(--danger-500)';
  if (ms >= 100) return 'var(--warning-500)';
  return 'var(--success-500)';
}

// Detecção de pico de latência: compara a última rodada contra a média +
// desvio-padrão das rodadas anteriores da mesma janela de 24h — só acusa
// anomalia com pelo menos 6 pontos anteriores pra ter uma "normalidade"
// minimamente confiável com que comparar (rede muito nova ainda não tem).
function detectLatencyAnomaly(rows, stdevMultiplier = 2) {
  if (!rows || rows.length < 7) return null;
  const last = rows[rows.length - 1];
  if (last?.avgLatencyMs == null) return null;
  const baseline = rows.slice(0, -1).map((r) => r.avgLatencyMs).filter((v) => typeof v === 'number');
  if (baseline.length < 6) return null;
  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length;
  const stdev = Math.sqrt(variance);
  if (stdev <= 0 || last.avgLatencyMs <= mean + stdevMultiplier * stdev) return null;
  return { current: Math.round(last.avgLatencyMs), mean: Math.round(mean) };
}

// Linha simples por índice (sem depender de nenhum campo de data/hora nos
// pontos — a API de histórico de rede nunca expôs isso em nenhum lugar do
// código, só avgLatencyMs/p95LatencyMs). Mesmo truque do LatencySparkline,
// só que genérico o bastante pra também servir de tendência mensal.
function TrendLineChart({ values, height = 70 }) {
  const points = (values || []).filter((v) => typeof v === 'number');
  if (points.length < 2) return <div className="field-hint">Sem dados suficientes ainda.</div>;
  const w = 480;
  const h = height;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id="monthly-line-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--viz-trend-1)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--viz-trend-2)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--viz-trend-3)' }} />
        </linearGradient>
        <linearGradient id="monthly-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--viz-trend-2)' }} stopOpacity="0.35" />
          <stop offset="100%" style={{ stopColor: 'var(--viz-trend-2)' }} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#monthly-area-grad)" stroke="none" />
      <path d={path} fill="none" stroke="url(#monthly-line-grad)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Barras de 0h a 23h — conta quantas vezes cada horário do dia aparece no
// conjunto de eventos filtrado (quedas, chamadas, etc.), pra achar o
// "horário de pico". Uma cor só, com o pico em opacidade cheia e o resto
// mais apagado — não é uma paleta categórica, é magnitude de uma métrica só.
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
            <stop offset="0%" style={{ stopColor: 'var(--viz-peak-hot-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--viz-peak-hot-1)' }} />
          </linearGradient>
          <linearGradient id={`${gradId}-dim`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--viz-peak-dim-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--viz-peak-dim-1)' }} />
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

// Conta ocorrências por hora local (0-23) dos eventos que passarem no
// filtro — usado tanto pra "horário de pico de queda" quanto, no Interfone,
// pra "horário de pico de chamada".
function countByHour(items, getDate, filter) {
  const counts = new Array(24).fill(0);
  for (const item of items) {
    if (filter && !filter(item)) continue;
    const d = getDate(item);
    if (!d || Number.isNaN(d.getTime())) continue;
    counts[d.getHours()] += 1;
  }
  return counts;
}

function AnaliseSection() {
  const [snapshot, setSnapshot] = useState(null);
  const [flappiest, setFlappiest] = useState([]);
  const [latencyAnomaly, setLatencyAnomaly] = useState(null);
  const [monthlyLatency, setMonthlyLatency] = useState(null);
  const [dropHourCounts, setDropHourCounts] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.rede
      .networkHistory(24 * 30)
      .then((nh) => setMonthlyLatency((nh.data || []).map((r) => r.avgLatencyMs)))
      .catch(() => {});
    api.rede
      .history(300)
      .then((hi) => {
        const events = hi.data || [];
        setDropHourCounts(countByHour(events, (e) => new Date(e.at), (e) => eventTone(e.eventLabel) === 'danger'));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([api.rede.networkHistory(24), api.rede.flappiest(), api.settings.getAnomaly().catch(() => null)])
      .then(([nh, fl, anomalySettings]) => {
        const rows = nh.data || [];
        setSnapshot(rows[rows.length - 1] || null);
        setFlappiest(fl.data || []);
        setLatencyAnomaly(detectLatencyAnomaly(rows, anomalySettings?.redeLatencyStdevMultiplier));
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

      {latencyAnomaly && (
        <div className="service-row" style={{ '--card-accent': 'var(--danger-500)', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--danger-500)' }}>Latência fora do normal</div>
            <div className="field-hint">
              {latencyAnomaly.current} ms agora, contra uma média de {latencyAnomaly.mean} ms nas últimas 24h.
            </div>
          </div>
          <span className="badge badge-danger"><span className="badge-dot" /> anomalia</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div
          style={{
            borderRadius: 14,
            padding: '16px 18px',
            background: 'linear-gradient(135deg, rgba(76,141,255,0.16), rgba(139,92,246,0.1))',
            border: '1px solid rgba(124,146,255,0.22)',
          }}
        >
          <div className="field-hint">Latência média</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', color: latencyColor(snapshot?.avgLatencyMs) }}>
            {snapshot?.avgLatencyMs != null ? `${Math.round(snapshot.avgLatencyMs)} ms` : '—'}
          </div>
        </div>
        <div
          style={{
            borderRadius: 14,
            padding: '16px 18px',
            background: 'linear-gradient(135deg, rgba(45,212,191,0.16), rgba(76,141,255,0.1))',
            border: '1px solid rgba(94,222,204,0.22)',
          }}
        >
          <div className="field-hint">Latência p95</div>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'var(--font-display)', color: latencyColor(snapshot?.p95LatencyMs) }}>
            {snapshot?.p95LatencyMs != null ? `${Math.round(snapshot.p95LatencyMs)} ms` : '—'}
          </div>
        </div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Mais instáveis</div>
      {flappiest.length === 0 ? (
        <div className="field-hint">Nenhuma queda registrada nas últimas 24h.</div>
      ) : (
        flappiest.map((d) => (
          <div className="service-row" key={d.id} style={{ '--card-accent': 'var(--warning-500)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
              <div className="field-hint">{d.location || d.ip}</div>
            </div>
            <span className="badge badge-warning">{d.drops} queda(s)</span>
          </div>
        ))
      )}

      <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 20, marginBottom: 8 }}>Horário de pico de quedas</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>Em que horário do dia as quedas mais acontecem (últimos ~300 eventos registrados).</p>
      {dropHourCounts === null ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 8 }} />
      ) : (
        <PeakHoursChart hourCounts={dropHourCounts} gradId="peak-drops" unitLabel="queda(s)" />
      )}

      <div style={{ fontWeight: 600, fontSize: 13.5, marginTop: 20, marginBottom: 8 }}>Tendência de latência (~30 dias)</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Cada ponto é uma rodada de checagem — sem data no eixo (o painel de Rede não expõe isso), só a evolução.
      </p>
      {monthlyLatency === null ? (
        <div className="skeleton" style={{ height: 70, borderRadius: 8 }} />
      ) : (
        <TrendLineChart values={monthlyLatency} />
      )}
    </div>
  );
}

// O rótulo do evento vem pronto do painel original ("ficou online", "ficou
// offline" etc.) — não temos um campo de tipo separado, então detectamos
// pela própria frase. Fallback neutro pra qualquer texto que não bata com
// nenhum padrão conhecido, em vez de arriscar colorir errado.
function eventTone(label) {
  const l = (label || '').toLowerCase();
  if (/offline|caiu|queda|down/.test(l)) return 'danger';
  if (/online|recuper|voltou|subiu/.test(l)) return 'success';
  return null;
}

function EventBadge({ label }) {
  const tone = eventTone(label);
  if (!tone) return <span>{label}</span>;
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" /> {label}
    </span>
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
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Equipamento</th>
                  <th>Evento</th>
                  <th className="hide-mobile">Durou</th>
                </tr>
              </thead>
              <tbody>
                {pageHistory.map((e) => (
                  <tr key={e.id} className={eventTone(e.eventLabel) === 'danger' ? 'row-tone-danger' : ''}>
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(e.at).toLocaleString('pt-BR')}</td>
                    <td style={{ fontWeight: 600 }}>{e.device?.name}</td>
                    <td>
                      <EventBadge label={e.eventLabel} />
                    </td>
                    <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{formatDuration(e.durationMs)}</td>
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

export default function RedeDashboard({ can, pendingSection, onSectionHandled }) {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [viewingDevice, setViewingDevice] = useState(null);
  const PAGE_SIZE = 10;
  const toast = useToast();

  const canSeeFloorPlan = can('rede.plantaBaixa');
  const canSeeAnalise = can('rede.analise');

  // Veio de um atalho do submenu lateral (ex.: "Planta baixa") — rola até o
  // card certo da tela em vez de só cair no topo da página.
  useEffect(() => {
    if (!pendingSection) return;
    document.getElementById(pendingSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onSectionHandled?.();
  }, [pendingSection, onSectionHandled]);

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

  const filteredDevices = devices
    .filter((d) => {
      const needle = deviceFilter.trim().toLowerCase();
      if (!needle) return true;
      return d.name.toLowerCase().includes(needle) || d.ip.includes(needle) || (d.location || '').toLowerCase().includes(needle);
    })
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDevices = filteredDevices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // "Favoritar" é do painel de Rede original — descoberto por uma exceção no
  // server.js do Portal, nunca chamado daqui antes. Se o formato do endpoint
  // estiver errado, isso só mostra um toast de erro (não quebra a tela).
  async function handleToggleFavorite(e, device) {
    e.stopPropagation();
    const next = !device.favorite;
    try {
      await api.rede.setFavorite(device.id, next);
      setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, favorite: next } : d)));
    } catch (err) {
      toast(`Não foi possível favoritar: ${err.message}`, 'error');
    }
  }

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
        summary.total > 0 && (
          <div className="kpi-strip">
            <div className="kpi-card surface" onClick={() => scrollToSection('equipamentos-section')}>
              <Ring
                percent={healthPercent(summary.online || 0, summary.total)}
                color="var(--module-rede)"
                value={`${healthPercent(summary.online || 0, summary.total)}%`}
              />
              <div className="kpi-card-body">
                <div className="kpi-card-label">Equipamentos online</div>
                <div className="kpi-card-value">
                  {summary.online || 0} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>de {summary.total}</span>
                </div>
                {(summary.offline > 0 || summary.degraded > 0) && (
                  <div className="kpi-card-sub" style={{ color: 'var(--danger-500)' }}>
                    {[summary.offline > 0 && `${summary.offline} offline`, summary.degraded > 0 && `${summary.degraded} degradado`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {devices.some((d) => d.status === 'offline') && (
        <div className="surface" style={{ padding: 24 }} id="rede-offline-section">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Equipamentos offline</div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            {devices.filter((d) => d.status === 'offline').length} equipamento(s) fora do ar agora.
          </p>
          {devices
            .filter((d) => d.status === 'offline')
            .map((d) => (
              <div className="service-row" key={d.id} style={{ '--card-accent': 'var(--danger-500)', cursor: 'pointer' }} onClick={() => setViewingDevice(d.id)}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                  <div className="field-hint">{d.location || d.ip}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
        </div>
      )}

      <div className="surface" style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Alertas ativos</div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {alerts.length === 0 ? 'Nada em aberto no momento.' : `${alerts.length} alerta(s) em aberto.`}
        </p>
        {alerts.slice(0, 10).map((a) => (
          <div
            className="service-row"
            key={a.id}
            style={{ '--card-accent': a.severity === 'critical' ? 'var(--danger-500)' : 'var(--warning-500)' }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.message}</div>
              <div className="field-hint">{new Date(a.createdAt).toLocaleString('pt-BR')}</div>
            </div>
            <SeverityBadge severity={a.severity} />
          </div>
        ))}
      </div>

      <div className="surface" style={{ padding: 24 }} id="equipamentos-section">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Equipamentos</div>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Consulta — clique num equipamento para ver todos os dados. Cadastro, edição e exclusão são feitos no painel de Rede original.
            </p>
          </div>
          {devices.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                downloadCsv('equipamentos-rede.csv', filteredDevices, [
                  { header: 'Nome', get: (d) => d.name },
                  { header: 'IP', get: (d) => d.ip },
                  { header: 'Local', get: (d) => d.location || '' },
                  { header: 'Tipo', get: (d) => d.type },
                  { header: 'Status', get: (d) => d.status },
                ])
              }
            >
              <Icon name="copy" size={14} /> Exportar CSV
            </button>
          )}
        </div>
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
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Nome</th>
                        <th className="hide-mobile">IP</th>
                        <th>Local</th>
                        <th className="hide-mobile">Tipo</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageDevices.map((d) => (
                        <tr
                          key={d.id}
                          onClick={() => setViewingDevice(d.id)}
                          className={d.status === 'offline' ? 'row-tone-danger' : d.status === 'degraded' ? 'row-tone-warning' : ''}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ width: 32 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={(e) => handleToggleFavorite(e, d)}
                              title={d.favorite ? 'Remover dos favoritos' : 'Favoritar'}
                              style={{ color: d.favorite ? 'var(--warning-500)' : 'var(--text-tertiary)' }}
                            >
                              <Icon name="star" size={15} />
                            </button>
                          </td>
                          <td style={{ fontWeight: 600 }}>{d.name}</td>
                          <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{d.ip}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{d.location || '—'}</td>
                          <td className="hide-mobile" style={{ color: 'var(--text-secondary)' }}>{d.type}</td>
                          <td>
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
