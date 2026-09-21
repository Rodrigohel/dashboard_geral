import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/sqlite.js';
import { encryptSecret, decryptSecret } from '../services/cryptoService.js';
import { requireOwner, requireDeviceAccess } from '../middleware/auth.js';
import * as deviceApi from '../services/accessControlClient.js';

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
    notes: row.notes,
    createdAt: row.created_at,
  };
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

function getDeviceOr404(req, res) {
  const device = db.prepare('SELECT * FROM access_devices WHERE id = ?').get(req.params.id || req.params.deviceId);
  if (!device) {
    res.status(404).json({ error: 'Equipamento não encontrado' });
    return null;
  }
  return device;
}

// --- CRUD do cadastro do equipamento (só owner) ---

accessDevicesRouter.get('/', (req, res) => {
  res.json(visibleDevices(req).map(serializeDevice));
});

accessDevicesRouter.post('/', requireOwner, (req, res) => {
  const { name, location, model, host, port, useHttps, deviceUsername, devicePassword, notes } = req.body || {};
  if (!name || !host || !deviceUsername || !devicePassword) {
    return res.status(400).json({ error: 'Nome, host, usuário e senha do equipamento são obrigatórios' });
  }
  const info = db
    .prepare(
      `INSERT INTO access_devices
        (name, location, model, host, port, use_https, device_username, device_password_enc, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      notes || ''
    );
  res.status(201).json(serializeDevice(db.prepare('SELECT * FROM access_devices WHERE id = ?').get(info.lastInsertRowid)));
});

accessDevicesRouter.put('/:id', requireOwner, (req, res) => {
  const device = getDeviceOr404(req, res);
  if (!device) return;
  const { name, location, model, host, port, useHttps, deviceUsername, devicePassword, notes } = req.body || {};

  db.prepare(
    `UPDATE access_devices SET
      name = ?, location = ?, model = ?, host = ?, port = ?, use_https = ?, device_username = ?, notes = ?
     WHERE id = ?`
  ).run(
    name ?? device.name,
    location ?? device.location,
    model ?? device.model,
    host ?? device.host,
    Number(port ?? device.port),
    useHttps === undefined ? device.use_https : useHttps ? 1 : 0,
    deviceUsername ?? device.device_username,
    notes ?? device.notes,
    device.id
  );
  if (devicePassword) {
    db.prepare('UPDATE access_devices SET device_password_enc = ? WHERE id = ?').run(encryptSecret(devicePassword), device.id);
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
  const { name, registration, password, cardNumber, expiration } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const user = await deviceApi.createUser(device, decryptSecret(device.device_password_enc), {
      name,
      registration,
      password,
      cardNumber,
      expiration,
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
