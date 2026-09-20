#!/usr/bin/env bash
# Instalador automatizado do Portal.
#
# Uso:
#   git clone <repo> /opt/portal
#   cd /opt/portal
#   sudo ./install.sh
#
# Idempotente: pode rodar de novo (ex.: depois de um `git pull`) para
# atualizar dependências e reiniciar o serviço, sem perder usuários,
# equipamentos ou configurações já cadastrados.
#
# Todas as opções abaixo também podem ser passadas como variáveis de
# ambiente para instalação 100% não-interativa, ex.:
#   sudo PORT=3000 ADMIN_PASSWORD='troque-isto' ./install.sh
set -euo pipefail

c_reset='\033[0m'; c_bold='\033[1m'; c_blue='\033[1;34m'; c_yellow='\033[1;33m'; c_red='\033[1;31m'; c_green='\033[1;32m'
log()  { echo -e "\n${c_blue}==>${c_reset} ${c_bold}$1${c_reset}"; }
info() { echo -e "    $1"; }
warn() { echo -e "${c_yellow}[aviso]${c_reset} $1"; }
die()  { echo -e "${c_red}[erro]${c_reset} $1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Rode como root: sudo ./install.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ] || \
  die "Rode este script de dentro da pasta do projeto (onde estão backend/ e frontend/)."

command -v apt-get >/dev/null 2>&1 || die "Este instalador é para Debian/Ubuntu (apt-get não encontrado)."

INSTALL_DIR="${INSTALL_DIR:-/opt/portal}"
SERVICE_USER="${SERVICE_USER:-portal}"
PORT="${PORT:-3000}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_NAME="${ADMIN_NAME:-Administrador}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

INTERACTIVE=1
[ -t 0 ] || INTERACTIVE=0
[ -n "${NONINTERACTIVE:-}" ] && INTERACTIVE=0

ask() {
  local prompt="$1" default="$2" __var="$3" reply
  if [ "$INTERACTIVE" -eq 1 ]; then
    read -rp "$prompt [$default]: " reply || true
    printf -v "$__var" '%s' "${reply:-$default}"
  else
    printf -v "$__var" '%s' "$default"
  fi
}

primary_ip() {
  if command -v hostname >/dev/null 2>&1; then hostname -I 2>/dev/null | awk '{print $1}'; fi
}

git config --global --add safe.directory "$SCRIPT_DIR" 2>/dev/null || true
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

log "Portal — instalação"
info "Diretório de instalação: $INSTALL_DIR"
ask "Porta do Portal (único serviço que deve ficar exposto externamente)" "$PORT" PORT

log "1/6 — Instalando dependências do sistema (Node.js, build tools)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq || warn "Falha ao atualizar algum repositório apt — continuando."
apt-get install -y -qq curl ca-certificates gnupg rsync openssl build-essential python3 >/dev/null

NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/v//;s/\..*//')"
  [ "$NODE_MAJOR" -ge 20 ] 2>/dev/null && NODE_OK=1
fi
if [ "$NODE_OK" -eq 0 ]; then
  info "Instalando Node.js 20.x (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
else
  info "Reaproveitando Node.js já instalado."
fi
info "Node $(node -v) / npm $(npm -v)"

log "2/6 — Preparando $INSTALL_DIR"
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude node_modules --exclude dist --exclude data --exclude .env --exclude .git \
    "$SCRIPT_DIR/" "$INSTALL_DIR/"
  info "Projeto copiado de $SCRIPT_DIR para $INSTALL_DIR"
else
  info "Já rodando a partir de $INSTALL_DIR"
fi
cd "$INSTALL_DIR"

log "3/6 — Configurando usuário de sistema '$SERVICE_USER'"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  info "Usuário '$SERVICE_USER' criado."
else
  info "Usuário '$SERVICE_USER' já existe."
fi

log "4/6 — Instalando e configurando o backend"
cd "$INSTALL_DIR/backend"
npm install --omit=dev --no-audit --no-fund --silent

FIRST_INSTALL=0
if [ ! -f .env ]; then
  FIRST_INSTALL=1
  cp .env.example .env
  JWT_SECRET="$(openssl rand -hex 32)"
  CREDENTIALS_KEY="$(openssl rand -hex 32)"
  sed -i "s#^PORT=.*#PORT=$PORT#" .env
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT_SECRET#" .env
  sed -i "s#^CREDENTIALS_KEY=.*#CREDENTIALS_KEY=$CREDENTIALS_KEY#" .env
  # O Portal serve seu próprio frontend (same-origin) — CORS só importa se
  # algo mais chamar a API de outra origem.
  sed -i "s#^CORS_ORIGIN=.*#CORS_ORIGIN=*#" .env
  info ".env criado com um JWT_SECRET e CREDENTIALS_KEY novos e aleatórios."
else
  info ".env já existia — mantido sem alterações."
fi

if [ ! -f data/portal.db ]; then
  if [ -z "$ADMIN_PASSWORD" ]; then
    if [ "$INTERACTIVE" -eq 1 ]; then
      read -rp "Usuário administrador do Portal [$ADMIN_USER]: " reply || true
      ADMIN_USER="${reply:-$ADMIN_USER}"
      while [ -z "$ADMIN_PASSWORD" ]; do
        read -rsp "Senha para '$ADMIN_USER': " ADMIN_PASSWORD; echo
      done
    else
      ADMIN_PASSWORD="$(openssl rand -base64 15)"
      GENERATED_PASSWORD=1
    fi
  fi
  node src/db/seedAdmin.js "$ADMIN_USER" "$ADMIN_NAME" "$ADMIN_PASSWORD" >/dev/null
  info "Administrador '$ADMIN_USER' criado."
else
  info "Já existe usuário cadastrado — pulando (rode 'npm run seed:admin' manualmente se precisar)."
fi

log "5/6 — Instalando e buildando o frontend"
cd "$INSTALL_DIR/frontend"
npm install --no-audit --no-fund --silent
npm run build --silent
info "Build gerado em frontend/dist — o backend serve esses arquivos direto, numa porta só."

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
[ -d "$INSTALL_DIR/.git" ] && chown -R root:root "$INSTALL_DIR/.git"

log "6/6 — Registrando o serviço systemd"
UNIT_FILE=/etc/systemd/system/portal-backend.service
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Portal - backend
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$(command -v node) src/server.js
EnvironmentFile=$INSTALL_DIR/backend/.env
Restart=on-failure
User=$SERVICE_USER

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable portal-backend >/dev/null 2>&1
if systemctl is-active --quiet portal-backend; then
  systemctl restart portal-backend
  info "Serviço reiniciado (atualização)."
else
  systemctl start portal-backend
  info "Serviço iniciado."
fi

sleep 2
if ! systemctl is-active --quiet portal-backend; then
  die "O serviço não subiu — veja os logs com: journalctl -u portal-backend -n 50"
fi

IP="$(primary_ip)"
echo
echo -e "${c_green}Instalação concluída.${c_reset}"
echo
echo "  Acesse o Portal em:"
echo "    http://${IP:-<ip-do-servidor>}:${PORT}"
echo
if [ "${GENERATED_PASSWORD:-0}" -eq 1 ]; then
  echo -e "  ${c_yellow}Administrador gerado automaticamente:${c_reset}"
  echo "    login: $ADMIN_USER"
  echo "    senha: $ADMIN_PASSWORD"
  echo "  (anote agora — não fica salva em nenhum lugar visível depois disso)"
  echo
fi
echo "  Próximos passos:"
echo "    1. Em Configurações, aponte os gateways de Rede e Interfone para os"
echo "       backends já rodando nesta máquina, com uma conta de serviço."
echo "    2. Em Controle de acesso, cadastre os porteiros Intelbras (host,"
echo "       usuário e senha da interface web de cada um)."
echo "    3. Em Usuários, crie o login de cada cliente e escolha o que cada"
echo "       um pode ver."
echo "    4. Configure o Cloudflare Tunnel apontando SÓ para esta porta ($PORT) —"
echo "       é o único serviço que deve ficar acessível pela internet."
echo
echo "  Comandos úteis:"
echo "    journalctl -u portal-backend -f   # acompanhar logs"
echo "    systemctl restart portal-backend  # reiniciar"
echo "    sudo ./install.sh                 # rodar de novo após um git pull"
echo
if [ "$FIRST_INSTALL" -eq 1 ]; then
  warn "Guarde o backend/.env gerado (tem o JWT_SECRET e a CREDENTIALS_KEY) — não é enviado ao git."
fi
