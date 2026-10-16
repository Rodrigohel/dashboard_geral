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

const POINT_KEYS = ['pronto', 'falha', 'emOperacao', 'avisoAtivo'];

// Lê o valor NUMÉRICO cru de um registrador (holding/input) — diferente de
// readPoint acima, que sempre devolve booleano. Usado pros pontos de valor
// (tensões em Volts, e os códigos de Estado do Motor/Modo do Controlador,
// decodificados abaixo via ENGINE_STATE_LABELS/CONTROLLER_MODE_LABELS).
async function readValuePoint(client, point) {
  if (point.addr === null || point.addr === undefined) return null;
  const addr = Number(point.addr);
  const r = point.type === 'input' ? await client.readInputRegisters(addr, 1) : await client.readHoldingRegisters(addr, 1);
  return Number(r.data[0]);
}

const VALUE_POINT_KEYS = [
  'tensaoGeradorL1N',
  'tensaoGeradorL2N',
  'tensaoGeradorL3N',
  'tensaoRedeL1N',
  'tensaoRedeL2N',
  'tensaoRedeL3N',
];

// Mapa do ComAp InteliLite4 (List#8/List#15 do cfgmodbus.txt mandado pelo
// Rodrigo) — "Estado do Motor" (Com.Obj 9244) e "Modo do Controlador"
// (Com.Obj 9887) vêm como código numérico; valor fora da lista mostra o
// código cru em vez de travar (controlador pode ter uma versão de firmware
// com mais estados do que os documentados aqui).
const ENGINE_STATE_LABELS = {
  0: 'Iniciando', 1: 'Pronto', 2: 'Não Pronto', 3: 'Pré-Partida', 4: 'Arranque', 5: 'Pausa',
  6: 'Em Partida', 7: 'Em Funcionamento', 8: 'Em Carga', 9: 'Rampa de Descarga', 10: 'Resfriamento',
  11: 'Parada', 12: 'Shutdown', 13: 'Ventilação', 14: 'Emergência Manual', 15: 'Rampa de Carga',
  16: 'Espere Parar', 17: 'Ventilação (Shutdown)',
};
const CONTROLLER_MODE_LABELS = { 0: 'Off', 1: 'Manual', 2: 'Automático', 3: 'Teste' };

function decodeEnum(labels, rawValue) {
  if (rawValue === null) return null;
  return { code: rawValue, label: labels[rawValue] ?? `Código ${rawValue} (não mapeado)` };
}

// Alguns controladores derrubam a conexão TCP em vez de responder a um
// pedido que não entendem (ver diagnoseModbus) — sem reconectar, UMA leitura
// assim mata a sequência inteira: tudo depois vira "Port Not Open", mascarando
// o que cada ponto realmente diria. Reconecta uma vez se achar a porta
// fechada antes do próximo ponto.
async function ensureOpen(client, host, port, unitId) {
  if (client.isOpen) return;
  await client.connectTCP(host, { port: port || 502 });
  client.setID(unitId || 1);
}

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
        await ensureOpen(client, config.host, config.port, config.unitId);
        result[key] = await readPoint(client, point);
      } catch (err) {
        result[key] = { error: err.message };
      }
    }
    for (const key of VALUE_POINT_KEYS) {
      const point = config.valuePoints[key];
      try {
        await ensureOpen(client, config.host, config.port, config.unitId);
        result[key] = await readValuePoint(client, point);
      } catch (err) {
        result[key] = { error: err.message };
      }
    }
    try {
      await ensureOpen(client, config.host, config.port, config.unitId);
      result.estadoMotor = decodeEnum(ENGINE_STATE_LABELS, await readValuePoint(client, config.valuePoints.estadoMotor));
    } catch (err) {
      result.estadoMotor = { error: err.message };
    }
    try {
      await ensureOpen(client, config.host, config.port, config.unitId);
      result.modoControlador = decodeEnum(CONTROLLER_MODE_LABELS, await readValuePoint(client, config.valuePoints.modoControlador));
    } catch (err) {
      result.modoControlador = { error: err.message };
    }
    for (const point of config.customPoints || []) {
      try {
        await ensureOpen(client, config.host, config.port, config.unitId);
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

// Diagnóstico Modbus (ver IDEIAS.md — o Rodrigo achou "Timed out" seguido
// de "Port Not Open" em todos os pontos). "Timed out" na 1ª leitura com
// "Port Not Open" em cascata nas seguintes é a conexão sendo DERRUBADA pelo
// controlador em vez de responder — compatível com dois motivos bem
// diferentes: (a) function code errado (o CM-Ethernet pode só falar
// holding/input register — FC3/4 — e recusar coil/discrete — FC1/2, mesmo
// a documentação dizendo que FC1/2 é permitido) ou (b) unit ID errado (o
// "Endereço do Controlador", registrador de setpoint 03029, pode não ser
// 1). Testa os dois de uma vez, cada combinação numa conexão nova (pra um
// teste que derruba a porta não estragar o próximo) com timeout curto.
async function tryRead(host, port, unitId, fn) {
  const client = new ModbusRTU();
  client.setTimeout(800);
  try {
    await client.connectTCP(host, { port: port || 502 });
    client.setID(unitId);
    const value = await fn(client);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    try {
      client.close(() => {});
    } catch {
      // idem
    }
  }
}

export async function diagnoseModbus({ host, port, unitId }) {
  if (!host) throw new Error('Informe o IP do controlador.');
  const baseId = Number(unitId) || 1;

  const functionCodes = {
    'FC3 (holding register) — Tensão Gerador L1-N @ 33': (id) => tryRead(host, port, id, (c) => c.readHoldingRegisters(33, 1).then((r) => r.data[0])),
    'FC1 (coil) — Pronto @ 39': (id) => tryRead(host, port, id, (c) => c.readCoils(39, 1).then((r) => r.data[0])),
    'FC2 (discrete input) — Pronto @ 39': (id) => tryRead(host, port, id, (c) => c.readDiscreteInputs(39, 1).then((r) => r.data[0])),
    'FC4 (input register) — Tensão Gerador L1-N @ 33': (id) => tryRead(host, port, id, (c) => c.readInputRegisters(33, 1).then((r) => r.data[0])),
  };
  const byFunctionCode = {};
  for (const [label, test] of Object.entries(functionCodes)) {
    byFunctionCode[label] = await test(baseId);
  }

  // Varredura de Unit ID (só com FC3, o teste acima menos arriscado de
  // derrubar a porta) — 1 a 10 cobre a maioria das instalações reais; o
  // range oficial do ComAp vai até 32, mas raramente passa de poucas
  // unidades numa instalação com um gerador só.
  const byUnitId = {};
  for (let id = 1; id <= 10; id++) {
    byUnitId[id] = await tryRead(host, port, id, (c) => c.readHoldingRegisters(33, 1).then((r) => r.data[0]));
  }

  return { host, port: port || 502, configuredUnitId: baseId, byFunctionCode, byUnitId };
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
