import { useEffect, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { api } from '../../api/client.js';

const MODULES = [
  { key: 'rede', label: 'Rede' },
  { key: 'interfone', label: 'Interfone' },
  { key: 'acesso', label: 'Controle de acesso' },
  { key: 'bombas', label: 'Bombas' },
];

// Permissões mais finas dentro de "rede" — visível só quando o módulo
// "rede" já está marcado acima. Controlam só o que o usuário VÊ (o Portal
// é só consulta de Rede; cadastro/edição de equipamento e planta baixa são
// feitos no painel de Rede original). Quem não marcar aqui continua vendo
// o monitoramento geral e a lista de equipamentos.
const REDE_FEATURES = [
  { key: 'rede.plantaBaixa', label: 'Planta baixa (mapa dos equipamentos por pavimento)' },
  { key: 'rede.analise', label: 'Análise de rede e histórico de eventos' },
];

// Mesma ideia das REDE_FEATURES acima, só que pro Controle de acesso: quem
// marcar "acesso" acima já vê a lista de equipamentos e moradores (visão
// controlada por device_permissions, não por essas chaves); essas aqui
// liberam as AÇÕES (incluir/editar/excluir) em cima do que já vê.
const ACESSO_EQUIPAMENTOS_FEATURES = [
  { key: 'acesso.equipamentos.incluir', label: 'Cadastrar novos equipamentos' },
  { key: 'acesso.equipamentos.editar', label: 'Editar equipamentos (e testar conexão)' },
  { key: 'acesso.equipamentos.excluir', label: 'Excluir equipamentos' },
];
const ACESSO_MORADORES_FEATURES = [
  { key: 'acesso.moradores.ver', label: 'Ver moradores cadastrados' },
  { key: 'acesso.moradores.incluir', label: 'Cadastrar moradores' },
  { key: 'acesso.moradores.editar', label: 'Editar moradores (e foto)' },
  { key: 'acesso.moradores.excluir', label: 'Excluir moradores' },
];
const BOMBAS_FEATURES = [{ key: 'bombas.editar', label: 'Editar configuração da casa de bombas' }];

// Sem módulo pai (a tela Usuários nunca foi um item de menu só-módulo,
// sempre foi só-dono) — por isso aparece numa seção própria, não dentro de
// "Módulos liberados" acima.
const USUARIOS_FEATURES = [
  { key: 'usuarios.ver', label: 'Ver usuários do Portal' },
  { key: 'usuarios.incluir', label: 'Criar novos usuários' },
  { key: 'usuarios.editar', label: 'Editar usuários' },
  { key: 'usuarios.excluir', label: 'Excluir usuários' },
];

export default function UserFormModal({ user, currentUserId, isOwner, can, onClose, onSave }) {
  // Mesma regra de escalonamento do backend (assertNoEscalation em
  // users.js): quem não é dono só pode marcar, pra outra conta, uma
  // permissão que ele mesmo já tem — nunca uma a mais. Reenviar sem
  // querer uma permissão que a conta editada já tinha (e o ator não tem)
  // não conta como "conceder", então o backend deixa passar — aqui só
  // escondemos o checkbox pra não dar a entender que é possível MUDAR algo
  // que já não aparece na tela.
  const allowed = (key) => isOwner || can(key);
  const [form, setForm] = useState({
    username: user?.username || '',
    displayName: user?.displayName || '',
    password: '',
    role: user?.role || 'user',
    tvMode: user?.tvMode || false,
    modules: user?.modules || [],
    deviceIds: user?.deviceIds || [],
    openDeviceIds: user?.openDeviceIds || [],
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
      // Tirar o acesso geral também tira a permissão de abrir — não faz
      // sentido manter uma sem a outra.
      openDeviceIds: f.deviceIds.includes(id) ? f.openDeviceIds.filter((d) => d !== id) : f.openDeviceIds,
    }));
  }

  function toggleOpenDevice(id) {
    setForm((f) => ({
      ...f,
      openDeviceIds: f.openDeviceIds.includes(id) ? f.openDeviceIds.filter((d) => d !== id) : [...f.openDeviceIds, id],
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

        {/* Quem não é dono nunca pode criar/promover um administrador —
            o backend bloqueia isso (assertNoEscalation), então nem mostra
            a opção aqui pra não dar falsa esperança. */}
        {isOwner && (
          <div className="field">
            <label className="field-label">Papel</label>
            <select className="select" value={form.role} disabled={isSelf} onChange={(e) => set('role', e.target.value)}>
              <option value="user">Usuário (só o que for liberado abaixo)</option>
              <option value="owner">Administrador (acesso total)</option>
            </select>
          </div>
        )}

        {form.role === 'user' && (
          <>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.tvMode} onChange={(e) => set('tvMode', e.target.checked)} />
              Modo TV / painel de portaria
            </label>
            <span className="field-hint" style={{ marginTop: -6 }}>
              Pensado pra ficar logado num monitor fixo — essa conta só vê os cards dos módulos liberados abaixo +
              alarmes ativos, sem menu nem acesso a nenhuma outra tela.
            </span>

            <div className="field">
              <label className="field-label">Módulos liberados</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {MODULES.filter((m) => allowed(m.key)).map((m) => (
                  <label className="checkbox-row" key={m.key}>
                    <input type="checkbox" checked={form.modules.includes(m.key)} onChange={() => toggleModule(m.key)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>

            {form.modules.includes('rede') && REDE_FEATURES.some((f) => allowed(f.key)) && (
              <div className="field">
                <label className="field-label">Dentro de Rede, também libera:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                  {REDE_FEATURES.filter((f) => allowed(f.key)).map((f) => (
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
              <>
                {ACESSO_EQUIPAMENTOS_FEATURES.some((f) => allowed(f.key)) && (
                  <div className="field">
                    <label className="field-label">Equipamentos de controle de acesso, pode:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                      {ACESSO_EQUIPAMENTOS_FEATURES.filter((f) => allowed(f.key)).map((f) => (
                        <label className="checkbox-row" key={f.key}>
                          <input type="checkbox" checked={form.modules.includes(f.key)} onChange={() => toggleModule(f.key)} />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {ACESSO_MORADORES_FEATURES.some((f) => allowed(f.key)) && (
                  <div className="field">
                    <label className="field-label">Moradores cadastrados nos equipamentos liberados abaixo, pode:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                      {ACESSO_MORADORES_FEATURES.filter((f) => allowed(f.key)).map((f) => (
                        <label className="checkbox-row" key={f.key}>
                          <input type="checkbox" checked={form.modules.includes(f.key)} onChange={() => toggleModule(f.key)} />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="field">
                  <label className="field-label">Equipamentos de controle de acesso liberados</label>
                  {devices.length === 0 ? (
                    <span className="field-hint">Nenhum equipamento cadastrado ainda.</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {devices.map((d) => (
                        <div key={d.id}>
                          <label className="checkbox-row">
                            <input type="checkbox" checked={form.deviceIds.includes(d.id)} onChange={() => toggleDevice(d.id)} />
                            {d.name} <span className="field-hint">({d.location || d.host})</span>
                          </label>
                          {form.deviceIds.includes(d.id) && (
                            <label className="checkbox-row" style={{ paddingLeft: 26, marginTop: 4 }}>
                              <input
                                type="checkbox"
                                checked={form.openDeviceIds.includes(d.id)}
                                onChange={() => toggleOpenDevice(d.id)}
                              />
                              <span className="field-hint">Também pode abrir esse porteiro remotamente pelo Portal</span>
                            </label>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {form.modules.includes('bombas') && BOMBAS_FEATURES.some((f) => allowed(f.key)) && (
              <div className="field">
                <label className="field-label">Dentro de Bombas, também libera:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingLeft: 4 }}>
                  {BOMBAS_FEATURES.filter((f) => allowed(f.key)).map((f) => (
                    <label className="checkbox-row" key={f.key}>
                      <input type="checkbox" checked={form.modules.includes(f.key)} onChange={() => toggleModule(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
                <span className="field-hint">Sem marcar aqui, o usuário ainda vê o status da casa de bombas — só não edita a configuração.</span>
              </div>
            )}

            {USUARIOS_FEATURES.some((f) => allowed(f.key)) && (
              <div className="field">
                <label className="field-label">Tela de Usuários do Portal, pode:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {USUARIOS_FEATURES.filter((f) => allowed(f.key)).map((f) => (
                    <label className="checkbox-row" key={f.key}>
                      <input type="checkbox" checked={form.modules.includes(f.key)} onChange={() => toggleModule(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
