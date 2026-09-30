// HTTP Digest Auth (RFC 2617) — usado por mais de um fabricante/linha de
// equipamento (Intelbras SS 3532 MF/Bio-T e câmeras Hikvision compartilham
// essa mesma convenção de autenticação, família Dahua/ISAPI). Centralizado
// aqui pra não duplicar em cada cliente.
import crypto from 'node:crypto';

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function parseDigestChallenge(header) {
  const parts = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m;
  while ((m = re.exec(header))) parts[m[1].toLowerCase()] = m[2] ?? m[3];
  return parts;
}

// Faz a requisição sem autenticação primeiro; se o equipamento responder
// 401 com um desafio Digest, monta o header de autorização e tenta de novo
// — igual o `fetch` faria automaticamente se suportasse Digest nativamente
// (não suporta).
export async function digestFetch(url, { method = 'GET', username, password, jsonBody } = {}) {
  const headers = jsonBody ? { 'Content-Type': 'application/json' } : {};
  const body = jsonBody ? JSON.stringify(jsonBody) : undefined;
  const opts = { method, headers, body, signal: AbortSignal.timeout(8000) };

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(`Não consegui alcançar ${url} (${err.message}).`);
  }
  if (res.status !== 401) return res;

  const challenge = res.headers.get('www-authenticate') || '';
  if (!/digest/i.test(challenge)) {
    throw new Error(`Equipamento pediu autenticação ${challenge.split(' ')[0] || 'desconhecida'}, esperava Digest.`);
  }
  const { realm, nonce, opaque, qop } = parseDigestChallenge(challenge);
  const u = new URL(url);
  const uri = u.pathname + u.search;
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  let authHeader;
  if (qop) {
    const qopValue = qop.split(',')[0].trim();
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qopValue}:${ha2}`);
    authHeader =
      `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
      `qop=${qopValue}, nc=${nc}, cnonce="${cnonce}", response="${response}"` +
      (opaque ? `, opaque="${opaque}"` : '');
  } else {
    const response = md5(`${ha1}:${nonce}:${ha2}`);
    authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"` + (opaque ? `, opaque="${opaque}"` : '');
  }

  try {
    return await fetch(url, { ...opts, headers: { ...headers, Authorization: authHeader } });
  } catch (err) {
    throw new Error(`Não consegui alcançar ${url} (${err.message}).`);
  }
}
