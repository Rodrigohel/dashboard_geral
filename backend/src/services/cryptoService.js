import crypto from 'node:crypto';
import { config } from '../config.js';

// SHA-256 da chave configurada garante exatamente 32 bytes (AES-256), não
// importa o tamanho/formato do que estiver em CREDENTIALS_KEY. Mesmo
// esquema usado no painel de Rede, para consistência entre os projetos.
const KEY = crypto.createHash('sha256').update(config.credentialsKey).digest();

/**
 * Criptografia simétrica (AES-256-GCM), reversível de propósito: usada para
 * senha de controlador de acesso e credenciais de serviço dos gateways, que
 * o próprio Portal precisa reenviar para autenticar em outro sistema. A
 * proteção real é a CREDENTIALS_KEY nunca sair do .env do servidor.
 */
export function encryptSecret(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(payload) {
  if (!payload) return '';
  try {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
