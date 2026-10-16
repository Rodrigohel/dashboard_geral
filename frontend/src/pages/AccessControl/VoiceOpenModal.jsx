import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

// Abrir por voz (Siri/Atalhos, Google/IFTTT — ver IDEIAS.md): cada link tem
// um token só do usuário logado pra ESTE equipamento. Copia a URL completa
// pra colar num Atalho do iPhone ("Buscar conteúdo da URL") ou num applet do
// IFTTT ("Webhooks" → GET).
export default function VoiceOpenModal({ device, onClose }) {
  const [tokens, setTokens] = useState(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  function load() {
    api.accessDevices.voiceTokens.list(device.id).then(setTokens);
  }
  useEffect(load, []);

  async function handleCreate() {
    setCreating(true);
    try {
      await api.accessDevices.voiceTokens.create(device.id, label.trim() || 'Abrir por voz');
      setLabel('');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(token) {
    await api.accessDevices.voiceTokens.remove(token);
    load();
  }

  async function handleCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado.');
    } catch {
      toast(url);
    }
  }

  return (
    <Modal title={`Abrir "${device.name}" por voz`} onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="field-hint">
          Crie um link e cole ele num Atalho do iPhone ("Buscar conteúdo da URL", disparado por "Hey Siri") ou num
          applet do IFTTT ("Google Assistant" → "Webhooks", método GET). Qualquer um com o link abre esse
          equipamento — trate como uma senha.
        </p>

        <div className="grid-2">
          <input className="input" placeholder="Nome (ex.: Siri - iPhone)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? <span className="spinner" /> : 'Criar link'}
          </button>
        </div>

        {tokens === null ? (
          <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
        ) : tokens.length === 0 ? (
          <span className="field-hint">Nenhum link criado ainda.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tokens.map((t) => {
              const url = `${window.location.origin}/api/voice/open/${t.token}`;
              return (
                <div key={t.token} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.label || 'Abrir por voz'}</div>
                    <div className="field-hint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleCopy(url)} title="Copiar link">
                    <Icon name="copy" size={15} />
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRevoke(t.token)} title="Revogar">
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
