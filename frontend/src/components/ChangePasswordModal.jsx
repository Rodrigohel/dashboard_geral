import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';
import { isPushSupported, getCurrentSubscription, subscribeToPush, unsubscribeFromPush } from '../utils/push.js';

function PushNotificationToggle() {
  const [pushInfo, setPushInfo] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!isPushSupported()) return;
    api.push
      .getPublicInfo()
      .then(async (info) => {
        setPushInfo(info);
        if (info.enabled) {
          const sub = await getCurrentSubscription();
          setSubscribed(Boolean(sub));
        }
      })
      .catch(() => {});
  }, []);

  if (!isPushSupported() || !pushInfo?.enabled) return null;

  async function handleToggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
        toast('Notificações desativadas neste navegador.');
      } else {
        await subscribeToPush(pushInfo.publicKey);
        setSubscribed(true);
        toast('Notificações ativadas neste navegador.');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Notificações neste navegador</div>
      <p className="field-hint">Avisos de porteiro offline e trava de força bruta, direto aqui no navegador.</p>
      <div>
        <button type="button" className="btn btn-secondary" onClick={handleToggle} disabled={busy}>
          {busy ? <span className="spinner spinner-dark" /> : subscribed ? 'Desativar' : 'Ativar'}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast('A confirmação não bate com a nova senha.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.account.changePassword({ currentPassword, newPassword });
      toast('Senha alterada.');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Minha conta" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label className="field-label">Senha atual</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label className="field-label">Nova senha</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <span className="field-hint">Pelo menos 6 caracteres.</span>
          </div>
          <div className="field">
            <label className="field-label">Confirmar nova senha</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar senha'}
            </button>
          </div>
        </form>

        <PushNotificationToggle />
      </div>
    </Modal>
  );
}
