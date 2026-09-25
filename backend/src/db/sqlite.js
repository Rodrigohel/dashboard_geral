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

  -- Nome e logo mostrados na tela de login e na barra lateral — uma linha
  -- só (id fixo = 1). Público de propósito (GET): a tela de login precisa
  -- mostrar isso ANTES do usuário entrar.
  CREATE TABLE IF NOT EXISTS branding (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT 'Portal',
    logo_filename TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO branding (id, name, logo_filename) VALUES (1, 'Portal', '');
`);

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
