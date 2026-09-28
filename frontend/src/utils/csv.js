// Gera e baixa um CSV a partir de linhas já carregadas na tela — sem
// endpoint novo no backend, é só serializar o que a tabela já mostra.
function escapeCsvValue(value) {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// `columns`: [{ header, get: (row) => value }]
export function downloadCsv(filename, rows, columns) {
  const lines = [
    columns.map((c) => escapeCsvValue(c.header)).join(';'),
    ...rows.map((row) => columns.map((c) => escapeCsvValue(c.get(row))).join(';')),
  ];
  // BOM no início — sem isso o Excel no Windows abre acento errado (lê como
  // se não fosse UTF-8).
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
