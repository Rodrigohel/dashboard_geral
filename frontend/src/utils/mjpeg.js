// Decodificador manual de MJPEG (multipart/x-mixed-replace) — não existe
// jeito nativo de fazer `fetch()` com header de Authorization e ainda usar
// isso como <img src> direto (câmera IP), então lemos os bytes crus do
// stream e cortamos frame a frame na mão. Cada frame vira um Blob URL: quem
// chama troca o src da <img> e libera a URL anterior.
function indexOfSeq(hay, needle, from) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

const HEADER_SEP = new TextEncoder().encode('\r\n\r\n');

export async function streamMjpegFrames(url, { headers, signal, onFrame, onError }) {
  let res;
  try {
    res = await fetch(url, { headers, signal });
  } catch (err) {
    if (err.name !== 'AbortError') onError(err);
    return;
  }
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      message = (await res.json()).error || message;
    } catch {
      // resposta sem corpo JSON — mantém a mensagem genérica
    }
    onError(new Error(message));
    return;
  }
  const contentType = res.headers.get('content-type') || '';
  const boundaryMatch = contentType.match(/boundary=("?)([^";]+)\1/i);
  if (!boundaryMatch) {
    onError(new Error('Câmera não expôs um stream contínuo nesse endpoint.'));
    return;
  }
  const boundary = new TextEncoder().encode(`--${boundaryMatch[2]}`);
  const reader = res.body.getReader();
  let buffer = new Uint8Array(0);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const merged = new Uint8Array(buffer.length + value.length);
      merged.set(buffer);
      merged.set(value, buffer.length);
      buffer = merged;

      let start = indexOfSeq(buffer, boundary, 0);
      while (start !== -1) {
        const next = indexOfSeq(buffer, boundary, start + boundary.length);
        if (next === -1) break;
        const part = buffer.subarray(start + boundary.length, next);
        const headerEnd = indexOfSeq(part, HEADER_SEP, 0);
        if (headerEnd !== -1) {
          let jpegBytes = part.subarray(headerEnd + HEADER_SEP.length);
          // Cada parte termina com CRLF antes da próxima boundary (parte da
          // moldura do multipart, não da imagem) — tira isso do frame.
          let end = jpegBytes.length;
          if (end >= 2 && jpegBytes[end - 2] === 0x0d && jpegBytes[end - 1] === 0x0a) end -= 2;
          else if (end >= 1 && jpegBytes[end - 1] === 0x0a) end -= 1;
          jpegBytes = jpegBytes.subarray(0, end);
          if (jpegBytes.length > 0) {
            onFrame(URL.createObjectURL(new Blob([jpegBytes], { type: 'image/jpeg' })));
          }
        }
        start = next;
      }
      // Mantém só o que ainda não virou frame (a partir da última boundary vista).
      if (start > 0) buffer = buffer.slice(start);
    }
  } catch (err) {
    if (err.name !== 'AbortError') onError(err);
  }
}
