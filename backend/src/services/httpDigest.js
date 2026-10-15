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

function buildAuthHeader({ username, password, method, uri, realm, nonce, opaque, qop, nc }) {
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  if (qop) {
    const qopValue = qop.split(',')[0].trim();
    const ncStr = String(nc).padStart(8, '0');
    const cnonce = crypto.randomBytes(8).toString('hex');
    const response = md5(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qopValue}:${ha2}`);
    return (
      `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
      `qop=${qopValue}, nc=${ncStr}, cnonce="${cnonce}", response="${response}"` +
      (opaque ? `, opaque="${opaque}"` : '')
    );
  }
  const response = md5(`${ha1}:${nonce}:${ha2}`);
  return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"` + (opaque ? `, opaque="${opaque}"` : '');
}

// Guarda o último desafio Digest aceito por host+usuário — reaproveitado na
// próxima chamada pra pular a primeira ida sem senha (que sempre volta 401
// só pra arrancar o desafio). Crítico pro poller de câmera (bate a cada
// poucos ms): sem isso, toda foto pagava DOIS round-trips em vez de um, o
// que é o bastante pra "empatar" com o intervalo do poller numa conexão
// mais lenta (ex.: acessando de fora, não na rede local) e a imagem parecer
// travando. Se o nonce guardado já expirou, o equipamento devolve 401 de
// novo e cai no fluxo normal (refaz o desafio do zero) — nunca quebra,
// só deixa de economizar o round-trip dessa vez.
const digestCache = new Map();

// O contador `nc` (nonce count) do desafio Digest guardado em digestCache é
// um objeto mutável compartilhado por host+usuário — se duas chamadas pro
// MESMO equipamento saírem ao mesmo tempo (ex.: busca de moradores + envio
// de foto + outra tela consultando ao mesmo tempo), uma pode terminar antes
// da outra e mandar um `nc` fora de ordem, que o equipamento recusa como
// nonce inválido/replay. Numa rede local isso quase nunca dá tempo de
// acontecer; atrás de um proxy mais lento (Cloudflare Tunnel) a janela pra
// essa corrida abre bem mais — bateu com o 502/"não responde" visto só no
// equipamento Digest (SS 3532 MF), nunca nos que usam Basic auth. Serializa
// as chamadas por host+usuário (uma de cada vez) pra eliminar a corrida.
const digestQueues = new Map();

export function digestFetch(url, { method = 'GET', username, password, jsonBody } = {}) {
  const host = new URL(url).host;
  const queueKey = `${username}@${host}`;
  const prev = digestQueues.get(queueKey) || Promise.resolve();
  const run = prev.then(
    () => digestFetchSerialized(url, { method, username, password, jsonBody }),
    () => digestFetchSerialized(url, { method, username, password, jsonBody })
  );
  // Nunca deixa a fila travada por uma falha anterior — cada chamada decide
  // seu próprio sucesso/erro (o `.catch` aqui só protege o encadeamento).
  digestQueues.set(queueKey, run.catch(() => {}));
  return run;
}

// Faz a requisição sem autenticação primeiro; se o equipamento responder
// 401 com um desafio Digest, monta o header de autorização e tenta de novo
// — igual o `fetch` faria automaticamente se suportasse Digest nativamente
// (não suporta).
async function digestFetchSerialized(url, { method = 'GET', username, password, jsonBody } = {}) {
  const headers = jsonBody ? { 'Content-Type': 'application/json' } : {};
  const body = jsonBody ? JSON.stringify(jsonBody) : undefined;
  const opts = { method, headers, body, signal: AbortSignal.timeout(8000) };
  const u = new URL(url);
  const uri = u.pathname + u.search;
  const cacheKey = `${username}@${u.host}`;

  const cached = digestCache.get(cacheKey);
  if (cached) {
    cached.nc += 1;
    let res;
    try {
      res = await fetch(url, { ...opts, headers: { ...headers, Authorization: buildAuthHeader({ username, password, method, uri, ...cached }) } });
    } catch (err) {
      throw new Error(`Não consegui alcançar ${url} (${err.message}).`);
    }
    if (res.status !== 401) return res;
    digestCache.delete(cacheKey);
  }

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
  digestCache.set(cacheKey, { realm, nonce, opaque, qop, nc: 1 });

  try {
    return await fetch(url, { ...opts, headers: { ...headers, Authorization: buildAuthHeader({ username, password, method, uri, realm, nonce, opaque, qop, nc: 1 }) } });
  } catch (err) {
    throw new Error(`Não consegui alcançar ${url} (${err.message}).`);
  }
}
