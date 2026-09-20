import { useState } from 'react';
import Modal from '../../components/Modal.jsx';

const MODELS = [
  { value: 'xpe3200', label: 'Intelbras XPE 3200 IP Face' },
  { value: 'ss3532mf', label: 'Intelbras SS 3532 MF (Bio-T)' },
  { value: 'other', label: 'Outro (compatível com API Control iD)' },
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
    notes: device?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name || !form.host || !form.deviceUsername || (!device && !form.devicePassword)) {
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
          <label className="field-label">Nome</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Porteiro — Portaria principal" />
        </div>

        <div className="field">
          <label className="field-label">Local</label>
          <input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Portaria, Bloco A..." />
        </div>

        <div className="field">
          <label className="field-label">Modelo</label>
          <select className="select" value={form.model} onChange={(e) => set('model', e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label className="field-label">Usuário do equipamento</label>
            <input className="input" value={form.deviceUsername} onChange={(e) => set('deviceUsername', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Senha do equipamento</label>
            <input
              className="input"
              type="password"
              value={form.devicePassword}
              onChange={(e) => set('devicePassword', e.target.value)}
              placeholder={device ? 'deixe em branco para manter' : ''}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Notas</label>
          <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opcional" />
        </div>
      </form>
    </Modal>
  );
}
