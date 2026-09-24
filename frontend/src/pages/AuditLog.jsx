import { useEffect, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/client.js';

function formatDateTime(iso) {
  // O SQLite guarda em UTC sem sufixo 'Z' — sem isso o navegador interpreta
  // como horário local e mostra a hora errada.
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('pt-BR');
}

export default function AuditLog() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.audit
      .logins()
      .then(setEvents)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Auditoria de acesso</h1>
          <p>Últimas 500 tentativas de login no Portal — quem entrou, quando e de onde.</p>
        </div>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)' }}>
          <strong style={{ color: 'var(--danger-500)' }}>Não foi possível carregar o histórico.</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>{error}</p>
        </div>
      )}

      {!error && events === null && <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />}

      {!error && events !== null && events.length === 0 && (
        <EmptyState icon="shieldFace" title="Nenhum login registrado ainda" description="Os próximos logins vão aparecer aqui." />
      )}

      {!error && events !== null && events.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Usuário</th>
                <th>Resultado</th>
                <th>IP</th>
                <th>Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{e.username}</td>
                  <td>
                    {e.success ? (
                      <span className="badge badge-success"><span className="badge-dot" /> sucesso</span>
                    ) : (
                      <span className="badge badge-danger"><span className="badge-dot" /> falhou</span>
                    )}
                  </td>
                  <td>{e.ip || '—'}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_agent}>
                    {e.user_agent || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
