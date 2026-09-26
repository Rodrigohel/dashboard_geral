import { db } from '../db/sqlite.js';
import { decryptSecret } from './cryptoService.js';
import { testConnection } from './accessControlClient.js';

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
        db.prepare(
          "UPDATE access_devices SET last_status = 'offline', last_checked_at = datetime('now'), last_error = ? WHERE id = ?"
        ).run(err.message || 'Falha desconhecida', device.id);
      }
    })
  );
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
