// SQLite guarda em UTC sem sufixo 'Z' — sem isso o navegador interpreta como
// horário local e a conta de "há quanto tempo" sai errada.
export function timeAgo(iso) {
  if (!iso) return null;
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return d.toLocaleDateString('pt-BR');
}
