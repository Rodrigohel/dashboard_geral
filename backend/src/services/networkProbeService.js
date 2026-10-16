// Sonda de diagnóstico de rede genérica — IP e porta QUALQUER, só pra quem é
// dono (ver requireOwner na rota). Começou presa ao gerador (ComAp AMF-9,
// porta 23) mas o Rodrigo pediu pra generalizar: "não sei se pode tirar ele
// daí, colocar em outro lugar para escanear o IP que eu quiser... só pra
// mim, o administrador" — útil pra qualquer equipamento com protocolo não
// documentado (abre a conexão, manda o texto digitado, se algum, e devolve
// tudo que chegou em `timeoutMs` — texto e hex, porque se for binário o
// texto vem ilegível).
import net from 'node:net';

export function probeTcp({ host, port, send = '', timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Informe o IP/host.'));
    if (!port) return reject(new Error('Informe a porta.'));
    const socket = new net.Socket();
    const chunks = [];
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;
      socket.destroy();
      const buffer = Buffer.concat(chunks);
      if (error && buffer.length === 0) return reject(error);
      resolve({ text: buffer.toString('latin1'), hex: buffer.toString('hex'), bytes: buffer.length });
    }

    socket.setTimeout(timeoutMs);
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('timeout', () => finish());
    socket.on('close', () => finish());
    socket.on('error', (err) => finish(err));
    socket.connect(port, host, () => {
      if (send) socket.write(send.endsWith('\n') ? send : send + '\r\n');
    });
  });
}

// Varredura de portas (pedido do Rodrigo: "eu só queria botar o IP e ele
// catar... os IPs e as portas que aquele IP tem aberta", depois "cobre
// tudo" — faixa inteira 1-65535) — não troca dados com nenhuma, só tenta
// conectar em cada uma e vê se fecha a conexão TCP (aberta) ou recusa/não
// responde (fechada/filtrada). `spec` é uma lista tipo "22,80,443,8000-
// 8100"; MAX_PORTS = 65535 é o máximo que existe, então na prática não
// bloqueia nada — só impede um valor absurdo tipo "0-999999999" de travar
// o parse.
const MAX_PORTS = 65535;

export function parsePortSpec(spec) {
  const ports = new Set();
  for (const part of String(spec || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
      if (p >= 1 && p <= 65535) ports.add(p);
    }
  }
  if (ports.size === 0) throw new Error('Nenhuma porta válida nessa lista.');
  if (ports.size > MAX_PORTS) throw new Error(`Muitas portas de uma vez (máximo ${MAX_PORTS}) — divida em faixas menores.`);
  return [...ports].sort((a, b) => a - b);
}

function isPortOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    function finish(open) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    }
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export async function scanPorts({ host, ports, timeoutMs, concurrency }) {
  if (!host) throw new Error('Informe o IP/host.');
  // Faixa grande (milhares de portas) precisa de timeout mais curto e bem
  // mais concorrência, senão o pior caso (várias portas filtradas, sem RST
  // nenhum) passa do tempo que o proxy na frente do Portal aguenta antes
  // de devolver o próprio erro genérico — mesma lição aprendida com a
  // leitura do gerador (ver generatorClient.js). Porta fechada de verdade
  // recusa quase na hora (RST); só filtrada espera o timeout inteiro.
  const effectiveTimeout = timeoutMs ?? (ports.length > 2000 ? 200 : 350);
  const effectiveConcurrency = concurrency ?? (ports.length > 2000 ? 500 : 150);
  const open = [];
  let next = 0;
  async function worker() {
    while (next < ports.length) {
      const port = ports[next++];
      if (await isPortOpen(host, port, effectiveTimeout)) open.push(port);
    }
  }
  await Promise.all(Array.from({ length: Math.min(effectiveConcurrency, ports.length) }, worker));
  return { host, scanned: ports.length, open: open.sort((a, b) => a - b) };
}
