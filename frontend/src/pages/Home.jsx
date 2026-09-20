import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';

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

const MODULE_META = {
  rede: {
    title: 'Rede',
    icon: 'network',
    desc: 'Câmeras, NVRs, switches e porteiros monitorados em tempo real — status, alertas e histórico de queda.',
  },
  interfone: {
    title: 'Interfone',
    icon: 'phone',
    desc: 'Ramais, chamadas ativas e saúde do PBX/Asterisk.',
  },
  acesso: {
    title: 'Controle de acesso',
    icon: 'shieldFace',
    desc: 'Inclua, edite e remova usuários dos porteiros com reconhecimento facial, de qualquer lugar.',
  },
};

export default function Home({ user, onNavigate }) {
  const [modules, setModules] = useState(null);

  useEffect(() => {
    api.modules().then(setModules).catch(() => setModules({}));
  }, []);

  const firstName = (user.displayName || user.username).split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Aqui está um resumo do que você tem acesso.</p>
        </div>
      </div>

      {user.role === 'owner' && <ServerHealthWidget onNavigate={onNavigate} />}

      <div className="module-grid">
        {user.modules?.map((key) => {
          const meta = MODULE_META[key];
          if (!meta) return null;
          const info = modules?.[key];

          return (
            <div key={key} className="module-card surface">
              <div className="module-card-icon badge-accent" style={{ background: 'var(--accent-glow)' }}>
                <Icon name={meta.icon} size={22} className="module-card-icon-svg" />
              </div>
              <div>
                <div className="module-card-title">{meta.title}</div>
                <div className="module-card-desc">{meta.desc}</div>
              </div>

              <div className="module-card-footer">
                {key === 'acesso' ? (
                  <>
                    <span className="badge badge-neutral">
                      {info?.deviceCount ?? '…'} equipamento{info?.deviceCount === 1 ? '' : 's'}
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('acesso')}>
                      Gerenciar
                    </button>
                  </>
                ) : info?.publicUrl ? (
                  <>
                    <span className="badge badge-success">
                      <span className="badge-dot" /> disponível
                    </span>
                    <a className="btn btn-secondary btn-sm" href={info.publicUrl} target="_blank" rel="noreferrer">
                      Abrir painel <Icon name="externalLink" size={14} />
                    </a>
                  </>
                ) : info?.configured ? (
                  <>
                    <span className="badge badge-warning">
                      <span className="badge-dot" /> falta o link público
                    </span>
                    {user.role === 'owner' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('configuracoes')}>
                        Configurar
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="badge badge-warning">
                      <span className="badge-dot" /> não configurado
                    </span>
                    {user.role === 'owner' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('configuracoes')}>
                        Configurar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(!user.modules || user.modules.length === 0) && (
        <div className="surface" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Você ainda não tem nenhum módulo liberado. Peça ao administrador para configurar seu acesso.
        </div>
      )}
    </>
  );
}
