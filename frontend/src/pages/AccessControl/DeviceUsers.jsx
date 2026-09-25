import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import Modal from '../../components/Modal.jsx';
import DeviceUserFormModal from './DeviceUserFormModal.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

export default function DeviceUsers({ device, onBack }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [photoModal, setPhotoModal] = useState(null); // { name, url } | null
  const [loadingPhotoId, setLoadingPhotoId] = useState(null);
  const [opening, setOpening] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  async function handleOpenDoor() {
    setConfirmOpen(false);
    setOpening(true);
    try {
      await api.accessDevices.openDoor(device.id);
      toast(`"${device.name}" aberto.`);
    } catch (err) {
      toast(`Falha ao abrir: ${err.message}`, 'error');
    } finally {
      setOpening(false);
    }
  }

  function reload() {
    setError('');
    api.accessDevices.users
      .list(device.id)
      .then(setUsers)
      .catch((err) => setError(err.message));
  }
  useEffect(reload, [device.id]);

  async function handleSave(form) {
    const payload = { ...form, expiration: form.expiration ? new Date(form.expiration).toISOString() : undefined };
    if (editing) {
      await api.accessDevices.users.update(device.id, editing.id, payload);
      toast('Usuário atualizado no equipamento.');
    } else {
      await api.accessDevices.users.create(device.id, payload);
      toast('Usuário criado no equipamento.');
    }
    setShowForm(false);
    setEditing(null);
    reload();
  }

  async function handleDelete() {
    await api.accessDevices.users.remove(device.id, deleting.id);
    toast('Usuário removido do equipamento.');
    setDeleting(null);
    reload();
  }

  function triggerPhotoUpload(userId) {
    fileInputRef.current.dataset.userId = userId;
    fileInputRef.current.click();
  }

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    const userId = e.target.dataset.userId;
    e.target.value = '';
    if (!file || !userId) return;
    setUploadingId(userId);
    try {
      await api.accessDevices.users.setPhoto(device.id, userId, file);
      toast('Foto facial enviada.');
      reload();
    } catch (err) {
      toast(`Falha ao enviar foto: ${err.message}`, 'error');
    } finally {
      setUploadingId(null);
    }
  }

  async function handleViewPhoto(u) {
    setLoadingPhotoId(u.id);
    try {
      const url = await api.accessDevices.users.getPhotoBlobUrl(device.id, u.id);
      setPhotoModal({ name: u.name, url });
    } catch (err) {
      if (/não tem foto|não é suportad/i.test(err.message)) {
        toast(err.message);
      } else {
        toast(`Não foi possível carregar a foto: ${err.message}`, 'error');
      }
    } finally {
      setLoadingPhotoId(null);
    }
  }

  function closePhotoModal() {
    if (photoModal?.url) URL.revokeObjectURL(photoModal.url);
    setPhotoModal(null);
  }

  const filtered = users?.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())) || [];

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Voltar para equipamentos
      </button>

      <div className="page-header">
        <div>
          <h1>{device.name}</h1>
          <p>{device.location} · {device.host}:{device.port}</p>
        </div>
        {device.canOpen && (
          <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={opening}>
            {opening ? <span className="spinner" /> : <Icon name="key" size={16} />} Abrir
          </button>
        )}
      </div>

      {error && /não é suportad/i.test(error) ? (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--warning-500)' }}>
          <strong style={{ color: 'var(--warning-500)' }}>Listar usuários ainda não é suportado neste modelo.</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>
            A conexão com o equipamento está OK — só não é possível listar/editar/excluir pela tela ainda para este
            modelo. Volte para a lista de equipamentos e use <strong>"Novo usuário em vários porteiros"</strong> pra
            cadastrar (funciona escolhendo só este aqui também).
          </p>
        </div>
      ) : (
        error && (
          <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)' }}>
            <strong style={{ color: 'var(--danger-500)' }}>Não foi possível falar com o equipamento.</strong>
            <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>{error}</p>
            <p style={{ color: 'var(--text-tertiary)', marginTop: 6, fontSize: 12.5 }}>
              Confira host/porta/credenciais em "Editar equipamento" e se ele está acessível a partir deste servidor.
            </p>
          </div>
        )
      )}

      {!error && (
        <div className="toolbar-search input-with-icon">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {!error && users === null && <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />}

      {!error && users !== null && filtered.length === 0 && (
        <EmptyState
          icon="users"
          title="Nenhum usuário encontrado"
          description={'Volte para a lista de equipamentos e use "Novo usuário em vários porteiros" pra cadastrar o primeiro morador/funcionário aqui.'}
        />
      )}

      {!error && filtered.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Apartamento</th>
                <th>Facial</th>
                <th>Cartão</th>
                <th>Expira em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.registration || '—'}</td>
                  <td>{u.apartment || '—'}</td>
                  <td>
                    <button
                      className="badge badge-neutral"
                      style={{ border: 'none', cursor: 'pointer' }}
                      onClick={() => handleViewPhoto(u)}
                      disabled={loadingPhotoId === u.id}
                      title="O equipamento não informa na listagem se tem foto — clique para checar"
                    >
                      {loadingPhotoId === u.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <span className="badge-dot" />}
                      ver foto
                    </button>
                  </td>
                  <td>{u.cardNumber || '—'}</td>
                  <td>{u.expiration ? new Date(u.expiration).toLocaleDateString('pt-BR') : 'Sem prazo'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-icon btn-sm" title="Cadastrar/trocar foto" onClick={() => triggerPhotoUpload(u.id)}>
                        {uploadingId === String(u.id) ? <span className="spinner spinner-dark" /> : <Icon name="camera" size={15} />}
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Editar" onClick={() => { setEditing(u); setShowForm(true); }}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Remover" onClick={() => setDeleting(u)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelected} />

      {showForm && (
        <DeviceUserFormModal user={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Abrir porta"
          message={`Abrir "${device.name}" agora?`}
          confirmLabel="Abrir"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleOpenDoor}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Remover usuário"
          message={`Remover "${deleting.name}" deste porteiro? A pessoa perde o acesso por facial/cartão/senha imediatamente.`}
          confirmLabel="Remover"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}

      {photoModal && (
        <Modal title={`Foto — ${photoModal.name}`} onClose={closePhotoModal}>
          <img
            src={photoModal.url}
            alt={`Foto facial de ${photoModal.name}`}
            style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }}
          />
        </Modal>
      )}
    </>
  );
}
