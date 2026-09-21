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
