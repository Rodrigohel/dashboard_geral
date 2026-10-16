// Prioridade por equipamento de Rede/Interfone (ver IDEIAS.md) — diferente
// de Acesso (equipamentos cadastrados NESTE banco, id local estável), Rede e
// Interfone são painéis à parte (ver gatewayService.js): cada equipamento só
// existe com um id lá. Em vez de reinventar um cadastro de equipamento
// aqui, aproveitamos o que o painel de Rede já tem — um campo "favorito"
// (confirmado no código do painel: backend/src/services/devicesService.js
// do Debian_dashboard, coluna `favorite`) — como o PRÉ-FILTRO de quais
// equipamentos nem aparecem como candidato na tela de Prioridades do
// Portal. Entre esses, o Rodrigo escolhe explicitamente (checkbox) quais
// também insistem via Telegram, guardado aqui em `external_device_priority`.
// Interfone ainda não tem campo equivalente (o Rodrigo disse que vai
// adicionar) — por isso só Rede está coberto; Interfone continua com o
// alarme agregado antigo até lá (ver networkAlarmPoller.js).
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';

const FAVORITE_LIST_PATH = {
  rede: '/api/devices',
};

export function supportsFavoritePriority(moduleKey) {
  return Boolean(FAVORITE_LIST_PATH[moduleKey]);
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
// equipamentos já marcados como favorito LÁ, e junta com a flag de
// prioridade salva aqui — é essa lista que a tela de Prioridades mostra.
export async function listFavoritedExternalDevices(moduleKey) {
  const path = FAVORITE_LIST_PATH[moduleKey];
  if (!path) return [];
  const gw = getGatewayConfig(moduleKey);
  if (!gw.configured) return [];

  const token = await getServiceToken(moduleKey);
  const res = await fetch(`${gw.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const devices = Array.isArray(body) ? body : body.data || [];
  const priorities = getPrioritiesMap(moduleKey);
  const now = Date.now();

  return devices
    .filter((d) => d.favorite === true)
    .map((d) => ({
      id: String(d.id),
      name: d.name,
      // "Em manutenção" lá no painel de Rede também silencia por aqui —
      // sem isso, o Portal continuaria insistindo num equipamento que o
      // Rodrigo já marcou como "sei que caiu, tô resolvendo" no outro painel.
      offline: d.status === 'offline' && !(d.maintenanceUntil && new Date(d.maintenanceUntil).getTime() > now),
      priority: Boolean(priorities[String(d.id)]),
    }));
}
