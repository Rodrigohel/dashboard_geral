import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from '../services/cryptoService.js';
import { requireOwner, requireDeviceAccess, requireDeviceOpenAccess } from '../middleware/auth.js';
import * as deviceApi from '../services/accessControlClient.js';
import * as segplaceClient from '../services/segplaceClient.js';
import * as cameraClient from '../services/cameraClient.js';
import { getAnomalyParams } from '../services/anomalySettingsService.js';

export const accessDevicesRouter = Router();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

function serializeDevice(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    model: row.model,
    host: row.host,
    port: row.port,
    useHttps: Boolean(row.use_https),
    deviceUsername: row.device_username,
    remoteId: row.remote_id || null,
    hasCamera: Boolean(row.camera_host),
    cameraHost: row.camera_host || '',
    cameraPort: row.camera_port || 80,
    cameraChannel: row.camera_channel || 1,
    cameraUsername: row.camera_username || '',
    notes: row.notes,
    createdAt: row.created_at,
    lastStatus: row.last_status,
    lastCheckedAt: row.last_checked_at || null,
    lastError: row.last_error,
  };
}

function logDoorOpen({ device, req, success, errorMessage }) {
  db.prepare(
    `INSERT INTO door_open_events (device_id, device_name, user_id, username, success, error_message)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(device.id, device.name, req.user.sub, req.user.username, success ? 1 : 0, errorMessage || '');
}

function visibleDevices(req) {
  if (req.user.role === 'owner') {
    return db.prepare('SELECT * FROM access_devices ORDER BY name ASC').all();
  }
  return db
    .prepare(
      `SELECT d.* FROM access_devices d
       JOIN device_permissions p ON p.device_id = d.id
       WHERE p.user_id = ? ORDER BY d.name ASC`
    )
    .all(req.user.sub);
}

const lastOpenStmt = db.prepare(
  `SELECT id, username, success, created_at, CAST(strftime('%H', created_at) AS INTEGER) AS hour
   FROM door_open_events WHERE device_id = ? ORDER BY id DESC LIMIT 1`
);
const baselineOpenCountStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM door_open_events WHERE device_id = ? AND success = 1 AND id != ?`
);
const sameHourOpenCountStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM door_open_events
   WHERE device_id = ? AND success = 1 AND id != ? AND CAST(strftime('%H', created_at) AS INTEGER) = ?`
);
// Só arrisca dizer "horário incomum" com histórico suficiente pra saber o
// que é normal — sem isso, os primeiros usos de um porteiro novo seriam
// TODOS "anômalos" (não tem nada com que comparar ainda). O mínimo de
// amostra é configurável em Configurações > Sensibilidade de anomalia
// (quanto menor, mais cedo passa a avaliar — e mais sensível fica).
function getLastOpen(deviceId) {
  const row = lastOpenStmt.get(deviceId);
  if (!row) return null;
  let anomaly = null;
  if (row.success) {
    const baseline = baselineOpenCountStmt.get(deviceId, row.id).c;
    if (baseline >= getAnomalyParams().acessoMinSample) {
      anomaly = sameHourOpenCountStmt.get(deviceId, row.id, row.hour).c === 0;
    }
  }
  return { username: row.username, success: Boolean(row.success), createdAt: row.created_at, anomaly };
}

function canOpenDevice(req, deviceId) {
  if (req.user.role === 'owner') return true;
  return Boolean(
    db.prepare('SELECT 1 FROM device_open_permissions WHERE user_id = ? AND device_id = ?').get(req.user.sub, deviceId)
  );
}

function getDeviceOr404(req, res) {
  const device = db.prepare('SELECT * FROM access_devices WHERE id = ?').get(req.params.id || req.params.deviceId);
  if (!device) {
    res.status(404).json({ error: 'Equipamento não encontrado' });
    return null;
  }
  return device;
}

// Busca os portões já cadastrados numa conta Segplace — usado pelo
// formulário "Novo equipamento" pra deixar o dono escolher qual portão
// (a conta pode ter mais de um) essa linha do Portal vai representar, sem
// precisar adivinhar o "id" interno da Segplace.
accessDevicesRouter.post('/segplace/discover', requireOwner, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha do Segplace são obrigatórios' });
  }
  try {
    const gates = await segplaceClient.listGates(username, password);
    res.json(gates);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- CRUD do cadastro do equipamento (só owner) ---

accessDevicesRouter.get('/', (req, res) => {
  res.json(
    visibleDevices(req).map((d) => ({ ...serializeDevice(d), canOpen: canOpenDevice(req, d.id), lastOpen: getLastOpen(d.id) }))
  );
});

accessDevicesRouter.post('/', requireOwner, (req, res) => {
  let {
    name,
    location,
    model,
    host,
    port,
    useHttps,
    deviceUsername,
    devicePassword,
    remoteId,
    notes,
    cameraHost,
    cameraPort,
    cameraChannel,
    cameraUsername,
    cameraPassword,
  } = req.body || {};

  // Segplace não tem host/porta configurável (é sempre a nuvem deles) — em
  // vez disso identifica o portão pelo "remoteId" escolhido via
  // POST /segplace/discover.
  if (model === 'segplace') {
    host = 'segplace.seekat.com.br';
    port = 443;
    useHttps = true;
    if (!name || !deviceUsername || !devicePassword || !remoteId) {
      return res.status(400).json({ error: 'Nome, usuário, senha e o portão escolhido (remoteId) são obrigatórios' });
    }
  } else if (!name || !host || !deviceUsername || !devicePassword) {
    return res.status(400).json({ error: 'Nome, host, usuário e senha do equipamento são obrigatórios' });
  }

  const info = db
    .prepare(
      `INSERT INTO access_devices
        (name, location, model, host, port, use_https, device_username, device_password_enc, remote_id, notes,
         camera_host, camera_port, camera_channel, camera_username, camera_password_enc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      location || '',
      model || 'xpe3200',
      host,
      Number(port) || 80,
      useHttps ? 1 : 0,
      deviceUsername,
      encryptSecret(devicePassword),
      remoteId || '',
      notes || '',
      cameraHost || '',
      Number(cameraPort) || 80,
      Number(cameraChannel) || 1,
      cameraUsername || '',
      cameraPassword ? encryptSecret(cameraPassword) : ''
    );
  res.status(201).json(serializeDevice(db.prepare('SELECT * FROM access_devices WHERE id = ?').get(info.lastInsertRowid)));
});

accessDevicesRouter.put('/:id', requireOwner, (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  let {
    name,
    location,
    model,
    host,
    port,
    useHttps,
    deviceUsername,
    devicePassword,
    remoteId,
    notes,
    cameraHost,
    cameraPort,
    cameraChannel,
    cameraUsername,
    cameraPassword,
  } = req.body || {};

  if ((model ?? device.model) === 'segplace') {
    host = 'segplace.seekat.com.br';
    port = 443;
    useHttps = true;
  }

  db.prepare(
    `UPDATE access_devices SET
      name = ?, location = ?, model = ?, host = ?, port = ?, use_https = ?, device_username = ?, remote_id = ?, notes = ?,
      camera_host = ?, camera_port = ?, camera_channel = ?, camera_username = ?
     WHERE id = ?`
  ).run(
    name ?? device.name,
    location ?? device.location,
    model ?? device.model,
    host ?? device.host,
    Number(port ?? device.port),
    useHttps === undefined ? device.use_https : useHttps ? 1 : 0,
    deviceUsername ?? device.device_username,
    remoteId ?? device.remote_id,
    notes ?? device.notes,
    cameraHost ?? device.camera_host,
    Number(cameraPort ?? device.camera_port),
    Number(cameraChannel ?? device.camera_channel),
    cameraUsername ?? device.camera_username,
    device.id
  );
  if (devicePassword) {
    db.prepare('UPDATE access_devices SET device_password_enc = ? WHERE id = ?').run(encryptSecret(devicePassword), device.id);
  }
  if (cameraPassword) {
    db.prepare('UPDATE access_devices SET camera_password_enc = ? WHERE id = ?').run(encryptSecret(cameraPassword), device.id);
  }
  res.json(serializeDevice(db.prepare('SELECT * FROM access_devices WHERE id = ?').get(device.id)));
});

accessDevicesRouter.delete('/:id', requireOwner, (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  db.prepare('DELETE FROM access_devices WHERE id = ?').run(device.id);
  res.status(204).end();
});

accessDevicesRouter.post('/:id/test-connection', requireOwner, async (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  try {
    await deviceApi.testConnection(device, decryptSecret(device.device_password_enc));
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Abre a porta/fechadura remotamente — permissão à parte de "gerenciar
// usuários" (ver requireDeviceOpenAccess): dá pra liberar só o botão de
// abrir pra um porteiro/zelador sem dar acesso ao cadastro de moradores.
accessDevicesRouter.post('/:id/open', requireDeviceAccess, requireDeviceOpenAccess, async (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  try {
    await deviceApi.openDoor(device, decryptSecret(device.device_password_enc));
    logDoorOpen({ device, req, success: true });
    res.json({ ok: true });
  } catch (err) {
    logDoorOpen({ device, req, success: false, errorMessage: err.message });
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Foto (não vídeo — navegador não toca RTSP nativo) de uma câmera IP
// avulsa apontada pro portão/porteiro, sem relação com a API do próprio
// equipamento de acesso (ver cameraClient.js). Mesma permissão de quem
// pode abrir a porta: é pensado pra ficar ao lado do botão "Abrir".
accessDevicesRouter.get('/:id/camera-snapshot', requireDeviceAccess, requireDeviceOpenAccess, async (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  if (!device.camera_host) return res.status(404).json({ error: 'Este equipamento não tem câmera configurada.' });
  try {
    const { buffer, contentType } = await cameraClient.fetchSnapshot(
      { host: device.camera_host, port: device.camera_port, channel: device.camera_channel, username: device.camera_username },
      decryptSecret(device.camera_password_enc)
    );
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Busca um usuário (por nome) em todos os equipamentos que o usuário logado
// enxerga de uma vez, em vez de abrir porteiro por porteiro — cada
// equipamento é consultado em paralelo e o que der erro (offline,
// credencial errada) não derruba os outros, só entra em "errors" separado.
accessDevicesRouter.get('/search-users', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [], errors: [] });
  const devices = visibleDevices(req);
  const results = [];
  const errors = [];
  await Promise.all(
    devices.map(async (device) => {
      try {
        const users = await deviceApi.listUsers(device, decryptSecret(device.device_password_enc));
        for (const user of users) {
          if ((user.name || '').toLowerCase().includes(q)) {
            results.push({ device: { id: device.id, name: device.name, location: device.location }, user });
          }
        }
      } catch (err) {
        errors.push({ device: { id: device.id, name: device.name }, message: err.message });
      }
    })
  );
  res.json({ results, errors });
});

// --- Usuários dentro do equipamento (liberado a quem tem device_permissions) ---

accessDevicesRouter.get('/:deviceId/users', requireDeviceAccess, async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  try {
    const users = await deviceApi.listUsers(device, decryptSecret(device.device_password_enc));
    res.json(users);
  } catch (err) {
    res.status(502).json({ error: `Não foi possível falar com o equipamento: ${err.message}` });
  }
});

accessDevicesRouter.post('/:deviceId/users', requireDeviceAccess, async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  const { name, registration, password, cardNumber, expiration, apartment } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const user = await deviceApi.createUser(device, decryptSecret(device.device_password_enc), {
      name,
      registration,
      password,
      cardNumber,
      expiration,
      apartment,
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(502).json({ error: `Não foi possível criar o usuário no equipamento: ${err.message}` });
  }
});

accessDevicesRouter.put('/:deviceId/users/:userId', requireDeviceAccess, async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  try {
    const user = await deviceApi.updateUser(device, decryptSecret(device.device_password_enc), req.params.userId, req.body || {});
    res.json(user);
  } catch (err) {
    res.status(502).json({ error: `Não foi possível atualizar o usuário: ${err.message}` });
  }
});

accessDevicesRouter.delete('/:deviceId/users/:userId', requireDeviceAccess, async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  try {
    await deviceApi.deleteUser(device, decryptSecret(device.device_password_enc), req.params.userId);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Não foi possível remover o usuário: ${err.message}` });
  }
});

accessDevicesRouter.post('/:deviceId/users/:userId/photo', requireDeviceAccess, upload.single('photo'), async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  if (!req.file) return res.status(400).json({ error: 'Envie um arquivo de foto (campo "photo")' });
  try {
    await deviceApi.setUserPhoto(device, decryptSecret(device.device_password_enc), req.params.userId, req.file.buffer, req.file.mimetype);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: `Não foi possível enviar a foto: ${err.message}` });
  }
});

accessDevicesRouter.get('/:deviceId/users/:userId/photo', requireDeviceAccess, async (req, res) => {
  const device = getDeviceOr404({ params: { id: req.params.deviceId } }, res);
  if (!device) return;
  try {
    const photo = await deviceApi.getUserPhoto(device, decryptSecret(device.device_password_enc), req.params.userId);
    if (!photo) return res.status(404).json({ error: 'Este usuário não tem foto cadastrada.' });
    res.set('Content-Type', 'image/jpeg');
    res.send(photo);
  } catch (err) {
    res.status(502).json({ error: `Não foi possível buscar a foto: ${err.message}` });
  }
});
