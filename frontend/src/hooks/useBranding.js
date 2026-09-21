import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const DEFAULT_BRANDING = { name: 'Portal', logoUrl: null };

// Nome/logo do sistema — endpoint público, usado tanto antes do login
// (tela de Login) quanto depois (sidebar). Busca uma vez só por sessão do
// componente que chamar; quem editar em Configurações recarrega a página
// pra ver o resultado (não precisa de sincronização em tempo real aqui).
export function useBranding() {
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    api.branding.get().then(setBranding).catch(() => {});
  }, []);

  return branding;
}
