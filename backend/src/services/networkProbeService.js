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
