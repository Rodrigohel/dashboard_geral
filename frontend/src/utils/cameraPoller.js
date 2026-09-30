import { api } from '../api/client.js';

// A MESMA câmera física pode estar cadastrada em mais de um equipamento
// (ex.: porteiro e portão apontando pra mesma câmera/DVR) — sem isso, cada
// card pedia foto sozinho, multiplicando o tanto de pedido em cima da
// MESMA câmera e derrubando ela (ficava saindo do ar e voltando no
// Portal). Um poller só por câmera física (identificada por host+porta+
// canal), compartilhado entre todos os cards que apontam pra ela.
const pollers = new Map();

function keyFor(device) {
  return `${device.cameraHost}:${device.cameraPort}/${device.cameraChannel}`;
}

function startPolling(entry) {
  async function tick() {
    try {
      const url = await api.accessDevices.getCameraSnapshotBlobUrl(entry.deviceId);
      const prev = entry.currentUrl;
      entry.currentUrl = url;
      entry.lastError = '';
      if (prev) URL.revokeObjectURL(prev);
      entry.subscribers.forEach((fn) => fn({ src: url, error: '' }));
    } catch (err) {
      entry.lastError = err.message;
      entry.subscribers.forEach((fn) => fn({ src: entry.currentUrl, error: err.message }));
    }
  }
  tick();
  entry.timer = setInterval(tick, 500);
}

// onUpdate(state) é chamado sempre que um frame novo (ou erro) chega.
// Retorna uma função de cancelamento — chame no cleanup do efeito.
export function subscribeCameraSnapshot(device, onUpdate) {
  const key = keyFor(device);
  let entry = pollers.get(key);
  if (!entry) {
    entry = { subscribers: new Set(), deviceId: device.id, currentUrl: null, lastError: '', timer: null };
    pollers.set(key, entry);
    startPolling(entry);
  }
  entry.subscribers.add(onUpdate);
  if (entry.currentUrl || entry.lastError) onUpdate({ src: entry.currentUrl, error: entry.lastError });

  return () => {
    entry.subscribers.delete(onUpdate);
    if (entry.subscribers.size === 0) {
      clearInterval(entry.timer);
      if (entry.currentUrl) URL.revokeObjectURL(entry.currentUrl);
      pollers.delete(key);
    }
  };
}
