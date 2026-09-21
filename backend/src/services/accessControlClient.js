// Cliente para os controladores de acesso facial Intelbras — a XPE 3200 IP
// Face e a SS 3532 MF usam DUAS APIs diferentes entre si (fabricante é o
// mesmo, protocolo não é). Cada uma tem sua implementação isolada abaixo,
// escolhida por `device.model`.
//
// XPE 3200 IP Face — validada contra hardware real (fonte: implementação
// de terceiros já rodando em produção, https://github.com/Sys-Bernardo-Rodrigues/zapy_rasp,
// citando o PDF oficial "XPE3200_IP_FACE_Http_API_de_Integração.pdf"):
//   - IMPORTANTE: a API vem DESLIGADA de fábrica — precisa habilitar em
//     "Segurança > HTTP API" na interface web do próprio equipamento antes
//     de qualquer chamada funcionar.
//   - `POST /api/{target}/{action}`, corpo `{ target, action, data }`,
//     autenticação HTTP Basic (mesmo usuário/senha do login web).
//   - Resposta `{ retcode, action, message, data }` — `retcode === 0` é
//     sucesso.
//
// SS 3532 MF (linha Bio-T) — AINDA NÃO VALIDADA contra hardware real. A
// implementação de referência usada aqui é baseada só na documentação
// (https://integracao.intelbras.com.br/linha-de-faciais), sem confirmação
// em campo — trate como ponto de partida, não como certeza:
//   - `GET/POST /cgi-bin/{Recurso}.cgi?action=...`, autenticação HTTP
//     Digest (RFC 2617) real, resposta em TEXTO PURO ("OK" ou um código de
//     erro), não JSON.
//   - Não existe endpoint de listagem de usuários na implementação de
//     referência — listar usuários não é suportado ainda para este modelo.
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { config } from '../config.js';

function baseUrlOf(device) {
  const scheme = device.use_https ? 'https' : 'http';
  return `${scheme}://${device.host}:${device.port}`;
}

// Retransmissão temporária de foto para a XPE 3200: descoberto que o campo
// `FaceUrl` do `user/set` faz o próprio equipamento BUSCAR a foto de um link
// (confirmado testando contra hardware real) — diferente de `FaceImage`
// (nunca existiu de verdade) ou de mandar bytes direto (a API não aceita).
// Guarda o arquivo em memória por pouco tempo, só até o equipamento buscar.
const faceRelayTokens = new Map(); // token -> { buffer, mimetype, expiresAt }
const FACE_RELAY_TTL_MS = 60_000;

function cleanupExpiredFaceRelayTokens() {
  const now = Date.now();
  for (const [token, entry] of faceRelayTokens) {
    if (entry.expiresAt < now) faceRelayTokens.delete(token);
  }
}

export function registerFaceRelayToken(buffer, mimetype) {
  cleanupExpiredFaceRelayTokens();
  const token = crypto.randomBytes(24).toString('hex');
  faceRelayTokens.set(token, { buffer, mimetype: mimetype || 'image/jpeg', expiresAt: Date.now() + FACE_RELAY_TTL_MS });
  return token;
}

// Não remove no primeiro uso — o equipamento pode tentar buscar mais de uma
// vez (retry de rede); o token expira sozinho pelo TTL.
export function getFaceRelayToken(token) {
  cleanupExpiredFaceRelayTokens();
  return faceRelayTokens.get(token) || null;
}

function deriveRegistration(name) {
  const slug = String(name || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'user';
  return `${slug}${Math.random().toString(36).slice(2, 6)}`;
}

// ======================================================================
// XPE 3200 IP Face
// ======================================================================

async function xpeCall(device, password, target, action, data) {
  const url = `${baseUrlOf(device)}/api/${target}/${action}`;
  const auth = 'Basic ' + Buffer.from(`${device.device_username}:${password}`).toString('base64');

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ target, action, data: data ?? {} }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new Error(`Não consegui alcançar ${url} (${err.message}).`);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Resposta inesperada do equipamento (${res.status}): ${text.slice(0, 200)}. ` +
        `Confira se a "API HTTP" está habilitada em Segurança na interface web do equipamento.`
    );
  }

  if (res.status === 401) throw new Error('Usuário/senha do equipamento recusados (HTTP 401).');
  if (!res.ok || json.retcode !== 0) {
    // O equipamento às vezes só devolve "Failed" sem mais detalhe — inclui
    // sempre a chamada e o retcode junto, senão a mensagem fica inútil.
    const detail = json.message ? `"${json.message}"` : 'sem mensagem';
    throw new Error(`Equipamento recusou ${target}/${action} (retcode ${json.retcode}, ${detail}).`);
  }
  return json.data || {};
}

function xpeFromItem(item) {
  return {
    id: item.ID,
    name: item.Name,
    registration: item.UserID,
    apartment: item.LiftFloorNum || '',
    // Confirmado via captura real de `user/get`: não existe campo de foto em
    // base64 nenhuma hora — o que existe é `FaceStatus` (0/1) + `FaceID`
    // (URL da foto, servida pelo próprio equipamento).
    hasFace: item.FaceStatus === 1,
    cardNumber: item.CardCode || null,
    // Validity aceita outros valores além de 0, mas o formato não está
    // confirmado — todo usuário cadastrado pela própria interface do
    // equipamento está com Validity=0 (sem prazo), então não editamos esse
    // campo pelo Portal por enquanto.
    expiration: null,
  };
}

// Busca o binário de uma URL absoluta que o próprio equipamento devolveu
// (ex.: FaceID). Usa os módulos nativos (não `fetch`) porque essas URLs vêm
// em HTTPS com certificado autoassinado do equipamento — precisa aceitar sem
// validar (mesmo aparelho da rede local que já autenticamos via API) — e o
// firmware usa uma chave Diffie-Hellman fraca que o OpenSSL moderno recusa
// por padrão ("dh key too small"), por isso baixa o nível de segurança do
// TLS só nessa chamada.
function fetchDeviceBinary(url, auth) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const mod = isHttps ? https : http;
    const opts = {
      headers: { Authorization: auth },
      timeout: 8000,
      ...(isHttps
        ? { agent: new https.Agent({ rejectUnauthorized: false, ciphers: 'DEFAULT@SECLEVEL=1' }) }
        : {}),
    };
    const req = mod.get(url, opts, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`Equipamento recusou a foto (HTTP ${res.statusCode}).`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao baixar a foto do equipamento.')));
    req.on('error', reject);
  });
}

// NOTE: formato exato do CardCode não confirmado por documentação oficial
// (só sabemos que é hex de 4 bytes com ordem de bytes invertida) — valide
// contra um cartão real antes de depender disso em produção.
function toXpeCardCode(cardNumber) {
  const num = Number(cardNumber);
  if (!Number.isFinite(num)) return String(cardNumber);
  const hex = Math.trunc(num).toString(16).padStart(8, '0').toUpperCase();
  const bytes = hex.match(/.{2}/g) || [];
  return bytes.reverse().join(',');
}

function xpeBuildItem(input) {
  // CardCode/PrivatePIN sempre presentes (mesmo vazios) de propósito: no
  // update, isso é um "merge" com o item existente (ver xpeUpdateUser) —
  // se esses campos só aparecessem quando preenchidos, limpar o cartão ou
  // a senha no formulário (deixando o campo em branco) não tinha efeito
  // nenhum, porque o valor antigo sobrevivia ao merge. Foi exatamente o
  // bug relatado: excluir o cartão no Portal não excluía no equipamento.
  return {
    UserID: input.registration || deriveRegistration(input.name),
    Name: input.name,
    Validity: 0,
    // O nome real desse campo é "WebRelay", não "Relay" — confirmado via
    // captura real de `user/get` (todo usuário cadastrado pela própria
    // interface do equipamento está com WebRelay="0"; "Relay" é um nome
    // que a API simplesmente ignora, ficando com o padrão do equipamento).
    WebRelay: '0',
    PrivatePIN: input.password || '',
    CardCode: input.cardNumber ? toXpeCardCode(input.cardNumber) : '',
    // Campo que a interface do próprio equipamento chama de "Apartamento"
    // (controla o andar liberado no elevador) — confirmado via captura real.
    LiftFloorNum: input.apartment || '0',
  };
}

async function xpeFindByUserId(device, password, userId) {
  const data = await xpeCall(device, password, 'user', 'get');
  return (data.item || []).find((it) => it.UserID === userId) || null;
}

async function xpeFindById(device, password, id) {
  const data = await xpeCall(device, password, 'user', 'get');
  return (data.item || []).find((it) => String(it.ID) === String(id)) || null;
}

async function xpeListUsers(device, password) {
  const data = await xpeCall(device, password, 'user', 'get');
  return (data.item || []).map(xpeFromItem);
}

async function xpeCreateUser(device, password, input) {
  const item = xpeBuildItem(input);
  await xpeCall(device, password, 'user', 'add', { item: [item] });
  // A resposta de "add" não tem formato confirmado — busca o item recém
  // criado pelo UserID pra descobrir o ID interno que os outros métodos
  // (set/del) exigem.
  const created = await xpeFindByUserId(device, password, item.UserID);
  return created ? xpeFromItem(created) : { id: item.UserID, ...xpeFromItem({ ...item, ID: item.UserID }) };
}

// Só os campos que a própria API documenta para "user/set" (ver
// xpeBuildItem) — em vez de reenviar o item inteiro exatamente como
// "user/get" devolveu. Reenviar o registro cru de volta pode incluir
// campos somente-leitura ou num formato que "set" não aceita de volta
// (ex.: fica um "Failed" genérico do equipamento, sem detalhe nenhum).
function xpeSafeExisting(existing) {
  if (!existing) return {};
  return {
    UserID: existing.UserID,
    Name: existing.Name,
    Validity: existing.Validity ?? 0,
    WebRelay: existing.WebRelay ?? '0',
    PrivatePIN: existing.PrivatePIN ?? '',
    CardCode: existing.CardCode ?? '',
    LiftFloorNum: existing.LiftFloorNum ?? '0',
  };
}

async function xpeUpdateUser(device, password, userId, input) {
  // user/set substitui o item inteiro (não é PATCH) — busca o existente e
  // mescla, senão campos não enviados no formulário (ex.: Apartamento) somem.
  const existing = await xpeFindById(device, password, userId);
  const merged = { ...xpeSafeExisting(existing), ...xpeBuildItem(input), ID: String(userId) };
  await xpeCall(device, password, 'user', 'set', { item: [merged] });
  return xpeFromItem(merged);
}

async function xpeDeleteUser(device, password, userId) {
  // Endpoint de exclusão não está confirmado por documentação/código de
  // referência — por simetria com "set" (que exige ID), assume o mesmo aqui.
  await xpeCall(device, password, 'user', 'del', { item: [{ ID: String(userId) }] });
}

async function xpeSetUserPhoto(device, password, userId, fileBuffer, mimetype) {
  if (fileBuffer.length > 200 * 1024) {
    throw new Error('Foto maior que 200KB — reduza o tamanho do arquivo (limite do equipamento).');
  }
  const relayBase = config.accessPhotoRelayBaseUrl;
  if (!relayBase) {
    throw new Error(
      'Cadastro de foto não está configurado — falta definir ACCESS_PHOTO_RELAY_BASE_URL no .env do Portal ' +
        '(o endereço do próprio Portal na rede local, que o equipamento consegue alcançar — não é a URL pública).'
    );
  }
  const existing = await xpeFindById(device, password, userId);
  if (!existing) throw new Error('Usuário não encontrado no equipamento.');

  const token = registerFaceRelayToken(fileBuffer, mimetype);
  const url = `${relayBase.replace(/\/$/, '')}/api/access/face-relay/${token}.jpg`;
  const merged = { ...xpeSafeExisting(existing), ID: String(userId), FaceUrl: url };
  await xpeCall(device, password, 'user', 'set', { item: [merged] });

  // O equipamento busca a foto de forma assíncrona depois do "OK" — retcode
  // 0 não garante nada (já vimos campos que ele aceita e ignora), e a busca
  // pode demorar mais que alguns segundos. Confirmado contra hardware real:
  // ao TROCAR uma foto já existente, o equipamento reaproveita a mesma URL
  // em FaceID (não muda), então comparar FaceID antes/depois dá falso
  // negativo sempre que já havia foto — só dá pra confirmar por FaceStatus.
  let updated = false;
  for (let i = 0; i < 8 && !updated; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const after = await xpeFindById(device, password, userId);
    updated = after?.FaceStatus === 1;
  }
  if (!updated) {
    throw new Error(
      `O equipamento não confirmou o cadastro da foto depois de esperar — confira se ele consegue alcançar ` +
        `${relayBase} pela rede local (firewall ou porta bloqueada podem impedir a busca).`
    );
  }
}

async function xpeGetUserPhoto(device, password, userId) {
  let existing = await xpeFindById(device, password, userId);
  // FaceStatus pode ficar "atrasado" por alguns segundos logo depois de uma
  // troca de foto (mesmo problema visto em xpeSetUserPhoto) — tenta mais
  // algumas vezes antes de dizer que não tem foto.
  for (let i = 0; i < 2 && existing && existing.FaceStatus !== 1; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    existing = await xpeFindById(device, password, userId);
  }
  if (!existing || existing.FaceStatus !== 1 || !existing.FaceID) return null;
  const auth = 'Basic ' + Buffer.from(`${device.device_username}:${password}`).toString('base64');
  return fetchDeviceBinary(existing.FaceID, auth);
}

async function xpeTestConnection(device, password) {
  await xpeCall(device, password, 'system', 'info');
  return true;
}

// ======================================================================
// SS 3532 MF (Bio-T) — não validada em hardware real, ver aviso no topo.
// ======================================================================

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
// 401 com um desafio Digest (RFC 2617), monta o header de autorização e
// tenta de novo — igual o `fetch` faria automaticamente se suportasse
// Digest nativamente (não suporta).
async function digestFetch(url, { method = 'GET', username, password, jsonBody } = {}) {
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

async function biotRequest(device, password, cgi, action, { method = 'POST', jsonBody, extraQuery } = {}) {
  const qs = new URLSearchParams({ action, ...(extraQuery || {}) });
  const url = `${baseUrlOf(device)}/cgi-bin/${cgi}?${qs.toString()}`;
  const res = await digestFetch(url, { method, username: device.device_username, password, jsonBody });
  const text = (await res.text()).trim();
  if (res.status === 401) throw new Error('Usuário/senha do equipamento recusados (HTTP 401).');
  if (!res.ok) throw new Error(`Equipamento respondeu HTTP ${res.status}: ${text.slice(0, 200)}`);
  return text;
}

function biotIsOk(text) {
  return /^OK/i.test(text);
}

function toBiotDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// input.password é ignorado aqui de propósito: a implementação de
// referência da linha Bio-T não tem nenhum campo de PIN/senha por usuário.
function biotUserBody(userId, name, expirationIso) {
  return {
    UserID: userId,
    UserName: name,
    UserType: 0,
    Doors: [0],
    TimeSections: [255],
    ValidFrom: '2020-01-01 00:00:00',
    ValidTo: expirationIso ? toBiotDateTime(expirationIso) : '2037-12-31 23:59:59',
  };
}

async function biotListUsers() {
  throw new Error(
    'Listar usuários ainda não é suportado para o modelo SS 3532 MF (a implementação de referência não documenta esse endpoint). ' +
      'Você ainda pode cadastrar um usuário novo pelo formulário "Novo usuário", mas editar/excluir pela lista não está disponível para este modelo por enquanto.'
  );
}

async function biotCreateUser(device, password, input) {
  const userId = input.registration || deriveRegistration(input.name);
  const body = { UserList: [biotUserBody(userId, input.name, input.expiration)] };
  let text = await biotRequest(device, password, 'AccessUser.cgi', 'insertMulti', { jsonBody: body });
  if (!biotIsOk(text) && /alreadyexist/i.test(text)) {
    text = await biotRequest(device, password, 'AccessUser.cgi', 'updateMulti', { jsonBody: body });
  }
  if (!biotIsOk(text)) throw new Error(`Equipamento recusou o usuário: ${text.slice(0, 200)}`);

  if (input.cardNumber) {
    const cardBody = { CardList: [{ UserID: userId, CardNo: String(input.cardNumber), CardType: 0, CardStatus: 0 }] };
    const cardText = await biotRequest(device, password, 'AccessCard.cgi', 'insertMulti', { jsonBody: cardBody });
    if (!biotIsOk(cardText)) throw new Error(`Usuário criado, mas falhou ao associar o cartão: ${cardText.slice(0, 200)}`);
  }

  return { id: userId, name: input.name, registration: userId, hasFace: false, cardNumber: input.cardNumber || null, expiration: input.expiration || null };
}

async function biotUpdateUser(device, password, userId, input) {
  const body = { UserList: [biotUserBody(String(userId), input.name, input.expiration)] };
  const text = await biotRequest(device, password, 'AccessUser.cgi', 'updateMulti', { jsonBody: body });
  if (!biotIsOk(text)) throw new Error(`Equipamento recusou a atualização: ${text.slice(0, 200)}`);
  return { id: userId, name: input.name, registration: String(userId), hasFace: null, cardNumber: input.cardNumber || null, expiration: input.expiration || null };
}

async function biotDeleteUser(device, password, userId) {
  const text = await biotRequest(device, password, 'AccessUser.cgi', 'removeMulti', {
    method: 'GET',
    extraQuery: { 'UserIDList[0]': String(userId) },
  });
  if (!biotIsOk(text)) throw new Error(`Equipamento recusou a exclusão: ${text.slice(0, 200)}`);
}

async function biotSetUserPhoto(device, password, userId, fileBuffer) {
  if (fileBuffer.length > 100 * 1024) {
    throw new Error('Foto maior que 100KB — reduza o tamanho do arquivo (limite do equipamento).');
  }
  const body = { FaceList: [{ UserID: String(userId), PhotoData: [fileBuffer.toString('base64')] }] };
  let text = await biotRequest(device, password, 'AccessFace.cgi', 'insertMulti', { jsonBody: body });
  if (!biotIsOk(text) && /photoexist/i.test(text)) {
    text = await biotRequest(device, password, 'AccessFace.cgi', 'updateMulti', { jsonBody: body });
  }
  if (!biotIsOk(text)) throw new Error(`Equipamento recusou a foto: ${text.slice(0, 200)}`);
}

async function biotGetUserPhoto() {
  throw new Error('Ver a foto cadastrada ainda não é suportado para o modelo SS 3532 MF (sem endpoint de consulta documentado).');
}

async function biotTestConnection(device, password) {
  const text = await biotRequest(device, password, 'magicBox.cgi', 'getSoftwareVersion', { method: 'GET' });
  if (!text) throw new Error('Equipamento não respondeu como esperado.');
  return true;
}

// ======================================================================
// Dispatcher — escolhe a implementação pelo modelo cadastrado.
// ======================================================================

const CLIENTS = {
  xpe3200: {
    listUsers: xpeListUsers,
    createUser: xpeCreateUser,
    updateUser: xpeUpdateUser,
    deleteUser: xpeDeleteUser,
    setUserPhoto: xpeSetUserPhoto,
    getUserPhoto: xpeGetUserPhoto,
    testConnection: xpeTestConnection,
  },
  ss3532mf: {
    listUsers: biotListUsers,
    createUser: biotCreateUser,
    updateUser: biotUpdateUser,
    deleteUser: biotDeleteUser,
    setUserPhoto: biotSetUserPhoto,
    getUserPhoto: biotGetUserPhoto,
    testConnection: biotTestConnection,
  },
};

function clientFor(device) {
  const client = CLIENTS[device.model];
  if (!client) {
    throw new Error(
      `Modelo "${device.model}" não tem um cliente de API implementado — escolha "Intelbras XPE 3200 IP Face" ou "Intelbras SS 3532 MF" no cadastro do equipamento.`
    );
  }
  return client;
}

export const listUsers = (device, password) => clientFor(device).listUsers(device, password);
export const createUser = (device, password, input) => clientFor(device).createUser(device, password, input);
export const updateUser = (device, password, userId, input) => clientFor(device).updateUser(device, password, userId, input);
export const deleteUser = (device, password, userId) => clientFor(device).deleteUser(device, password, userId);
export const setUserPhoto = (device, password, userId, fileBuffer) => clientFor(device).setUserPhoto(device, password, userId, fileBuffer);
export const getUserPhoto = (device, password, userId) => clientFor(device).getUserPhoto(device, password, userId);
export const testConnection = (device, password) => clientFor(device).testConnection(device, password);
