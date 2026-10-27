#!/usr/bin/env bash
# Trae lo último de `main` y reinicia Nexo si cambió (hist. §103). Lo corre
# nexo-actualizar.timer cada 5 minutos, como root; a mano:
#
#   sudo bash /opt/nexo/deploy/actualizar.sh            # solo si hay commits nuevos
#   sudo bash /opt/nexo/deploy/actualizar.sh --forzar   # reaplica todo igual
#
# Reglas:
# - Solo pasa a un commit con el CI de GitHub en verde (main llega por PR, pero
#   el push a main corre el CI de nuevo). Si el CI todavía corre, espera.
# - Si Nexo no responde después de reiniciar, vuelve al commit anterior y anota
#   el que falló para no reintentarlo cada 5 minutos.
# - El respaldo de la base lo hace el mismo arranque (db/respaldo.js), antes de
#   cualquier migración.
# Todo va dentro de main(): git reemplaza este archivo mientras corre, y bash
# ya tiene la función entera leída.
set -euo pipefail

APP=/opt/nexo
DATOS=/var/lib/nexo
RAMA=main
API=https://api.github.com/repos/Code7C26/Nexo
FALLIDO=$DATOS/.commit-fallido
UNIDADES="nexo.service nexo-actualizar.service nexo-actualizar.timer nexo-respaldo.service nexo-respaldo.timer nexo-duckdns.service nexo-duckdns.timer"

como_nexo() { runuser -u nexo -- env HOME="$DATOS" "$@"; }

estado_ci() {
  curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "$API/commits/$1/check-runs" \
    | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const corridas = JSON.parse(s).check_runs || [];
        if (!corridas.length || corridas.some((c) => c.status !== "completed")) return console.log("pendiente");
        console.log(corridas.every((c) => ["success", "skipped", "neutral"].includes(c.conclusion)) ? "ok" : "fallo");
      });' \
    || echo "sin-respuesta"
}

instalar_dependencias() {
  como_nexo npm ci --omit=dev --no-audit --no-fund --prefix "$APP/backend" > /dev/null
}

responde() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:3000/robots.txt && return 0
    sleep 1
  done
  return 1
}

aplicar_sistema() {
  local recargar=0
  for unidad in $UNIDADES; do
    if ! cmp -s "$APP/deploy/$unidad" "/etc/systemd/system/$unidad"; then
      install -m 644 "$APP/deploy/$unidad" "/etc/systemd/system/$unidad"
      recargar=1
    fi
  done
  [ "$recargar" = 1 ] && systemctl daemon-reload
  if ! cmp -s "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile; then
    caddy validate --config "$APP/deploy/Caddyfile" --adapter caddyfile > /dev/null
    install -m 644 "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
    systemctl reload caddy || systemctl restart caddy
  fi
  systemctl enable --quiet caddy nexo
}

main() {
  local forzar=0
  [ "${1:-}" = --forzar ] && forzar=1
  cd "$APP"

  como_nexo git -C "$APP" fetch -q origin "$RAMA"
  local actual nuevo
  actual=$(como_nexo git -C "$APP" rev-parse HEAD)
  nuevo=$(como_nexo git -C "$APP" rev-parse "origin/$RAMA")

  if [ "$actual" != "$nuevo" ]; then
    if [ "$nuevo" = "$(cat "$FALLIDO" 2>/dev/null)" ] && [ "$forzar" = 0 ]; then exit 0; fi
    local ci
    ci=$(estado_ci "$nuevo")
    if [ "$ci" != ok ] && [ "$forzar" = 0 ]; then
      echo "Hay un commit nuevo (${nuevo:0:7}) con el CI en \"$ci\": se espera."
      exit 0
    fi
    echo "Actualizando ${actual:0:7} → ${nuevo:0:7}."
    como_nexo git -C "$APP" reset -q --hard "$nuevo"
  elif [ "$forzar" = 0 ]; then
    exit 0
  fi

  if [ "$forzar" = 1 ] || [ ! -d "$APP/backend/node_modules" ] \
    || ! como_nexo git -C "$APP" diff --quiet "$actual" "$nuevo" -- backend/package-lock.json; then
    instalar_dependencias
  fi
  como_nexo node "$APP/scripts/fuentes.mjs" --si-falta || true
  aplicar_sistema
  systemctl restart nexo

  if responde; then
    rm -f "$FALLIDO"
    echo "Nexo responde en ${nuevo:0:7}."
    return 0
  fi

  echo "Nexo no responde en ${nuevo:0:7}." >&2
  journalctl -u nexo -n 30 --no-pager >&2 || true
  if [ "$actual" != "$nuevo" ]; then
    echo "$nuevo" > "$FALLIDO"
    echo "Se vuelve a ${actual:0:7}." >&2
    como_nexo git -C "$APP" reset -q --hard "$actual"
    instalar_dependencias
    aplicar_sistema
    systemctl restart nexo
    responde && echo "Nexo responde de nuevo en ${actual:0:7}." >&2
  fi
  exit 1
}

exec 9> /run/nexo-actualizar.lock
flock -n 9 || exit 0
main "$@"
