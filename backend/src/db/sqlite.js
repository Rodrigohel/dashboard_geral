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
