#!/usr/bin/env bash
# Sync only production paths to /opt/shcontent (no IDE/tooling dirs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-root@72.62.51.230}"
DEST="${DEST:-/opt/shcontent}"

cd "$ROOT"

echo "==> Building frontend"
(cd web && npm run build)

echo "==> Syncing application files"
rsync -avz --delete app/ "${REMOTE}:${DEST}/app/"
rsync -avz --delete scripts/ "${REMOTE}:${DEST}/scripts/"
rsync -avz --delete templates/ "${REMOTE}:${DEST}/templates/"
rsync -avz --delete workflows/ "${REMOTE}:${DEST}/workflows/"
rsync -avz --delete alembic/ "${REMOTE}:${DEST}/alembic/"
rsync -avz --delete deploy/ "${REMOTE}:${DEST}/deploy/"
ssh "${REMOTE}" "mkdir -p ${DEST}/web/dist"
rsync -avz --delete web/dist/ "${REMOTE}:${DEST}/web/dist/"
rsync -avz requirements.txt alembic.ini Dockerfile.api "${REMOTE}:${DEST}/"

echo "==> Done. Restart with:"
echo "  ssh ${REMOTE} 'chmod -R a+rX ${DEST}/web/dist && cd ${DEST}/deploy && docker compose --env-file /etc/shcontent/.env -f docker-compose.prod.yml -f docker-compose.domains.yml up -d --build'"
