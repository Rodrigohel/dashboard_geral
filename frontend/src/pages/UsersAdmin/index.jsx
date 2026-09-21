import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import UserFormModal from './UserFormModal.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

const MODULE_LABELS = {
  rede: 'Rede',
  interfone: 'Interfone',
  acesso: 'Acesso',
  'rede.dispositivos': 'Rede: cadastro',
  'rede.plantaBaixa': 'Rede: planta baixa',
  'rede.analise': 'Rede: análise',
};
// Lista fixa (não vem da API) só pra mostrar o "Tudo" do dono como uma
// lista explícita de badges, igual a um usuário comum totalmente liberado
// — o dono nunca tem essas linhas na tabela `permissions` (ele passa direto
// por role), então não dá pra ler isso de `u.modules`.
const ALL_PERMISSIONS = ['rede', 'rede.dispositivos', 'rede.plantaBaixa', 'rede.analise', 'interfone', 'acesso'];

export default function UsersAdmin({ currentUserId }) {
  const [users, setUsers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();

  function reload() {
    api.users.list().then(setUsers);
  }
  useEffect(reload, []);

  async function handleSave(form) {
    if (editing) {
      await api.users.update(editing.id, form);
      toast('Usuário atualizado.');
    } else {
      await api.users.create(form);
      toast('Usuário criado.');
    }
    setShowForm(false);
    setEditing(null);
    reload();
  }

  async function handleDelete() {
    try {
      await api.users.remove(deleting.id);
      toast('Usuário removido.');
      setDeleting(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Usuários do Portal</h1>
          <p>Quem pode entrar e o que cada um enxerga.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={16} /> Novo usuário
        </button>
      </div>

      {users === null ? (
        <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />
      ) : users.length === 0 ? (
        <EmptyState icon="users" title="Nenhum usuário" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Papel</th>
                <th>Módulos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.displayName}</td>
                  <td>{u.username}</td>
                  <td>
                    {u.role === 'owner' ? (
                      <span className="badge badge-accent">Administrador</span>
                    ) : (
                      <span className="badge badge-neutral">Usuário</span>
                    )}
                  </td>
                  <td>
                    {(u.role === 'owner' ? ALL_PERMISSIONS : u.modules).length === 0 ? (
                      <span className="field-hint">Nenhum</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(u.role === 'owner' ? ALL_PERMISSIONS : u.modules).map((m) => (
                          <span className={`badge ${u.role === 'owner' ? 'badge-accent' : 'badge-neutral'}`} key={m}>
                            {MODULE_LABELS[m] || m}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(u); setShowForm(true); }} title="Editar">
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setDeleting(u)}
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? 'Você não pode excluir a própria conta' : 'Excluir'}
                      >
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

      {showForm && (
        <UserFormModal
          user={editing}
          currentUserId={currentUserId}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir usuário"
          message={`Remover o acesso de "${deleting.displayName}" ao Portal?`}
          confirmLabel="Excluir"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
