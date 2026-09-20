import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';

const META = {
  rede: { title: 'Painel de Rede', icon: 'network' },
  interfone: { title: 'Painel de Interfone', icon: 'phone' },
};

export default function ModuleLink({ moduleKey, isOwner, onNavigate }) {
  const [info, setInfo] = useState(null);
  const meta = META[moduleKey];

  useEffect(() => {
    api.modules().then((data) => setInfo(data[moduleKey] || {}));
  }, [moduleKey]);

  return (
    <div
      className="surface"
      style={{
        padding: 56,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div className="module-card-icon" style={{ background: 'var(--accent-glow)', width: 64, height: 64 }}>
        <Icon name={meta.icon} size={30} />
      </div>
      <h2 style={{ fontSize: 20 }}>{meta.title}</h2>

      {info === null ? (
        <span className="spinner spinner-dark" />
      ) : info.publicUrl ? (
        <>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>
            Este painel abre em uma nova aba por enquanto — a integração completa em uma única tela é o próximo passo.
          </p>
          <a className="btn btn-primary" href={info.publicUrl} target="_blank" rel="noreferrer">
            Abrir {meta.title} <Icon name="externalLink" size={16} />
          </a>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>
            Este módulo ainda não tem um endereço configurado.
            {isOwner ? ' Configure em "Configurações → Gateways".' : ' Peça ao administrador para configurá-lo.'}
          </p>
          {isOwner && (
            <button className="btn btn-primary" onClick={() => onNavigate('configuracoes')}>
              Ir para Configurações
            </button>
          )}
        </>
      )}
    </div>
  );
}
