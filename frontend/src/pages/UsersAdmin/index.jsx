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
  bombas: 'Bombas',
  gerador: 'Gerador',
  'rede.plantaBaixa': 'Rede: planta baixa',
  'rede.analise': 'Rede: análise',
  'acesso.equipamentos.incluir': 'Equipamentos: incluir',
  'acesso.equipamentos.editar': 'Equipamentos: editar',
  'acesso.equipamentos.excluir': 'Equipamentos: excluir',
  'acesso.moradores.ver': 'Moradores: ver',
  'acesso.moradores.incluir': 'Moradores: incluir',
  'acesso.moradores.editar': 'Moradores: editar',
  'acesso.moradores.excluir': 'Moradores: excluir',
  'bombas.editar': 'Bombas: editar',
  'gerador.editar': 'Gerador: editar',
  'usuarios.ver': 'Usuários: ver',
  'usuarios.incluir': 'Usuários: incluir',
  'usuarios.editar': 'Usuários: editar',
  'usuarios.excluir': 'Usuários: excluir',
  'auditoria.ver': 'Auditoria: ver/baixar logs',
};
// Lista fixa (não vem da API) só pra mostrar o "Tudo" do dono como uma
// lista explícita de badges, igual a um usuário comum totalmente liberado
// — o dono nunca tem essas linhas na tabela `permissions` (ele passa direto
// por role), então não dá pra ler isso de `u.modules`.
const ALL_PERMISSIONS = [
  'rede',
  'rede.plantaBaixa',
  'rede.analise',
  'interfone',
  'acesso',
  'acesso.equipamentos.incluir',
  'acesso.equipamentos.editar',
  'acesso.equipamentos.excluir',
  'acesso.moradores.ver',
  'acesso.moradores.incluir',
  'acesso.moradores.editar',
  'acesso.moradores.excluir',
  'bombas',
  'bombas.editar',
  'gerador',
  'gerador.editar',
  'usuarios.ver',
  'usuarios.incluir',
  'usuarios.editar',
  'usuarios.excluir',
  'auditoria.ver',
];

export default function UsersAdmin({ currentUserId, isOwner, can }) {
  const canCreate = isOwner || can('usuarios.incluir');
  const canEditUsers = isOwner || can('usuarios.editar');
  const canDeleteUsers = isOwner || can('usuarios.excluir');

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
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={16} /> Novo usuário
          </button>
        )}
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
                <th className="hide-mobile">Login</th>
                <th>Papel</th>
                <th className="hide-mobile">Módulos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.displayName}</td>
                  <td className="hide-mobile">{u.username}</td>
                  <td>
                    {u.role === 'owner' ? (
                      <span className="badge badge-accent">Administrador</span>
                    ) : (
                      <span className="badge badge-neutral">Usuário</span>
                    )}
                    {u.tvMode && (
                      <span className="badge badge-neutral" style={{ marginLeft: 6 }} title="Só vê cards + alarmes, sem menu">
                        TV
                      </span>
                    )}
                  </td>
                  <td className="hide-mobile">
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
                      {/* Quem não é dono nunca pode mexer numa conta de administrador
                          (owner) — o backend bloqueia (assertNotTargetingOwner), então
                          nem mostra o botão aqui. */}
                      {canEditUsers && (isOwner || u.role !== 'owner') && (
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditing(u); setShowForm(true); }} title="Editar">
                          <Icon name="edit" size={15} />
                        </button>
                      )}
                      {canDeleteUsers && (isOwner || u.role !== 'owner') && (
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setDeleting(u)}
                          disabled={u.id === currentUserId}
                          title={u.id === currentUserId ? 'Você não pode excluir a própria conta' : 'Excluir'}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
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
          isOwner={isOwner}
          can={can}
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
