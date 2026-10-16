import { db } from '../db/sqlite.js';
import { decryptSecret } from './cryptoService.js';
import { testConnection } from './accessControlClient.js';
import { notifyDeviceOffline } from './pushService.js';
import { checkAccessDeviceAlarms } from './telegramService.js';

const POLL_MS = 5 * 60 * 1000;
// Pequeno atraso pro servidor terminar de subir antes da primeira rodada —
// evita concorrer com o resto da inicialização.
const INITIAL_DELAY_MS = 10 * 1000;

async function pollOnce() {
  const devices = db.prepare('SELECT * FROM access_devices').all();
  await Promise.allSettled(
    devices.map(async (device) => {
      try {
        await testConnection(device, decryptSecret(device.device_password_enc));
        db.prepare(
          "UPDATE access_devices SET last_status = 'online', last_checked_at = datetime('now'), last_error = '' WHERE id = ?"
        ).run(device.id);
      } catch (err) {
        const wasOffline = device.last_status === 'offline';
        db.prepare(
          "UPDATE access_devices SET last_status = 'offline', last_checked_at = datetime('now'), last_error = ? WHERE id = ?"
        ).run(err.message || 'Falha desconhecida', device.id);
        // Só avisa na transição online/desconhecido -> offline, não em
        // toda rodada de checagem enquanto continuar caído (senão seria um
        // push a cada 5 minutos até alguém consertar).
        if (!wasOffline) notifyDeviceOffline(device);
      }
    })
  );

  // Alertas via Telegram (ver IDEIAS.md) — checa a cada rodada, não só na
  // transição, pro mesmo motivo do pumpStationHistoryPoller: se o Portal
  // reiniciar com um porteiro já offline, ainda assim quer avisar/insistir.
  const freshDevices = db.prepare('SELECT * FROM access_devices').all();
  checkAccessDeviceAlarms(freshDevices).catch(() => {});
}

// Checagem periódica e silenciosa de saúde de cada porteiro cadastrado —
// mesmo endpoint leve (system/info) já usado pelo botão "Testar conexão",
// só que rodando sozinho em segundo plano pra alimentar o status ao vivo
// mostrado na Início e na lista de equipamentos.
export function startDeviceHealthPoller() {
  setTimeout(() => {
    pollOnce();
    setInterval(pollOnce, POLL_MS);
  }, INITIAL_DELAY_MS);
}
