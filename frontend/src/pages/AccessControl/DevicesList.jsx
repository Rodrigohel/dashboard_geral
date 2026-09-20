import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DeviceFormModal from './DeviceFormModal.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

const MODEL_LABELS = { xpe3200: 'XPE 3200 IP Face', ss3532mf: 'SS 3532 MF' };

export default function DevicesList({ isOwner, onOpenDevice }) {
  const [devices, setDevices] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [testing, setTesting] = useState(null);
  const toast = useToast();

  function reload() {
    api.accessDevices.list().then(setDevices);
  }
  useEffect(reload, []);

  async function handleSave(form) {
    if (editing) {
      await api.accessDevices.update(editing.id, form);
      toast('Equipamento atualizado.');
    } else {
      await api.accessDevices.create(form);
      toast('Equipamento cadastrado.');
    }
    setShowForm(false);
    setEditing(null);
    reload();
  }

  async function handleDelete() {
    await api.accessDevices.remove(deleting.id);
    toast('Equipamento removido.');
    setDeleting(null);
    reload();
  }

  async function handleTest(device) {
    setTesting(device.id);
    try {
      await api.accessDevices.testConnection(device.id);
      toast(`Conexão com "${device.name}" OK.`);
    } catch (err) {
      toast(`Falha ao conectar em "${device.name}": ${err.message}`, 'error');
    } finally {
      setTesting(null);
    }
  }

  return (
    <>
      <div className="toolbar">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Porteiros com reconhecimento facial cadastrados. Clique em um para gerenciar os usuários liberados.
        </p>
        {isOwner && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> Novo equipamento
          </button>
        )}
      </div>

      {devices === null ? (
        <div className="device-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 150, borderRadius: 20 }} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon="shieldFace"
          title="Nenhum equipamento cadastrado"
          description={isOwner ? 'Cadastre o primeiro porteiro para começar a gerenciar acessos remotamente.' : 'Peça ao administrador para liberar um equipamento para você.'}
          action={
            isOwner && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Icon name="plus" size={16} /> Novo equipamento
              </button>
            )
          }
        />
      ) : (
        <div className="device-grid">
          {devices.map((d) => (
            <div key={d.id} className="device-card surface" onClick={() => onOpenDevice(d)}>
              <div className="device-card-top">
                <div className="module-card-icon" style={{ background: 'var(--accent-glow)', width: 40, height: 40 }}>
                  <Icon name="shieldFace" size={18} />
                </div>
                {isOwner && (
                  <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleTest(d)} title="Testar conexão">
                      {testing === d.id ? <span className="spinner spinner-dark" /> : <Icon name="wifi" size={15} />}
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(d); setShowForm(true); }} title="Editar">
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleting(d)} title="Excluir">
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <div className="device-card-name">{d.name}</div>
                <div className="device-card-meta">
                  <span>{d.location || 'Local não informado'}</span>
                  <span>{MODEL_LABELS[d.model] || d.model} · {d.host}:{d.port}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DeviceFormModal
          device={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir equipamento"
          message={`Tem certeza que quer remover "${deleting.name}" do Portal? Isso não apaga nada no equipamento físico, só o cadastro aqui.`}
          confirmLabel="Excluir"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
