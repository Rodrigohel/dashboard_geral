// Leitura do gerador via Modbus TCP — direto no controlador (ComAp AMF-9),
// sem login: Modbus em si não tem conceito de usuário/senha (só a tela de
// monitoramento própria do controlador teria isso, que o Portal não usa).
// Mesmo padrão de pumpStationClient.js (casa de bombas) — cada ponto tem
// endereço/tipo configurados pela tela "Gerador", nunca fixo aqui, porque o
// mapeamento depende de como o controlador foi configurado na instalação.
import ModbusRTU from 'modbus-serial';

const TIMEOUT_MS = 5000;

async function readPoint(client, point) {
  if (point.addr === null || point.addr === undefined) return null;
  const addr = Number(point.addr);
  let value;
  switch (point.type) {
    case 'discrete': {
      const r = await client.readDiscreteInputs(addr, 1);
      value = Boolean(r.data[0]);
      break;
    }
    case 'holding': {
      const r = await client.readHoldingRegisters(addr, 1);
      value = Number(r.data[0]) !== 0;
      break;
    }
    case 'input': {
      const r = await client.readInputRegisters(addr, 1);
      value = Number(r.data[0]) !== 0;
      break;
    }
    case 'coil':
    default: {
      const r = await client.readCoils(addr, 1);
      value = Boolean(r.data[0]);
      break;
    }
  }
  return point.invert ? !value : value;
}

const POINT_KEYS = ['pronto', 'falha', 'emOperacao'];

export async function readGeneratorStatus(config) {
  if (!config.host) {
    throw new Error('Endereço (IP) do controlador não configurado.');
  }

  const client = new ModbusRTU();
  client.setTimeout(TIMEOUT_MS);
  try {
    await client.connectTCP(config.host, { port: config.port || 502 });
    client.setID(config.unitId || 1);

    const result = {};
    for (const key of POINT_KEYS) {
      const point = config.points[key];
      try {
        result[key] = await readPoint(client, point);
      } catch (err) {
        result[key] = { error: err.message };
      }
    }
    for (const point of config.customPoints || []) {
      try {
        result[`custom_${point.id}`] = await readPoint(client, point);
      } catch (err) {
        result[`custom_${point.id}`] = { error: err.message };
      }
    }
    return result;
  } catch (err) {
    throw new Error(`Não consegui alcançar o controlador configurado (${err.message}).`);
  } finally {
    try {
      client.close(() => {});
    } catch {
      // socket já pode ter caído sozinho
    }
  }
}

export async function testGeneratorConnection(host, port, unitId) {
  const client = new ModbusRTU();
  client.setTimeout(TIMEOUT_MS);
  try {
    await client.connectTCP(host, { port: port || 502 });
    client.setID(unitId || 1);
    await client.readCoils(0, 1).catch(() => {});
  } finally {
    try {
      client.close(() => {});
    } catch {
      // idem
    }
  }
}
