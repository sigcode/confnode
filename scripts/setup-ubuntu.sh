#!/usr/bin/env bash
# confnode Ubuntu setup script
# Usage:        sudo bash setup-ubuntu.sh          # fresh install
# Update only:  sudo bash setup-ubuntu.sh --update # skip questions, rebuild & restart

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✖${NC}  $*" >&2; }
title() { echo -e "\n${BOLD}$*${NC}"; }

INSTALL_DIR=/usr/lib/configurator
REPO_URL=https://github.com/sigcode/confnode.git
BUILD_DIR=/tmp/confnode-build
UPDATE_ONLY=0
[[ "${1:-}" == "--update" ]] && UPDATE_ONLY=1

# ─── Phase 1: Preflight ───────────────────────────────────────────────────────

title "confnode — Ubuntu ${UPDATE_ONLY:+Updater}${UPDATE_ONLY:-Installer}"

if [[ $EUID -ne 0 ]]; then
  error "Run as root: sudo bash $0"
  exit 1
fi

# Ubuntu check
if ! grep -q 'ID=ubuntu' /etc/os-release 2>/dev/null; then
  warn "This script targets Ubuntu. Continuing anyway, but things may break."
fi

if ! curl -s --max-time 5 https://github.com &>/dev/null; then
  error "No internet access — cannot reach github.com"
  exit 1
fi

# ─── Phase 2: Questions (skipped on --update) ─────────────────────────────────

if [[ $UPDATE_ONLY -eq 1 ]]; then
  if [[ ! -f /etc/configurator/config.yaml ]]; then
    error "No existing install found (/etc/configurator/config.yaml missing). Run without --update for a fresh install."
    exit 1
  fi
  info "Update mode — skipping configuration questions."
  # Read PHP versions from existing config for dependency install
  PHP_VERSIONS=$(grep -A5 'versions:' /etc/configurator/config.yaml | grep -oP '"[0-9]+\.[0-9]+"' | tr -d '"' | tr '\n' ' ' || echo "8.1 8.3 8.4")
  PHP_DEFAULT=$(grep 'default:' /etc/configurator/config.yaml | grep -oP '"[0-9]+\.[0-9]+"' | tr -d '"' | head -1 || echo "8.4")
  CERTBOT_EMAIL=""
  TOOL_DOMAIN=""
  ADMIN_PASS=""
else
  title "Configuration"

  read -rp "Email for Let's Encrypt (certbot): " CERTBOT_EMAIL
  if [[ -z "$CERTBOT_EMAIL" ]]; then
    error "Certbot email is required."
    exit 1
  fi

  read -rp "Subdomain for this tool (e.g. conf.yourdomain.com): " TOOL_DOMAIN
  if [[ -z "$TOOL_DOMAIN" ]]; then
    error "Subdomain is required."
    exit 1
  fi

  read -rsp "Admin password (input hidden): " ADMIN_PASS
  echo
  if [[ -z "$ADMIN_PASS" ]]; then
    error "Admin password is required."
    exit 1
  fi

  read -rp "PHP versions to install [default: 8.1 8.3 8.4]: " PHP_INPUT
  PHP_VERSIONS="${PHP_INPUT:-8.1 8.3 8.4}"
  PHP_DEFAULT=$(echo "$PHP_VERSIONS" | awk '{print $NF}')

  echo
  info "Installing confnode with:"
  info "  Domain    : $TOOL_DOMAIN"
  info "  Email     : $CERTBOT_EMAIL"
  info "  PHP       : $PHP_VERSIONS"
  echo
  read -rp "Proceed? [Y/n]: " CONFIRM
  if [[ "${CONFIRM,,}" == "n" ]]; then
    echo "Aborted."; exit 0
  fi
fi

# ─── Phase 3: Dependencies ────────────────────────────────────────────────────

title "Installing system dependencies"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Core dependencies
apt-get install -y -qq \
  apache2 \
  certbot python3-certbot-apache \
  git curl wget rsync \
  software-properties-common

# Node.js 20 LTS (via NodeSource) — force install/upgrade if below v20
NODE_MAJOR=0
command -v node &>/dev/null && NODE_MAJOR=$(node --version 2>/dev/null | grep -oP '^\Kv?\K\d+' | head -1 || echo 0)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  info "Installing Node.js 20 LTS (current: v${NODE_MAJOR:-none})..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  hash -r  # refresh PATH cache
fi
info "Node.js: $(node --version)"

# Go (Ubuntu 22.04 ships 1.18+; 24.04 ships 1.22 — both sufficient)
# If too old, we download from go.dev
install_go() {
  info "Downloading Go from go.dev..."
  local arch
  arch=$(dpkg --print-architecture)
  local goarch="amd64"
  [[ "$arch" == "arm64" ]] && goarch="arm64"
  local GO_VER
  GO_VER=$(curl -s "https://go.dev/VERSION?m=text" | head -1 | tr -d '\n')
  curl -Lo /tmp/go.tar.gz "https://go.dev/dl/${GO_VER}.linux-${goarch}.tar.gz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
}

if command -v go &>/dev/null; then
  GO_MAJOR=$(go version | grep -oP 'go\K\d+\.\d+' | cut -d. -f1)
  GO_MINOR=$(go version | grep -oP 'go\K\d+\.\d+' | cut -d. -f2)
  if [[ $GO_MAJOR -lt 1 ]] || [[ $GO_MAJOR -eq 1 && $GO_MINOR -lt 21 ]]; then
    warn "Installed Go is too old (need >= 1.21), downloading fresh copy..."
    install_go
  fi
else
  apt-get install -y -qq golang-go 2>/dev/null || install_go
  # Re-check version after apt install
  if command -v go &>/dev/null; then
    GO_MINOR=$(go version | grep -oP 'go\K\d+\.\d+' | cut -d. -f2)
    [[ $GO_MINOR -lt 21 ]] && install_go
  fi
fi
export PATH="/usr/local/go/bin:$PATH"

# PHP via ondrej/php PPA
info "Adding ondrej/php PPA..."
add-apt-repository -y ppa:ondrej/php &>/dev/null || true
apt-get update -qq

for ver in $PHP_VERSIONS; do
  info "Installing PHP $ver..."
  apt-get install -y -qq "php${ver}-fpm" "php${ver}-cli" "php${ver}-common" || \
    warn "PHP $ver not available — skipping"
done

# Apache modules
info "Enabling Apache modules..."
a2enmod proxy proxy_http ssl rewrite headers 2>/dev/null || true

# ─── Phase 4: Build ───────────────────────────────────────────────────────────

title "Building confnode"

# Clone or update
if [[ -d "$BUILD_DIR/.git" ]]; then
  info "Updating existing clone..."
  git -C "$BUILD_DIR" fetch --quiet origin
  git -C "$BUILD_DIR" reset --hard origin/main --quiet
else
  info "Cloning from $REPO_URL..."
  rm -rf "$BUILD_DIR"
  git clone --quiet "$REPO_URL" "$BUILD_DIR"
fi

# Go agent
info "Building agent (Go)..."
cd "$BUILD_DIR/agent"
go build -trimpath -ldflags="-s -w" -o /usr/bin/configurator-agent .

# Backend
info "Building backend (Node.js)..."
cd "$BUILD_DIR/backend"
npm ci --prefer-offline --silent
npx tsc --noEmit  # type check
npx tsc

# Frontend
info "Building frontend (Vite)..."
cd "$BUILD_DIR/frontend"
npm ci --prefer-offline --silent
npm run build --silent

# ─── Phase 5: Install ─────────────────────────────────────────────────────────

title "Installing files"

mkdir -p "$INSTALL_DIR/backend" "$INSTALL_DIR/frontend"
rsync -a --delete "$BUILD_DIR/backend/dist/"        "$INSTALL_DIR/backend/dist/"
rsync -a --delete "$BUILD_DIR/backend/node_modules/" "$INSTALL_DIR/backend/node_modules/"
rsync -a --delete "$BUILD_DIR/frontend/dist/"        "$INSTALL_DIR/frontend/dist/"
# package.json must be present so Node.js recognises the dist/ files as ESM ("type": "module")
cp "$BUILD_DIR/backend/package.json" "$INSTALL_DIR/backend/package.json"

info "Installed to $INSTALL_DIR"

# ─── Phase 6: User + Config ───────────────────────────────────────────────────

title "Setting up user and config"

# System user
if ! id -u configurator &>/dev/null; then
  useradd -r -s /sbin/nologin -d /var/lib/configurator -M configurator
fi
mkdir -p /var/lib/configurator
chown configurator:configurator /var/lib/configurator

# Build PHP versions YAML array
PHP_YAML="["
for v in $PHP_VERSIONS; do
  PHP_YAML="$PHP_YAML\"$v\", "
done
PHP_YAML="${PHP_YAML%, }]"

# Config (only write if missing)
if [[ ! -f /etc/configurator/config.yaml ]]; then
  mkdir -p /etc/configurator
  SECRET=$(openssl rand -hex 32)
  cat > /etc/configurator/config.yaml <<EOF
server:
  port: 3001
  secret: "$SECRET"
  frontend_dist: /usr/lib/configurator/frontend/dist

database:
  path: /var/lib/configurator/db.sqlite

apache:
  mode: debian
  sites_available: /etc/apache2/sites-available
  sites_enabled:   /etc/apache2/sites-enabled
  default_webroot: /var/www

php:
  versions: $PHP_YAML
  default: "$PHP_DEFAULT"

certbot:
  email: "$CERTBOT_EMAIL"

agent:
  socket: /run/configurator-agent.sock
EOF
  info "Config written to /etc/configurator/config.yaml"
else
  warn "Config already exists — not overwritten. Edit manually if needed."
fi

# ─── Phase 7: Systemd ─────────────────────────────────────────────────────────

title "Installing systemd units"

cp "$BUILD_DIR/deploy/configurator-agent.service" /etc/systemd/system/
cp "$BUILD_DIR/deploy/configurator.service"        /etc/systemd/system/

# Set admin password via drop-in (used on first start by ensureAdminUser)
if [[ $UPDATE_ONLY -eq 0 ]]; then
  mkdir -p /etc/systemd/system/configurator.service.d
  cat > /etc/systemd/system/configurator.service.d/admin.conf <<EOF
[Service]
Environment=ADMIN_PASSWORD=$ADMIN_PASS
EOF
fi

systemctl daemon-reload
systemctl enable configurator-agent configurator
systemctl restart configurator-agent
sleep 1  # give socket time to appear
systemctl restart configurator

info "Services started"

# ─── Phase 8: Apache Proxy Vhost (skipped on --update) ───────────────────────

if [[ $UPDATE_ONLY -eq 1 ]]; then
  echo
  echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}${BOLD}║   confnode updated successfully! ✅           ║${NC}"
  echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
  echo
  echo "  Service status:"
  systemctl is-active --quiet configurator-agent && echo -e "    configurator-agent  ${GREEN}active${NC}" || echo -e "    configurator-agent  ${RED}FAILED${NC}"
  if systemctl is-active --quiet configurator; then
    echo -e "    configurator        ${GREEN}active${NC}"
  else
    echo -e "    configurator        ${RED}FAILED${NC}"
    echo
    echo -e "${YELLOW}Last journal entries for configurator:${NC}"
    journalctl -u configurator --no-pager -n 15 --output=short
  fi
  echo
  exit 0
fi

title "Setting up Apache reverse proxy"

# Use the server's public IP in the VirtualHost so it lands in the IP-specific
# NameVirtualHost group, which takes priority over wildcard *:80 groups that
# other vhosts (e.g. old hostname-syntax VirtualHost directives) may create.
SERVER_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}')
if [[ -z "$SERVER_IP" ]]; then
  warn "Could not detect public IP — falling back to *:80"
  SERVER_IP="*"
fi
info "VirtualHost IP: $SERVER_IP"

# Ensure .well-known dir exists for certbot webroot challenge
mkdir -p /var/www/html/.well-known/acme-challenge

VHOST_FILE="/etc/apache2/sites-available/configurator.conf"
CREATE_VHOST=1

if [[ -f "$VHOST_FILE" ]]; then
  read -rp "Proxy vhost $VHOST_FILE already exists. Overwrite? [y/N]: " yn
  [[ "${yn,,}" != "y" ]] && CREATE_VHOST=0
fi

if [[ $CREATE_VHOST -eq 1 ]]; then
  cat > "$VHOST_FILE" <<EOF
<VirtualHost ${SERVER_IP}:80>
    ServerName $TOOL_DOMAIN

    # Serve ACME challenges directly — must come before ProxyPass
    Alias /.well-known/ /var/www/html/.well-known/
    <Directory /var/www/html/.well-known/>
        Options None
        AllowOverride None
        Require all granted
    </Directory>
    ProxyPass /.well-known/ !

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/

    ErrorLog  \${APACHE_LOG_DIR}/configurator-error.log
    CustomLog \${APACHE_LOG_DIR}/configurator-access.log combined
</VirtualHost>
EOF
  a2ensite configurator
  apache2ctl configtest
  systemctl reload apache2
  info "Proxy vhost created for $TOOL_DOMAIN (${SERVER_IP}:80)"
else
  warn "Skipped vhost creation."
fi

# ─── Phase 9: SSL via Certbot ─────────────────────────────────────────────────

title "Obtaining SSL certificate"

if systemctl is-active --quiet apache2; then
  # Use webroot mode: avoids the certbot --apache plugin touching vhost configs,
  # which can conflict with IP-specific NameVirtualHost groups on busy servers.
  certbot certonly \
    --webroot \
    -w /var/www/html \
    --non-interactive \
    --agree-tos \
    --keep-until-expiring \
    --email "$CERTBOT_EMAIL" \
    -d "$TOOL_DOMAIN" && info "SSL certificate obtained." \
    || warn "Certbot failed — check that DNS for $TOOL_DOMAIN points to this server."
else
  warn "Apache is not running, skipping certbot. Run manually:"
  warn "  certbot certonly --webroot -w /var/www/html -d $TOOL_DOMAIN --email $CERTBOT_EMAIL --agree-tos"
fi

# Add SSL vhost if cert was obtained
CERT_PATH="/etc/letsencrypt/live/$TOOL_DOMAIN/fullchain.pem"
if [[ -f "$CERT_PATH" ]] && [[ $CREATE_VHOST -eq 1 ]]; then
  cat >> "$VHOST_FILE" <<EOF

<VirtualHost ${SERVER_IP}:443>
    ServerName $TOOL_DOMAIN

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/$TOOL_DOMAIN/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/$TOOL_DOMAIN/privkey.pem
    Include                 /etc/letsencrypt/options-ssl-apache.conf

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3001/
    ProxyPassReverse / http://127.0.0.1:3001/

    ErrorLog  \${APACHE_LOG_DIR}/configurator-ssl-error.log
    CustomLog \${APACHE_LOG_DIR}/configurator-ssl-access.log combined
</VirtualHost>
EOF
  apache2ctl configtest && systemctl reload apache2 && info "SSL vhost added."
fi

# ─── Phase 10: Cleanup ────────────────────────────────────────────────────────

# Remove admin password from drop-in after it's been consumed
# (wait a moment for the service to start and pick it up)
sleep 2
rm -f /etc/systemd/system/configurator.service.d/admin.conf
rmdir /etc/systemd/system/configurator.service.d 2>/dev/null || true
systemctl daemon-reload

# ─── Done ─────────────────────────────────────────────────────────────────────

echo
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   confnode installed successfully! ✅         ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo
echo -e "  URL    : ${BOLD}https://$TOOL_DOMAIN${NC}"
echo -e "  Login  : ${BOLD}admin${NC} / (password as entered)"
echo
echo "  Existing Apache vhosts are auto-discovered — no import step needed."
echo "  To update confnode later: sudo bash setup-ubuntu.sh --update"
echo
echo "  Service status:"
systemctl is-active --quiet configurator-agent && echo -e "    configurator-agent  ${GREEN}active${NC}" || echo -e "    configurator-agent  ${RED}FAILED${NC}"
if systemctl is-active --quiet configurator; then
  echo -e "    configurator        ${GREEN}active${NC}"
else
  echo -e "    configurator        ${RED}FAILED${NC}"
  echo
  echo -e "${YELLOW}Last journal entries for configurator:${NC}"
  journalctl -u configurator --no-pager -n 15 --output=short
fi
echo
