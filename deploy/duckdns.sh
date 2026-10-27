#!/usr/bin/env bash
# Le avisa a DuckDNS la IP pública de este servidor (hist. §103). Lo corre
# nexo-duckdns.timer con DUCKDNS_TOKEN y DUCKDNS_DOMINIO de
# /etc/nexo/duckdns.env. El token va por la entrada de curl, no como
# argumento, para que no aparezca en la lista de procesos.
set -euo pipefail
: "${DUCKDNS_TOKEN:?falta DUCKDNS_TOKEN en /etc/nexo/duckdns.env}"
dominio=${DUCKDNS_DOMINIO:-nexosystem}
respuesta=$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$dominio" "$DUCKDNS_TOKEN" \
  | curl -fsS --max-time 20 -K -)
[ "$respuesta" = OK ] || { echo "DuckDNS respondió: $respuesta" >&2; exit 1; }
