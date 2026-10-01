import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Ring, { healthPercent } from '../components/Ring.jsx';
import { api } from '../api/client.js';
import { timeAgo } from '../utils/relativeTime.js';

function levelFor(percent, { warn = 60, danger = 85 } = {}) {
  if (percent === null || percent === undefined) return 'ok';
  if (percent >= danger) return 'danger';
  if (percent >= warn) return 'warn';
  return 'ok';
}

function MiniMeter({ label, percent, level, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{sub}</span>
      </div>
      <div className="meter">
        <div className={`meter-fill level-${level}`} style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }} />
      </div>
    </div>
  );
}

function ServerHealthWidget({ onNavigate }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.system.health().then(setHealth).catch(() => setError(true));
  }, []);

  if (error) return null;

  return (
    <div className="surface" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <Icon name="server" size={17} />
          Saúde do servidor
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('servidor')}>
          Ver detalhes
        </button>
      </div>
      {!health ? (
        <div className="skeleton" style={{ height: 44, borderRadius: 8 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 16 }}>
          <MiniMeter label="Processador" percent={health.cpu.loadPercent} level={levelFor(health.cpu.loadPercent)} sub={`${health.cpu.loadPercent}%`} />
          <MiniMeter label="Memória" percent={health.memory.usedPercent} level={levelFor(health.memory.usedPercent)} sub={`${health.memory.usedPercent}%`} />
          {health.disk && (
            <MiniMeter
              label="Disco"
              percent={health.disk.usedPercent}
              level={levelFor(health.disk.usedPercent, { warn: 70, danger: 90 })}
              sub={`${health.disk.usedPercent}%`}
            />
          )}
        </div>
      )}
    </div>
  );
}

const ACTIVITY_PAGE_SIZE = 5;

// Junta em uma linha do tempo só o que hoje só dava pra ver em 3 telas
// separadas — queda/recuperação de rede, chamada perdida, abertura de
// porteiro. Cada fonte é opcional (só entra se o usuário tiver acesso ao
// módulo e permissão pro dado): a lista mescla o que existir de verdade,
// sem inventar nada pras fontes indisponíveis. Paginado (5 por página) e
// colocado por último na tela — sem isso, no celular o card ficava
// comprido e empurrava os cards de módulo lá pra baixo.
function ActivityFeed({ events }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(events.length / ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEvents = events.slice((safePage - 1) * ACTIVITY_PAGE_SIZE, safePage * ACTIVITY_PAGE_SIZE);

  if (events.length === 0) {
    return (
      <div className="surface" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
          <Icon name="activity" size={17} />
          Atividade recente
        </div>
        <p className="field-hint">Nada de novo por aqui ainda.</p>
      </div>
    );
  }
  return (
    <div className="surface" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 12 }}>
        <Icon name="activity" size={17} />
        Atividade recente
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {pageEvents.map((e) => (
          <div key={e.id} className="service-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: e.glow,
                  color: e.color,
                }}
              >
                <Icon name={e.icon} size={14} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.title}
                </div>
                <div className="field-hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.subtitle}
                </div>
              </div>
            </div>
            <span className="field-hint" style={{ flexShrink: 0 }}>
              {timeAgo(e.at)}
            </span>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <span className="field-hint">
            Página {safePage} de {totalPages}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            Anterior
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

const MODULE_META = {
  rede: {
    title: 'Rede',
    icon: 'network',
    desc: 'Câmeras, NVRs, switches e porteiros monitorados em tempo real — status, alertas e histórico de queda.',
    color: 'var(--module-rede)',
    colorEnd: 'var(--module-rede-end)',
    glow: 'var(--module-rede-glow)',
  },
  interfone: {
    title: 'Interfone',
    icon: 'phone',
    desc: 'Ramais, chamadas ativas e saúde do PBX/Asterisk.',
    color: 'var(--module-interfone)',
    colorEnd: 'var(--module-interfone-end)',
    glow: 'var(--module-interfone-glow)',
  },
  acesso: {
    title: 'Controle de acesso',
    icon: 'shieldFace',
    desc: 'Porteiros com reconhecimento facial — cadastro de moradores, fotos e abertura remota.',
    color: 'var(--module-acesso)',
    colorEnd: 'var(--module-acesso-end)',
    glow: 'var(--module-acesso-glow)',
  },
};

// Converte uma série de números num par de paths SVG (linha + área
// preenchida) dentro de um viewBox fixo 100x28 — mesmo cálculo usado no
// mockup aprovado, só que aqui alimentado com dados reais da API.
function buildSparkline(points) {
  if (!points || points.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const usable = h * 0.8;
  const pad = h * 0.1;
  const step = w / (points.length - 1);
  const coords = points.map((v, i) => [i * step, h - pad - ((v - min) / range) * usable]);
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];
  return { line, area, lastX: last[0].toFixed(1), lastY: last[1].toFixed(1) };
}

function formatEyebrow(date) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const day = cap(date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));
  const dm = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${dm} · ${time}`;
}

export default function Home({ user, onNavigate, can }) {
  const [modules, setModules] = useState(null);
  const [redeSummary, setRedeSummary] = useState(null);
  const [redePoints, setRedePoints] = useState(null);
  const [interfoneSummary, setInterfoneSummary] = useState(null);
  const [interfonePoints, setInterfonePoints] = useState(null);
  const [redeActivity, setRedeActivity] = useState([]);
  const [interfoneActivity, setInterfoneActivity] = useState([]);
  const [acessoActivity, setAcessoActivity] = useState([]);
  const isOwner = user.role === 'owner';

  const hasRede = Boolean(user.modules?.includes('rede'));
  const hasInterfone = Boolean(user.modules?.includes('interfone'));
  const hasAcesso = Boolean(user.modules?.includes('acesso'));
  const canSeeRedeAnalise = Boolean(can?.('rede.analise'));

  useEffect(() => {
    api.modules().then(setModules).catch(() => setModules({}));
  }, []);

  useEffect(() => {
    if (!hasRede) return;
    api.rede.summary().then(setRedeSummary).catch(() => {});
  }, [hasRede]);

  useEffect(() => {
    // A série histórica de latência exige a feature "rede.analise" — sem
    // ela o gateway responde 403, então nem tentamos buscar.
    if (!hasRede || !canSeeRedeAnalise) return;
    api.rede
      .networkHistory(24)
      .then((res) => {
        const values = (res?.data || []).map((row) => row.avgLatencyMs).filter((v) => typeof v === 'number');
        if (values.length >= 2) setRedePoints(values);
      })
      .catch(() => {});
  }, [hasRede, canSeeRedeAnalise]);

  useEffect(() => {
    if (!hasInterfone) return;
    api.interfone.extensionsSummary().then(setInterfoneSummary).catch(() => {});
    api.interfone
      .callsSummary('7d')
      .then((trend) => {
        if (trend?.recebidas?.length >= 2) setInterfonePoints(trend.recebidas);
      })
      .catch(() => {});
  }, [hasInterfone]);

  // Feed de atividade — junta o que hoje só dava pra ver em 3 telas
  // separadas. Cada fonte já é a mesma API que a tela correspondente usa
  // (histórico de eventos da Rede, chamadas perdidas do Interfone, última
  // abertura de cada porteiro), só reorganizada numa linha do tempo só.
  useEffect(() => {
    if (!hasRede || !canSeeRedeAnalise) return;
    api.rede
      .history(20)
      .then((hi) => {
        setRedeActivity(
          (hi.data || []).map((e) => ({
            id: `rede-${e.id}`,
            icon: 'network',
            color: 'var(--module-rede)',
            glow: 'var(--module-rede-glow)',
            title: e.device?.name || 'Equipamento',
            subtitle: e.eventLabel,
            at: e.at,
          }))
        );
      })
      .catch(() => {});
  }, [hasRede, canSeeRedeAnalise]);

  useEffect(() => {
    if (!hasInterfone) return;
    api.interfone
      .missedToday()
      .then((miss) => {
        setInterfoneActivity(
          (miss || []).map((m, i) => ({
            id: `interfone-${m.number}-${i}`,
            icon: 'phone',
            color: 'var(--module-interfone)',
            glow: 'var(--module-interfone-glow)',
            title: 'Chamada perdida',
            subtitle: m.total > 1 ? `${m.number} · ${m.total}x hoje` : m.number,
            at: m.lastAt,
          }))
        );
      })
      .catch(() => {});
  }, [hasInterfone]);

  useEffect(() => {
    if (!hasAcesso) return;
    api.accessDevices
      .list()
      .then((devices) => {
        setAcessoActivity(
          (devices || [])
            .filter((d) => d.lastOpen)
            .map((d) => ({
              id: `acesso-${d.id}`,
              icon: 'key',
              color: d.lastOpen.success ? 'var(--module-acesso)' : 'var(--danger-500)',
              glow: d.lastOpen.success ? 'var(--module-acesso-glow)' : 'var(--danger-soft)',
              title: d.lastOpen.success ? `${d.name} aberto` : `Falha ao abrir ${d.name}`,
              subtitle: `por ${d.lastOpen.username}`,
              at: d.lastOpen.createdAt,
            }))
        );
      })
      .catch(() => {});
  }, [hasAcesso]);

  // Os "at" de cada fonte vêm em formatos diferentes (ISO com 'Z' da Rede/
  // Interfone, "YYYY-MM-DD HH:MM:SS" sem 'Z' do nosso próprio SQLite pro
  // Acesso) — sem normalizar isso aqui, o navegador interpretaria o do
  // Acesso como horário local e desalinharia a ordem da lista.
  function toTimestamp(at) {
    if (!at) return 0;
    const iso = at.includes('T') || at.endsWith('Z') ? at : `${at.replace(' ', 'T')}Z`;
    return new Date(iso).getTime();
  }
  const activityFeed = [...redeActivity, ...interfoneActivity, ...acessoActivity]
    .sort((a, b) => toTimestamp(b.at) - toTimestamp(a.at))
    .slice(0, 25);

  const firstName = (user.displayName || user.username).split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const linkModules = user.modules?.filter((k) => MODULE_META[k]) || [];

  // Cada card só mostra números e gráficos que existem de verdade — sem
  // dado real disponível (ex.: histórico de abertura dos porteiros, que o
  // backend não guarda), o card simplesmente omite aquele pedaço em vez de
  // inventar algo.
  function cardDataFor(key, info) {
    if (key === 'rede') {
      const s = redeSummary;
      const offline = s?.offline ?? 0;
      return {
        status: s
          ? offline > 0
            ? { color: 'var(--danger-500)', label: `${offline} offline` }
            : { color: 'var(--success-500)', label: 'online' }
          : null,
        trendLabel: 'latência média · 24h',
        points: redePoints,
        online: s ? s.online ?? 0 : null,
        total: s?.total ?? null,
        stat1: s ? { value: s.online ?? 0, label: 'online' } : null,
        stat2: s && offline > 0 ? { value: offline, label: 'offline', color: 'var(--danger-500)' } : null,
      };
    }
    if (key === 'interfone') {
      const s = interfoneSummary;
      const offline = s?.offline ?? 0;
      return {
        status: s
          ? offline > 0
            ? { color: 'var(--danger-500)', label: `${offline} offline` }
            : { color: 'var(--success-500)', label: 'online' }
          : null,
        trendLabel: 'chamadas recebidas · 7 dias',
        points: interfonePoints,
        online: s ? s.online ?? 0 : null,
        total: s ? (s.online ?? 0) + offline : null,
        stat1: s ? { value: s.online ?? 0, label: 'ramais online' } : null,
        stat2: s && offline > 0 ? { value: offline, label: 'ramais offline', color: 'var(--danger-500)' } : null,
      };
    }
    // acesso: sem histórico de aberturas guardado no backend, então não
    // fabricamos um gráfico — mas o status/contagem online-offline agora vêm
    // da checagem periódica de saúde (deviceHealthPoller), então é dado real.
    const offline = info?.offline ?? 0;
    return {
      status:
        info?.deviceCount > 0
          ? offline > 0
            ? { color: 'var(--danger-500)', label: `${offline} offline` }
            : { color: 'var(--success-500)', label: 'online' }
          : null,
      trendLabel: null,
      points: null,
      online: info?.deviceCount !== undefined ? info.deviceCount - offline : null,
      total: info?.deviceCount ?? null,
      stat1: info?.deviceCount !== undefined ? { value: info.deviceCount, label: info.deviceCount === 1 ? 'porteiro' : 'porteiros' } : null,
      stat2: info?.deviceCount > 0 && offline > 0 ? { value: offline, label: 'offline', color: 'var(--danger-500)' } : null,
    };
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="home-eyebrow">{formatEyebrow(new Date())}</div>
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Aqui está um resumo do que você tem acesso.</p>
        </div>
      </div>

      <div className="home-main">
        {isOwner && <ServerHealthWidget onNavigate={onNavigate} />}

        {linkModules.length > 0 && (
        <div className="module-grid">
          {linkModules.map((key) => {
            const meta = MODULE_META[key];
            const info = modules?.[key];
            // Rede e Interfone são nativos dentro do Portal (consultam a API
            // do gateway direto, sem iframe nem link externo) — só depende do
            // gateway estar configurado (endereço + conta de serviço).
            // "Controle de acesso" não depende de gateway nenhum, sempre abre
            // (a própria tela mostra "nenhum equipamento cadastrado" se for
            // o caso).
            const needsGateway = key === 'rede' || key === 'interfone';
            const configured = !needsGateway || Boolean(info?.configured);
            const data = cardDataFor(key, info);
            const spark = configured ? buildSparkline(data.points) : null;

            function handleClick() {
              // Sem gateway configurado ainda, manda o dono direto pra onde
              // resolve isso em vez de abrir uma tela quebrada.
              if (needsGateway && !configured && isOwner) onNavigate('configuracoes');
              else onNavigate(key);
            }

            return (
              <div
                key={key}
                className="module-card surface"
                style={{ '--module-color': meta.color, cursor: 'pointer' }}
                onClick={handleClick}
              >
                <span className="module-card-corner tl" />
                <span className="module-card-corner br" />

                <div className="module-card-top">
                  {data.total > 0 ? (
                    <Ring percent={healthPercent(data.online, data.total)} color={meta.color} value={`${healthPercent(data.online, data.total)}%`} size={52} />
                  ) : (
                    <div className="module-card-icon" style={{ background: meta.glow, color: meta.color }}>
                      <Icon name={meta.icon} size={18} />
                    </div>
                  )}
                  {data.status && (
                    <div className="module-card-status" style={{ color: data.status.color }}>
                      <span className="module-card-status-dot" style={{ background: data.status.color }} />
                      {data.status.label}
                    </div>
                  )}
                </div>

                <div>
                  <div className="module-card-title">{meta.title}</div>
                  <div className="module-card-desc">{meta.desc}</div>
                </div>

                {spark && (
                  <div className="module-card-trend">
                    <div className="module-card-trend-label">{data.trendLabel}</div>
                    <svg viewBox="0 0 100 28" className="module-card-chart" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={`spark-line-${key}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" style={{ stopColor: meta.color }} />
                          <stop offset="100%" style={{ stopColor: meta.colorEnd }} />
                        </linearGradient>
                        <linearGradient id={`spark-area-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" style={{ stopColor: meta.colorEnd }} stopOpacity="0.35" />
                          <stop offset="100%" style={{ stopColor: meta.colorEnd }} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={spark.area} fill={`url(#spark-area-${key})`} stroke="none" />
                      <path
                        d={spark.line}
                        fill="none"
                        stroke={`url(#spark-line-${key})`}
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx={spark.lastX} cy={spark.lastY} r="2.8" style={{ fill: meta.colorEnd }} />
                    </svg>
                  </div>
                )}

                {(data.stat1 || data.stat2) && (
                  <div className="module-card-stats">
                    {data.stat1 && (
                      <div>
                        <div className="module-card-stat-value">{data.stat1.value}</div>
                        <div className="module-card-stat-label">{data.stat1.label}</div>
                      </div>
                    )}
                    {data.stat2 && (
                      <div>
                        <div className="module-card-stat-value" style={{ color: data.stat2.color }}>
                          {data.stat2.value}
                        </div>
                        <div className="module-card-stat-label" style={{ color: data.stat2.color }}>
                          {data.stat2.label}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {needsGateway && !configured && (
                  <div className="field-hint">
                    Ainda não configurado{isOwner ? ' — clique para configurar.' : '.'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

          {(!user.modules || user.modules.length === 0) && (
            <div className="surface" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
              Você ainda não tem nenhum módulo liberado. Peça ao administrador para configurar seu acesso.
            </div>
          )}

        {(hasRede || hasInterfone || hasAcesso) && <ActivityFeed events={activityFeed} />}
      </div>
    </>
  );
}
