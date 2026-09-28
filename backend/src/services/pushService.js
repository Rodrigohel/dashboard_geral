import webpush from 'web-push';
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from './cryptoService.js';

// E-mail de contato exigido pelo padrão VAPID (vai no cabeçalho 'mailto:'
// que os serviços de push dos navegadores usam pra falar com o
// administrador do site em caso de abuso) — não é enviado a ninguém, só
// identifica o remetente perante Google/Mozilla/Apple.
const VAPID_CONTACT = 'mailto:admin@portal.local';

function getRow() {
  return db.prepare('SELECT * FROM push_settings WHERE id = 1').get();
}

// Exposto a qualquer usuário autenticado — o navegador precisa da chave
// pública pra se inscrever, mesmo que o usuário não seja dono.
export function getPublicPushInfo() {
  const row = getRow();
  return { enabled: Boolean(row.enabled), publicKey: row.enabled ? row.vapid_public_key : null };
}

export function getPushSettings() {
  const row = getRow();
  return { enabled: Boolean(row.enabled) };
}

function configureWebPush(row) {
  webpush.setVapidDetails(VAPID_CONTACT, row.vapid_public_key, decryptSecret(row.vapid_private_key_enc));
}

// Gera o par de chaves só na primeira vez que o dono ativa — reaproveita
// depois (inclusive se desligar e ligar de novo) pra não invalidar
// assinaturas já feitas pelos navegadores dos usuários.
export function setPushEnabled(enabled) {
  const row = getRow();
  if (enabled && !row.vapid_public_key) {
    const keys = webpush.generateVAPIDKeys();
    db.prepare('UPDATE push_settings SET enabled = 1, vapid_public_key = ?, vapid_private_key_enc = ? WHERE id = 1').run(
      keys.publicKey,
      encryptSecret(keys.privateKey)
    );
  } else {
    db.prepare('UPDATE push_settings SET enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
  }
  return getPushSettings();
}

export function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Assinatura de push inválida.');
  }
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  ).run(userId, endpoint, keys.p256dh, keys.auth);
}

export function removeSubscription(endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

// Manda pra todos os donos (owner) — os avisos hoje disponíveis (porteiro
// caiu, trava de força bruta) são de infraestrutura/segurança, mesmo
// público que já enxerga Auditoria e Saúde do servidor. Falha de entrega
// de uma assinatura específica (410/404 = o navegador cancelou a inscrição
// sozinho) remove essa assinatura em vez de derrubar as outras.
export async function notifyOwners(payload) {
  const row = getRow();
  if (!row.enabled) return;
  const subs = db
    .prepare(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.role = 'owner'`
    )
    .all();
  if (subs.length === 0) return;
  configureWebPush(row);
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          removeSubscription(sub.endpoint);
        }
      }
    })
  );
}

export function notifyDeviceOffline(device) {
  return notifyOwners({
    title: 'Porteiro offline',
    body: `"${device.name}" parou de responder.`,
    tag: `device-offline-${device.id}`,
  }).catch(() => {});
}

export function notifyLoginLockout(username, ip) {
  return notifyOwners({
    title: 'Trava de força bruta disparada',
    body: `Muitas tentativas de login para "${username}" (${ip || 'IP desconhecido'}).`,
    tag: 'login-lockout',
  }).catch(() => {});
}
