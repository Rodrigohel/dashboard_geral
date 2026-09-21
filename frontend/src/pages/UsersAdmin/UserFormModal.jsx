import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { api } from '../../api/client.js';

const MODULES = [
  { key: 'rede', label: 'Rede' },
  { key: 'interfone', label: 'Interfone' },
  { key: 'acesso', label: 'Controle de acesso' },
];

// Permissões mais finas dentro de "rede" — visível só quando o módulo
// "rede" já está marcado acima. Quem não marcar aqui continua vendo o
// monitoramento geral, só não vê essas ações/telas específicas.
const REDE_FEATURES = [
  { key: 'rede.dispositivos', label: 'Cadastro de equipamentos (criar, editar, excluir, importar, escanear)' },
  { key: 'rede.plantaBaixa', label: 'Planta baixa (mapa dos equipamentos por pavimento)' },
  { key: 'rede.analise', label: 'Análise de rede e histórico de eventos' },
];

export default function UserFormModal({ user, currentUserId, onClose, onSave }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    displayName: user?.displayName || '',
    password: '',
    role: user?.role || 'user',
    modules: user?.modules || [],
    deviceIds: user?.deviceIds || [],
  });
  const [devices, setDevices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.accessDevices.list().then(setDevices).catch(() => setDevices([]));
  }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleModule(key) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(key) ? f.modules.filter((m) => m !== key) : [...f.modules, key],
    }));
  }

  function toggleDevice(id) {
    setForm((f) => ({
      ...f,
      deviceIds: f.deviceIds.includes(id) ? f.deviceIds.filter((d) => d !== id) : [...f.deviceIds, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.username || !form.displayName || (!user && !form.password)) {
      setError('Usuário, nome e senha são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isSelf = user && currentUserId === user.id;

  return (
    <Modal
      title={user ? 'Editar usuário' : 'Novo usuário'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Salvar'}
          </button>
        </>
      }
    >
      <form className="modal-body" onSubmit={handleSubmit}>
        {error && <div className="login-error">{error}</div>}

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Login</label>
            <input className="input" value={form.username} disabled={!!user} onChange={(e) => set('username', e.target.value)} placeholder="joao.silva" />
          </div>
          <div className="field">
            <label className="field-label">Nome de exibição</label>
            <input className="input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="João Silva" />
          </div>
        </div>

        <div className="field">
          <label className="field-label">{user ? 'Nova senha (opcional)' : 'Senha'}</label>
          <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={user ? 'deixe em branco para manter' : ''} />
        </div>

        <div className="field">
          <label className="field-label">Papel</label>
          <select className="select" value={form.role} disabled={isSelf} onChange={(e) => set('role', e.target.value)}>
            <option value="user">Usuário (só o que for liberado abaixo)</option>
            <option value="owner">Administrador (acesso total)</option>
          </select>
        </div>

        {form.role === 'user' && (
          <>
            <div className="field">
              <label className="field-label">Módulos liberados</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {MODULES.map((m) => (
                  <label className="checkbox-row" key={m.key}>
                    <input type="checkbox" checked={form.modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            {form.modules.includes('rede') && (
              <div className="field">
                <label className="field-label">Dentro de Rede, também libera:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                  {REDE_FEATURES.map((f) => (
                    <label className="checkbox-row" key={f.key}>
                      <input type="checkbox" checked={form.modules.includes(f.key)} onChange={() => toggleModule(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
                <span className="field-hint">Sem marcar aqui, o usuário ainda vê o monitoramento geral da Rede — só não vê essas telas/ações.</span>
              </div>
            )}

            {form.modules.includes('acesso') && (
              <div className="field">
                <label className="field-label">Equipamentos de controle de acesso liberados</label>
                {devices.length === 0 ? (
                  <span className="field-hint">Nenhum equipamento cadastrado ainda.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {devices.map((d) => (
                      <label className="checkbox-row" key={d.id}>
                        <input type="checkbox" checked={form.deviceIds.includes(d.id)} onChange={() => toggleDevice(d.id)} />
                        {d.name} <span className="field-hint">({d.location || d.host})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
