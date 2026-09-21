// Aplica a cor de destaque customizada (Configurações → Marca) por cima do
// padrão do tema, gerando as variações mais clara/escura/glow a partir de
// só uma cor — sem precisar guardar 4 valores nem trazer lib de cor.
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to255 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

export function applyAccentColor(hex) {
  const root = document.documentElement.style;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    ['--accent-500', '--accent-400', '--accent-600', '--accent-glow'].forEach((v) => root.removeProperty(v));
    return;
  }
  const [h, s, l] = hexToHsl(hex);
  root.setProperty('--accent-500', hex);
  root.setProperty('--accent-400', hslToHex(h, s, Math.min(0.92, l + 0.12)));
  root.setProperty('--accent-600', hslToHex(h, s, Math.max(0.08, l - 0.12)));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  root.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);
}
