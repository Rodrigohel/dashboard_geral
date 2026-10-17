// Grava transição online/offline de cada ramal (ver interfone_extension_events
// em sqlite.js) — o painel original do Interfone não guarda esse histórico,
// só o estado atual, então o relatório de quedas (ver Relatórios → Interfone)
// só existe a partir de quando esse poller começar a rodar, dia a dia daqui
// pra frente (igual pump_events, mas sem como voltar no tempo).
import { db } from '../db/sqlite.js';
import { getGatewayConfig, getServiceToken } from './gatewayService.js';

const POLL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

let lastKnown = {}; // número do ramal -> 'online' | 'offline'
let hasBaseline = false;

async function fetchExtensions() {
  const gw = getGatewayConfig('interfone');
  if (!gw.configured) return null;
  const token = await getServiceToken('interfone');
  const res = await fetch(`${gw.baseUrl}/api/extensions`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : body.data || [];
}

async function pollOnce() {
  let extensions;
  try {
    extensions = await fetchExtensions();
  } catch {
    // Painel fora do ar / token expirado nessa rodada — só pula, igual os
    // outros pollers (não grava evento falso por uma falha pontual).
    return;
  }
  if (!extensions) return;

  // Primeira leitura só vira a "foto inicial" (lastKnown) — não grava
  // evento nenhum, senão todo ramal já online no boot viraria uma
  // "transição" falsa assim que o Portal sobe (mesma lógica de
  // pumpStationHistoryPoller.js).
  for (const ext of extensions) {
    const number = String(ext.number);
    const state = ext.state === 'offline' ? 'offline' : 'online';
    if (hasBaseline && lastKnown[number] !== undefined && lastKnown[number] !== state) {
      db.prepare('INSERT INTO interfone_extension_events (extension_number, extension_name, state) VALUES (?, ?, ?)').run(
        number,
        ext.name || '',
        state
      );
    }
    lastKnown[number] = state;
  }
  hasBaseline = true;
}

export function startInterfoneHealthPoller() {
  setTimeout(() => {
    pollOnce();
    setInterval(pollOnce, POLL_MS);
  }, INITIAL_DELAY_MS);
}
