import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const dir = path.dirname(config.auth.sqlitePath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.auth.sqlitePath);
db.pragma('journal_mode = WAL');

db.exec(`
  -- Contas do Portal. 'owner' enxerga e administra tudo, sem precisar de
  -- linha em 'permissions' — é o papel do dono/administrador geral. 'user'
  -- só acessa os módulos (e, dentro de "acesso", os equipamentos) listados
  -- explicitamente para ele.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'owner' | 'user'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Quais módulos (rede / interfone / acesso) cada usuário comum enxerga.
  CREATE TABLE IF NOT EXISTS permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    PRIMARY KEY (user_id, module_key)
  );

  -- Cada porteiro/controlador de acesso facial cadastrado (XPE 3200 IP
  -- Face, SS 3532 MF, etc.), com a credencial de acesso à API HTTP dele
  -- guardada criptografada (ver cryptoService).
  CREATE TABLE IF NOT EXISTS access_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT 'xpe3200', -- 'xpe3200' | 'ss3532mf'
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 80,
    use_https INTEGER NOT NULL DEFAULT 0,
    device_username TEXT NOT NULL DEFAULT 'admin',
    device_password_enc TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Dentro do módulo "acesso", em qual(is) porteiro(s) específico(s) um
  -- usuário comum pode mexer (ex.: síndico só vê o porteiro do bloco dele).
  CREATE TABLE IF NOT EXISTS device_permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES access_devices(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, device_id)
  );

  -- Permissão à parte de device_permissions (que só controla "enxerga/gerencia
  -- usuários daquele porteiro") — quem pode ABRIR remotamente. Separada de
  -- propósito: dá pra liberar o botão de abrir pra um porteiro/zelador sem
  -- dar acesso ao cadastro de moradores daquele equipamento.
  CREATE TABLE IF NOT EXISTS device_open_permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES access_devices(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, device_id)
  );

  -- Guarda a ÚLTIMA foto facial enviada pelo Portal pra cada nome (não por
  -- equipamento) — a foto que o próprio equipamento devolve depois de
  -- cadastrada já passou pela recompressão/redimensionamento dele (pensado
  -- pro motor de reconhecimento facial, não pra qualidade); reusar ela como
  -- origem ao "liberar em outro equipamento" ia piorando a cada salto
  -- ("cópia da cópia"). Guardando o arquivo original aqui (de qualquer
  -- envio feito pelo Portal, tela única ou vários equipamentos de uma vez),
  -- "liberar em outro equipamento" sempre parte do original, nunca de uma
  -- cópia já reprocessada pelo equipamento.
  CREATE TABLE IF NOT EXISTS morador_photos (
    name_key TEXT PRIMARY KEY,
    photo BLOB NOT NULL,
    mimetype TEXT NOT NULL DEFAULT 'image/jpeg',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Configuração de cada gateway (Rede/Interfone): endereço do backend real
  -- na rede local + conta de serviço que o Portal usa para logar nele em
  -- nome do usuário (o usuário final só loga uma vez, no Portal).
  CREATE TABLE IF NOT EXISTS module_gateways (
    module_key TEXT PRIMARY KEY, -- 'rede' | 'interfone'
    base_url TEXT NOT NULL DEFAULT '',
    public_url TEXT NOT NULL DEFAULT '',
    service_username TEXT NOT NULL DEFAULT '',
    service_password_enc TEXT NOT NULL DEFAULT ''
  );

  -- Cada tentativa de login (sucesso ou falha) — auditoria só pro
  -- administrador. Guarda username digitado mesmo em falha/usuário
  -- inexistente (user_id fica NULL nesse caso) pra dar pra ver tentativas
  -- de acesso indevido, não só logins válidos.
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    success INTEGER NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cada tentativa de abertura remota de porteiro (sucesso ou falha) —
  -- mesma lógica de login_events: guarda device_name e username direto na
  -- linha (não só o id) pra continuar legível mesmo se o equipamento ou o
  -- usuário forem apagados depois.
  CREATE TABLE IF NOT EXISTS door_open_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER REFERENCES access_devices(id) ON DELETE SET NULL,
    device_name TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    success INTEGER NOT NULL,
    error_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Nome e logo mostrados na tela de login e na barra lateral — uma linha
  -- só (id fixo = 1). Público de propósito (GET): a tela de login precisa
  -- mostrar isso ANTES do usuário entrar.
  CREATE TABLE IF NOT EXISTS branding (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Portal',
    logo_filename TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO branding (id, name, logo_filename) VALUES (1, 'Portal', '');

  -- Parâmetros de segurança do login — uma linha só (id fixo = 1), igual
  -- 'branding'. Valores batem com o que já era fixo no código antes desta
  -- tabela existir (10 falhas/15min, sessão de 8h), então criar a tabela não
  -- muda o comportamento de ninguém até o dono ir em Configurações mudar.
  CREATE TABLE IF NOT EXISTS security_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_login_failures INTEGER NOT NULL DEFAULT 10,
    login_window_minutes INTEGER NOT NULL DEFAULT 15,
    session_hours INTEGER NOT NULL DEFAULT 8
  );
  INSERT OR IGNORE INTO security_settings (id) VALUES (1);

  -- Sensibilidade da detecção de anomalia de cada módulo ('baixa' | 'media'
  -- | 'alta') — uma linha só, igual 'security_settings'. Os valores
  -- numéricos reais (multiplicador de desvio-padrão, mínimo de amostra
  -- etc.) ficam só no código (anomalySettingsService.js): aqui guarda só o
  -- nível escolhido, então mudar a régua não exige migração.
  CREATE TABLE IF NOT EXISTS anomaly_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rede_sensitivity TEXT NOT NULL DEFAULT 'media',
    interfone_sensitivity TEXT NOT NULL DEFAULT 'media',
    acesso_sensitivity TEXT NOT NULL DEFAULT 'media'
  );
  INSERT OR IGNORE INTO anomaly_settings (id) VALUES (1);

  -- Por quantos dias manter login_events/door_open_events antes de apagar
  -- sozinho (ver auditRetentionPruner.js). 0 = nunca apagar automaticamente
  -- (comportamento de sempre, antes desta tabela existir).
  CREATE TABLE IF NOT EXISTS retention_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    audit_retention_days INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO retention_settings (id) VALUES (1);

  -- Liga/desliga a funcionalidade de notificação push (Web Push) pro Portal
  -- inteiro — desligada por padrão (feature nova, opt-in do dono). O par de
  -- chaves VAPID é gerado sozinho na primeira vez que o dono ativa (ver
  -- pushService.js) e reaproveitado depois, senão toda assinatura já feita
  -- pelos navegadores viraria inválida ao desligar/ligar de novo.
  CREATE TABLE IF NOT EXISTS push_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    vapid_public_key TEXT NOT NULL DEFAULT '',
    vapid_private_key_enc TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO push_settings (id) VALUES (1);

  -- Uma linha por navegador/dispositivo inscrito (um usuário pode ter mais
  -- de um — celular e PC, por exemplo). endpoint é único por natureza do
  -- Web Push (a URL do serviço de push do navegador), por isso serve de
  -- chave pra evitar duplicata ao reinscrever o mesmo dispositivo.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Casa de bombas (nível do subsolo + 2 bombas), lida via Modbus TCP direto
  -- na IHM (Weintek) que já fala com o LOGO — não no LOGO em si. Uma linha
  -- só (id fixo = 1), igual 'branding'/'push_settings'. Cada ponto tem
  -- endereço + tipo de registrador em branco por padrão: ninguém sabe o
  -- endereço certo até configurar na tela de "Bombas" (ver pumpStationClient.js),
  -- então nunca inventamos um valor aqui.
  CREATE TABLE IF NOT EXISTS pump_station (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT 'Casa de bombas',
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 502,
    unit_id INTEGER NOT NULL DEFAULT 1,
    nivel_minimo_addr INTEGER,
    nivel_minimo_type TEXT NOT NULL DEFAULT 'coil',
    nivel_medio_addr INTEGER,
    nivel_medio_type TEXT NOT NULL DEFAULT 'coil',
    nivel_maximo_addr INTEGER,
    nivel_maximo_type TEXT NOT NULL DEFAULT 'coil',
    nivel_seguranca_addr INTEGER,
    nivel_seguranca_type TEXT NOT NULL DEFAULT 'coil',
    bomba1_addr INTEGER,
    bomba1_type TEXT NOT NULL DEFAULT 'coil',
    bomba2_addr INTEGER,
    bomba2_type TEXT NOT NULL DEFAULT 'coil',
    termico1_addr INTEGER,
    termico1_type TEXT NOT NULL DEFAULT 'coil',
    termico2_addr INTEGER,
    termico2_type TEXT NOT NULL DEFAULT 'coil',
    modo_manual_addr INTEGER,
    modo_manual_type TEXT NOT NULL DEFAULT 'coil',
    poll_seconds INTEGER NOT NULL DEFAULT 10
  );
  INSERT OR IGNORE INTO pump_station (id) VALUES (1);

  -- Log de transições (borda, não amostra) de cada sinal da casa de bombas —
  -- uma linha só quando o valor MUDA (ver pumpStationHistoryPoller.js), não
  -- uma linha por rodada de leitura. Base pro histórico/gráfico de quantas
  -- vezes cada bomba ligou, quanto tempo ficou ligada, e quais níveis
  -- estavam ativos no momento.
  CREATE TABLE IF NOT EXISTS pump_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_key TEXT NOT NULL,
    state INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_pump_events_created_at ON pump_events(created_at);

  -- Foto completa (todos os pontos, já com invert aplicado) tirada sozinha
  -- no instante em que bomba1 OU bomba2 liga (ver pumpStationHistoryPoller.js)
  -- — pra comparar com o painel físico sem precisar estar lá esperando ligar.
  CREATE TABLE IF NOT EXISTS pump_activation_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    points_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Fase 1 de "pontos customizados" (ver IDEIAS.md): sinal extra que o
  -- Rodrigo cadastra sozinho quando o CLP ganha um I/O novo, sem precisar de
  -- deploy. Mesma forma addr/type/invert dos pontos fixos de pump_station,
  -- só que em lista (uma linha por ponto) em vez de colunas fixas, porque
  -- não dá pra prever quantos vão existir. Exibição ainda genérica (sim/não
  -- com o nome que a pessoa deu) — o desenho bonito fica pra uma fase 2.
  CREATE TABLE IF NOT EXISTS pump_custom_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    addr INTEGER,
    type TEXT NOT NULL DEFAULT 'coil',
    invert INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Título/descrição customizados dos cards de módulo na tela Início —
  -- título/descrição em branco = usa o padrão (ver MODULE_META no front).
  -- Só dono edita (tela Início, botão de lápis no card); todo mundo lê, pra
  -- o card mostrar o texto certo pra qualquer usuário.
  CREATE TABLE IF NOT EXISTS module_card_overrides (
    module_key TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );
`);

// Última checagem periódica de saúde de cada porteiro (ver
// deviceHealthPoller.js) — 'unknown' até a primeira checagem rodar.
const accessDeviceColumns = db.prepare('PRAGMA table_info(access_devices)').all().map((c) => c.name);
if (!accessDeviceColumns.includes('last_status')) {
  db.exec("ALTER TABLE access_devices ADD COLUMN last_status TEXT NOT NULL DEFAULT 'unknown'");
}
if (!accessDeviceColumns.includes('last_checked_at')) {
  db.exec("ALTER TABLE access_devices ADD COLUMN last_checked_at TEXT NOT NULL DEFAULT ''");
}
if (!accessDeviceColumns.includes('last_error')) {
  db.exec("ALTER TABLE access_devices ADD COLUMN last_error TEXT NOT NULL DEFAULT ''");
}
// Só usado pelo modelo 'segplace' (portão Segplace/Axiom Wifi) — o
// identificador da "porta" na nuvem deles, já que host/porta/usuário não
// servem pra distinguir qual portão é qual quando uma conta tem mais de um
// (ver segplaceClient.js). Vazio nos modelos Intelbras.
if (!accessDeviceColumns.includes('remote_id')) {
  db.exec("ALTER TABLE access_devices ADD COLUMN remote_id TEXT NOT NULL DEFAULT ''");
}
// Câmera IP separada (não faz parte do porteiro/portão) apontada pro local,
// pra ver ao vivo se abriu/tá abrindo/parado — opcional, sem relação com o
// modelo do equipamento em si. Só suportado Hikvision (ISAPI) por enquanto.
if (!accessDeviceColumns.includes('camera_host')) {
  db.exec("ALTER TABLE access_devices ADD COLUMN camera_host TEXT NOT NULL DEFAULT ''");
  db.exec("ALTER TABLE access_devices ADD COLUMN camera_port INTEGER NOT NULL DEFAULT 80");
  db.exec("ALTER TABLE access_devices ADD COLUMN camera_channel INTEGER NOT NULL DEFAULT 1");
  db.exec("ALTER TABLE access_devices ADD COLUMN camera_username TEXT NOT NULL DEFAULT ''");
  db.exec("ALTER TABLE access_devices ADD COLUMN camera_password_enc TEXT NOT NULL DEFAULT ''");
}
// Escolha explícita do dono, por equipamento, se ele tem câmera de
// reconhecimento facial de verdade — independe do modelo (uma unidade XPE
// pode estar instalada sem a câmera). Controla só se a tela de "Novo
// usuário" oferece o campo de foto pra esse equipamento; portões Segplace
// (sem API de usuário nenhuma) continuam de fora da lista de qualquer jeito,
// com ou sem essa marcação.
if (!accessDeviceColumns.includes('is_facial')) {
  db.exec('ALTER TABLE access_devices ADD COLUMN is_facial INTEGER NOT NULL DEFAULT 1');
  db.exec("UPDATE access_devices SET is_facial = 0 WHERE model = 'segplace'");
}

const gatewayColumns = db.prepare('PRAGMA table_info(module_gateways)').all().map((c) => c.name);
if (!gatewayColumns.includes('public_url')) {
  db.exec("ALTER TABLE module_gateways ADD COLUMN public_url TEXT NOT NULL DEFAULT ''");
}

// Cor de destaque (botões, item ativo do menu) — separado do logo pra dar
// pra ajustar sem precisar reenviar a imagem. Vazio = usa o padrão do tema.
const brandingColumns = db.prepare('PRAGMA table_info(branding)').all().map((c) => c.name);
if (!brandingColumns.includes('accent_color')) {
  db.exec("ALTER TABLE branding ADD COLUMN accent_color TEXT NOT NULL DEFAULT ''");
}
// Nome curto e ícone quadrado, os dois só pro PWA (Adicionar à tela
// inicial). Nome curto porque `name` pode ser longo demais pra caber
// embaixo do ícone na tela inicial do celular; ícone à parte do logo
// porque o logo (tela de login/menu) pode não ser quadrado — usado como
// <img>, tanto faz — mas um ícone de app precisa ser quadrado pra não
// ficar cortado/espremido pelo sistema operacional.
if (!brandingColumns.includes('short_name')) {
  db.exec("ALTER TABLE branding ADD COLUMN short_name TEXT NOT NULL DEFAULT ''");
}
if (!brandingColumns.includes('pwa_icon_filename')) {
  db.exec("ALTER TABLE branding ADD COLUMN pwa_icon_filename TEXT NOT NULL DEFAULT ''");
}

// Intervalo de atualização da tela "Bombas" — pedido explícito pra ser
// configurável (não fixo em 10s), já que a IHM responde rápido.
const pumpStationColumns = db.prepare('PRAGMA table_info(pump_station)').all().map((c) => c.name);
if (!pumpStationColumns.includes('poll_seconds')) {
  db.exec('ALTER TABLE pump_station ADD COLUMN poll_seconds INTEGER NOT NULL DEFAULT 10');
}
// 6 pontos novos identificados na planilha real de Data Transfer da IHM
// (emergência, falta de fase, painel desligado, falha das boias, qual
// bomba é "a do dia" de cada uma) — além dos 9 já existentes acima.
for (const point of ['emergencia', 'falta_fase', 'painel_desligado', 'falha_boias', 'bomba1_do_dia', 'bomba2_do_dia']) {
  if (!pumpStationColumns.includes(`${point}_addr`)) {
    db.exec(`ALTER TABLE pump_station ADD COLUMN ${point}_addr INTEGER`);
    db.exec(`ALTER TABLE pump_station ADD COLUMN ${point}_type TEXT NOT NULL DEFAULT 'coil'`);
  }
}
// "Inverter" por ponto — confirmado em campo que pelo menos um sinal
// (emergência) vem ao contrário do nome (bit em 1 com tudo normal, 0 só
// quando aciona — comum em circuito de segurança com contato NF). Como o
// sentido do contato (NA/NF) varia de instalação pra instalação, isso é
// configurável por ponto, igual addr/type, em vez de inverter só esses
// dois fixo no código.
const pumpStationColumnsAfterPoints = db.prepare('PRAGMA table_info(pump_station)').all().map((c) => c.name);
for (const point of [
  'nivel_minimo', 'nivel_medio', 'nivel_maximo', 'nivel_seguranca',
  'bomba1', 'bomba2', 'termico1', 'termico2', 'modo_manual',
  'emergencia', 'falta_fase', 'painel_desligado', 'falha_boias', 'bomba1_do_dia', 'bomba2_do_dia',
]) {
  if (!pumpStationColumnsAfterPoints.includes(`${point}_invert`)) {
    db.exec(`ALTER TABLE pump_station ADD COLUMN ${point}_invert INTEGER NOT NULL DEFAULT 0`);
  }
}

// Alertas via Telegram (ver IDEIAS.md) — token do bot guardado criptografado
// igual outros segredos (ver cryptoService). `webhook_secret` vai na URL do
// webhook configurado no Telegram, pra qualquer um na internet não poder
// chamar POST /api/telegram/webhook/<secret> fingindo ser o Telegram e
// reconhecer alarmes à toa. `resend_interval_seconds` vale só pros alarmes
// marcados como prioridade (ver `_priority` nos pontos de pump_station,
// migração logo abaixo) — os demais mandam uma mensagem só, sem insistir.
db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    bot_token_enc TEXT NOT NULL DEFAULT '',
    chat_id TEXT NOT NULL DEFAULT '',
    webhook_secret TEXT NOT NULL DEFAULT '',
    resend_interval_seconds INTEGER NOT NULL DEFAULT 1800
  );
  INSERT OR IGNORE INTO telegram_settings (id) VALUES (1);

  -- Um alarme "ativo" (ver telegramService.js) vira uma linha aqui entre o
  -- instante em que disparou e o instante em que resolveu (sinal voltou a
  -- false) OU foi reconhecido por uma resposta no chat do Telegram. Sem
  -- linha = alarme não está ativo (não dispara de novo até acontecer uma
  -- transição false->true nova).
  CREATE TABLE IF NOT EXISTS telegram_alarm_state (
    alarm_key TEXT PRIMARY KEY,
    active_since TEXT NOT NULL DEFAULT (datetime('now')),
    last_sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    acknowledged_at TEXT,
    ack_reason TEXT NOT NULL DEFAULT ''
  );
`);

// `ack_reason` adicionado depois de telegram_alarm_state já estar em
// produção (botões "Visto"/"Em manutenção" — ver telegramService.js) —
// mesmo cuidado de sempre, ALTER TABLE guardado por PRAGMA table_info.
const telegramAlarmStateColumns = db.prepare('PRAGMA table_info(telegram_alarm_state)').all().map((c) => c.name);
if (!telegramAlarmStateColumns.includes('ack_reason')) {
  db.exec("ALTER TABLE telegram_alarm_state ADD COLUMN ack_reason TEXT NOT NULL DEFAULT ''");
}

// Flag "prioridade" por sinal de alarme da casa de bombas — só esses 7
// pontos fazem sentido como "alarme" (os 4 sensores de nível não são
// alarme, são leitura de nível normal). Prioridade = o Telegram insiste
// (reenvia) até reconhecer; sem prioridade = manda uma vez só.
const pumpStationColumnsForPriority = db.prepare('PRAGMA table_info(pump_station)').all().map((c) => c.name);
for (const point of ['termico1', 'termico2', 'modo_manual', 'emergencia', 'falta_fase', 'painel_desligado', 'falha_boias']) {
  if (!pumpStationColumnsForPriority.includes(`${point}_priority`)) {
    db.exec(`ALTER TABLE pump_station ADD COLUMN ${point}_priority INTEGER NOT NULL DEFAULT 0`);
  }
}

// "Modo TV / painel de portaria" — conta especial marcada na criação do
// usuário (não é um 'role' novo, é um flag à parte) que faz o front mostrar
// só os cards de módulo + alarmes ativos, sem menu nenhum — pensada pra
// ficar logada num monitor fixo na guarita. Continua usando o sistema de
// permissões normal (módulos/equipamentos) pra decidir quais cards
// aparecem; isso só troca a APRESENTAÇÃO, não dá acesso a nada que a conta
// já não teria.
const usersColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!usersColumns.includes('tv_mode')) {
  db.exec('ALTER TABLE users ADD COLUMN tv_mode INTEGER NOT NULL DEFAULT 0');
}

// Gerador (grupo gerador diesel) — mesmo padrão de pump_station: lido via
// Modbus TCP direto no controlador (ComAp AMF-9, IP dado pelo Rodrigo,
// 192.168.1.253), que normalmente não exige login nenhum pro Modbus em si
// (só pra tela de monitoramento própria do controlador, que o Portal nem
// usa). Endereço de cada ponto em branco por padrão — só o Rodrigo sabe o
// endereço certo depois de configurar/consultar o controlador, igual nunca
// inventamos nada em pump_station.
db.exec(`
  CREATE TABLE IF NOT EXISTS generator_station (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT 'Gerador',
    host TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 502,
    unit_id INTEGER NOT NULL DEFAULT 1,
    poll_seconds INTEGER NOT NULL DEFAULT 10,
    pronto_addr INTEGER,
    pronto_type TEXT NOT NULL DEFAULT 'coil',
    pronto_invert INTEGER NOT NULL DEFAULT 0,
    falha_addr INTEGER,
    falha_type TEXT NOT NULL DEFAULT 'coil',
    falha_invert INTEGER NOT NULL DEFAULT 0,
    em_operacao_addr INTEGER,
    em_operacao_type TEXT NOT NULL DEFAULT 'coil',
    em_operacao_invert INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO generator_station (id) VALUES (1);
`);

// Usuário/senha do gerador, pedidos pelo Rodrigo mesmo sabendo que o Modbus
// TCP em si não pede login (ver comentário acima) — guardados pra quando ele
// descobrir se o controlador precisa disso por algum outro caminho (ex.: tela
// web própria do ComAp), em vez de ficar pedindo de novo depois. Mesmo padrão
// de device_password_enc: nunca decifrado de volta pro front.
const generatorStationColumns = db.prepare('PRAGMA table_info(generator_station)').all().map((c) => c.name);
if (!generatorStationColumns.includes('username')) {
  db.exec("ALTER TABLE generator_station ADD COLUMN username TEXT NOT NULL DEFAULT ''");
}
if (!generatorStationColumns.includes('password_enc')) {
  db.exec("ALTER TABLE generator_station ADD COLUMN password_enc TEXT NOT NULL DEFAULT ''");
}
if (!generatorStationColumns.includes('falha_priority')) {
  db.exec('ALTER TABLE generator_station ADD COLUMN falha_priority INTEGER NOT NULL DEFAULT 0');
}

// Flag "prioridade" por porteiro — mesma ideia do `_priority` dos pontos de
// pump_station, só que aqui é por EQUIPAMENTO (não por sinal): porteiro cair
// com essa marcação insiste via Telegram até reconhecer, igual os alarmes
// de bombas.
const accessDevicesColumnsForPriority = db.prepare('PRAGMA table_info(access_devices)').all().map((c) => c.name);
if (!accessDevicesColumnsForPriority.includes('telegram_priority')) {
  db.exec('ALTER TABLE access_devices ADD COLUMN telegram_priority INTEGER NOT NULL DEFAULT 0');
}

// Alarmes que não são "por equipamento cadastrado" (Rede/Interfone são
// painéis à parte, só dão uma contagem de offline — não uma lista estável de
// IDs locais) e a trava de força bruta (evento, não sinal contínuo) — flags
// de prioridade únicas, uma linha singleton igual telegram_settings.
db.exec(`
  CREATE TABLE IF NOT EXISTS telegram_module_priority (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rede_offline_priority INTEGER NOT NULL DEFAULT 0,
    interfone_offline_priority INTEGER NOT NULL DEFAULT 0,
    forca_bruta_priority INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO telegram_module_priority (id) VALUES (1);
`);

// Ligação telefônica (Twilio) como escalonamento de um alarme de prioridade
// que ninguém reconheceu via Telegram — ver twilioService.js. Preço/provedor
// ainda não decididos (ver IDEIAS.md); os campos ficam em branco até o
// Rodrigo criar a conta e preencher aqui.
db.exec(`
  CREATE TABLE IF NOT EXISTS twilio_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    account_sid TEXT NOT NULL DEFAULT '',
    auth_token_enc TEXT NOT NULL DEFAULT '',
    from_number TEXT NOT NULL DEFAULT '',
    to_numbers TEXT NOT NULL DEFAULT '',
    call_after_seconds INTEGER NOT NULL DEFAULT 300
  );
  INSERT OR IGNORE INTO twilio_settings (id) VALUES (1);
`);

// Marca se já ligou por telefone pra esse episódio do alarme — sem isso, a
// cada reenvio do Telegram (ver resend_interval_seconds) ligaria de novo
// também, o que viraria ligação atrás de ligação pro mesmo alarme ainda
// ativo.
const telegramAlarmStateColumnsForCall = db.prepare('PRAGMA table_info(telegram_alarm_state)').all().map((c) => c.name);
if (!telegramAlarmStateColumnsForCall.includes('call_sent_at')) {
  db.exec('ALTER TABLE telegram_alarm_state ADD COLUMN call_sent_at TEXT');
}
