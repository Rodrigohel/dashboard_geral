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
    // Só fazem sentido editando um usuário existente — na edição, deixar
    // senha/cartão em branco MANTÉM o valor atual; pra apagar de verdade
    // precisa marcar aqui.
    removePassword: false,
    removeCard: false,
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
            <input
              className="input"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value, removePassword: false }))}
              placeholder="Senha numérica"
              disabled={form.removePassword}
            />
            {user && (
              <label className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={form.removePassword}
                  onChange={(e) => setForm((f) => ({ ...f, removePassword: e.target.checked, password: e.target.checked ? '' : f.password }))}
                />
                Remover senha de acesso
              </label>
            )}
            {user && !form.removePassword && (
              <span className="field-hint">Deixe em branco para manter a senha atual.</span>
            )}
          </div>
          <div className="field">
            <label className="field-label">Cartão RFID (opcional)</label>
            <input
              className="input"
              value={form.cardNumber}
              onChange={(e) => setForm((f) => ({ ...f, cardNumber: e.target.value, removeCard: false }))}
              disabled={form.removeCard}
            />
            {user && (
              <label className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={form.removeCard}
                  onChange={(e) => setForm((f) => ({ ...f, removeCard: e.target.checked, cardNumber: e.target.checked ? '' : f.cardNumber }))}
                />
                Remover cartão RFID
              </label>
            )}
          </div>
        </div>

        <div className="field">
          <label className="field-label">Acesso expira em (opcional)</label>
          <input className="input" type="date" value={form.expiration} onChange={(e) => set('expiration', e.target.value)} />
          <span className="field-hint">Deixe em branco para acesso sem prazo.</span>
        </div>

        <span className="field-hint">
          O cadastro da <strong>foto facial</strong> é feito depois de salvar, na própria linha do usuário na lista.
        </span>
      </form>
    </Modal>
  );
}
