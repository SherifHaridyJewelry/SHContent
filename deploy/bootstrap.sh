#!/usr/bin/env bash
# One-time VPS bootstrap for SHContent workflow app.
# Run as root on a fresh Ubuntu/Debian VPS.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="/opt/shcontent"
DATA_DIR="/var/lib/shcontent"
ENV_FILE="/etc/shcontent/.env"
DOMAIN="${DOMAIN:-workflow.yourdomain.com}"

echo "==> Creating deploy user"
id "$DEPLOY_USER" &>/dev/null || useradd -m -s /bin/bash "$DEPLOY_USER"

echo "==> Creating directories"
mkdir -p "$APP_DIR" "$DATA_DIR"/{data,images,raw,prompts,exports/catalog,logs}
mkdir -p /etc/shcontent
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" "$DATA_DIR"

echo "==> Installing system packages"
apt-get update
apt-get install -y python3 python3-venv python3-pip nginx postgresql postgresql-contrib certbot python3-certbot-nginx rsync git

echo "==> Creating PostgreSQL database"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='shcontent'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER shcontent WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='shcontent'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE shcontent OWNER shcontent;"

echo "==> Creating Python virtualenv"
sudo -u "$DEPLOY_USER" python3 -m venv "/home/$DEPLOY_USER/.venvs/shcontent"

echo "==> Installing nginx site config"
cp "$APP_DIR/deploy/nginx/shcontent.conf" /etc/nginx/sites-available/shcontent
ln -sf /etc/nginx/sites-available/shcontent /etc/nginx/sites-enabled/shcontent
nginx -t

echo "==> Installing systemd unit"
cp "$APP_DIR/deploy/systemd/shcontent-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable shcontent-api

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=postgresql+psycopg2://shcontent:CHANGE_ME@localhost/shcontent
APP_ENV=production
SECRET_KEY=$(openssl rand -hex 32)
API_KEY=$(openssl rand -hex 32)
ALLOWED_ORIGINS=https://${DOMAIN}
DATA_ROOT=${DATA_DIR}
KIE_API_KEY=
CF_ACCOUNT_ID=
CF_R2_ACCESS_KEY=
CF_R2_SECRET_KEY=
CF_R2_BUCKET=
CF_R2_PUBLIC_URL=
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — edit secrets before starting service"
fi

echo "==> SSL certificate (interactive)"
echo "Run: certbot --nginx -d ${DOMAIN}"

echo "Bootstrap complete. Next steps:"
echo "  1. Edit ${ENV_FILE}"
echo "  2. Deploy app code to ${APP_DIR}"
echo "  3. pip install -r requirements.txt && alembic upgrade head"
echo "  4. python scripts/import_json_to_postgres.py  (first deploy only)"
echo "  5. systemctl start shcontent-api"
