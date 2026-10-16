// Prioridade por equipamento de Rede/Interfone (ver IDEIAS.md) — diferente
// de Acesso (equipamentos cadastrados NESTE banco, id local estável), Rede e
// Interfone são painéis à parte (ver gatewayService.js): cada equipamento só
// existe com um id lá. Em vez de reinventar um cadastro de equipamento aqui,
// aproveitamos o que o painel de Rede já tem — um campo `critical` (coluna
// `critical` em backend/src/db/sqlite.js do Debian_dashboard; NÃO é o
// `favorite`/estrela, que é outro campo — confirmado lendo a branch de
// verdade do painel, que tinha commits novos não vistos numa leitura
// anterior) — como o PRÉ-FILTRO de quais equipamentos aparecem como
// candidato na tela de Prioridades do Portal. Entre esses, o Rodrigo escolhe
// explicitamente (checkbox) quais também insistem via Telegram, guardado
// aqui em `external_device_priority`. Interfone não tem esse campo — por
// decisão do Rodrigo, não vai ganhar (fica só com o alarme agregado, ver
// networkAlarmPoller.js).
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';

const CRITICAL_LIST_PATH = {
  rede: '/api/devices',
};

export function supportsCriticalPriority(moduleKey) {
  return Boolean(CRITICAL_LIST_PATH[moduleKey]);
}

function getPrioritiesMap(moduleKey) {
  const rows = db.prepare('SELECT device_id, priority FROM external_device_priority WHERE module_key = ?').all(moduleKey);
  const map = {};
  for (const r of rows) map[r.device_id] = Boolean(r.priority);
  return map;
}

export function setExternalDevicePriority(moduleKey, deviceId, priority) {
  db.prepare(
    `INSERT INTO external_device_priority (module_key, device_id, priority) VALUES (?, ?, ?)
     ON CONFLICT(module_key, device_id) DO UPDATE SET priority = excluded.priority`
  ).run(moduleKey, String(deviceId), priority ? 1 : 0);
}

// Lê a lista COMPLETA (não só o resumo de contagem) do painel, filtra só os
// equipamentos já marcados como CRÍTICO lá, e junta com a flag de
// prioridade salva aqui — é essa lista que a tela de Prioridades mostra.
// `totalDevices`/`criticalCount` vão junto pra diagnosticar sem adivinhar:
// se `totalDevices` vier 0, o gateway não está devolvendo nada (configuração/
// token); se vier >0 e `criticalCount` 0, é que nenhum está marcado como
// crítico do jeito que o Portal reconhece.
export async function listCriticalExternalDevices(moduleKey) {
  const path = CRITICAL_LIST_PATH[moduleKey];
  if (!path) return { devices: [], totalDevices: 0, criticalCount: 0 };
  const gw = getGatewayConfig(moduleKey);
  if (!gw.configured) return { devices: [], totalDevices: 0, criticalCount: 0 };

  const token = await getServiceToken(moduleKey);
  const res = await fetch(`${gw.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const all = Array.isArray(body) ? body : body.data || [];
  const priorities = getPrioritiesMap(moduleKey);
  const now = Date.now();

  // `Boolean(...)` em vez de `=== true`: se o painel mandar o campo como
  // 1/0 (em vez de true/false) isso não pode fazer a lista vir vazia.
  const critical = all.filter((d) => Boolean(d.critical));
  const devices = critical.map((d) => ({
    id: String(d.id),
    name: d.name,
    // "Em manutenção" lá no painel de Rede também silencia por aqui — sem
    // isso, o Portal continuaria insistindo num equipamento que o Rodrigo
    // já marcou como "sei que caiu, tô resolvendo" no outro painel.
    offline: d.status === 'offline' && !(d.maintenanceUntil && new Date(d.maintenanceUntil).getTime() > now),
    priority: Boolean(priorities[String(d.id)]),
  }));
  return { devices, totalDevices: all.length, criticalCount: devices.length };
}
