// Câmera IP avulsa (Hikvision) apontada pro portão/porteiro — sem relação
// com a API do equipamento de acesso em si, é só pra visualização. Usa a
// ISAPI da Hikvision (mesma família de autenticação Digest da SS 3532 MF,
// ver httpDigest.js), pedindo uma FOTO (JPEG) a cada chamada em vez de
// stream de vídeo de verdade — navegador não toca RTSP nativamente, e pedir
// uma foto a cada 1-2s (o frontend decide o intervalo) já é o bastante pra
// ver se o portão está parado/abrindo/aberto, sem precisar de nenhum
// servidor de transcodificação no meio.
//
// Convenção de canal ISAPI: "<canal><stream>01" vira "<canal>01" pro stream
// principal — câmera standalone quase sempre é canal 1 (-> "101"); ligada
// num NVR, cada canal físico tem seu próprio número (2 -> "201", etc.).
import { digestFetch } from './httpDigest.js';

function snapshotUrl(camera) {
  const scheme = 'http'; // ISAPI não costuma rodar em HTTPS nos modelos comuns de câmera/NVR.
  const channelCode = `${camera.channel || 1}01`;
  return `${scheme}://${camera.host}:${camera.port || 80}/ISAPI/Streaming/channels/${channelCode}/picture`;
}

export async function fetchSnapshot(camera, password) {
  const url = snapshotUrl(camera);
  let res;
  try {
    res = await digestFetch(url, { username: camera.username, password });
  } catch (err) {
    throw new Error(`Não consegui alcançar a câmera em ${camera.host}:${camera.port || 80} (${err.message}).`);
  }
  if (res.status === 401) {
    throw new Error('Câmera recusou usuário/senha.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Câmera respondeu HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}.`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}
