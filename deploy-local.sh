#!/usr/bin/env bash
#
# deploy-local.sh — Sync, push and (re)build the Pulse add-on on the local
# HAOS box for development. Coexists with a publicly-installed Pulse: the dev
# install uses slug `pulse-dev` (Supervisor sees `local_pulse-dev`), so you
# can A/B compare your in-progress changes against the published image.
#
# For the public release flow (CI, ghcr.io, version bump) see RELEASING.md.
#
# Pipeline:
#   1. rsync repo (excluding pulse/ catalog folder) → /addons/pulse-dev/ on HAOS
#   2. Copy pulse/config.yaml + pulse/README.md to /addons/pulse-dev/, with:
#        - `image:` line stripped (so Supervisor builds from source)
#        - `slug: pulse` → `slug: pulse-dev`
#        - `name: Pulse` → `name: Pulse (dev)`
#   3. ha store reload + install/update/rebuild + restart
#   4. Auto-register the sidebar panel (Supervisor doesn't do it for local
#      add-ons automatically — see LESSONS.md §8)
#
# Auth: SSH key (~/.ssh/id_ed25519, already authorized on HAOS).
# Connectivity: Tailscale by default, override via HAOS_HOST.
#
# Usage:
#   ./deploy-local.sh                  full deploy + rebuild + restart
#   ./deploy-local.sh --no-restart     push only (frontend live-reload cases)
#   ./deploy-local.sh --logs           tail logs after deploy finishes
#   HAOS_HOST=192.168.100.190 ./deploy-local.sh   override host
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HAOS_HOST="${HAOS_HOST:-ha-c.tail49f016.ts.net}"
HAOS_USER="${HAOS_USER:-root}"
# Dev slug — distinct from the public catalog install (`pulse`) so both can
# coexist on the same HAOS during testing.
SLUG="pulse-dev"
APP="local_${SLUG}"
REMOTE_PATH="/addons/${SLUG}"
SSH_TARGET="${HAOS_USER}@${HAOS_HOST}"

NO_RESTART=0
TAIL_LOGS=0

usage() {
  cat <<'EOF'
deploy-local.sh — push the Pulse add-on (dev variant) to a local HAOS box.

Usage:
  ./deploy-local.sh [--no-restart] [--logs]

Flags:
  --no-restart   Skip ha apps rebuild/restart (frontend HMR iterations).
  --logs         Follow add-on logs after deploy finishes.
  -h, --help     Show this help.

Environment:
  HAOS_HOST      SSH host (default: ha-c.tail49f016.ts.net).
  HAOS_USER      SSH user (default: root).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restart) NO_RESTART=1; shift ;;
    --logs)       TAIL_LOGS=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)
      echo "[deploy-local] unknown flag: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

log() { printf '[deploy-local] %s\n' "$*"; }

log "target: ${SSH_TARGET}:${REMOTE_PATH}"

# 1. rsync repo root → /addons/pulse-dev/, excluding the catalog manifest folder
#    (we'll layer that in step 2) plus all the dev/build artifacts.
log "rsync repo → ${SSH_TARGET}:${REMOTE_PATH}"
rsync -av --delete \
  --no-owner --no-group \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.tanstack' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.playwright-mcp' \
  --exclude='playwright-report' \
  --exclude='test-results' \
  --exclude='.claude' \
  --exclude='/pulse/' \
  --exclude='/.github/' \
  --exclude='deploy-local.sh' \
  --exclude='repository.yaml' \
  --exclude='release-please-config.json' \
  --exclude='.release-please-manifest.json' \
  -e "ssh -o ConnectTimeout=10" \
  "${SCRIPT_DIR}/" \
  "${SSH_TARGET}:${REMOTE_PATH}/"

# 2. Layer the addon manifest from pulse/ on top, with dev-mode transforms.
log "writing dev-mode config.yaml to ${REMOTE_PATH}"
ssh "$SSH_TARGET" "mkdir -p ${REMOTE_PATH}"
# We pipe the local config.yaml through sed and write it on the remote. This
# strips `image:` (so Supervisor builds locally) and renames slug + name.
sed \
  -e '/^image:/d' \
  -e 's/^slug: pulse$/slug: pulse-dev/' \
  -e 's/^name: Pulse$/name: Pulse (dev)/' \
  "${SCRIPT_DIR}/pulse/config.yaml" \
  | ssh "$SSH_TARGET" "cat > ${REMOTE_PATH}/config.yaml"

scp -q "${SCRIPT_DIR}/pulse/README.md" "${SSH_TARGET}:${REMOTE_PATH}/README.md"

if [[ $NO_RESTART -eq 1 ]]; then
  log "--no-restart: source pushed, skipping rebuild"
  exit 0
fi

# 3+4. Rescan local store + install/rebuild on the HAOS side. Single SSH session.
log "running ha lifecycle on HAOS (app=${APP})"
ssh "$SSH_TARGET" APP="$APP" 'bash -se' <<'REMOTE'
set -euo pipefail
rlog() { printf '[ha-remote] %s\n' "$*"; }

rlog "ha store reload"
ha store reload >/dev/null

# Detect installation state via `ha apps list` (only returns installed apps).
# `ha apps info` succeeds for store-only entries too, so it can't be used.
if ha apps list --raw-json 2>/dev/null \
     | jq -e --arg s "$APP" '.data.addons[]? | select(.slug == $s)' >/dev/null; then
  # Already installed. If config.yaml version differs from installed, the
  # Supervisor refuses `rebuild` ("Version changed, use Update instead") and
  # only re-reads the full config schema (panel_*, schema, options) on
  # `update`. So branch on update_available.
  UPDATE_AVAILABLE=$(ha apps info "$APP" --raw-json 2>/dev/null \
                       | jq -r '.data.update_available // false')
  if [[ "$UPDATE_AVAILABLE" == "true" ]]; then
    rlog "updating $APP (config version changed)"
    ha apps update "$APP"
  else
    rlog "rebuilding $APP (same version)"
    ha apps rebuild "$APP"
  fi
  rlog "restarting $APP"
  ha apps restart "$APP"
else
  rlog "installing $APP (first time)"
  ha apps install "$APP"
  rlog "starting $APP (initial build, may take 5-8 min)"
  ha apps start "$APP"
fi

# Sidebar panel registration. For STORE add-ons the HA frontend POSTs
# `{ingress_panel: true}` automatically on first install. For LOCAL add-ons
# in /addons/ that auto-POST never fires, so the add-on stays accessible
# only via Settings → Add-ons. We force it whenever ingress is enabled.
INGRESS=$(ha apps info "$APP" --raw-json 2>/dev/null | jq -r '.data.ingress // false')
PANEL=$(ha apps info "$APP" --raw-json 2>/dev/null | jq -r '.data.ingress_panel // false')
if [[ "$INGRESS" == "true" && "$PANEL" != "true" ]]; then
  rlog "registering sidebar panel (POST /addons/$APP/options ingress_panel=true)"
  curl -fsS -X POST \
    -H "Authorization: Bearer $SUPERVISOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"ingress_panel": true}' \
    "http://supervisor/addons/$APP/options" >/dev/null
fi

rlog "done"
REMOTE

if [[ $TAIL_LOGS -eq 1 ]]; then
  log "tailing logs — Ctrl-C to stop"
  exec ssh -t "$SSH_TARGET" "ha apps logs ${APP} -f"
fi

log "done"
