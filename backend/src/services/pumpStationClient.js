// Leitura da casa de bombas via Modbus TCP — não fala com o LOGO
// diretamente, fala com a IHM Weintek que já está ligada nele (ela tem um
// servidor Modbus TCP/IP embutido, feito exatamente pra isso: deixar outro
// sistema ler os mesmos valores mostrados na tela dela, sem precisar da
// senha do LOGO). Cada sinal (nível, bomba, térmico...) tem endereço e tipo
// de registrador configurados pela tela "Bombas" — nunca um valor fixo
// aqui, porque esse mapeamento é escolhido durante a configuração da IHM
// (ver docs/casa-de-bombas.md) e muda de instalação pra instalação.
import ModbusRTU from 'modbus-serial';

const TIMEOUT_MS = 5000;

// Cada "ponto" é { addr, type, invert } — type decide qual função Modbus
// ler. Coil/discrete voltam array de boolean; holding/input voltam array de
// number (0/1 também contam como desligado/ligado nesse caso). `invert`
// inverte o booleano final — o sentido do contato (normalmente aberto vs.
// normalmente fechado) varia de sinal pra sinal e de instalação pra
// instalação (confirmado em campo: um circuito de segurança com contato NF
// lê "1" com tudo normal e "0" só quando aciona), então é configurável por
// ponto em vez de assumido fixo no código.
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

const POINT_KEYS = [
  'nivelMinimo',
  'nivelMedio',
  'nivelMaximo',
  'nivelSeguranca',
  'bomba1',
  'bomba2',
  'termico1',
  'termico2',
  'modoManual',
  'emergencia',
  'faltaFase',
  'painelDesligado',
  'falhaBoias',
  'bomba1DoDia',
  'bomba2DoDia',
];

// `config` é a linha da tabela pump_station já convertida pra camelCase
// (ver serializePumpStationConfig em routes/pumpStation.js) — espera
// `points.<chave> = { addr, type }` pra cada um dos POINT_KEYS acima.
export async function readPumpStationStatus(config) {
  if (!config.host) {
    throw new Error('Endereço (IP) da IHM não configurado.');
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
        // Um ponto não configurado (addr vazio) já retorna null em
        // readPoint sem chegar aqui — isso é erro de leitura de verdade
        // (endereço configurado mas a IHM recusou/não respondeu). Não
        // derruba a leitura inteira por causa de UM sinal com problema.
        result[key] = { error: err.message };
      }
    }
    return result;
  } catch (err) {
    // Sem o host/porta na mensagem de propósito: esse erro sobe até
    // GET /status, que qualquer usuário com o módulo "bombas" (não só quem
    // edita a configuração) pode ver — IP/porta da IHM é detalhe de
    // infraestrutura que não deve vazar pra fora da tela de configuração.
    throw new Error(`Não consegui alcançar a IHM configurada (${err.message}).`);
  } finally {
    try {
      client.close(() => {});
    } catch {
      // socket já pode ter caído sozinho — fechar de novo não é problema
    }
  }
}

// Usado pelo botão "Testar conexão" — só confirma que dá pra abrir a
// conexão Modbus TCP com a IHM, sem exigir nenhum ponto configurado ainda.
export async function testPumpStationConnection(host, port, unitId) {
  const client = new ModbusRTU();
  client.setTimeout(TIMEOUT_MS);
  try {
    await client.connectTCP(host, { port: port || 502 });
    client.setID(unitId || 1);
    // FC1 lendo 1 coil do endereço 0 — não precisa existir de verdade, só
    // confirma que a IHM responde no protocolo Modbus (mesmo uma resposta
    // de erro Modbus, tipo "endereço inválido", já prova que o servidor
    // está de pé e falando o protocolo certo).
    await client.readCoils(0, 1).catch(() => {});
  } finally {
    try {
      client.close(() => {});
    } catch {
      // idem
    }
  }
}
