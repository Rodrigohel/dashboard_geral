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
    isFacial: device ? Boolean(device.isFacial) : true,
    host: device?.host || '',
    port: device?.port || 80,
    useHttps: device?.useHttps || false,
    deviceUsername: device?.deviceUsername || 'admin',
    devicePassword: '',
    remoteId: device?.remoteId || '',
    notes: device?.notes || '',
    cameraHost: device?.cameraHost || '',
    cameraPort: device?.cameraPort || 80,
    cameraChannel: device?.cameraChannel || 1,
    cameraUsername: device?.cameraUsername || '',
    cameraPassword: '',
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

  // Trocar pra Segplace esconde o botão (portão nunca é facial) — trocar de
  // volta pra um modelo Intelbras não mexe no que a pessoa já tinha
  // escolhido antes.
  function setModel(value) {
    setForm((f) => ({ ...f, model: value, isFacial: value === 'segplace' ? false : f.isFacial }));
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
          <select className="select" value={form.model} onChange={(e) => setModel(e.target.value)} autoFocus>
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

        {!isSegplace && (
          <div className="field">
            <label className="field-label">Este equipamento é facial (tem câmera de reconhecimento)?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${form.isFacial ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => set('isFacial', true)}
              >
                Sim
              </button>
              <button
                type="button"
                className={`btn btn-sm ${!form.isFacial ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => set('isFacial', false)}
              >
                Não
              </button>
            </div>
            <span className="field-hint">
              Controla se a tela de "Novo usuário" oferece o campo de foto pra este equipamento — marque "Não" se esta
              unidade estiver instalada sem a câmera.
            </span>
          </div>
        )}

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

        <div className="field" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
          <label className="field-label">Câmera apontada pro portão (opcional)</label>
          <span className="field-hint">
            Câmera IP avulsa (Hikvision), separada deste equipamento — só pra ver ao vivo se abriu, ao lado do botão "Abrir".
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 12 }}>
          <div className="field">
            <label className="field-label">IP da câmera</label>
            <input className="input" value={form.cameraHost} onChange={(e) => set('cameraHost', e.target.value)} placeholder="192.168.1.62" />
          </div>
          <div className="field">
            <label className="field-label">Porta</label>
            <input className="input" type="number" value={form.cameraPort} onChange={(e) => set('cameraPort', Number(e.target.value))} />
          </div>
          <div className="field">
            <label className="field-label">Canal</label>
            <input className="input" type="number" min="1" value={form.cameraChannel} onChange={(e) => set('cameraChannel', Number(e.target.value))} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="field-label">Usuário da câmera</label>
            <input className="input" value={form.cameraUsername} onChange={(e) => set('cameraUsername', e.target.value)} placeholder="admin" />
          </div>
          <div className="field">
            <label className="field-label">Senha da câmera</label>
            <input
              className="input"
              type="password"
              value={form.cameraPassword}
              onChange={(e) => set('cameraPassword', e.target.value)}
              placeholder={device?.cameraHost ? 'deixe em branco para manter' : ''}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
