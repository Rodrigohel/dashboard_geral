import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { api } from '../../api/client.js';

const MODELS = [
  { value: 'xpe3200', label: 'Intelbras XPE 3200 IP Face' },
  { value: 'ss3532mf', label: 'Intelbras SS 3532 MF (Bio-T)' },
  { value: 'segplace', label: 'Segplace / Axiom Wifi (portão)' },
  { value: 'other', label: 'Outro (ainda não suportado)' },
];

export default function DeviceFormModal({ device, onClose, onSave }) {
  const [form, setForm] = useState({
    name: device?.name || '',
    location: device?.location || '',
    model: device?.model || 'xpe3200',
    host: device?.host || '',
    port: device?.port || 80,
    useHttps: device?.useHttps || false,
    deviceUsername: device?.deviceUsername || 'admin',
    devicePassword: '',
    remoteId: device?.remoteId || '',
    notes: device?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Segplace não tem host/porta pra digitar (é sempre a nuvem deles) — em
  // vez disso, busca os portões já cadastrados na conta informada e deixa
  // escolher qual deles essa linha representa (uma conta pode ter mais de
  // um portão).
  const [gates, setGates] = useState(null);
  const [discovering, setDiscovering] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const isSegplace = form.model === 'segplace';

  async function handleDiscoverGates() {
    setError('');
    setDiscovering(true);
    setGates(null);
    try {
      const found = await api.accessDevices.discoverSegplace({
        username: form.deviceUsername,
        password: form.devicePassword,
      });
      setGates(found);
      if (found.length === 0) {
        setError('Login funcionou, mas essa conta não tem nenhum portão cadastrado na Segplace.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDiscovering(false);
    }
  }

  function handlePickGate(remoteId) {
    const gate = gates.find((g) => g.remoteId === remoteId);
    set('remoteId', remoteId);
    if (gate && !form.name) set('name', gate.nome);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (isSegplace) {
      if (!form.name || !form.deviceUsername || (!device && !form.devicePassword) || !form.remoteId) {
        setError('Preencha nome, usuário, senha e escolha um portão ("Buscar portões").');
        return;
      }
    } else if (!form.name || !form.host || !form.deviceUsername || (!device && !form.devicePassword)) {
      setError('Preencha nome, host, usuário e senha do equipamento.');
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

  return (
    <Modal
      title={device ? 'Editar equipamento' : 'Novo equipamento'}
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

        <div className="field">
          <label className="field-label">Modelo</label>
          <select className="select" value={form.model} onChange={(e) => set('model', e.target.value)} autoFocus>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {form.model === 'xpe3200' && (
            <span className="field-hint">
              Precisa habilitar antes, na interface web do próprio equipamento: Segurança → API HTTP (vem desligada de fábrica).
            </span>
          )}
          {form.model === 'ss3532mf' && (
            <span className="field-hint">
              Suporte a este modelo ainda não foi validado num equipamento real — cadastro/foto devem funcionar, mas listar/editar/excluir usuários ainda não.
            </span>
          )}
          {isSegplace && (
            <span className="field-hint">
              Só controla abrir/ver status do portão — cadastro de moradores não é suportado por esse tipo (a Segplace
              não expõe isso na API deles).
            </span>
          )}
        </div>

        <div className="field">
          <label className="field-label">Nome</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Porteiro — Portaria principal" />
        </div>

        <div className="field">
          <label className="field-label">Local</label>
          <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Portaria, Bloco A..." />
        </div>

        {!isSegplace && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
              <div className="field">
                <label className="field-label">Host / IP</label>
                <input className="input" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.50" />
              </div>
              <div className="field">
                <label className="field-label">Porta</label>
                <input className="input" type="number" value={form.port} onChange={(e) => set('port', Number(e.target.value))} />
              </div>
            </div>

            <label className="checkbox-row">
              <input type="checkbox" checked={form.useHttps} onChange={(e) => set('useHttps', e.target.checked)} />
              Usar HTTPS
            </label>
          </>
        )}

        <div className="grid-2">
          <div className="field">
            <label className="field-label">{isSegplace ? 'Usuário (conta Segplace)' : 'Usuário do equipamento'}</label>
            <input className="input" value={form.deviceUsername} onChange={(e) => set('deviceUsername', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{isSegplace ? 'Senha (conta Segplace)' : 'Senha do equipamento'}</label>
            <input
              className="input"
              type="password"
              value={form.devicePassword}
              onChange={(e) => set('devicePassword', e.target.value)}
              placeholder={device ? 'deixe em branco para manter' : ''}
            />
          </div>
        </div>

        {isSegplace && (
          <div className="field">
            <label className="field-label">Portão</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDiscoverGates}
                disabled={discovering || !form.deviceUsername || !form.devicePassword}
              >
                {discovering ? <span className="spinner spinner-dark" /> : 'Buscar portões'}
              </button>
              {gates && gates.length > 0 && (
                <select className="select" value={form.remoteId} onChange={(e) => handlePickGate(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Escolha um portão...</option>
                  {gates.map((g) => (
                    <option key={g.remoteId} value={g.remoteId}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <span className="field-hint">Preencha usuário e senha acima primeiro, depois clique em "Buscar portões".</span>
          </div>
        )}

        <div className="field">
          <label className="field-label">Notas</label>
          <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opcional" />
        </div>
      </form>
    </Modal>
  );
}
