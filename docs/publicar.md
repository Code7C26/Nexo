# Publicar Nexo

Cómo está publicado Nexo, cómo se actualiza y qué hacer si algo falla
(etapa 8, Fase 4; hist. §103 en `docs/handoff-historico.md`).

## Dónde está

- **Dirección:** https://nexosystem.duckdns.org. La landing está en `/` y la
  app en `/app`.
- **Servidor:** Oracle Cloud, cuenta "Nexoapp", región Brazil East (São
  Paulo).
  - Instancia `nexo`: VM.Standard.E2.1.Micro, con 1 GB de memoria y 2 GB de
    swap, y Ubuntu 24.04.
  - IP `137.131.218.182`, que se mantiene mientras exista la instancia.
- **Entrar por SSH:**
  `ssh -i "C:\Users\HP ULTRA 5\.ssh\nexo-oracle.key" ubuntu@137.131.218.182`.
  La llave no se versiona ni se comparte.
- **DuckDNS:** `nexosystem.duckdns.org` apunta a esa IP.

## Cómo funciona

```
internet ──443──▶ Caddy (https, Let's Encrypt) ──▶ Node en 127.0.0.1:3000 ──▶ /var/lib/nexo/nexo.db
```

| Qué | Dónde |
|---|---|
| Código (un clon de `main`) | `/opt/nexo`, del usuario `nexo` |
| Base y respaldos | `/var/lib/nexo/nexo.db`, `/var/lib/nexo/respaldos/` |
| Variables (`.env` del servidor) | `/etc/nexo/nexo.env` |
| Token de DuckDNS (opcional) | `/etc/nexo/duckdns.env` |
| Caddy | `/etc/caddy/Caddyfile` (copia de `deploy/Caddyfile`) |
| Servicios | `nexo`, `caddy` y los timers `nexo-actualizar`, `nexo-respaldo` y `nexo-duckdns` |

- **Https:** Caddy saca el certificado y lo renueva solo. Manda HSTS y, hasta
  que estén los términos (Fase 3 de 8b), `X-Robots-Tag: noindex`, para que
  ningún buscador indexe el sitio.
- **Proceso de Node:** corre como `nexo` y solo puede escribir en
  `/var/lib/nexo`.
- **Firewall:** abierto el 22, el 80 y el 443, en la Security List de Oracle
  y en el iptables de Ubuntu. El 3000 no se ve desde afuera.

## Cómo se actualiza

Solo: **lo que llega a `main` aparece en el servidor en unos 5 minutos.**

`nexo-actualizar.timer` corre `deploy/actualizar.sh` cada 5 minutos. El
script:

1. Hace `git fetch` de `main`. Si no hay nada nuevo, termina.
2. Espera a que el CI de GitHub de ese commit esté en verde. Si está en rojo,
   no lo instala.
3. Pasa al commit nuevo:
   - corre `npm ci` si cambió `backend/package-lock.json`;
   - copia las unidades y el `Caddyfile` si cambiaron;
   - reinicia Nexo.

   Al arrancar, Nexo respalda la base antes de migrarla.
4. Si Nexo no responde en 30 segundos, vuelve al commit anterior y anota el
   que falló en `/var/lib/nexo/.commit-fallido`, para no reintentarlo. Un
   commit nuevo en `main` lo destraba.

Forzar una actualización ya, o reaplicar todo:

```bash
sudo bash /opt/nexo/deploy/actualizar.sh --forzar
```

## Respaldos

- **En cada arranque** (`db/respaldo.js`) y **todos los días a las 3:30**
  (`nexo-respaldo.timer`), en `/var/lib/nexo/respaldos/`. Se guardan los
  últimos 60.
- **Traer uno a la compu:**
  ```bash
  scp -i "C:\Users\HP ULTRA 5\.ssh\nexo-oracle.key" ubuntu@137.131.218.182:/var/lib/nexo/respaldos/<archivo>.db .
  ```
  Antes hay que dejarlo legible para `ubuntu`: copiarlo con sudo a `/tmp` y
  hacerle `chmod`.
- **Pendiente:** un respaldo fuera de la VM (Object Storage de Oracle).
  Mientras tanto, si se pierde la VM se pierden también sus respaldos.

## Tareas comunes

```bash
systemctl status nexo caddy                  # ¿anda?
journalctl -u nexo -f                        # el log de Nexo en vivo
journalctl -u nexo-actualizar -n 50          # qué hizo la última actualización
sudo systemctl restart nexo                  # después de cambiar /etc/nexo/nexo.env
sudoedit /etc/nexo/nexo.env                  # variables (SMTP, Gemini, etc.)
sudo -u nexo sqlite3 /var/lib/nexo/nexo.db   # mirar la base (con cuidado)
```

**Cambiar una variable:** las del servidor son las mismas de `.env.example`.
Las que fija la instalación son `NODE_ENV=production`, `NEXO_HOST=127.0.0.1`,
`NEXO_TRUST_PROXY=1`, `NEXO_URL_PUBLICA`, `NEXO_DB_PATH`, `NEXO_BACKUP_DIR` y
`NEXO_BACKUP_KEEP=60`.

**DuckDNS:** la IP no cambia mientras exista la instancia, así que el aviso a
DuckDNS es solo por si acaso. Para prenderlo, crear `/etc/nexo/duckdns.env`
con el token, que nunca va al repo ni al chat:

```bash
sudo install -m 600 /dev/null /etc/nexo/duckdns.env
sudoedit /etc/nexo/duckdns.env   # DUCKDNS_TOKEN=... y DUCKDNS_DOMINIO=nexosystem
sudo systemctl start nexo-duckdns.service && journalctl -u nexo-duckdns -n 5
```

## Instalar desde cero

En una VM nueva con Ubuntu 24.04:

1. **En Oracle:** abrir el 80 y el 443 (TCP) en la Security List de la VCN.
2. **En DuckDNS:** apuntar el dominio a la IP nueva.
3. **Desde la compu:** subir el instalador y, si se quiere llevar, una copia
   de la base. La copia sale con `VACUUM INTO` (por ejemplo, con
   `npm run backup`), nunca copiando el `.db` en uso:
   ```bash
   scp -i <llave> deploy/instalar.sh nexo.db ubuntu@<ip>:
   ```
4. **En el servidor:**
   ```bash
   sudo bash instalar.sh nexo.db    # sin nexo.db arranca con una base vacía
   sudoedit /etc/nexo/nexo.env      # SMTP y lo que falte
   sudo systemctl restart nexo
   ```

El instalador se puede correr de nuevo sin romper nada: cada paso se fija si
ya está hecho, y nunca pisa la base ni el `.env`.

## Cuidados

- **Oracle recupera las VM gratis que pasan una semana casi sin uso.** Pasar
  la cuenta a Pay As You Go lo evita. Es una decisión de plata, sin tomar.
- **La base del servidor es la de verdad desde el 27 de octubre de 2026.** La
  de la compu quedó como copia vieja: lo que se cargue ahí no sube solo.
- **Los enlaces de los mails** usan `NEXO_URL_PUBLICA`. Los que se mandaron
  desde la compu apuntan a `localhost` y no sirven en el servidor.
