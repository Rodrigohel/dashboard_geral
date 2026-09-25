import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api/client.js';

// Cadastra a mesma pessoa em vários porteiros de uma vez (ex.: "só a Torre
// B", ou "Torre A e B juntas") — evita ter que abrir equipamento por
// equipamento e repetir o mesmo formulário. Cada equipamento continua sendo
// um cadastro independente por trás (a API não tem conceito de "usuário
// compartilhado" entre porteiros), então mandamos uma criação por
// equipamento escolhido e mostramos o resultado de cada um.
export default function MultiDeviceUserFormModal({ devices, initialName = '', onClose, onDone }) {
  const [form, setForm] = useState({
    name: initialName,
    registration: '',
    apartment: '',
    password: '',
    cardNumber: '',
    expiration: '',
  });
  const [selected, setSelected] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null); // [{ device, ok: true|'partial'|false, message }] | null

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleDevice(id) {
    setSelected((s) => (s.includes(id) ? s.filter((d) => d !== id) : [...s, id]));
  }

  async function createOnDevice(deviceId, payload) {
    const device = devices.find((d) => d.id === deviceId);
    let created;
    try {
      created = await api.accessDevices.users.create(deviceId, payload);
    } catch (err) {
      return { device, ok: false, message: `Não foi possível criar o usuário: ${err.message}` };
    }
    if (!photoFile) return { device, ok: true, message: 'Usuário criado.' };
    try {
      await api.accessDevices.users.setPhoto(deviceId, created.id, photoFile);
      return { device, ok: true, message: 'Usuário criado e foto enviada.' };
    } catch (err) {
      return { device, ok: 'partial', message: `Usuário criado, mas a foto falhou: ${err.message}` };
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name) {
      setError('Informe o nome da pessoa.');
      return;
    }
    if (selected.length === 0) {
      setError('Escolha pelo menos um equipamento.');
      return;
    }
    setSaving(true);
    const payload = { ...form, expiration: form.expiration ? new Date(form.expiration).toISOString() : undefined };
    const outcomes = await Promise.all(selected.map((deviceId) => createOnDevice(deviceId, payload)));
    setResults(outcomes);
    setSaving(false);
  }

  function handleClose() {
    if (results?.some((r) => r.ok)) onDone();
    onClose();
  }

  const STATUS_COLOR = { true: 'var(--success-500)', partial: 'var(--warning-500)', false: 'var(--danger-500)' };
  const STATUS_ICON = { true: 'check', partial: 'camera', false: 'x' };

  if (results) {
    const fullCount = results.filter((r) => r.ok === true).length;
    const partialCount = results.filter((r) => r.ok === 'partial').length;
    return (
      <Modal
        title="Resultado do cadastro"
        onClose={handleClose}
        footer={
          <button className="btn btn-primary" onClick={handleClose}>
            Fechar
          </button>
        }
      >
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)' }}>
            <strong>{form.name}</strong> cadastrado em {fullCount + partialCount} de {results.length} equipamento
            {results.length === 1 ? '' : 's'}
            {partialCount > 0 ? ` (${partialCount} sem a foto)` : ''}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(({ device, ok, message }) => (
              <div
                key={device.id}
                className="surface"
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  borderLeft: `3px solid ${STATUS_COLOR[ok]}`,
                }}
              >
                <span style={{ color: STATUS_COLOR[ok], marginTop: 2, flexShrink: 0, display: 'flex' }}>
                  <Icon name={STATUS_ICON[ok]} size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{device.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Novo usuário em vários porteiros"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : `Cadastrar em ${selected.length || ''} equipamento${selected.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <form className="modal-body" onSubmit={handleSubmit}>
        {error && <div className="login-error">{error}</div>}

        <div className="field">
          <label className="field-label">Nome completo</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: João da Silva" autoFocus />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Matrícula / código</label>
            <input className="input" value={form.registration} onChange={(e) => set('registration', e.target.value)} placeholder="Opcional — mesmo código em todos" />
            <span className="field-hint">Deixe em branco e cada equipamento gera o dele — se quer o mesmo código em todos, preencha aqui.</span>
          </div>
          <div className="field">
            <label className="field-label">Apartamento (opcional)</label>
            <input className="input" value={form.apartment} onChange={(e) => set('apartment', e.target.value)} placeholder="Ex.: 2502" />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Senha de acesso (opcional)</label>
            <input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Senha numérica" />
          </div>
          <div className="field">
            <label className="field-label">Cartão RFID (opcional)</label>
            <input className="input" value={form.cardNumber} onChange={(e) => set('cardNumber', e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Acesso expira em (opcional)</label>
          <input className="input" type="date" value={form.expiration} onChange={(e) => set('expiration', e.target.value)} />
          <span className="field-hint">Deixe em branco para acesso sem prazo.</span>
        </div>

        <div className="field">
          <label className="field-label">Foto facial (opcional)</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
          <span className="field-hint">
            Enviada logo depois de criar o usuário em cada equipamento escolhido. Se algum equipamento recusar (ex.:
            tamanho/formato), o resto continua normalmente — o resultado mostra equipamento por equipamento.
          </span>
        </div>

        <div className="field">
          <label className="field-label">Cadastrar nestes equipamentos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {devices.map((d) => (
              <label className="checkbox-row" key={d.id}>
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleDevice(d.id)} />
                {d.name} <span className="field-hint">({d.location || d.host})</span>
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
