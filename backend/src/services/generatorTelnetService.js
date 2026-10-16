// Sonda de diagnóstico pro gerador (ComAp AMF-9, porta 23/Telnet — diferente
// da 502/Modbus já usada em generatorClient.js) — ver IDEIAS.md. Antes de
// implementar leitura de verdade (falhas, estado Pronto/Auto/Manual/Teste,
// tensões), precisa ver o que o controlador realmente devolve nessa porta:
// não documentado, pode ser um menu de texto, um protocolo binário próprio
// da ComAp, ou nada. Só abre a conexão, manda o texto digitado (se algum) e
// devolve tudo que chegou em `timeoutMs` — tanto como texto quanto em hex,
// porque se for binário o texto vem ilegível.
import net from 'node:net';

export function probeGeneratorTelnet({ host, port = 23, send = '', timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Host do gerador não configurado (ver Gerador → Configurações).'));
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
