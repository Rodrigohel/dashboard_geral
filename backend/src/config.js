import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5175',

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    sqlitePath: process.env.SQLITE_PATH || './data/portal.db',
  },

  // Mesma ideia do painel de Rede: chave só para criptografar (reversível)
  // segredos guardados no banco — senha dos controladores de acesso e das
  // contas de serviço usadas para logar nos painéis de Rede/Interfone por
  // trás do gateway. Nunca é hashing, porque precisamos recuperar o valor
  // original para autenticar contra outro sistema.
  credentialsKey: process.env.CREDENTIALS_KEY || 'dev-credentials-key-change-me',

  // Cada módulo "de fora" (Rede, Interfone) é um painel Node já pronto,
  // rodando sozinho na rede local. O Portal nunca expõe esses backends
  // diretamente: ele loga neles com uma conta de serviço (guardada nas
  // Configurações, não aqui) e faz de gateway. baseUrl/frontendDist abaixo
  // são só o valor inicial — o que está salvo no banco (tabela
  // module_gateways) manda depois que alguém configurar pela tela.
  gateways: {
    rede: {
      baseUrl: process.env.GATEWAY_REDE_BASE_URL || 'http://127.0.0.1:3002',
      frontendDist: process.env.GATEWAY_REDE_FRONTEND_DIST || '',
    },
    interfone: {
      baseUrl: process.env.GATEWAY_INTERFONE_BASE_URL || 'http://127.0.0.1:3001',
      frontendDist: process.env.GATEWAY_INTERFONE_FRONTEND_DIST || '',
    },
  },

  // Endereço do próprio Portal na rede local, alcançável pelos equipamentos
  // de controle de acesso (ex.: http://192.168.1.50:3000) — NÃO é a URL
  // pública do Cloudflare Tunnel, porque o equipamento fica só na rede
  // local. Usado só para cadastrar foto facial na XPE 3200 (ver
  // accessControlClient.js): o Portal hospeda a foto enviada por um
  // instante num link temporário, e o próprio equipamento busca de lá.
  accessPhotoRelayBaseUrl: process.env.ACCESS_PHOTO_RELAY_BASE_URL || '',
};

// Chaves válidas de módulo — usadas para validar permissões e rotas.
// 'acesso' (controle de acesso facial) é nativo do Portal, não um gateway.
export const MODULE_KEYS = ['rede', 'interfone', 'acesso'];

// Permissões "de funcionalidade", mais finas que um módulo inteiro — hoje só
// dentro de "rede", pra dar de liberar o monitoramento geral sem liberar
// ações sensíveis (cadastro/exclusão de equipamento, planta baixa). Guardadas
// na mesma tabela `permissions` do módulo (mesmo formato user_id+chave), só
// com uma chave "namespaced" (ex.: "rede.dispositivos") em vez do nome do
// módulo puro.
export const FEATURE_KEYS = ['rede.dispositivos', 'rede.plantaBaixa', 'rede.analise'];
