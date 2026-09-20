// Conjunto pequeno de ícones inline (sem dependência externa), no estilo
// outline usado no resto da interface. `size`/`strokeWidth` seguem o padrão
// lucide-like para ficar consistente em qualquer tamanho.
const paths = {
  home: 'M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9',
  network:
    'M4 18h4M10 18h4M16 18h4M6 14v4M12 10v8M18 14v4M6 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM18 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  phone: 'M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2C10 19 5 14 3.5 5a2 2 0 0 1 2-2Z',
  shieldFace:
    'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM9.5 11a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1ZM14.5 11a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1M9 15c.9.7 1.9 1 3 1s2.1-.3 3-1',
  users: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2.5 20a6.5 6.5 0 0 1 13 0M17 8a3 3 0 1 1 0 6M20 20a5.5 5.5 0 0 0-4.5-5.4',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6',
  edit: 'm16.5 3.5 4 4L8 20H4v-4Z',
  chevronRight: 'm9 6 6 6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M6.6 6.7C4 8.3 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 7 10 7a15 15 0 0 1-1.8 2.6',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  loader: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
  camera: 'M4 8h3l2-2h6l2 2h3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  externalLink: 'M14 4h6v6M20 4 10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6',
  wifi: 'M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5 3.5 3.5M20.5 20.5 19 19M5 19l-1.5 1.5M20.5 3.5 19 5M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
  search: 'm21 21-4.3-4.3M18.5 11a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  building: 'M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M12 21v-9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20',
  key: 'M15.5 8.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0ZM8.5 8.5H2M5 8.5v3',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  server:
    'M3 4h18a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM3 13h18a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1ZM7 7h.01M7 16h.01M11 7h4M11 16h4',
  thermometer: 'M14 14.76V4a2 2 0 1 0-4 0v10.76a4 4 0 1 0 4 0Z',
  cpu: 'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M7 7h10v10H7z',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

export default function Icon({ name, size = 18, strokeWidth = 1.8, className }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
