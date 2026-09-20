#!/usr/bin/env bash
# Instala (primeira vez) ou atualiza (das próximas em diante) os três
# sistemas juntos, neste servidor: o Portal (este repositório), o painel de
# Rede e o painel de Interfone/PBX.
#
# Uso — depois de clonar ESTE repositório em qualquer pasta:
#   sudo ./install-all.sh
#
# É esse o único comando que você precisa rodar sempre que quiser trazer as
# últimas atualizações do GitHub para o servidor: ele busca a versão mais
# recente de cada um dos três projetos e reinstala/reinicia cada serviço,
# sem apagar usuários, equipamentos ou configurações já cadastrados
# (cada `install.sh` chamado abaixo já é idempotente nesse sentido).
#
# Onde cada projeto fica instalado (pode trocar via variável de ambiente):
#   Portal            -> INSTALL_DIR do install.sh dele (padrão /opt/portal)
#   Painel de Rede     -> REDE_DIR       (padrão /opt/ip-dashboard)
#   Painel de Interfone -> INTERFONE_DIR (padrão /opt/pbx-dashboard)
set -euo pipefail

c_reset='\033[0m'; c_bold='\033[1m'; c_blue='\033[1;34m'; c_yellow='\033[1;33m'; c_green='\033[1;32m'
log()  { echo -e "\n${c_blue}==>${c_reset} ${c_bold}$1${c_reset}"; }
info() { echo -e "    $1"; }
warn() { echo -e "${c_yellow}[aviso]${c_reset} $1"; }

[ "$(id -u)" -eq 0 ] || { echo "Rode como root: sudo ./install-all.sh" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REDE_DIR="${REDE_DIR:-/opt/ip-dashboard}"
REDE_REPO="${REDE_REPO:-https://github.com/Rodrigohel/debian_dashboard}"
INTERFONE_DIR="${INTERFONE_DIR:-/opt/pbx-dashboard}"
INTERFONE_REPO="${INTERFONE_REPO:-https://github.com/Rodrigohel/FreePBX_Asterisk}"

git config --global --add safe.directory '*' 2>/dev/null || true

# Clona na primeira vez; nas próximas, só traz o que mudou (git pull) no
# branch que já estava em uso — não força trocar de branch sozinho.
clone_or_pull() {
  local dir="$1" repo="$2" name="$3"
  if [ -d "$dir/.git" ]; then
    info "Atualizando $name ($dir)..."
    if ! git -C "$dir" pull --ff-only; then
      warn "Não consegui atualizar $name automaticamente (histórico local diverge do remoto) — mexendo com o código que já está em $dir, sem tocar nele. Resolva manualmente com 'git -C $dir status' se precisar da versão mais nova."
    fi
  else
    info "Clonando $name em $dir..."
    mkdir -p "$(dirname "$dir")"
    git clone "$repo" "$dir"
  fi
}

log "1/3 — Portal"
info "Único serviço que deve ficar exposto para a internet (via Cloudflare Tunnel)."
"$SCRIPT_DIR/install.sh"

log "2/3 — Painel de Rede"
clone_or_pull "$REDE_DIR" "$REDE_REPO" "painel de Rede"
if [ -f "$REDE_DIR/install.sh" ]; then
  (cd "$REDE_DIR" && ./install.sh)
else
  warn "install.sh não encontrado em $REDE_DIR — pulei esta etapa."
fi

log "3/3 — Painel de Interfone/PBX"
clone_or_pull "$INTERFONE_DIR" "$INTERFONE_REPO" "painel de Interfone"
if [ -f "$INTERFONE_DIR/update.sh" ]; then
  (cd "$INTERFONE_DIR" && ./update.sh)
elif systemctl list-unit-files pbx-dashboard-backend.service >/dev/null 2>&1; then
  warn "Serviço pbx-dashboard-backend já existe, mas não achei update.sh em $INTERFONE_DIR — atualize manualmente (git pull + npm install + npm run build no frontend + systemctl restart pbx-dashboard-backend)."
else
  warn "Painel de Interfone ainda não parece instalado neste servidor. Como ele envolve configurar um usuário no AMI do FreePBX e o Apache/Nginx, siga o README dele manualmente na primeira vez: $INTERFONE_DIR/README.md"
fi

echo
echo -e "${c_green}Tudo atualizado.${c_reset}"
echo "  Portal:            http://$(hostname -I 2>/dev/null | awk '{print $1}'):$( [ -f "$SCRIPT_DIR/backend/.env" ] && grep -oP '^PORT=\K.*' "$SCRIPT_DIR/backend/.env" || echo 3000)"
echo "  journalctl -u portal-backend -f          # logs do Portal"
echo "  journalctl -u ip-dashboard-backend -f    # logs do painel de Rede"
echo "  journalctl -u pbx-dashboard-backend -f   # logs do painel de Interfone"
