import os from 'node:os';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function round(n, decimals = 1) {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

// Nomes dos serviços systemd que dividem esta máquina com o Portal — usado
// só para status/memória de cada um, nunca para controlá-los. Ajustável via
// SERVER_HEALTH_SERVICES (separado por vírgula) caso os nomes reais no seu
// servidor sejam diferentes.
const SERVICE_UNITS = (process.env.SERVER_HEALTH_SERVICES || 'portal-backend,ip-dashboard-backend,pbx-dashboard-backend,asterisk')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function readCpuTemperature() {
  // Best-effort: nem toda máquina/CPU expõe isso, e o caminho varia (às
  // vezes thermal_zone0 é o Wi-Fi ou outro sensor, não a CPU) — por isso
  // pega o maior valor entre as zonas "cpu"/"x86_pkg_temp"/"soc" quando dá
  // pra identificar, senão o maior valor entre todas.
  try {
    const zones = await fs.readdir('/sys/class/thermal').catch(() => []);
    const readings = [];
    for (const zone of zones) {
      if (!zone.startsWith('thermal_zone')) continue;
      try {
        const [rawTemp, type] = await Promise.all([
          fs.readFile(`/sys/class/thermal/${zone}/temp`, 'utf8'),
          fs.readFile(`/sys/class/thermal/${zone}/type`, 'utf8').catch(() => ''),
        ]);
        const celsius = Number(rawTemp.trim()) / 1000;
        if (Number.isFinite(celsius) && celsius > 0 && celsius < 150) {
          readings.push({ celsius, type: type.trim().toLowerCase() });
        }
      } catch {
        // zona ilegível — ignora
      }
    }
    if (readings.length === 0) return null;
    const cpuLike = readings.find((r) => /cpu|pkg|core|soc/.test(r.type));
    return round((cpuLike || readings.sort((a, b) => b.celsius - a.celsius)[0]).celsius);
  } catch {
    return null;
  }
}

async function readServiceStatus(unit) {
  try {
    const { stdout: activeState } = await execFileAsync('systemctl', ['is-active', unit], { timeout: 3000 });
    const status = activeState.trim();
    let memoryBytes = null;
    try {
      const { stdout: memRaw } = await execFileAsync('systemctl', ['show', unit, '-p', 'MemoryCurrent', '--value'], {
        timeout: 3000,
      });
      const parsed = Number(memRaw.trim());
      if (Number.isFinite(parsed) && parsed > 0) memoryBytes = parsed;
    } catch {
      // sem cgroup memory accounting habilitado — segue sem esse dado
    }
    return { unit, status, memoryMb: memoryBytes ? round(memoryBytes / 1e6) : null };
  } catch {
    // systemctl indisponível, ou unidade não existe nesta máquina (ex.: em
    // desenvolvimento local) — não é erro, só não reporta esse serviço
    return { unit, status: 'unknown', memoryMb: null };
  }
}

/**
 * Saúde da máquina onde o Portal roda — a mesma que já hospeda o FreePBX e
 * os outros dois painéis. Pensado para o super admin acompanhar que nada
 * ali está sobrecarregando o servidor (e, com isso, arriscando a central
 * telefônica). Usa só APIs nativas do Node para os números da máquina;
 * `systemctl` (read-only: is-active/show) só para o status de cada serviço.
 */
export async function getServerHealth() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const load = os.loadavg(); // [1min, 5min, 15min]

  let disk = null;
  try {
    const stats = await fs.statfs('/');
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    disk = {
      totalGb: round(totalBytes / 1e9),
      usedGb: round(usedBytes / 1e9),
      freeGb: round(freeBytes / 1e9),
      usedPercent: round((usedBytes / totalBytes) * 100),
    };
  } catch {
    // fs.statfs precisa de Node >=18.15 — se não disponível, só omite o disco
  }

  const [temperatureCelsius, services] = await Promise.all([
    readCpuTemperature(),
    Promise.all(SERVICE_UNITS.map(readServiceStatus)),
  ]);

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpu: {
      count: cpus.length,
      model: cpus[0]?.model?.trim() || null,
      loadAverage: { '1m': round(load[0], 2), '5m': round(load[1], 2), '15m': round(load[2], 2) },
      // Carga por núcleo é a leitura correta pra saber se está "pesado" de
      // verdade — load average de 4 numa máquina de 8 núcleos é tranquilo,
      // na mesma máquina com 2 núcleos já seria saturação.
      loadPercent: round(Math.min(100, (load[0] / cpus.length) * 100)),
      temperatureCelsius,
    },
    memory: {
      totalGb: round(totalMem / 1e9, 2),
      usedGb: round(usedMem / 1e9, 2),
      freeGb: round(freeMem / 1e9, 2),
      usedPercent: round((usedMem / totalMem) * 100),
    },
    disk,
    systemUptimeSeconds: Math.floor(os.uptime()),
    processUptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    services,
  };
}

// Histórico em memória (zera a cada reinício do processo, de propósito —
// não é dado crítico o bastante pra justificar persistir em disco) pra
// alimentar o gráfico de CPU/memória ao longo do tempo na tela Início.
// Uma amostra por minuto, guarda as últimas 2h.
const HISTORY_MAX = 120;
const history = [];
let samplerStarted = false;

export function startHealthHistorySampler() {
  if (samplerStarted) return;
  samplerStarted = true;
  const sampleOnce = async () => {
    try {
      const h = await getServerHealth();
      history.push({ t: Date.now(), cpu: h.cpu.loadPercent, memory: h.memory.usedPercent });
      if (history.length > HISTORY_MAX) history.shift();
    } catch {
      // falha pontual de amostra — só pula, não derruba o sampler
    }
  };
  sampleOnce();
  setInterval(sampleOnce, 60_000);
}

export function getHealthHistory() {
  return history;
}
