#!/usr/bin/env bash
# mail-autopull.sh — check for new commits on TinyTrashLabs/mail main
# and rebuild + redeploy if behind.
#
# Runs every 5 minutes via mail-autopull.timer. Compares deployed sha
# to origin/main. If behind: pull, rsync to /opt/mail, rebuild viewer,
# recreate viewer container. Posts result to #it-help.
#
# Env knobs (set in mail-autopull.service):
#   CHECKOUT         - prod-side git checkout (default: /home/patch/projects/mail)
#   COMPOSE_FILE     - path to docker-compose.yml
#   IT_HELP_CHANNEL_ID
#   MM_URL_HOST
#   MM_BOT_TOKEN     - @patch bot token (optional; skips MM post if absent)

set -euo pipefail

CHECKOUT="${CHECKOUT:-/home/patch/projects/mail}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/mail/docker-compose.yml}"
IT_HELP_CHANNEL_ID="${IT_HELP_CHANNEL_ID:-hwwyb3bqrjrqdkakgja7ssgq3a}"
MM_URL_HOST="${MM_URL_HOST:-https://mm.tinytrashlabs.com}"
STAMP_DIR="/var/lib/mail-autopull"
STAMP="${STAMP_DIR}/last_deployed_sha"

mkdir -p "$STAMP_DIR"

if [[ ! -d "$CHECKOUT/.git" ]]; then
    echo "[mail-autopull] no git checkout at $CHECKOUT — bailing" >&2
    exit 1
fi

# Fetch latest (public repo, no auth needed)
git -C "$CHECKOUT" fetch origin main --quiet 2>&1 || {
    echo "[mail-autopull] git fetch failed" >&2
    exit 1
}

ORIGIN_SHA=$(git -C "$CHECKOUT" rev-parse origin/main)
LAST_SHA=$(cat "$STAMP" 2>/dev/null || echo "")
LOCAL_SHA=$(git -C "$CHECKOUT" rev-parse HEAD)

if [[ "$ORIGIN_SHA" == "$LAST_SHA" ]]; then
    echo "[mail-autopull] already at ${ORIGIN_SHA:0:7} — nothing to do"
    exit 0
fi

echo "[mail-autopull] deploying: ${LOCAL_SHA:0:7} -> ${ORIGIN_SHA:0:7}"

mm_post() {
    local msg="$1"
    if [[ -n "${MM_BOT_TOKEN:-}" ]] && command -v jq &>/dev/null; then
        local payload
        payload=$(jq -n --arg ch "$IT_HELP_CHANNEL_ID" --arg msg "$msg" \
            '{channel_id: $ch, message: $msg}')
        curl -s -X POST "${MM_URL_HOST}/api/v4/posts" \
            -H "Authorization: Bearer ${MM_BOT_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$payload" > /dev/null || true
    fi
}

# Pull and sync
git -C "$CHECKOUT" pull origin main --quiet 2>&1
sudo rsync -a --delete --exclude='.git' "$CHECKOUT/" /opt/mail/

# Rebuild + recreate viewer only (store and db are unaffected by viewer code changes)
sudo docker compose -f "$COMPOSE_FILE" build mail-viewer 2>&1
sudo docker compose -f "$COMPOSE_FILE" up -d --force-recreate mail-viewer 2>&1

# Wait for container to settle, then check health
sleep 8
HEALTH=$(sudo docker inspect mail-mail-viewer-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
echo "[mail-autopull] viewer health after deploy: $HEALTH"

if [[ "$HEALTH" != "healthy" ]]; then
    echo "[mail-autopull] deploy unhealthy — NOT recording sha, will retry" >&2
    mm_post "⚠️ mail-autopull: deployed \`${ORIGIN_SHA:0:7}\` but viewer health is \`${HEALTH}\` — will retry"
    exit 1
fi

# Only record success once we know it's healthy
echo "$ORIGIN_SHA" > "$STAMP"
mm_post "📬 mail deployed: \`${LOCAL_SHA:0:7}\` → \`${ORIGIN_SHA:0:7}\` (viewer healthy)"
echo "[mail-autopull] done — deployed ${ORIGIN_SHA:0:7}"
