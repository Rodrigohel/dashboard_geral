// Cliente para a API HTTP embutida nos controladores de acesso facial
// Intelbras (XPE 3200 IP Face, SS 3532 MF e afins) — todos derivados da
// mesma plataforma "Control iD" por trás da linha de controle de acesso da
// Intelbras, expondo endpoints .fcgi para login e CRUD de objetos
// (create_objects / load_objects / modify_objects / destroy_objects) e
// upload de foto facial (user_set_image).
//
// IMPORTANTE: a Intelbras não publica um dicionário de campos 100% aberto
// do objeto "users" — o formato abaixo segue o que está documentado
// publicamente para a API Control iD/Bio-T. Antes de ir para produção,
// valide num equipamento real (ex.: `listUsers` numa unidade de teste) e
// ajuste os nomes de campo em `toDeviceUser`/`fromDeviceUser` se o
// firmware instalado usar nomes diferentes.

function baseUrlOf(device) {
  const scheme = device.use_https ? 'https' : 'http';
  return `${scheme}://${device.host}:${device.port}`;
}

async function request(device, session, fcgiPath, body) {
  const url = `${baseUrlOf(device)}/${fcgiPath}`;
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers.Cookie = session;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(8000),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta inesperada do equipamento (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || data.error) {
    throw new Error(data.error || `Falha ao falar com o equipamento (HTTP ${res.status})`);
  }
  return { data, res };
}

// Autentica e devolve o cookie de sessão a ser reenviado nas próximas
// chamadas. Alguns firmwares devolvem a sessão no corpo (`session`) em vez
// de cookie — cobrimos os dois casos.
async function login(device, password) {
  const { data, res } = await request(device, null, 'login.fcgi', {
    login: device.device_username,
    password,
  });

  const setCookie = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie')].filter(Boolean);

  if (setCookie.length) return setCookie.map((c) => c.split(';')[0]).join('; ');
  if (data.session) return `session=${data.session}`;
  throw new Error('Login aceito, mas o equipamento não retornou uma sessão.');
}

function toDeviceUser(input) {
  const values = {
    name: input.name,
    registration: input.registration || String(input.name || '').slice(0, 20),
  };
  if (input.password) values.password = input.password;
  if (input.expiration) values.expiration = input.expiration; // ISO date, acesso expira nessa data
  if (input.cardNumber) values.card_number = input.cardNumber;
  return values;
}

function fromDeviceUser(row) {
  return {
    id: row.id,
    name: row.name,
    registration: row.registration,
    hasFace: Boolean(row.image ?? row.has_image),
    cardNumber: row.card_number || row.cardNumber || null,
    expiration: row.expiration || null,
  };
}

export async function listUsers(device, password) {
  const session = await login(device, password);
  const { data } = await request(device, session, 'load_objects.fcgi', { object: 'users' });
  return (data.users || []).map(fromDeviceUser);
}

export async function createUser(device, password, input) {
  const session = await login(device, password);
  const { data } = await request(device, session, 'create_objects.fcgi', {
    object: 'users',
    values: [toDeviceUser(input)],
  });
  const id = data.ids?.[0];
  if (!id) throw new Error('Equipamento não retornou o id do usuário criado.');
  return { id, ...fromDeviceUser({ id, ...toDeviceUser(input) }) };
}

export async function updateUser(device, password, userId, input) {
  const session = await login(device, password);
  await request(device, session, 'modify_objects.fcgi', {
    object: 'users',
    match: { id: userId },
    values: toDeviceUser(input),
  });
  return { id: userId, ...fromDeviceUser({ id: userId, ...toDeviceUser(input) }) };
}

export async function deleteUser(device, password, userId) {
  const session = await login(device, password);
  await request(device, session, 'destroy_objects.fcgi', {
    object: 'users',
    match: { id: userId },
  });
}

// Cadastro/troca da foto facial — multipart, não JSON como os demais.
export async function setUserPhoto(device, password, userId, fileBuffer, mimeType) {
  const session = await login(device, password);
  const form = new FormData();
  form.append('user_id', String(userId));
  form.append('file', new Blob([fileBuffer], { type: mimeType || 'image/jpeg' }), 'face.jpg');

  const res = await fetch(`${baseUrlOf(device)}/user_set_image.fcgi`, {
    method: 'POST',
    headers: { Cookie: session },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Falha ao enviar a foto (HTTP ${res.status})`);
}

// Usado pelo botão "Testar conexão" na tela de equipamentos — só confirma
// que dá para logar, sem mexer em nada.
export async function testConnection(device, password) {
  await login(device, password);
  return true;
}
