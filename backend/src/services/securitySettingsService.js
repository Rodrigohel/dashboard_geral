import { db } from '../db/sqlite.js';

const MIN_MAX = { maxLoginFailures: [3, 50], loginWindowMinutes: [1, 120], sessionHours: [1, 720] };

export function getSecuritySettings() {
  const row = db.prepare('SELECT * FROM security_settings WHERE id = 1').get();
  return {
    maxLoginFailures: row.max_login_failures,
    loginWindowMinutes: row.login_window_minutes,
    sessionHours: row.session_hours,
  };
}

// Limites propositais — sem eles, alguém digitando 0 aqui travaria o
// próprio login pra todo mundo (inclusive o dono) sem forma de desfazer
// pela interface.
export function validateSecuritySettings({ maxLoginFailures, loginWindowMinutes, sessionHours }) {
  const values = { maxLoginFailures, loginWindowMinutes, sessionHours };
  for (const [key, [min, max]] of Object.entries(MIN_MAX)) {
    const v = Number(values[key]);
    if (!Number.isInteger(v) || v < min || v > max) {
      return `Valor inválido para "${key}" — precisa ser um número inteiro entre ${min} e ${max}.`;
    }
  }
  return null;
}

export function saveSecuritySettings({ maxLoginFailures, loginWindowMinutes, sessionHours }) {
  db.prepare(
    'UPDATE security_settings SET max_login_failures = ?, login_window_minutes = ?, session_hours = ? WHERE id = 1'
  ).run(Number(maxLoginFailures), Number(loginWindowMinutes), Number(sessionHours));
}
