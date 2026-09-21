import { useState } from 'react';
import Modal from '../../components/Modal.jsx';

export default function DeviceUserFormModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    registration: user?.registration || '',
    apartment: user?.apartment || '',
    password: '',
    cardNumber: user?.cardNumber || '',
    expiration: user?.expiration ? user.expiration.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name) {
      setError('Informe o nome da pessoa.');
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

        <div className="field">
          <label className="field-label">Nome completo</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: João da Silva" autoFocus />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="field-label">Matrícula / código</label>
            <input className="input" value={form.registration} onChange={(e) => set('registration', e.target.value)} placeholder="Opcional — gerado automaticamente se vazio" />
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

        <span className="field-hint">
          Cadastrar/trocar <strong>foto facial</strong> ainda não é suportado pelo Portal neste equipamento — use a
          interface web do próprio porteiro. Já dá pra visualizar a foto cadastrada pela lista de usuários.
        </span>
      </form>
    </Modal>
  );
}
