import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { downloadCsv } from '../utils/csv.js';

function formatDateTime(iso) {
  // O SQLite guarda em UTC sem sufixo 'Z' — sem isso o navegador interpreta
  // como horário local e mostra a hora errada.
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('pt-BR');
}

function LoginEventsTable({ events }) {
  if (events.length === 0) {
    return <EmptyState icon="shieldFace" title="Nenhum login registrado ainda" description="Os próximos logins vão aparecer aqui." />;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Usuário</th>
            <th>Resultado</th>
            <th className="hide-mobile">IP</th>
            <th className="hide-mobile">Dispositivo</th>
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
              <td className="hide-mobile">{e.ip || '—'}</td>
              <td className="hide-mobile" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.user_agent}>
                {e.user_agent || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DoorOpenEventsTable({ events }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="Nenhuma abertura registrada ainda"
        description="As próximas aberturas remotas de porteiro vão aparecer aqui."
      />
    );
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Usuário</th>
            <th>Porteiro</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{formatDateTime(e.created_at)}</td>
              <td style={{ fontWeight: 600 }}>{e.username}</td>
              <td>{e.device_name}</td>
              <td>
                {e.success ? (
                  <span className="badge badge-success"><span className="badge-dot" /> abriu</span>
                ) : (
                  <span className="badge badge-danger" title={e.error_message}><span className="badge-dot" /> falhou</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = {
  logins: { label: 'Logins', desc: 'Últimas 500 tentativas de login no Portal — quem entrou, quando e de onde.' },
  doorOpens: { label: 'Aberturas de porteiro', desc: 'Últimas 500 tentativas de abertura remota — quem abriu, quando e qual porteiro.' },
};

const CSV_COLUMNS = {
  logins: [
    { header: 'Data/hora', get: (e) => formatDateTime(e.created_at) },
    { header: 'Usuário', get: (e) => e.username },
    { header: 'Resultado', get: (e) => (e.success ? 'sucesso' : 'falhou') },
    { header: 'IP', get: (e) => e.ip || '' },
    { header: 'Dispositivo', get: (e) => e.user_agent || '' },
  ],
  doorOpens: [
    { header: 'Data/hora', get: (e) => formatDateTime(e.created_at) },
    { header: 'Usuário', get: (e) => e.username },
    { header: 'Porteiro', get: (e) => e.device_name },
    { header: 'Resultado', get: (e) => (e.success ? 'abriu' : 'falhou') },
    { header: 'Erro', get: (e) => e.error_message || '' },
  ],
};

export default function AuditLog() {
  const [tab, setTab] = useState('logins');
  const [loginEvents, setLoginEvents] = useState(null);
  const [doorEvents, setDoorEvents] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setError('');
    if (tab === 'logins' && loginEvents === null) {
      api.audit.logins().then(setLoginEvents).catch((err) => setError(err.message));
    }
    if (tab === 'doorOpens' && doorEvents === null) {
      api.audit.doorOpens().then(setDoorEvents).catch((err) => setError(err.message));
    }
  }, [tab, loginEvents, doorEvents]);

  // Zera a busca ao trocar de aba — um filtro por IP não faz sentido na
  // aba de aberturas de porteiro (e vice-versa com "porteiro").
  useEffect(() => setFilter(''), [tab]);

  const events = tab === 'logins' ? loginEvents : doorEvents;

  const filteredEvents = useMemo(() => {
    if (!events) return events;
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      tab === 'logins'
        ? e.username.toLowerCase().includes(q) || (e.ip || '').toLowerCase().includes(q)
        : e.username.toLowerCase().includes(q) || (e.device_name || '').toLowerCase().includes(q)
    );
  }, [events, filter, tab]);

  function handleExport() {
    const filename = tab === 'logins' ? 'auditoria-logins.csv' : 'auditoria-aberturas.csv';
    downloadCsv(filename, filteredEvents || [], CSV_COLUMNS[tab]);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Auditoria de acesso</h1>
          <p>{TABS[tab].desc}</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!filteredEvents || filteredEvents.length === 0}>
          <Icon name="copy" size={15} /> Exportar CSV
        </button>
      </div>

      <div className="tabs">
        {Object.entries(TABS).map(([key, meta]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {meta.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)' }}>
          <strong style={{ color: 'var(--danger-500)' }}>Não foi possível carregar o histórico.</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>{error}</p>
        </div>
      )}

      {!error && events === null && <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />}

      {!error && events !== null && events.length > 0 && (
        <input
          className="input"
          style={{ marginBottom: 12, maxWidth: 320 }}
          placeholder={tab === 'logins' ? 'Buscar por usuário ou IP...' : 'Buscar por usuário ou porteiro...'}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      {!error && events !== null && events.length > 0 && filteredEvents.length === 0 && (
        <div className="field-hint">Nenhum resultado para "{filter}".</div>
      )}

      {!error && events !== null && (events.length === 0 || filteredEvents.length > 0) && (
        tab === 'logins' ? <LoginEventsTable events={filteredEvents} /> : <DoorOpenEventsTable events={filteredEvents} />
      )}
    </>
  );
}
