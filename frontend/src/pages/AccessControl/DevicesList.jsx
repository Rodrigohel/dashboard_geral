import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DeviceFormModal from './DeviceFormModal.jsx';
import MultiDeviceUserFormModal from './MultiDeviceUserFormModal.jsx';
import UserSearch from './UserSearch.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';
import { timeAgo } from '../../utils/relativeTime.js';

const MODEL_LABELS = { xpe3200: 'XPE 3200 IP Face', ss3532mf: 'SS 3532 MF' };
const STATUS_META = {
  online: { label: 'online', badge: 'badge-success', accent: 'var(--success-500)' },
  offline: { label: 'offline', badge: 'badge-danger', accent: 'var(--danger-500)' },
  unknown: { label: 'verificando...', badge: 'badge-neutral', accent: 'var(--border-strong)' },
};

export default function DevicesList({ isOwner, onOpenDevice }) {
  const [devices, setDevices] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [testing, setTesting] = useState(null);
  const [opening, setOpening] = useState(null);
  const [showMultiUserForm, setShowMultiUserForm] = useState(false);
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

  // Sem confirmação de propósito — é uma ação rápida, pra quem já tem a
  // permissão específica de abrir esse equipamento (ver botão no card).
  async function handleOpenDoor(device) {
    setOpening(device.id);
    try {
      await api.accessDevices.openDoor(device.id);
      toast(`"${device.name}" aberto.`);
    } catch (err) {
      toast(`Falha ao abrir: ${err.message}`, 'error');
    } finally {
      setOpening(null);
    }
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
      {devices?.length > 1 && <UserSearch devices={devices} onOpenDevice={onOpenDevice} />}

      <div className="toolbar">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Porteiros com reconhecimento facial cadastrados. Clique em um para gerenciar os usuários liberados.
        </p>
        {isOwner && devices?.length > 0 && (
          <button className="btn btn-secondary" onClick={() => setShowMultiUserForm(true)}>
            <Icon name="users" size={16} /> Novo usuário em vários porteiros
          </button>
        )}
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
          {devices.map((d) => {
            const statusMeta = STATUS_META[d.lastStatus || 'unknown'];
            return (
            <div key={d.id} className="device-card surface" style={{ '--card-accent': statusMeta.accent }} onClick={() => onOpenDevice(d)}>
              <div className="device-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="module-card-icon" style={{ background: 'var(--accent-glow)', width: 40, height: 40 }}>
                    <Icon name="shieldFace" size={18} />
                  </div>
                  <span className={`badge ${statusMeta.badge}`} title={d.lastError || undefined}>
                    <span className="badge-dot" /> {statusMeta.label}
                  </span>
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
              {d.lastOpen && (
                <div className="device-card-last-open">
                  <Icon name="key" size={13} />
                  <span>
                    {d.lastOpen.success ? 'Aberto' : 'Falha ao abrir'} por <strong>{d.lastOpen.username}</strong>, {timeAgo(d.lastOpen.createdAt)}
                  </span>
                  {d.lastOpen.anomaly && (
                    <span className="badge badge-warning" title="Esse porteiro nunca tinha sido aberto nesse horário antes.">
                      <span className="badge-dot" /> horário incomum
                    </span>
                  )}
                </div>
              )}
              {d.canOpen && (
                <div className="module-card-footer">
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDoor(d);
                    }}
                    disabled={opening === d.id}
                  >
                    {opening === d.id ? <span className="spinner" /> : <Icon name="key" size={15} />} Abrir
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <DeviceFormModal
          device={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {showMultiUserForm && (
        <MultiDeviceUserFormModal
          devices={devices}
          onClose={() => setShowMultiUserForm(false)}
          onDone={() => toast('Usuário cadastrado.')}
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
