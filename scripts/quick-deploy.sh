#!/usr/bin/env bash
# confnode quick deploy — fast update path for backend + agent only.
#
# Complements scripts/setup-ubuntu.sh (fresh installs, or when the frontend
# or system dependencies changed — apt packages, PHP versions, Apache
# modules, ...). This script skips all of that and just does: pull latest,
# build backend (tsc) + agent (go build), install, restart. Good for the
# usual "fixed a bug, ship it" loop.
#
# Usage:  ./scripts/quick-deploy.sh [--no-pull] [--no-build]
# Run as the user this checkout belongs to (NOT root) — it escalates via a
# single `sudo` only for the install/restart step, so you get one password
# prompt for the whole run instead of one per command.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${GREEN}▸${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✖${NC}  $*" >&2; }
title() { echo -e "\n${BOLD}$*${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIST_TARGET=/usr/lib/configurator/backend/dist
AGENT_BIN_TARGET=/usr/bin/configurator-agent

no_pull=false
no_build=false
for arg in "$@"; do
  case "$arg" in
    --no-pull) no_pull=true ;;
    --no-build) no_build=true ;;
    -h|--help)
      echo "Usage: $0 [--no-pull] [--no-build]"
      exit 0
      ;;
    *)
      error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

if [[ $EUID -eq 0 ]]; then
  error "Run as your normal user, not root — this escalates itself via sudo where needed."
  exit 1
fi

if ! $no_pull; then
  if [[ -d "$SCRIPT_DIR/.git" ]]; then
    title "Pulling latest (sigcode/confnode, main)"
    git -C "$SCRIPT_DIR" pull --ff-only
  else
    warn "Not a git checkout ($SCRIPT_DIR has no .git) — skipping pull, deploying what's on disk."
  fi
fi

if ! $no_build; then
  title "Building backend (tsc)"
  ( cd "$SCRIPT_DIR/backend" && npm ci --silent && npm run build --silent )

  title "Building agent (go build)"
  ( cd "$SCRIPT_DIR/agent" && go build -trimpath -ldflags="-s -w" -o configurator-agent . )
fi

[[ -d "$SCRIPT_DIR/backend/dist" ]] || { error "backend/dist missing — run without --no-build first"; exit 1; }
[[ -x "$SCRIPT_DIR/agent/configurator-agent" ]] || { error "agent/configurator-agent missing — run without --no-build first"; exit 1; }

title "Installing (needs sudo — one password prompt for everything below)"
sudo bash -s -- "$SCRIPT_DIR" "$BACKEND_DIST_TARGET" "$AGENT_BIN_TARGET" <<'INSTALL'
set -euo pipefail
SRC="$1"; DIST_TARGET="$2"; AGENT_TARGET="$3"
TS="$(date +%Y%m%d%H%M%S)"

echo "▸ Backing up current install (suffix .bak-$TS)"
[[ -d "$DIST_TARGET" ]] && cp -a "$DIST_TARGET" "$DIST_TARGET.bak-$TS"
[[ -f "$AGENT_TARGET" ]] && cp -a "$AGENT_TARGET" "$AGENT_TARGET.bak-$TS"

echo "▸ Installing backend dist"
rm -rf "$DIST_TARGET"
cp -r "$SRC/backend/dist" "$DIST_TARGET"
chown -R root:root "$DIST_TARGET"

echo "▸ Installing agent binary"
cp --remove-destination "$SRC/agent/configurator-agent" "$AGENT_TARGET"
chown root:root "$AGENT_TARGET"
chmod 755 "$AGENT_TARGET"

echo "▸ Restarting services"
systemctl restart configurator-agent
systemctl restart configurator

sleep 1
systemctl is-active --quiet configurator-agent && echo "  configurator-agent  active" || echo "  configurator-agent  FAILED"
systemctl is-active --quiet configurator       && echo "  configurator        active" || echo "  configurator        FAILED"

echo
echo "Rollback if needed:"
echo "  sudo rm -rf $DIST_TARGET && sudo mv $DIST_TARGET.bak-$TS $DIST_TARGET"
echo "  sudo cp $AGENT_TARGET.bak-$TS $AGENT_TARGET && sudo systemctl restart configurator-agent"
INSTALL

title "Done."
