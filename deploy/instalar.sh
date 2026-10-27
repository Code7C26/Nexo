#!/usr/bin/env bash
# Instala Nexo en un Ubuntu 24.04 limpio: la VM de Oracle Cloud (hist. §103,
# guía en docs/publicar.md). En el servidor:
#
#   sudo bash instalar.sh [base.db]
#
# Con `base.db`, esa base pasa a ser la de Nexo si todavía no hay una (para
# llevar la base real de una compu al servidor). Se puede volver a correr:
# cada paso se fija si ya está hecho, y nunca pisa la base ni el .env.
set -euo pipefail

REPO=https://github.com/Code7C26/Nexo.git
RAMA=main
APP=/opt/nexo
DATOS=/var/lib/nexo
CONFIG=/etc/nexo
DOMINIO=${NEXO_DOMINIO:-nexosystem.duckdns.org}
BASE_INICIAL=${1:-}

[ "$(id -u)" -eq 0 ] || { echo "Correr con sudo." >&2; exit 1; }
paso() { printf '\n== %s\n' "$*"; }
export DEBIAN_FRONTEND=noninteractive

paso "Swap de 2 GB (la VM tiene 1 GB de memoria)"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-nexo-swap.conf
sysctl -q -p /etc/sysctl.d/90-nexo-swap.conf

paso "Paquetes base"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git sqlite3 iptables-persistent

paso "Firewall de Ubuntu: 80 y 443"
# Las imágenes de Oracle traen iptables cerrado salvo el 22, con un REJECT al
# final de INPUT: las reglas nuevas van antes de ese REJECT. La Security List
# de Oracle (afuera de la VM) ya tiene abiertos los dos puertos.
for puerto in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport "$puerto" -j ACCEPT 2>/dev/null; then
    linea=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    if [ -n "$linea" ]; then
      iptables -I INPUT "$linea" -p tcp -m state --state NEW -m tcp --dport "$puerto" -j ACCEPT
    else
      iptables -A INPUT -p tcp -m state --state NEW -m tcp --dport "$puerto" -j ACCEPT
    fi
  fi
done
netfilter-persistent save

paso "Node 22 (NodeSource)"
if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)' 2>/dev/null; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -y -q nodejs
fi
node --version

paso "Caddy (https automático)"
if ! command -v caddy > /dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi
caddy version

paso "Usuario nexo y carpetas"
id nexo > /dev/null 2>&1 || useradd --system --home-dir "$DATOS" --shell /usr/sbin/nologin nexo
install -d -o nexo -g nexo -m 750 "$DATOS" "$DATOS/respaldos"
install -d -o root -g nexo -m 750 "$CONFIG"

paso "Código ($RAMA)"
if [ ! -d "$APP/.git" ]; then
  install -d -o nexo -g nexo -m 755 "$APP"
  (cd / && runuser -u nexo -- env HOME="$DATOS" git clone -q --branch "$RAMA" "$REPO" "$APP")
fi

paso "Configuración ($CONFIG/nexo.env)"
if [ ! -f "$CONFIG/nexo.env" ]; then
  cat > "$CONFIG/nexo.env" <<EOF
# Variables de Nexo en el servidor (las mismas de .env.example). Después de
# cambiar algo: sudo systemctl restart nexo
NODE_ENV=production
PORT=3000
NEXO_HOST=127.0.0.1
NEXO_TRUST_PROXY=1
NEXO_URL_PUBLICA=https://$DOMINIO
NEXO_DB_PATH=$DATOS/nexo.db
NEXO_BACKUP_DIR=$DATOS/respaldos
NEXO_BACKUP_KEEP=60
# Mail (sin estas dos, Nexo no manda mails):
# NEXO_SMTP_USUARIO=
# NEXO_SMTP_CLAVE=
# GEMINI_API_KEY=
EOF
fi
chown root:nexo "$CONFIG/nexo.env"
chmod 640 "$CONFIG/nexo.env"

if [ -n "$BASE_INICIAL" ]; then
  paso "Base inicial"
  if [ -f "$DATOS/nexo.db" ]; then
    echo "Ya hay una base en $DATOS/nexo.db: no se pisa."
  else
    systemctl stop nexo 2>/dev/null || true
    sqlite3 "$BASE_INICIAL" 'PRAGMA integrity_check;' | grep -qx ok || { echo "La base $BASE_INICIAL no pasa integrity_check." >&2; exit 1; }
    install -o nexo -g nexo -m 640 "$BASE_INICIAL" "$DATOS/nexo.db"
    echo "Base copiada a $DATOS/nexo.db."
  fi
fi

paso "Servicios, Caddy y arranque"
bash "$APP/deploy/actualizar.sh" --forzar
systemctl enable --now nexo-actualizar.timer nexo-respaldo.timer nexo-duckdns.timer

paso "Listo"
echo "Nexo: https://$DOMINIO (el certificado puede tardar un minuto la primera vez)."
