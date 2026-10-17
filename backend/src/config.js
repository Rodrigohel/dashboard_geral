import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5175',

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
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
};

// Chaves válidas de módulo — usadas para validar permissões e rotas.
// 'acesso' (controle de acesso facial) e 'bombas' (casa de bombas, lida via
// Modbus TCP na IHM) são nativos do Portal, não um gateway.
export const MODULE_KEYS = ['rede', 'interfone', 'acesso', 'bombas', 'gerador'];

// Permissões "de funcionalidade", mais finas que um módulo inteiro — hoje só
// dentro de "rede", pra dar de liberar o monitoramento geral sem liberar
// telas extras (planta baixa, análise/histórico). Guardadas na mesma tabela
// `permissions` do módulo (mesmo formato user_id+chave), só com uma chave
// "namespaced" (ex.: "rede.plantaBaixa") em vez do nome do módulo puro.
// Cadastro/edição/exclusão de equipamento não é feito pelo Portal (só
// consulta) — por isso não existe "rede.dispositivos" aqui: isso é feito
// direto no painel de Rede original.
//
// "acesso.equipamentos.*"/"acesso.moradores.*"/"bombas.editar" seguem o
// mesmo formato, pra dar controle fino (ver/incluir/editar/excluir) em vez
// de só "tem o módulo ou não tem" — hoje cadastrar/editar/excluir um
// equipamento de acesso ou mexer na configuração da casa de bombas é
// sempre só-dono; essas chaves é que passam a controlar isso por usuário.
// Não existe "acesso.equipamentos.ver" de propósito: quem já vê o
// equipamento (módulo "acesso" + liberado em device_permissions) já pode
// listar/olhar ele — criar uma chave de "ver" separada seria um segundo
// portão redundante pro mesmo "sim" que já existe hoje.
//
// "usuarios.*" é diferente dos outros: não tem módulo pai (a tela
// Usuários nunca foi um módulo escolhível no menu, sempre foi só-dono) —
// por isso NÃO leva ponto antes de "usuarios" aqui, e setPermissions()
// em users.js sabe que uma chave assim não precisa de um módulo pai
// marcado junto (só os com prefixo rede./acesso./bombas. precisam).
export const FEATURE_KEYS = [
  'rede.plantaBaixa',
  'rede.analise',
  'acesso.equipamentos.incluir',
  'acesso.equipamentos.editar',
  'acesso.equipamentos.excluir',
  'acesso.moradores.ver',
  'acesso.moradores.incluir',
  'acesso.moradores.editar',
  'acesso.moradores.excluir',
  'bombas.editar',
  'gerador.editar',
  'usuarios.ver',
  'usuarios.incluir',
  'usuarios.editar',
  'usuarios.excluir',
  // Mesma ideia de "usuarios.*": Auditoria nunca foi módulo escolhível,
  // sempre só-dono — essa chave dá pro dono liberar alguém específico pra
  // ver/baixar os logs sem virar dono.
  'auditoria.ver',
  // Idem pra Relatórios (ver Rodrigo: "não pode todos terem acesso, eu
  // tenho que poder dizer quais usuários terão acesso") — independente de
  // ter os módulos Bombas/Acesso, só quem o dono marcar aqui vê a tela.
  'relatorios.ver',
];
