// Gateway server-to-server para os painéis de Rede e Interfone: eles
// continuam sendo aplicações Node independentes, cada uma com seu próprio
// login (usuário/senha + JWT). Em vez do cliente logar duas vezes, o
// próprio Portal loga nelas com uma conta de serviço (configurada em
// Configurações → Gateways) e repassa as chamadas — o usuário final só vê
// o login do Portal.
import { db } from '../db/sqlite.js';
import { config } from '../config.js';
import { encryptSecret, decryptSecret } from './cryptoService.js';

// Token de serviço em memória por módulo — evita logar de novo a cada
// requisição. Reautentica sozinho se o painel de baixo responder 401.
const tokenCache = new Map(); // moduleKey -> { token, obtainedAt }

export function getGatewayConfig(moduleKey) {
  const row = db.prepare('SELECT * FROM module_gateways WHERE module_key = ?').get(moduleKey);
  const fallback = config.gateways[moduleKey] || {};
  return {
    baseUrl: row?.base_url || fallback.baseUrl || '',
    publicUrl: row?.public_url || '',
    serviceUsername: row?.service_username || '',
    servicePassword: row ? decryptSecret(row.service_password_enc) : '',
    configured: Boolean(row?.base_url && row?.service_username),
  };
}

export function saveGatewayConfig(moduleKey, { baseUrl, publicUrl, serviceUsername, servicePassword }) {
  const existing = db.prepare('SELECT * FROM module_gateways WHERE module_key = ?').get(moduleKey);
  const passwordEnc = servicePassword ? encryptSecret(servicePassword) : existing?.service_password_enc || '';

  if (existing) {
    db.prepare(
      'UPDATE module_gateways SET base_url = ?, public_url = ?, service_username = ?, service_password_enc = ? WHERE module_key = ?'
    ).run(
      baseUrl ?? existing.base_url,
      publicUrl ?? existing.public_url,
      serviceUsername ?? existing.service_username,
      passwordEnc,
      moduleKey
    );
  } else {
    db.prepare(
      'INSERT INTO module_gateways (module_key, base_url, public_url, service_username, service_password_enc) VALUES (?, ?, ?, ?, ?)'
    ).run(moduleKey, baseUrl || '', publicUrl || '', serviceUsername || '', passwordEnc);
  }
  tokenCache.delete(moduleKey);
}

async function authenticate(moduleKey) {
  const gw = getGatewayConfig(moduleKey);
  if (!gw.configured) throw new Error(`Gateway "${moduleKey}" ainda não foi configurado.`);

  let res;
  try {
    res = await fetch(`${gw.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: gw.serviceUsername, password: gw.servicePassword }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    // Erro de rede (host errado, porta fechada, painel fora do ar) — sem
    // isso, o usuário só veria "fetch failed", sem pista nenhuma.
    throw new Error(`Não consegui alcançar ${gw.baseUrl} (${err.message}). Confira o endereço interno da API.`);
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // resposta não-JSON — segue com data vazio, a mensagem abaixo cobre isso
  }

  if (!res.ok) {
    throw new Error(data.error || `Painel respondeu HTTP ${res.status} — confira usuário/senha de serviço.`);
  }
  if (!data.token) {
    throw new Error('Login aceito, mas o painel não retornou um token — endereço da API pode estar errado.');
  }
  tokenCache.set(moduleKey, { token: data.token, obtainedAt: Date.now() });
  return data.token;
}

export async function getServiceToken(moduleKey, { forceRefresh = false } = {}) {
  if (!forceRefresh && tokenCache.has(moduleKey)) return tokenCache.get(moduleKey).token;
  return authenticate(moduleKey);
}

// Usado pelo botão "Testar conexão" nas Configurações — tenta logar de
// verdade com a conta de serviço salva, sem afetar o cache normal.
export async function testGatewayConnection(moduleKey) {
  await authenticate(moduleKey);
  return true;
}

// Middleware de proxy "manual": mais simples e previsível do que configurar
// http-proxy-middleware com reautenticação embutida. Encaminha
// método/corpo/query, injeta o Bearer do token de serviço, e tenta de novo
// uma vez se o painel de baixo responder 401 (token expirado).
//
// `featureRules` (opcional): lista de { test(method, path), feature,
// message? } — antes de encaminhar, se alguma regra bater com a
// requisição, exige que o usuário do Portal (não a conta de serviço) tenha
// essa permissão de funcionalidade, senão devolve 403 sem nem chamar o
// painel de baixo. Dono sempre passa. Usado pra bloquear ações sensíveis
// (ex.: cadastro de equipamento) mesmo com o módulo inteiro liberado.
export function gatewayProxy(moduleKey, { featureRules = [] } = {}) {
  return async (req, res) => {
    const gw = getGatewayConfig(moduleKey);
    if (!gw.configured) {
      return res.status(503).json({ error: `Gateway "${moduleKey}" ainda não foi configurado nas Configurações.` });
    }

    // Só tira o prefixo "/gateway/<moduleKey>" — o resto da URL (ex.:
    // "/api/auth/me") já vem completo do cliente, não precisa (e não deve)
    // reescrever de novo, senão vira "/api/api/..." (bug real, encontrado ao
    // usar este proxy pela primeira vez de verdade, com os painéis embutidos).
    const targetPath = req.originalUrl.replace(new RegExp(`^/gateway/${moduleKey}`), '');
    const pathOnly = targetPath.split('?')[0];

    if (req.user?.role !== 'owner') {
      const rule = featureRules.find((r) => r.test(req.method, pathOnly));
      if (rule) {
        const allowed = db
          .prepare('SELECT 1 FROM permissions WHERE user_id = ? AND module_key = ?')
          .get(req.user.sub, rule.feature);
        if (!allowed) {
          return res.status(403).json({ error: rule.message || 'Você não tem acesso a esta função.' });
        }
      }
    }

    const doRequest = async (token) =>
      fetch(`${gw.baseUrl}${targetPath}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        signal: AbortSignal.timeout(15000),
      });

    try {
      let token = await getServiceToken(moduleKey);
      let response = await doRequest(token);
      if (response.status === 401) {
        token = await getServiceToken(moduleKey, { forceRefresh: true });
        response = await doRequest(token);
      }
      // arrayBuffer (não .text()) porque essa mesma rota também encaminha
      // binário (ex.: imagem de planta baixa, PDF de relatório) — .text()
      // decodifica como UTF-8 e corrompe qualquer coisa que não seja texto.
      const body = Buffer.from(await response.arrayBuffer());
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'application/json');
      res.send(body);
    } catch (err) {
      res.status(502).json({ error: `Painel "${moduleKey}" indisponível: ${err.message}` });
    }
  };
}
