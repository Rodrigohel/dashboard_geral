import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { api } from '../api/client.js';
import { downloadCsv } from '../utils/csv.js';
import { useBranding } from '../hooks/useBranding.js';

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '—';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

// Completo, com segundos — só pro CSV (lá cabe, não é limitado por
// largura de coluna/folha A4 igual a tabela na tela/PDF).
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString('pt-BR');
}

// Compacto, sem segundos, numa linha só — pra tabela (tela e PDF). Era
// "17/10/2026, 10:08:31" quebrando em duas linhas dentro da coluna, dobrando
// a altura de cada linha da tabela e estourando a largura da folha A4.
function formatDateTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDateBr(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('pt-BR');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

function StatTile({ label, value, sub }) {
  return (
    <div className="surface" style={{ padding: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Cabeçalho que só aparece na impressão/PDF (ver .print-only em layout.css)
// — na tela normal o título já vem do page-header; impresso, o menu/topbar
// somem (.no-print), então o relatório precisa do próprio título + período
// + a logo configurada em Configurações → Marca (pedido do Rodrigo).
function PrintHeader({ title, from, to, branding }) {
  return (
    <div className="print-only" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #0f1424', paddingBottom: 12 }}>
      {branding?.logoUrl && <img src={branding.logoUrl} alt={branding.name} style={{ height: 44, width: 'auto' }} />}
      <div>
        <h2 style={{ margin: 0, fontSize: 19 }}>
          {branding?.name ? `${branding.name} — ` : ''}
          {title}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>
          Período: {formatDateBr(from)} até {formatDateBr(to)} — gerado em {new Date().toLocaleString('pt-BR')}
        </p>
      </div>
    </div>
  );
}

// Botões "Exportar CSV"/"Exportar PDF" — PDF não precisa de lib nenhuma nem
// rota de backend: usa window.print() (some com o menu/filtros via
// .no-print, mostra o PrintHeader via .print-only — ver layout.css) e deixa
// o próprio navegador salvar como PDF no diálogo de impressão, que todo
// navegador (desktop e celular) já tem.
function ExportButtons({ onCsv, disabled }) {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-secondary" onClick={onCsv} disabled={disabled}>
        <Icon name="copy" size={15} /> Exportar CSV
      </button>
      <button className="btn btn-secondary" onClick={() => window.print()} disabled={disabled}>
        <Icon name="download" size={15} /> Exportar PDF
      </button>
    </div>
  );
}

const PUMP_LABEL = { bomba1: 'Bomba 1', bomba2: 'Bomba 2' };

// Mesmos nomes de LEVEL_STOPS (pumpLevel.js) — pra escrever o nível de um
// jeito que qualquer um entende de cara ("72% (Máximo)"), não só o número
// cru (pedido do Rodrigo: "não sei como ficar didático... a pessoa
// entender"). 92% (Segurança) é o pior caso — o poço encheu até a última
// boia antes da bomba responder — por isso vem em vermelho.
const LEVEL_LABEL = { 92: 'Segurança', 72: 'Máximo', 48: 'Médio', 24: 'Mínimo', 6: 'abaixo do mínimo' };
function levelDisplay(percent) {
  return `${percent}% (${LEVEL_LABEL[percent] ?? '—'})`;
}

function BombasReport({ branding }) {
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
      { header: 'Poço encheu em (antes de ligar)', get: (r) => (r.fillSeconds === null ? '' : formatDuration(r.fillSeconds)) },
      { header: 'Até que nível encheu', get: (r) => levelDisplay(r.startLevelPercent) },
      { header: 'Ligou em', get: (r) => formatDateTime(r.startedAt) },
      { header: 'Desligou em', get: (r) => (r.endedAt ? formatDateTime(r.endedAt) : 'ainda ligada') },
      { header: 'Tempo ligada', get: (r) => formatDuration(r.durationSeconds) },
      { header: 'Era a bomba do dia?', get: (r) => (r.wasBombaDoDia ? 'sim' : 'não') },
      { header: 'Ligou junto com a outra?', get: (r) => (r.simultaneous ? 'sim' : 'não') },
    ]);
  }

  // Resumo do período — pedido de melhoria: ver de cara quantas vezes cada
  // bomba ligou, tempo total e quantas simultâneas, sem precisar somar linha
  // por linha.
  const summary = rows && {
    bomba1Count: rows.filter((r) => r.pointKey === 'bomba1').length,
    bomba2Count: rows.filter((r) => r.pointKey === 'bomba2').length,
    bomba1Seconds: rows.filter((r) => r.pointKey === 'bomba1').reduce((s, r) => s + r.durationSeconds, 0),
    bomba2Seconds: rows.filter((r) => r.pointKey === 'bomba2').reduce((s, r) => s + r.durationSeconds, 0),
    simultaneousCount: new Set(rows.filter((r) => r.simultaneous).map((r) => r.startedAt)).size,
  };

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="field-hint">até</span>
          <input className="input" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <ExportButtons onCsv={handleExport} disabled={!rows || rows.length === 0} />
      </div>

      <PrintHeader title="Relatório de Bombas" from={from} to={to} branding={branding} />

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
      {!error && summary && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <StatTile label="Bomba 1 — ligou" value={`${summary.bomba1Count}x`} sub={formatDuration(summary.bomba1Seconds) + ' no total'} />
          <StatTile label="Bomba 2 — ligou" value={`${summary.bomba2Count}x`} sub={formatDuration(summary.bomba2Seconds) + ' no total'} />
          <StatTile label="Ativações simultâneas" value={summary.simultaneousCount} sub={summary.simultaneousCount > 0 ? 'bomba 1 e 2 juntas' : 'nenhuma'} />
        </div>
      )}
      {!error && rows !== null && rows.length > 0 && (
        <>
          <p className="field-hint no-print" style={{ marginBottom: 8 }}>
            "Poço encheu em" + "Até" explicam a duração de cada ciclo: o poço levou um tempo pra subir até aquele
            nível (quanto mais alto, mais água acumulada) — só depois disso a bomba ligou. Por isso o mesmo volume de
            água pode levar 20min num dia e 1h noutro: não é a bomba mais lenta, é o poço que encheu mais antes de
            ligar.
          </p>
          <div className="table-wrap">
          <table className="data-table reports-table">
            <thead>
              <tr>
                <th>Bomba</th>
                <th className="hide-mobile" title="Quanto tempo o poço levou pra encher até esse nível, desde a última vez que uma bomba desligou">
                  Poço encheu em
                </th>
                <th className="col-narrow" title="Até onde o poço encheu antes da bomba ligar — explica por que um ciclo demora mais que outro: quanto mais alto, mais água pra tirar">
                  Até
                </th>
                <th>Ligou em</th>
                <th>Desligou em</th>
                <th className="col-narrow">Tempo ligada</th>
                <th className="hide-mobile col-narrow">Do dia?</th>
                <th className="hide-mobile col-narrow">Simultânea?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.simultaneous ? 'row-tone-warning' : undefined}>
                  <td style={{ fontWeight: 600 }}>
                    <span style={{ color: r.pointKey === 'bomba1' ? 'var(--chart-series-1)' : 'var(--chart-series-2)' }}>●</span> {PUMP_LABEL[r.pointKey]}
                  </td>
                  <td className="hide-mobile">{r.fillSeconds === null ? '—' : formatDuration(r.fillSeconds)}</td>
                  <td className="col-narrow" style={r.startLevelPercent === 92 ? { color: 'var(--danger-500)', fontWeight: 700 } : undefined}>
                    {levelDisplay(r.startLevelPercent)}
                  </td>
                  <td>{formatDateTimeShort(r.startedAt)}</td>
                  <td>{r.endedAt ? formatDateTimeShort(r.endedAt) : <span className="badge badge-success">ligada agora</span>}</td>
                  <td className="col-narrow">{formatDuration(r.durationSeconds)}</td>
                  <td className="hide-mobile col-narrow">{r.wasBombaDoDia ? 'sim' : 'não'}</td>
                  <td className="hide-mobile col-narrow">
                    {r.simultaneous ? (
                      <span className="badge badge-warning" title="Bomba 1 e Bomba 2 ligadas ao mesmo tempo">
                        <span className="badge-dot" /> sim
                      </span>
                    ) : (
                      'não'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </>
  );
}

function AcessoReport({ branding }) {
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

  const summary = rows && {
    total: rows.length,
    success: rows.filter((r) => r.success).length,
    failed: rows.filter((r) => !r.success).length,
    byDevice: rows.reduce((set, r) => set.add(r.device_name), new Set()).size,
  };

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="field-hint">até</span>
          <input className="input" type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <ExportButtons onCsv={handleExport} disabled={!rows || rows.length === 0} />
      </div>

      <PrintHeader title="Relatório de Acessos" from={from} to={to} branding={branding} />

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
      {!error && summary && rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <StatTile label="Total de aberturas" value={summary.total} sub={`${summary.byDevice} porteiro(s)`} />
          <StatTile label="Com sucesso" value={summary.success} />
          <StatTile label="Falharam" value={summary.failed} sub={summary.failed > 0 ? 'ver detalhe na tabela' : undefined} />
        </div>
      )}
      {!error && rows !== null && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table reports-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Usuário</th>
                <th>Porteiro</th>
                <th className="col-narrow">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{formatDateTimeShort(r.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{r.username}</td>
                  <td>{r.device_name}</td>
                  <td className="col-narrow">
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

// Acesso à tela inteira já é controlado por "relatorios.ver" (ver App.jsx)
// — diferente da versão anterior, aqui dentro as duas abas aparecem pra
// quem tiver essa permissão, sem depender também de ter os módulos
// Bombas/Acesso liberados (pedido do Rodrigo: permissão própria de
// relatório, não "herdada" do módulo).
export default function Reports() {
  const [tab, setTab] = useState('bombas');
  const branding = useBranding();

  return (
    <>
      {/* Linha mais fina que o padrão de outras tabelas do Portal (essa
          tem mais colunas, precisa de mais densidade) — e "col-narrow"
          encolhe a coluna até caber só o "sim"/"não", em vez de ficar do
          tamanho do cabeçalho ("Bomba do dia?"/"Simultânea?"), que sobrava
          um espaço vazio enorme (pedido do Rodrigo). */}
      <style>{`
        .reports-table th, .reports-table td { padding: 7px 10px !important; font-size: 13px; }
        .reports-table td.col-narrow { width: 1%; white-space: nowrap; text-align: center; }
        .reports-table th.col-narrow { width: 1%; white-space: normal !important; text-align: center; }
      `}</style>
      <div className="page-header no-print">
        <div>
          <h1>Relatórios</h1>
          <p>Relatório detalhado por módulo — diferente de Auditoria, que é o log geral do sistema.</p>
        </div>
      </div>

      <div className="tabs no-print">
        <button className={`tab ${tab === 'bombas' ? 'active' : ''}`} onClick={() => setTab('bombas')}>
          Bombas
        </button>
        <button className={`tab ${tab === 'acesso' ? 'active' : ''}`} onClick={() => setTab('acesso')}>
          Acessos
        </button>
      </div>

      {tab === 'bombas' && <BombasReport branding={branding} />}
      {tab === 'acesso' && <AcessoReport branding={branding} />}
    </>
  );
}
