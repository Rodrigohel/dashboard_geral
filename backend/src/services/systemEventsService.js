// Log central de tudo que acontece de importante no Portal (ver IDEIAS.md —
// pedido do Rodrigo: "relatório de tudo", liga/desliga bomba, gerador em
// falha, alarme disparado/reconhecido, etc.), pra baixar depois por período
// em Auditoria → Sistema. Login e abertura de porteiro já tinham tabela
// própria (login_events/door_open_events) — ficam lá, e `listSystemEvents`
// junta os três numa lista só, ordenada por data.
import { db } from '../db/sqlite.js';

export function logSystemEvent(type, message, meta) {
  db.prepare('INSERT INTO system_events (type, message, meta) VALUES (?, ?, ?)').run(type, message, meta ? JSON.stringify(meta) : null);
}

function normalizeRange(from, to) {
  // Sem filtro -> últimos 30 dias, pra não devolver o banco inteiro por
  // engano quando a pessoa esquece de escolher uma data.
  const toDate = to ? `${to} 23:59:59` : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const fromDate = from ? `${from} 00:00:00` : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  return { fromDate, toDate };
}

// Une system_events + login_events + door_open_events num formato só —
// é isso que alimenta a tela e o CSV de Auditoria → Sistema.
export function listSystemEvents({ from, to } = {}) {
  const { fromDate, toDate } = normalizeRange(from, to);

  const events = db
    .prepare('SELECT created_at AS createdAt, type, message FROM system_events WHERE created_at BETWEEN ? AND ? ORDER BY id DESC')
    .all(fromDate, toDate);

  const logins = db
    .prepare(
      `SELECT created_at AS createdAt, username, success, ip FROM login_events WHERE created_at BETWEEN ? AND ? ORDER BY id DESC`
    )
    .all(fromDate, toDate)
    .map((r) => ({
      createdAt: r.createdAt,
      type: 'login',
      message: `Login de "${r.username}" (${r.ip || 'IP desconhecido'}) — ${r.success ? 'sucesso' : 'falhou'}`,
    }));

  const doorOpens = db
    .prepare(
      `SELECT created_at AS createdAt, device_name, username, success, error_message FROM door_open_events
       WHERE created_at BETWEEN ? AND ? ORDER BY id DESC`
    )
    .all(fromDate, toDate)
    .map((r) => ({
      createdAt: r.createdAt,
      type: 'acesso.abertura',
      message: `"${r.username}" ${r.success ? 'abriu' : 'tentou abrir e falhou'} "${r.device_name}"${r.error_message ? ` — ${r.error_message}` : ''}`,
    }));

  return [...events, ...logins, ...doorOpens].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
