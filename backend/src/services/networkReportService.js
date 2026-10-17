// Relatório de quedas — Rede usa o histórico que o painel original já tem
// pronto (retroativo, qualquer período); Interfone usa o log próprio do
// Portal (interfone_extension_events, ver interfoneHealthPoller.js), que só
// existe a partir de quando esse poller começou a rodar (sem como voltar no
// tempo, diferente de Rede).
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';

async function gatewayFetch(moduleKey, path) {
  const gw = getGatewayConfig(moduleKey);
  if (!gw.configured) throw new Error(`Painel de ${moduleKey} ainda não foi configurado (ver Configurações → Gateways).`);
  const token = await getServiceToken(moduleKey);
  const res = await fetch(`${gw.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : body.data || [];
}

function isDropLabel(label) {
  return /offline|caiu|queda|down/i.test(label || '');
}
function isRecoveryLabel(label) {
  return /online|recuper|voltou|subiu/i.test(label || '');
}

function normalizeRange(from, to) {
  const toMs = to ? new Date(`${to}T23:59:59`).getTime() : Date.now();
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : toMs - 30 * 24 * 3600 * 1000;
  return { fromMs, toMs };
}

// Top 3 maiores quedas por equipamento/ramal — pedido do Rodrigo: "os
// últimos dois ou três maiores tempos... e dia". `outages` já vem como
// [{ at, durationMs }], não precisa saber a origem (Rede ou Interfone).
function summarizeOutages(outages) {
  const sorted = [...outages].sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
  return sorted.map((o) => ({ at: o.at, durationMs: o.durationMs }));
}

export async function getRedeDowntimeReport({ from, to }) {
  const { fromMs, toMs } = normalizeRange(from, to);
  const devices = await gatewayFetch('rede', '/api/devices');
  // O painel original não filtra por data na própria API — pede um limite
  // alto e filtra aqui (mesmo período pode ter poucas ou muitas quedas,
  // 5000 cobre folgado qualquer instalação real).
  const events = await gatewayFetch('rede', '/api/history?limit=5000');
  const inRange = events.filter((e) => {
    const t = new Date(e.at).getTime();
    return t >= fromMs && t <= toMs;
  });

  const byDevice = {};
  for (const e of inRange) {
    const id = String(e.device?.id ?? e.device?.name ?? 'desconhecido');
    if (!byDevice[id]) byDevice[id] = { drops: 0, outages: [] };
    if (isDropLabel(e.eventLabel)) byDevice[id].drops++;
    if (isRecoveryLabel(e.eventLabel) && e.durationMs) byDevice[id].outages.push({ at: e.at, durationMs: e.durationMs });
  }

  // Uptime % no período: o painel já calcula isso por dia (uptime-heatmap);
  // pede dias suficientes pra cobrir desde "from" até hoje e filtra só os
  // dias dentro do período pedido, em vez de recalcular do zero aqui.
  const daysSpan = Math.max(1, Math.ceil((Date.now() - fromMs) / 86400000) + 1);
  const heatmapResults = await Promise.allSettled(
    devices.map((d) => gatewayFetch('rede', `/api/devices/${d.id}/uptime-heatmap?days=${daysSpan}`))
  );

  return devices
    .map((d, i) => {
      const id = String(d.id);
      const agg = byDevice[id] || { drops: 0, outages: [] };
      let uptimePercent = null;
      const hr = heatmapResults[i];
      if (hr.status === 'fulfilled') {
        const inPeriod = hr.value.filter((h) => {
          const t = new Date(`${h.date}T12:00:00`).getTime();
          return t >= fromMs && t <= toMs && h.uptimePercent != null;
        });
        if (inPeriod.length > 0) {
          uptimePercent = Math.round((inPeriod.reduce((s, h) => s + h.uptimePercent, 0) / inPeriod.length) * 10) / 10;
        }
      }
      const topOutages = summarizeOutages(agg.outages);
      return {
        name: d.name,
        drops: agg.drops,
        uptimePercent,
        topOutages,
      };
    })
    .sort((a, b) => b.drops - a.drops);
}

export async function getInterfoneDowntimeReport({ from, to }) {
  const { fromMs, toMs } = normalizeRange(from, to);
  const rows = db
    .prepare('SELECT extension_number, extension_name, state, created_at FROM interfone_extension_events ORDER BY created_at ASC, id ASC')
    .all();

  const open = {}; // número -> { startMs, name }
  const outagesByExt = {}; // número -> { name, drops, outages: [...] }

  for (const row of rows) {
    const isoAt = row.created_at.replace(' ', 'T') + 'Z';
    const atMs = new Date(isoAt).getTime();
    const num = row.extension_number;
    if (!outagesByExt[num]) outagesByExt[num] = { name: row.extension_name, drops: 0, outages: [] };
    outagesByExt[num].name = row.extension_name || outagesByExt[num].name;

    if (row.state === 'offline') {
      open[num] = { startMs: atMs, startIso: isoAt };
      if (atMs >= fromMs && atMs <= toMs) outagesByExt[num].drops++;
    } else if (row.state === 'online' && open[num]) {
      const durationMs = atMs - open[num].startMs;
      // A queda "pertence" ao período se ela TERMINOU dentro do período
      // pedido — mesmo critério de onde contar a duração.
      if (atMs >= fromMs && atMs <= toMs) outagesByExt[num].outages.push({ at: open[num].startIso, durationMs });
      delete open[num];
    }
  }
  // Ramal que caiu e continua offline até agora — conta como queda em
  // andamento (duração até o instante atual), igual ativação de bomba
  // "ainda ligada".
  const nowMs = Date.now();
  for (const [num, o] of Object.entries(open)) {
    if (o.startMs >= fromMs && o.startMs <= toMs && outagesByExt[num]) {
      outagesByExt[num].outages.push({ at: o.startIso, durationMs: nowMs - o.startMs, ongoing: true });
    }
  }

  // % de disponibilidade usa como início do período o que vier DEPOIS: o
  // "de" escolhido, ou quando esse log passou a existir (o que for mais
  // recente) — senão um período pedido antes do poller existir mostraria
  // uptime enganoso (100% só porque não tinha nada registrado ainda).
  const earliest = db.prepare('SELECT MIN(created_at) AS m FROM interfone_extension_events').get();
  const monitoringStartMs = earliest?.m ? new Date(earliest.m.replace(' ', 'T') + 'Z').getTime() : null;
  const periodStartMs = monitoringStartMs ? Math.max(fromMs, monitoringStartMs) : fromMs;
  const periodMs = Math.max(1, toMs - periodStartMs);
  return Object.entries(outagesByExt)
    .map(([number, agg]) => {
      const totalOfflineMs = agg.outages.reduce((s, o) => s + o.durationMs, 0);
      const uptimePercent = Math.max(0, Math.round((1 - totalOfflineMs / periodMs) * 1000) / 10);
      return {
        name: agg.name || `Ramal ${number}`,
        drops: agg.drops,
        uptimePercent,
        topOutages: summarizeOutages(agg.outages),
      };
    })
    .sort((a, b) => b.drops - a.drops);
}
