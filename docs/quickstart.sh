#!/usr/bin/env bash
# Opus Davi · Phase 2 self-hosted Bitcoin pool · quickstart bootstrap
#
# Usage (run on your VPS / box as a user with sudo):
#   curl -fsSL https://raw.githubusercontent.com/davilibanio3-alt/Opus-Davi/main/docs/quickstart.sh | bash
# or
#   git clone https://github.com/davilibanio3-alt/Opus-Davi.git && cd Opus-Davi && bash docs/quickstart.sh
#
# This script is idempotent — re-running it is safe.

set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$HOME/Opus-Davi}"
REPO_URL="${REPO_URL:-https://github.com/davilibanio3-alt/Opus-Davi.git}"

log() { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m⚠\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m✗\033[0m %s\n" "$*"; exit 1; }

# 1. System prerequisites
if ! command -v docker >/dev/null; then
  log "Installing Docker Engine via official convenience script…"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  warn "You were added to the 'docker' group. Log out + back in, OR run: newgrp docker"
fi
if ! docker compose version >/dev/null 2>&1; then
  die "'docker compose' plugin not found. Install docker-compose-plugin and re-run."
fi
command -v openssl >/dev/null || sudo apt-get install -y openssl

# 2. Clone / update repo
if [ ! -d "$ROOT_DIR/.git" ]; then
  log "Cloning $REPO_URL → $ROOT_DIR"
  git clone "$REPO_URL" "$ROOT_DIR"
else
  log "Updating existing checkout at $ROOT_DIR"
  git -C "$ROOT_DIR" fetch --all
  git -C "$ROOT_DIR" pull --ff-only
fi
cd "$ROOT_DIR"

# 3. Bootstrap .env if it doesn't exist
if [ ! -f .env ]; then
  log "Creating .env from template…"
  cp .env.example .env

  GENERATED_PWD="$(openssl rand -hex 32)"
  # macOS-safe sed-in-place
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^BITCOIND_RPC_PASSWORD=.*|BITCOIND_RPC_PASSWORD=${GENERATED_PWD}|" .env
  else
    sed -i "" "s|^BITCOIND_RPC_PASSWORD=.*|BITCOIND_RPC_PASSWORD=${GENERATED_PWD}|" .env
  fi
  warn "Generated a random BITCOIND_RPC_PASSWORD in .env"
fi

# 4. Make sure POOL_PAYOUT_ADDRESS is set
if grep -qE '^POOL_PAYOUT_ADDRESS=\s*$' .env || grep -qE '^POOL_PAYOUT_ADDRESS=bc1q\.\.\.your-address' .env; then
  warn "POOL_PAYOUT_ADDRESS is not set in .env."
  warn "Edit .env and set POOL_PAYOUT_ADDRESS to a Mainnet address YOU control."
  warn "(any bc1q…/bc1p…/3…/1… address from your own wallet works.)"
  warn "Then re-run this script."
  exit 0
fi

# 5. Bring up bitcoind first (long IBD ahead)
log "Building images + starting bitcoind…"
docker compose build bitcoind pool backend frontend
docker compose up -d bitcoind

log "bitcoind is starting Initial Block Download (IBD)."
log "On NVMe this takes ~1 day, on spinning disk 3–5 days."
log "Tail progress:   docker compose logs -f bitcoind"
log "Check state:     docker compose exec bitcoind bitcoin-cli -datadir=/data getblockchaininfo | jq .verificationprogress"

# 6. Bring up the rest of the stack — pool will sit idle until IBD is done.
log "Starting pool, backend, frontend (they will idle until bitcoind is ready)…"
docker compose up -d pool backend frontend

cat <<EOF

──────────────────────────────────────────────────────────────────
 Opus Davi stack is up.

  • frontend  http://$(hostname -I | awk '{print $1}'):3000   (Pool tab)
  • backend   http://$(hostname -I | awk '{print $1}'):8787
  • Stratum   stratum+tcp://$(hostname -I | awk '{print $1}'):3333
  • bitcoind  TCP 8333 (p2p), RPC 8332 (loopback only)

 Next steps:

  1. Wait for IBD (\`docker compose logs -f bitcoind\`).
  2. Once verificationprogress ≈ 1.0, you can point real hashpower
     at stratum+tcp://your-ip:3333  (any worker name, password "x").
  3. To test end-to-end with the bundled CPU miner sidecar:
       docker compose --profile with-miner up -d miner
  4. Open the Pool tab in the frontend — you should see your CPU
     worker, real shares, real block candidates.

 Stop the stack:   docker compose down
 Nuke the chain:   docker volume rm opus-davi_bitcoin-data
──────────────────────────────────────────────────────────────────
EOF
