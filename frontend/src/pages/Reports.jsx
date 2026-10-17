import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/client.js';
import { downloadCsv } from '../utils/csv.js';

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('pt-BR');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

const PUMP_LABEL = { bomba1: 'Bomba 1', bomba2: 'Bomba 2' };

function BombasReport() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setRows(null);
    api.reports.bombas({ from, to }).then(setRows).catch((err) => setError(err.message));
  }, [from, to]);

  function handleExport() {
    downloadCsv(`relatorio-bombas-${from}-a-${to}.csv`, rows || [], [
      { header: 'Bomba', get: (r) => PUMP_LABEL[r.pointKey] },
      { header: 'Ligou em', get: (r) => formatDateTime(r.startedAt) },
      { header: 'Desligou em', get: (r) => (r.endedAt ? formatDateTime(r.endedAt) : 'ainda ligada') },
      { header: 'Tempo ligada', get: (r) => formatDuration(r.durationSeconds) },
      { header: 'Era a bomba do dia?', get: (r) => (r.wasBombaDoDia ? 'sim' : 'não') },
      { header: 'Ligou junto com a outra?', get: (r) => (r.simultaneous ? 'sim' : 'não') },
      { header: 'Tempo de enchimento antes', get: (r) => (r.fillSeconds === null ? '' : formatDuration(r.fillSeconds)) },
    ]);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="field-hint">até</span>
          <input className="input" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!rows || rows.length === 0}>
          <Icon name="copy" size={15} /> Exportar CSV
        </button>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)' }}>
          <strong style={{ color: 'var(--danger-500)' }}>Não foi possível carregar o relatório.</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>{error}</p>
        </div>
      )}
      {!error && rows === null && <div className="skeleton" style={{ height: 300, borderRadius: 20 }} />}
      {!error && rows !== null && rows.length === 0 && (
        <EmptyState icon="droplet" title="Nenhuma ativação nesse período" description="Troque as datas acima pra ver outro período." />
      )}
      {!error && rows !== null && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bomba</th>
                <th>Ligou em</th>
                <th>Desligou em</th>
                <th>Tempo ligada</th>
                <th className="hide-mobile">Bomba do dia?</th>
                <th className="hide-mobile">Simultânea?</th>
                <th className="hide-mobile">Enchimento antes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={r.simultaneous ? { background: 'color-mix(in srgb, var(--warning-500) 10%, transparent)' } : undefined}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ color: r.pointKey === 'bomba1' ? 'var(--chart-series-1)' : 'var(--chart-series-2)' }}>●</span> {PUMP_LABEL[r.pointKey]}
                  </td>
                  <td>{formatDateTime(r.startedAt)}</td>
                  <td>{r.endedAt ? formatDateTime(r.endedAt) : <span className="badge badge-success">ligada agora</span>}</td>
                  <td>{formatDuration(r.durationSeconds)}</td>
                  <td className="hide-mobile">{r.wasBombaDoDia ? 'sim' : 'não'}</td>
                  <td className="hide-mobile">
                    {r.simultaneous ? (
                      <span className="badge badge-warning" title="Bomba 1 e Bomba 2 ligadas ao mesmo tempo">
                        <span className="badge-dot" /> sim
                      </span>
                    ) : (
                      'não'
                    )}
                  </td>
                  <td className="hide-mobile">{r.fillSeconds === null ? '—' : formatDuration(r.fillSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AcessoReport() {
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setRows(null);
    api.reports.acesso({ from, to }).then(setRows).catch((err) => setError(err.message));
  }, [from, to]);

  function handleExport() {
    downloadCsv(`relatorio-acessos-${from}-a-${to}.csv`, rows || [], [
      { header: 'Data/hora', get: (r) => formatDateTime(r.created_at) },
      { header: 'Usuário', get: (r) => r.username },
      { header: 'Porteiro', get: (r) => r.device_name },
      { header: 'Resultado', get: (r) => (r.success ? 'abriu' : 'falhou') },
      { header: 'Erro', get: (r) => r.error_message || '' },
    ]);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="field-hint">até</span>
          <input className="input" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={!rows || rows.length === 0}>
          <Icon name="copy" size={15} /> Exportar CSV
        </button>
      </div>

      {error && (
        <div className="surface" style={{ padding: 20, borderLeft: '3px solid var(--danger-500)' }}>
          <strong style={{ color: 'var(--danger-500)' }}>Não foi possível carregar o relatório.</strong>
          <p style={{ color: 'var(--text-secondary)', marginTop: 6, fontSize: 13.5 }}>{error}</p>
        </div>
      )}
      {!error && rows === null && <div className="skeleton" style={{ height: 300, borderRadius: 20 }} />}
      {!error && rows !== null && rows.length === 0 && (
        <EmptyState icon="shieldFace" title="Nenhuma abertura nesse período" description="Troque as datas acima pra ver outro período." />
      )}
      {!error && rows !== null && rows.length > 0 && (
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
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.username}</td>
                  <td>{r.device_name}</td>
                  <td>
                    {r.success ? (
                      <span className="badge badge-success"><span className="badge-dot" /> abriu</span>
                    ) : (
                      <span className="badge badge-danger" title={r.error_message}><span className="badge-dot" /> falhou</span>
                    )}
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

export default function Reports({ can }) {
  const hasBombas = can('bombas');
  const hasAcesso = can('acesso');
  const [tab, setTab] = useState(hasBombas ? 'bombas' : 'acesso');

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Relatório detalhado por módulo — diferente de Auditoria, que é o log geral do sistema.</p>
        </div>
      </div>

      {hasBombas && hasAcesso && (
        <div className="tabs">
          <button className={`tab ${tab === 'bombas' ? 'active' : ''}`} onClick={() => setTab('bombas')}>
            Bombas
          </button>
          <button className={`tab ${tab === 'acesso' ? 'active' : ''}`} onClick={() => setTab('acesso')}>
            Acessos
          </button>
        </div>
      )}

      {tab === 'bombas' && hasBombas && <BombasReport />}
      {tab === 'acesso' && hasAcesso && <AcessoReport />}
    </>
  );
}
