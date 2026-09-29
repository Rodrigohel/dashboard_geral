// Cliente para a nuvem da Segplace (app "Segplace", equipamento físico
// "Axiom Wifi") — CONFIRMADO lendo o código-fonte real do APK oficial
// (decompilado), não é um chute: endpoints, cabeçalhos e formato de
// resposta vêm todos de lá. Ainda assim, nunca foi testado contra a API de
// verdade (a rede daqui não alcança hosts de terceiros), então trate com a
// mesma cautela de qualquer integração recém-nascida.
//
// Diferença importante em relação aos porteiros Intelbras: não existe IP
// local nenhum — o módulo Axiom Wifi conecta ele mesmo na nuvem da
// Segplace, e o app também só fala com essa nuvem (que repassa o comando
// pro módulo). Por isso aqui não há host/porta configurável: é sempre
// segplace.seekat.com.br:443, autenticando com usuário/senha da CONTA
// Segplace (não do equipamento em si) — uma conta pode ter mais de um
// portão, cada um com seu próprio "id" (ver listGates).
//
// Login não é cacheado de propósito (loga de novo a cada chamada) — mais
// simples e sem risco de usar um token expirado, ao custo de uma chamada
// HTTP a mais por ação. Como o dono só aciona isso ocasionalmente (mais a
// checagem de status a cada 5min do deviceHealthPoller), não deve pesar,
// mas o limite de requisições da Segplace não é documentado publicamente
// — se isso virar problema (muitos portões na mesma conta), cacheá-lo
// com expiração vira a próxima melhoria óbvia.
const API_HOST = 'segplace.seekat.com.br';
const API_PORT = 443;
const BASE_URL = `https://${API_HOST}:${API_PORT}`;
const USER_AGENT = 'Seekat Mobile Android'; // exatamente o mesmo do app oficial

async function login(username, password) {
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/entrar`, {
      method: 'POST',
      headers: { Authorization: auth, 'User-agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(`Não consegui alcançar o Segplace (${err.message}).`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Usuário ou senha do Segplace recusados.');
  }
  if (!res.ok) {
    throw new Error(`Segplace recusou o login (HTTP ${res.status}).`);
  }
  // Node/undici junta múltiplos Set-Cookie numa string só separada por
  // vírgula — o app original lê só o primeiro "session=...", então extrai
  // com regex em vez de tentar separar por vírgula (o valor do cookie
  // também pode conter vírgula em teoria).
  const setCookie = res.headers.get('set-cookie') || '';
  const match = /session=([^;,]+)/.exec(setCookie);
  if (!match) {
    throw new Error('Segplace não devolveu o token de sessão esperado (a API pode ter mudado).');
  }
  return match[1];
}

async function authedRequest(path, token, { method = 'GET', body } = {}) {
  const headers = { 'User-agent': USER_AGENT, Accept: 'application/json', Cookie: `session=${token}` };
  const init = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch (err) {
    throw new Error(`Não consegui alcançar o Segplace (${err.message}).`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Sessão do Segplace expirou ou a senha mudou — tente de novo.');
  }
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta inesperada do Segplace (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

// Lista os portões (e só os portões — a conta pode ter também alarme,
// câmeras, interfone, mas o Portal só cuida de controle de acesso) já
// cadastrados na conta Segplace informada. Usado tanto pra "descobrir"
// portões na hora de cadastrar quanto poderia servir de base pra uma
// futura sincronização automática.
export async function listGates(username, password) {
  const token = await login(username, password);
  const json = await authedRequest('/api/dispositivos/get', token);
  const portas = Array.isArray(json.portas) ? json.portas : [];
  return portas.map((p) => ({
    remoteId: String(p.id),
    nome: p.nome || `Portão ${p.id}`,
    fechada: Boolean(p.fechada),
    trancada: Boolean(p.trancada),
  }));
}

export async function openGate(username, password, remoteId) {
  const token = await login(username, password);
  const json = await authedRequest('/api/portas/abrir', token, { method: 'POST', body: { id: Number(remoteId) } });
  if (!json.Sucesso) {
    throw new Error('Segplace recusou abrir o portão.');
  }
  return true;
}

export async function testConnection(username, password) {
  await login(username, password);
  return true;
}
