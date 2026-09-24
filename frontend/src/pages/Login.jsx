import { useState } from 'react';
import Icon from '../components/Icon.jsx';

export default function Login({ branding, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card surface glass">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.name} className="brand-mark brand-logo-img" />
        ) : (
          <div className="brand-mark">{branding.name.charAt(0).toUpperCase()}</div>
        )}
        <div className="login-title">Bem-vindo de volta</div>
        <div className="login-subtitle">Entre para acessar seus painéis</div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error">
              <Icon name="x" size={15} />
              {error}
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              className="input"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuário"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Senha
            </label>
            <div className="input-with-icon">
              <input
                id="password"
                className="input"
                style={{ paddingRight: 40 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="input-icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  left: 'auto',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
              </button>
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8, padding: '12px' }}>
            {loading ? <span className="spinner" /> : 'Entrar'}
          </button>
        </form>

        <div className="login-footnote">Acesso restrito — fale com o administrador para receber um login.</div>
      </div>
    </div>
  );
}
