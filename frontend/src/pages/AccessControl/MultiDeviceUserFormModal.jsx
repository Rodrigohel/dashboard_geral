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
export default function MultiDeviceUserFormModal({ devices, onClose, onDone }) {
  const [form, setForm] = useState({
    name: '',
    registration: '',
    apartment: '',
    password: '',
    cardNumber: '',
    expiration: '',
  });
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null); // [{ device, ok, message }] | null

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleDevice(id) {
    setSelected((s) => (s.includes(id) ? s.filter((d) => d !== id) : [...s, id]));
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
    const outcomes = await Promise.allSettled(
      selected.map((deviceId) => api.accessDevices.users.create(deviceId, payload))
    );
    setResults(
      outcomes.map((outcome, i) => {
        const device = devices.find((d) => d.id === selected[i]);
        return outcome.status === 'fulfilled'
          ? { device, ok: true }
          : { device, ok: false, message: outcome.reason?.message || 'Falha desconhecida' };
      })
    );
    setSaving(false);
  }

  function handleClose() {
    if (results?.some((r) => r.ok)) onDone();
    onClose();
  }

  if (results) {
    const okCount = results.filter((r) => r.ok).length;
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
            <strong>{form.name}</strong> cadastrado em {okCount} de {results.length} equipamento{results.length === 1 ? '' : 's'}.
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
                  borderLeft: `3px solid ${ok ? 'var(--success-500)' : 'var(--danger-500)'}`,
                }}
              >
                <span style={{ color: ok ? 'var(--success-500)' : 'var(--danger-500)', marginTop: 2, flexShrink: 0, display: 'flex' }}>
                  <Icon name={ok ? 'check' : 'x'} size={16} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{device.name}</div>
                  {!ok && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{message}</div>}
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

        <span className="field-hint">
          O cadastro da <strong>foto facial</strong> é feito depois, equipamento por equipamento, na própria linha do usuário na lista.
        </span>
      </form>
    </Modal>
  );
}
