import express from 'express';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import db, { withTransaction, registrarAuditoria, resembrarEtapasCrm, sembrarCatalogosBase } from './db/index.js';
import { interpretar, InterpreteError } from './interprete.js';
import { esMailValido, mandarMail, plantillaMail } from './mail.js';
import { fechaDeHoy, inicioDeHoyUTC } from './fecha.js';
import { CATALOGO_POR_DEFECTO, MODULOS, MODULOS_INFO, PERFILES_RUBRO, RUBRO_POR_DEFECTO, RUBROS_PROXIMAMENTE, modulosDelPreset } from './perfiles.js';
import { DIAS_PRUEBA, PLANES, PLAN_POR_DEFECTO, esPlan, planEfectivo, planQuePermite } from './planes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// "Hoy" es el día en la zona del negocio (fecha.js, hist. §81), nunca el
// date('now') de SQLite, que es UTC. Todo INSERT pasa la fecha explícita (el
// DEFAULT (date('now')) de las tablas ya no se usa): desde JS con fechaDeHoy(),
// y dentro del SQL con HOY_SQL, una función registrada en la conexión que
// llama a la misma fechaDeHoy(), así las dos no pueden dar distinto.
db.function('fecha_de_hoy', { deterministic: false }, () => fechaDeHoy());
const HOY_SQL = 'fecha_de_hoy()';

// Cabeceras de seguridad básicas (CLAUDE.md §35), y la CSP desde la PWA (hist.
// §94): las fuentes ya se sirven desde frontend/fonts/ y el script del <head>
// salió a js/arranque.js, así que todo lo que carga la app es del mismo origen.
// Sin script inline: un XSS que lograra meter HTML no podría ejecutar nada.
// style-src permite inline porque las plantillas de la app arman atributos
// style="" (anchos de barras, colores). img-src suma data: (los íconos de los
// avisos en styles.css) y blob: (lo que arma el PDF de un comprobante).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.disable('x-powered-by');
// Detrás de un proxy inverso (HTTPS en producción) `req.ip` sería siempre la IP
// del proxy y los límites por IP agruparían a todos los clientes. NEXO_TRUST_PROXY
// es la cantidad de proxies de confianza delante (normalmente 1).
if (Number(process.env.NEXO_TRUST_PROXY) > 0) {
  app.set('trust proxy', Number(process.env.NEXO_TRUST_PROXY));
} else if (process.env.NODE_ENV === 'production') {
  // Sin esto, detrás de un proxy todos los clientes comparten IP y 30 logins
  // fallidos de cualquiera bloquean el login de todos durante 15 minutos.
  console.warn('NEXO_TRUST_PROXY no está definido: si hay un proxy inverso delante, los límites por IP agrupan a todos los clientes.');
}
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  next();
});

app.use(express.json());

/* ---------- Páginas públicas y la app (hist. §100) ---------- */

// `/` es la landing, y la app vive en `/app`. Quien ya tiene sesión va derecho
// a la app: una instalación vieja de la PWA (start_url "/") sigue abriendo
// bien. Lo estático va con `index: false` para que `/` no sirva index.html.
const FRONTEND = path.join(__dirname, '..', 'frontend');
const PAGINAS_PUBLICAS = ['/', '/privacidad'];

// La dirección pública, para lo que tiene que ir absoluto (canónico, imagen de
// Open Graph, robots y sitemap). NEXO_URL_PUBLICA la fija al publicar (Fase 4);
// sin ella se arma con el pedido, que alcanza en desarrollo.
const urlPublica = (req) => (process.env.NEXO_URL_PUBLICA || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

// Los precios del JSON-LD salen de PLANES, como los de las tarjetas (que arma
// landing.js con GET /api/auth/planes): un precio se cambia solo en planes.js.
// `<` se escapa para que ningún texto pueda cerrar el <script>.
function jsonLdLanding(url) {
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Nexo',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS, Windows, macOS',
    url: `${url}/`,
    inLanguage: 'es-AR',
    offers: Object.values(PLANES).map((plan) => ({
      '@type': 'Offer',
      name: plan.nombre,
      price: plan.precio,
      priceCurrency: 'ARS',
      description: plan.descripcion
    }))
  };
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}

// La plantilla se lee una vez en producción y en cada pedido en desarrollo,
// así un cambio en landing.html se ve sin reiniciar.
let plantillaLanding = null;
function leerPlantillaLanding() {
  if (plantillaLanding && process.env.NODE_ENV === 'production') return plantillaLanding;
  plantillaLanding = readFileSync(path.join(FRONTEND, 'landing.html'), 'utf8');
  return plantillaLanding;
}

app.get('/', (req, res) => {
  if (sesionValida(leerCookie(req, COOKIE_SESION))) return res.redirect(302, '/app');
  const url = urlPublica(req);
  const html = leerPlantillaLanding()
    .replaceAll('%URL%', url)
    .replaceAll('%JSONLD%', () => jsonLdLanding(url));
  res.type('html').send(html);
});
app.get('/app', (req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.get('/index.html', (req, res) => res.redirect(301, '/app'));
app.get('/privacidad', (req, res) => res.sendFile(path.join(FRONTEND, 'privacidad.html')));

// El enlace del mail de verificación (hist. §102). Es un GET porque se toca
// desde el programa de mail; si un antivirus del mail lo abre antes, solo
// verifica antes de tiempo, y quien lo toque después ve "verificado" igual.
// Vale si no venció y si la cuenta sigue teniendo el mismo mail al que se
// mandó. Redirige a la app, que muestra el resultado (sesion.js).
app.get('/verificar-mail', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const fila = token
    ? db
        .prepare(
          `SELECT t.id, t.usuario_id, t.usado, u.email_verificado
             FROM tokens_cuenta t
             JOIN usuarios u ON u.id = t.usuario_id
            WHERE t.token_hash = ? AND t.tipo = 'verificar_email'
              AND t.vence > datetime('now') AND u.email = t.email`
        )
        .get(hashToken(token))
    : null;
  if (!fila) return res.redirect(302, '/app?mail=invalido');
  if (fila.usado) return res.redirect(302, fila.email_verificado ? '/app?mail=verificado' : '/app?mail=invalido');

  withTransaction(() => {
    db.prepare("UPDATE tokens_cuenta SET usado = datetime('now') WHERE id = ?").run(fila.id);
    db.prepare("UPDATE usuarios SET email_verificado = datetime('now') WHERE id = ?").run(fila.usuario_id);
    // Sin sesión: va al último negocio que usó, para que se vea en su auditoría.
    const negocio = db
      .prepare(
        `SELECT organizacion_id FROM usuario_organizaciones WHERE usuario_id = ?
          ORDER BY ultimo_acceso IS NULL, ultimo_acceso DESC LIMIT 1`
      )
      .get(fila.usuario_id);
    registrarAuditoria({
      accion: 'editar',
      entidad: 'usuario',
      entidad_id: fila.usuario_id,
      usuario_id: fila.usuario_id,
      organizacion_id: negocio?.organizacion_id ?? null,
      detalle: 'Verificó su mail'
    });
  });
  res.redirect(302, '/app?mail=verificado');
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\n\nSitemap: ${urlPublica(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
  const url = urlPublica(req);
  const entradas = PAGINAS_PUBLICAS.map((p) => `  <url><loc>${url}${p}</loc></url>`).join('\n');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entradas}\n</urlset>\n`);
});

app.use(express.static(FRONTEND, { index: false }));
// assets/ vive al mismo nivel que backend/ y frontend/ (así lo define
// CLAUDE.md), no adentro de frontend/. Sin este mount el logo y el
// favicon no serían alcanzables por HTTP. Es una ruta estática de solo
// lectura, no toca lógica ni datos.
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

/* ---------- Usuarios, sesión y roles ---------- */

// Parámetros de scrypt. N=16384/r=8/p=1 mide ~15-16 MB reales de memoria
// (medido en la práctica), por debajo del límite default de Node (32 MB)
// — así que en teoría alcanzaría sin más, pero se pasa maxmem explícito
// igual: es gratis, documenta la intención, y protege si en el futuro
// alguien sube N sin revisar el límite default. Se elige scrypt sobre
// pbkdf2 por ser memory-hard (mucho más caro de atacar con GPU al mismo
// costo de CPU). Es la variante SYNC (no hay scrypt async simple sin
// pasar un callback) y bloquea el event loop ~100 ms por login — es real,
// medido, y por eso el rate limit de abajo NO es opcional: 5 intentos
// fallidos seguidos ya son medio segundo de servidor congelado. No migrar
// a una versión async sin motivo: rompería la simetría con el resto del
// archivo, que es sync de punta a punta porque node:sqlite lo es.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = randomBytes(16);
  // NFKC: una contraseña con acentos puede llegar en NFC o NFD según el
  // teclado/SO de quien tipea, y sin normalizar no matchearía consigo
  // misma entre el alta y un login posterior.
  const hash = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return { hash: hash.toString('hex'), salt: salt.toString('hex') };
}

function verificarPassword(password, hashHex, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const calculado = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  const esperado = Buffer.from(hashHex, 'hex');
  // timingSafeEqual tira si los buffers difieren en longitud, así que hay
  // que chequear eso antes en vez de dejar que lance.
  if (calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

// Hash de un password que nunca es real, calculado una sola vez al
// bootear. Sin esto, el login respondería instantáneo para un usuario
// que no existe (nunca llega a calcular un scrypt) y ~100ms más lento
// para uno que sí existe, revelando por temporización qué usuarios hay
// dados de alta. Con esto, ambos casos hacen el mismo trabajo.
const HASH_DUMMY = hashPassword('nexo-usuario-inexistente-' + randomBytes(8).toString('hex'));

// Parser mínimo de la cookie de sesión, en vez de instalar el paquete
// `cookie-parser` para un solo campo. `indexOf` (no `split('=')`) porque
// un valor de cookie podría contener '=' (no es el caso acá, pero es más
// robusto no asumirlo).
function leerCookie(req, nombre) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const parte of header.split(';')) {
    const trimmed = parte.trim();
    const igual = trimmed.indexOf('=');
    if (igual === -1) continue;
    if (trimmed.slice(0, igual) === nombre) return trimmed.slice(igual + 1);
  }
  return null;
}

const COOKIE_SESION = 'nexo_sesion';
const SESION_HORAS = 12;

function ponerCookieSesion(res, token) {
  // httpOnly: inalcanzable desde JS — importa porque varias tablas del
  // frontend interpolan texto sin escapar, así que una cookie legible
  // por JS sería un vector de XSS más grave de lo habitual. sameSite:lax
  // cubre CSRF sin necesitar un token aparte en same-origin. secure debe
  // ser false en http://localhost (si no, el navegador la descarta
  // directamente) y solo se activa en producción real con HTTPS.
  res.cookie(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESION_HORAS * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  });
}

function borrarCookieSesion(res) {
  res.clearCookie(COOKIE_SESION, { path: '/' });
}

// La sesión nace en un negocio: el que se acaba de crear en el registro, o el
// último que usó quien entra (hist. §77).
function crearSesion(usuarioId, organizacionId) {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sesiones (token, usuario_id, organizacion_id, expira)
     VALUES (?, ?, ?, datetime('now', '+${SESION_HORAS} hours'))`
  ).run(token, usuarioId, organizacionId);
  return token;
}

// Tabla de sesiones en vez de token firmado (JWT): dar de baja a un
// empleado o resetearle la contraseña borra sus filas de `sesiones`, y
// eso lo saca del sistema en el próximo request — con un JWT seguiría
// operando hasta que el token expirara por su cuenta. En un sistema que
// maneja plata y audita todo, esa demora no es aceptable.
//
// El negocio sale de la sesión y el rol, de lo que el usuario es en ese
// negocio (usuario_organizaciones, hist. §77). Llegan a req.usuario con los
// nombres de siempre, organizacion_id y rol, así ningún handler cambia. La
// baja en ese negocio corta la sesión en el próximo request.
function sesionValida(token) {
  if (!token) return null;
  const fila = db
    .prepare(
      `SELECT usuarios.id, usuarios.usuario, usuarios.nombre, pertenencia.rol,
              usuarios.debe_cambiar_password, sesiones.organizacion_id,
              usuarios.email, usuarios.email_verificado
         FROM sesiones
         JOIN usuarios ON usuarios.id = sesiones.usuario_id
         JOIN usuario_organizaciones pertenencia
           ON pertenencia.usuario_id = sesiones.usuario_id
          AND pertenencia.organizacion_id = sesiones.organizacion_id
        WHERE sesiones.token = ?
          AND sesiones.expira > datetime('now')
          AND pertenencia.activo = 1`
    )
    .get(token);
  return fila ?? null;
}

// Lo que el frontend sabe del usuario de la sesión, con la misma forma en
// estado, login y registro. organizacion_id es el negocio activo: sesion.js lo
// marca en <html> para separar por negocio lo que se guarda en el navegador y
// para darse cuenta si otra pestaña cambió de negocio. Sin email, sesion.js
// muestra "Sumá tu mail" antes de arrancar la app (hist. §102).
function datosUsuario({ id, usuario, nombre, rol, debe_cambiar_password, organizacion_id, email, email_verificado }) {
  return {
    id,
    usuario,
    nombre,
    rol,
    debe_cambiar_password: !!debe_cambiar_password,
    organizacion_id,
    email: email ?? null,
    email_verificado: !!email_verificado
  };
}

// Cuándo entró por última vez a un negocio: el login vuelve al último. Con
// milésimas y no con datetime('now'), porque cambiar de negocio y volver a
// entrar pueden caer en el mismo segundo. Los formatos de fecha del frontend
// leen solo el principio, así que la cola no se ve.
function marcarAcceso(usuarioId, organizacionId) {
  db.prepare(
    `UPDATE usuario_organizaciones SET ultimo_acceso = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE usuario_id = ? AND organizacion_id = ?`
  ).run(usuarioId, organizacionId);
}

function renovarSesion(token) {
  db.prepare(`UPDATE sesiones SET expira = datetime('now', '+${SESION_HORAS} hours') WHERE token = ?`).run(
    token
  );
}

/* ---------- Mail de la cuenta (hist. §102) ---------- */

// Se entra con el mail (docs/investigacion-login-legal.md, sección 5). Se
// guarda en minúsculas: nadie distingue "Ana@" de "ana@" al tipear.
const normalizarMail = (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : '');

// Un mail que ya usa otra cuenta, como mail o como nombre de usuario: el login
// busca por los dos, y una cuenta nueva tiene su mail como usuario.
function mailEnUso(email, usuarioId = 0) {
  return !!db
    .prepare('SELECT 1 FROM usuarios WHERE id != ? AND (LOWER(email) = ? OR LOWER(usuario) = ?)')
    .get(usuarioId, email, email);
}

const VERIFICACION_HORAS = 48;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Un enlace nuevo reemplaza a los anteriores del mismo tipo que no se usaron:
// solo vale el último mail.
function crearTokenCuenta(usuarioId, tipo, email, horas) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM tokens_cuenta WHERE usuario_id = ? AND tipo = ? AND usado IS NULL').run(usuarioId, tipo);
  db.prepare(
    `INSERT INTO tokens_cuenta (usuario_id, tipo, token_hash, email, vence)
     VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).run(usuarioId, tipo, hashToken(token), email, `+${horas} hours`);
  return token;
}

// El mail sale después de responder: Gmail tarda un par de segundos, y si
// falla (o no está configurado) la operación ya quedó hecha. Queda en el log;
// la persona puede pedir otro desde Mi cuenta.
function mandarSinEsperar(datos) {
  mandarMail(datos).catch((err) => console.error(`No se pudo mandar el mail "${datos.asunto}": ${err.message}`));
}

function mandarVerificacion(req, { usuarioId, nombre, email }) {
  const token = crearTokenCuenta(usuarioId, 'verificar_email', email, VERIFICACION_HORAS);
  const { texto, html } = plantillaMail({
    titulo: 'Confirmá tu mail',
    parrafos: [
      `Hola, ${nombre}.`,
      'Tocá el botón para confirmar que este mail es tuyo. Con él entrás a Nexo y, si algún día te olvidás la contraseña, recuperás tu cuenta.',
      `El enlace vence en ${VERIFICACION_HORAS} horas.`
    ],
    boton: { texto: 'Confirmar mi mail', url: `${urlPublica(req)}/verificar-mail?token=${token}` },
    pie: 'Si no creaste una cuenta en Nexo, podés ignorar este mail.'
  });
  mandarSinEsperar({ para: email, asunto: 'Confirmá tu mail de Nexo', texto, html });
}

// Wrapper de registrarAuditoria que agrega automáticamente quién operó.
// Explícito, no AsyncLocalStorage: como `req` ya está en scope en los ~44
// sitios que auditan (todos viven dentro de un handler `(req, res) => {`),
// alcanza con este helper de una línea y un reemplazo mecánico de
// `registrarAuditoria({` a `auditar(req, {` en cada uno. AsyncLocalStorage
// sería magia implícita en un proyecto que tiene todo el SQL a la vista, y
// además código que corriera fuera de su contexto auditaría con
// usuario_id NULL en silencio, sin ningún error que lo delate.
//
// Se descarta de plano una variable de módulo con "el usuario en curso":
// los handlers del asistente hacen `await` sobre una llamada de red a
// Gemini, así que dos requests concurrentes (dos usuarios distintos
// operando al mismo tiempo) se pisarían esa variable entre sí y
// auditarían la operación de uno a nombre del otro — corrupción de datos
// en el sistema que existe justamente para evitar corrupción de datos.
//
// Los 4 sitios del asistente conservan actor:'asistente' Y ADEMÁS llevan
// usuario_id: fue el asistente la vía de entrada, pero fue esa persona
// quien confirmó la operación propuesta. Es exactamente la distinción que
// justifica tener las dos columnas en vez de una sola.
//
// Mismo wrapper agrega organizacion_id (Etapa A, CLAUDE.md §28): como
// autenticar ya carga req.usuario.organizacion_id, los ~63 call-sites que
// pasan por acá quedan aislados sin tocarlos uno por uno. Los 4 llamados
// directos a registrarAuditoria de auth (login/registro, sin sesión
// todavía) resuelven su propia organización aparte, ver más abajo.
function auditar(req, datos) {
  return registrarAuditoria({
    ...datos,
    usuario_id: req.usuario?.id ?? null,
    organizacion_id: req.usuario?.organizacion_id ?? null
  });
}

// Lo único que puede hacer una cuenta sin mail (ver autenticar).
const RUTAS_SIN_MAIL = new Set(['/auth/email', '/auth/logout', '/auth/cambiar-password']);

function autenticar(req, res, next) {
  const token = leerCookie(req, COOKIE_SESION);
  const sesion = sesionValida(token);
  if (!sesion) {
    // 401 JSON, nunca HTML ni redirect: quien llama acá es siempre
    // fetch() desde el frontend, no una navegación de browser.
    return res.status(401).json({ error: 'Sesión no válida. Iniciá sesión de nuevo.' });
  }
  req.usuario = sesion;
  renovarSesion(token);
  // La cookie tiene que seguir siendo válida (por eso no es un 401: eso lo
  // agarraría el interceptor de sesion.js y mandaría de nuevo a login, que
  // vuelve a entrar bien y cae otra vez acá — loop infinito) pero mientras
  // el cambio de contraseña forzado siga pendiente, no puede operar nada
  // más que cambiarla o salir. req.path ya viene sin el prefijo /api acá
  // adentro (es el remanente después del mount de app.use('/api', ...)).
  if (sesion.debe_cambiar_password && req.path !== '/auth/cambiar-password' && req.path !== '/auth/logout') {
    return res.status(403).json({ error: 'Tenés que cambiar tu contraseña antes de seguir.' });
  }
  // Lo mismo con el mail (hist. §102): una cuenta de antes de §102 lo carga
  // antes de operar, porque sin mail no puede recuperar la cuenta. El código
  // le dice al frontend que muestre "Sumá tu mail".
  if (!sesion.email && !RUTAS_SIN_MAIL.has(req.path)) {
    return res.status(403).json({ error: 'Sumá tu mail antes de seguir.', codigo: 'falta_email' });
  }
  next();
}

// Express 4 no captura el rechazo de un handler `async`: sin esto, una
// excepción después de un `await` (la llamada a Gemini, el INSERT) es un
// unhandledRejection, que en Node 22 mata el proceso y deja sin servicio a
// TODAS las empresas. Esto lo manda al manejador de errores del final.
function asincrono(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function soloAdmin(req, res, next) {
  // 403, no 401: distinción a propósito. El frontend trata 401 como
  // "mostrar la pantalla de login" y 403 como "estás logueado pero no
  // tenés permiso para esto".
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Necesitás ser administrador para esto.' });
  }
  next();
}

// Rate limit del login en memoria (no en base: es efímero a propósito).
// No es defensa contra un atacante determinado — es para que un script
// tonto no pueda bloquear el event loop corriendo scryptSync cientos de
// veces por segundo contra el mismo usuario.
const INTENTOS_MAX = 5;
const INTENTOS_VENTANA_MS = 15 * 60 * 1000;
const intentosLogin = new Map();

function bloqueado(usuario) {
  const registro = intentosLogin.get(usuario.toLowerCase());
  if (!registro) return false;
  if (Date.now() - registro.desde > INTENTOS_VENTANA_MS) {
    intentosLogin.delete(usuario.toLowerCase());
    return false;
  }
  return registro.fallos >= INTENTOS_MAX;
}

// El tope por usuario solo frena a quien insiste con UN usuario (y deja que
// cualquiera bloquee la cuenta de otro durante 15 minutos). Cada intento con un
// usuario distinto igual cuesta un scryptSync de ~100 ms que congela el event
// loop de todas las empresas, así que también hay un tope por IP. Es más
// holgado a propósito: una oficina entera sale por la misma IP.
const INTENTOS_MAX_POR_IP = 30;
const intentosPorIp = new Map();
const TOPE_REGISTROS_EN_MEMORIA = 5000;

// Los dos mapas crecen con cada usuario/IP distinto que falla: sin poda, un
// script que pruebe usuarios al azar llena la memoria del proceso.
function podarVencidos(mapa) {
  const ahora = Date.now();
  for (const [clave, registro] of mapa) {
    if (ahora - registro.desde > INTENTOS_VENTANA_MS) mapa.delete(clave);
  }
}

function ipBloqueada(ip) {
  const registro = intentosPorIp.get(ip);
  if (!registro) return false;
  if (Date.now() - registro.desde > INTENTOS_VENTANA_MS) {
    intentosPorIp.delete(ip);
    return false;
  }
  return registro.fallos >= INTENTOS_MAX_POR_IP;
}

function registrarIntentoFallido(usuario, ip) {
  if (intentosLogin.size > TOPE_REGISTROS_EN_MEMORIA) podarVencidos(intentosLogin);
  if (intentosPorIp.size > TOPE_REGISTROS_EN_MEMORIA) podarVencidos(intentosPorIp);

  const clave = usuario.toLowerCase();
  const registro = intentosLogin.get(clave);
  if (!registro || Date.now() - registro.desde > INTENTOS_VENTANA_MS) {
    intentosLogin.set(clave, { fallos: 1, desde: Date.now() });
  } else {
    registro.fallos += 1;
  }

  const registroIp = intentosPorIp.get(ip);
  if (!registroIp || Date.now() - registroIp.desde > INTENTOS_VENTANA_MS) {
    intentosPorIp.set(ip, { fallos: 1, desde: Date.now() });
  } else {
    registroIp.fallos += 1;
  }
}

function limpiarIntentos(usuario) {
  intentosLogin.delete(usuario.toLowerCase());
}

// Por organización y no global: con multi-empresa (CLAUDE.md §28) la
// salvaguarda del último admin tiene que mirar solo la empresa que se está
// tocando. Global, la empresa B podría quedarse sin ningún admin porque la
// empresa A todavía tiene los suyos. El rol y la baja son de cada negocio
// (hist. §77): se cuentan en usuario_organizaciones.
function contarAdminsActivos(organizacionId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count FROM usuario_organizaciones
        WHERE rol = 'admin' AND activo = 1 AND organizacion_id = ?`
    )
    .get(organizacionId).count;
}

// Único uso legítimo que queda: la rama "instalación nueva" de
// POST /api/auth/registro, donde por definición hay una sola organización (es
// el primer usuario del sistema, y la fila la sembró db/index.js al arrancar).
// Cualquier otro handler resuelve la empresa desde la sesión con
// req.usuario.organizacion_id, nunca desde acá — ver CLAUDE.md §28.
function organizacionUnica() {
  return db.prepare('SELECT id FROM organizaciones ORDER BY id LIMIT 1').get().id;
}

/* ---------- Auth: endpoints públicos (sin sesión) ---------- */
// Declarados ANTES de app.use('/api', autenticar) más abajo — por eso
// quedan fuera de la protección. Son los únicos tres que un cliente sin
// cookie puede llamar.

app.get('/api/auth/estado', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM usuarios').get();
  if (count === 0) {
    return res.json({ requiere_bootstrap: true, autenticado: false, usuario: null });
  }
  const token = leerCookie(req, COOKIE_SESION);
  const sesion = sesionValida(token);
  if (!sesion) {
    return res.json({ requiere_bootstrap: false, autenticado: false, usuario: null });
  }
  renovarSesion(token);
  res.json({ requiere_bootstrap: false, autenticado: true, usuario: datosUsuario(sesion) });
});

app.post('/api/auth/login', (req, res) => {
  // Se entra con el mail (hist. §102). Las cuentas de antes de §102 también
  // con su nombre de usuario, para no dejar a nadie afuera: llega en el mismo
  // campo, como `email` o como `usuario`.
  const { password } = req.body ?? {};
  const usuario = req.body?.email || req.body?.usuario;
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Mail y contraseña son obligatorios.' });
  }
  // Sin sesión todavía: un tipo inesperado (`usuario: 123`) reventaba en
  // `.toLowerCase()` como 500 con stack en el log, y un usuario de 90 KB se
  // guardaba entero como clave del mapa de intentos y en la auditoría.
  if (typeof usuario !== 'string' || typeof password !== 'string' || usuario.length > 254 || password.length > 1000) {
    return res.status(400).json({ error: 'Mail o contraseña inválidos.' });
  }
  if (bloqueado(usuario) || ipBloqueada(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.' });
  }

  // El usuario con el negocio en el que entra: el último que usó entre los que
  // tiene activos (hist. §77). Sin ninguno activo es como si no existiera, igual
  // que antes un usuario dado de baja. Por el mail o por el usuario viejo; si
  // las dos cosas coinciden con cuentas distintas, gana la del mail.
  const fila = db
    .prepare(
      `SELECT usuarios.id, usuarios.usuario, usuarios.nombre, usuarios.password_hash, usuarios.password_salt,
              usuarios.debe_cambiar_password, usuarios.email, usuarios.email_verificado,
              pertenencia.organizacion_id, pertenencia.rol
         FROM usuarios
         JOIN usuario_organizaciones pertenencia
           ON pertenencia.usuario_id = usuarios.id AND pertenencia.activo = 1
        WHERE LOWER(usuarios.email) = LOWER(?1) OR LOWER(usuarios.usuario) = LOWER(?1)
        ORDER BY COALESCE(LOWER(usuarios.email) = LOWER(?1), 0) DESC,
                 pertenencia.ultimo_acceso IS NULL, pertenencia.ultimo_acceso DESC, pertenencia.organizacion_id
        LIMIT 1`
    )
    .get(usuario.trim());

  // Mensaje idéntico para "no existe" y "contraseña mala" — no hay que
  // darle a quien intenta loguearse ninguna pista de cuál de las dos fue.
  // Se verifica igual contra HASH_DUMMY cuando no existe, para que el
  // tiempo de respuesta tampoco lo revele.
  const MENSAJE_ERROR = 'Mail o contraseña incorrectos.';

  if (!fila) {
    verificarPassword(password, HASH_DUMMY.hash, HASH_DUMMY.salt);
    registrarIntentoFallido(usuario, req.ip);
    // Sin usuario_id: no hay a quién atribuírselo, no existe ese usuario.
    // En detalle va solo el nombre tecleado, nunca el body entero — aunque
    // si alguien escribió su contraseña en el campo de usuario por error,
    // quedaría igual en texto plano acá; riesgo aceptado, no hay forma de
    // distinguir ese caso del de un usuario tipeado mal.
    // Tampoco organizacion_id (Etapa A, CLAUDE.md §28), por el mismo motivo
    // que no hay usuario_id: no existe empresa a la que atribuirle este
    // intento, y queda NULL a propósito en vez de mezclarlo con una al
    // azar — invisible en GET /api/auditoria para todas las empresas.
    registrarAuditoria({
      accion: 'login_fallido',
      entidad: 'usuario',
      detalle: `Intento de inicio de sesión con usuario "${usuario}" (no existe)`
    });
    return res.status(401).json({ error: MENSAJE_ERROR });
  }

  const ok = verificarPassword(password, fila.password_hash, fila.password_salt);
  if (!ok) {
    registrarIntentoFallido(usuario, req.ip);
    registrarAuditoria({
      accion: 'login_fallido',
      entidad: 'usuario',
      entidad_id: fila.id,
      usuario_id: fila.id,
      organizacion_id: fila.organizacion_id,
      detalle: 'Intento de inicio de sesión con contraseña incorrecta'
    });
    return res.status(401).json({ error: MENSAJE_ERROR });
  }

  limpiarIntentos(usuario);
  const token = crearSesion(fila.id, fila.organizacion_id);
  ponerCookieSesion(res, token);
  db.prepare("UPDATE usuarios SET ultimo_acceso = datetime('now') WHERE id = ?").run(fila.id);
  marcarAcceso(fila.id, fila.organizacion_id);
  registrarAuditoria({
    accion: 'login',
    entidad: 'usuario',
    entidad_id: fila.id,
    usuario_id: fila.id,
    organizacion_id: fila.organizacion_id,
    detalle: 'Inició sesión'
  });

  res.json({ usuario: datosUsuario(fila) });
});

// Rate limit del registro, por IP y en memoria (mismo criterio que
// intentosLogin: efímero a propósito). Cuenta cada intento, no solo los
// fallidos: este endpoint es público y cada llamada calcula un scrypt, así
// que sin tope un script podría congelar el event loop o llenar la base de
// empresas vacías.
const REGISTROS_MAX = 5;
const REGISTROS_VENTANA_MS = 60 * 60 * 1000;
const intentosRegistro = new Map();

function registroExcedido(ip) {
  const ahora = Date.now();
  const registro = intentosRegistro.get(ip);
  if (!registro || ahora - registro.desde > REGISTROS_VENTANA_MS) {
    intentosRegistro.set(ip, { cuenta: 1, desde: ahora });
    return false;
  }
  registro.cuenta += 1;
  return registro.cuenta > REGISTROS_MAX;
}

// Los datos de un negocio nuevo, del alta de cuenta y de "Agregar negocio"
// (POST /api/negocios): se validan igual que en Configuración, con el nombre
// obligatorio. Los módulos quedan guardados siempre (hist. §88): sin elegirlos,
// los del tipo. Así un cambio de tipo después no prende ni apaga nada.
function validarNegocioNuevo(cuerpo) {
  const { error, datos } = validarDatosNegocio(
    {
      nombre: cuerpo.nombre,
      rubro: cuerpo.rubro ?? RUBRO_POR_DEFECTO,
      modulos: cuerpo.modulos,
      documento: cuerpo.documento,
      condicion_iva: cuerpo.condicion_iva,
      direccion: cuerpo.direccion,
      telefono: cuerpo.telefono,
      email: cuerpo.email
    },
    { parcial: false }
  );
  if (error) return { error };
  return { datos: { ...datos, modulos: datos.modulos ?? modulosDelPreset(datos.rubro) } };
}

// En el orden de las columnas de los INSERT y UPDATE de abajo.
function valoresNegocio(datos) {
  return [
    datos.nombre,
    datos.rubro,
    datos.modulos,
    datos.documento ?? null,
    datos.condicion_iva ?? null,
    datos.direccion ?? null,
    datos.telefono ?? null,
    datos.email ?? null
  ];
}

// Crea el negocio con sus catálogos base (depósito, lista, cuentas). Va
// adentro de la transacción de quien lo llama, que después le suma su admin.
function insertarNegocio(datos) {
  const orgId = Number(
    db
      .prepare(
        `INSERT INTO organizaciones (nombre, rubro, modulos, documento, condicion_iva, direccion, telefono, email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...valoresNegocio(datos)).lastInsertRowid
  );
  sembrarCatalogosBase(orgId);
  return orgId;
}

// Suma a un usuario a un negocio con su rol en él (hist. §77).
function sumarAlNegocio(usuarioId, organizacionId, rol) {
  db.prepare('INSERT INTO usuario_organizaciones (usuario_id, organizacion_id, rol) VALUES (?, ?, ?)').run(
    usuarioId,
    organizacionId,
    rol
  );
}

// Alta de empresa (CLAUDE.md §28): cualquiera crea su negocio y queda como su
// primer admin. Reemplaza al viejo /api/auth/bootstrap, que era el caso
// particular "instalación nueva, primera empresa".
//
// Riesgo aceptado y documentado acá para que no se lea como un olvido: la
// cuenta se crea y se usa antes de verificar el mail (el enlace llega por
// mail y la app avisa hasta que se toca, hist. §102), y no hay captcha, solo
// el rate limit por IP de arriba. Apagar el registro público es la Fase 4 de
// la etapa 8b (handoff.md).
app.post('/api/auth/registro', (req, res) => {
  if (registroExcedido(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos de registro. Probá de nuevo más tarde.' });
  }

  const empresa = String(req.body?.empresa ?? '').trim();
  // La cuenta se crea con el mail (hist. §102). Llega como `email_cuenta`
  // porque `email` es el del negocio, el que va en los comprobantes (igual que
  // en "Agregar negocio"). Por dentro, el nombre de usuario de una cuenta nueva
  // es su mail: la columna sigue NOT NULL UNIQUE sin reconstruir la tabla.
  const email = normalizarMail(req.body?.email_cuenta);
  const nombre = String(req.body?.nombre ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!empresa || !email || !nombre || !password) {
    return res.status(400).json({ error: 'Negocio, mail, nombre y contraseña son obligatorios.' });
  }
  // Mismos topes que el login para la contraseña.
  if (password.length > 1000 || nombre.length > 120) {
    return res.status(400).json({ error: 'El nombre o la contraseña son demasiado largos.' });
  }
  if (!esMailValido(email)) {
    return res.status(400).json({ error: 'El mail no es válido.' });
  }
  const usuario = email;
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres.' });
  }
  // El alta guiada puede traer también los módulos y los datos de los
  // comprobantes. `nombre` acá es el de la persona; el del negocio llega como
  // `empresa`.
  const { error, datos } = validarNegocioNuevo({ ...req.body, nombre: empresa });
  if (error) {
    return res.status(400).json({ error });
  }
  // El plan que eligió en la landing (hist. §98). Uno pago arranca como prueba
  // de DIAS_PRUEBA días; al vencer, el negocio queda en Gratis.
  const plan = req.body?.plan ?? PLAN_POR_DEFECTO;
  if (typeof plan !== 'string' || !esPlan(plan)) {
    return res.status(400).json({ error: 'El plan no es válido.' });
  }
  const planVence = PLANES[plan].precio > 0 ? sumarDias(fechaDeHoy(), DIAS_PRUEBA) : null;

  // Global a propósito: el mail es único en todo Nexo y el login no pide
  // empresa (hist. §45, §102).
  if (mailEnUso(email)) {
    return res.status(409).json({ error: 'Ya hay una cuenta con ese mail. Entrá con él, o usá otro.' });
  }

  let usuarioId;
  let orgId;
  withTransaction(() => {
    const { hash, salt } = hashPassword(password);
    // Instalación nueva: todavía no hay ningún usuario, así que se adopta la
    // organización que db/index.js sembró al arrancar en vez de dejarla
    // huérfana. Revalidado acá adentro, nunca confiar en el frontend.
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM usuarios').get();
    if (count === 0) {
      orgId = organizacionUnica();
      db.prepare(
        `UPDATE organizaciones
            SET nombre = ?, rubro = ?, modulos = ?, documento = ?, condicion_iva = ?,
                direccion = ?, telefono = ?, email = ?
          WHERE id = ?`
      ).run(...valoresNegocio(datos), orgId);
      resembrarEtapasCrm(orgId);
    } else {
      orgId = insertarNegocio(datos);
    }
    db.prepare('UPDATE organizaciones SET plan = ?, plan_vence = ? WHERE id = ?').run(plan, planVence, orgId);
    const info = db
      .prepare(
        `INSERT INTO usuarios (organizacion_id, usuario, nombre, password_hash, password_salt, debe_cambiar_password, email)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      )
      .run(orgId, usuario, nombre, hash, salt, email);
    usuarioId = Number(info.lastInsertRowid);
    sumarAlNegocio(usuarioId, orgId, 'admin');
    marcarAcceso(usuarioId, orgId);
    registrarAuditoria({
      accion: 'crear',
      entidad: 'organizacion',
      entidad_id: orgId,
      usuario_id: usuarioId,
      organizacion_id: orgId,
      detalle: `Empresa "${empresa}" creada (${PERFILES_RUBRO[datos.rubro].nombre}, plan ${PLANES[plan].nombre}${
        planVence ? ` de prueba hasta el ${planVence}` : ''
      })`
    });
    registrarAuditoria({
      accion: 'crear',
      entidad: 'usuario',
      entidad_id: usuarioId,
      usuario_id: usuarioId,
      organizacion_id: orgId,
      detalle: `Primer administrador creado: ${nombre} (${usuario})`
    });
  });

  const token = crearSesion(usuarioId, orgId);
  ponerCookieSesion(res, token);
  mandarVerificacion(req, { usuarioId, nombre, email });
  res.status(201).json({
    usuario: datosUsuario({
      id: usuarioId,
      usuario,
      nombre,
      rol: 'admin',
      debe_cambiar_password: 0,
      organizacion_id: orgId,
      email,
      email_verificado: null
    })
  });
});

// Los tipos de negocio y los módulos, para el alta guiada, que los muestra
// antes de que exista una sesión. Es el mismo catálogo para todos y no tiene
// ningún dato de una empresa.
app.get('/api/auth/tipos-negocio', (req, res) => {
  res.json(catalogoTiposNegocio());
});

// Los planes y sus precios (hist. §98), para la landing y el alta guiada,
// antes de que exista una sesión. Mismo criterio que los tipos de negocio.
app.get('/api/auth/planes', (req, res) => {
  res.json(catalogoPlanes());
});

// Contacto de la landing y de "Tu plan" (hist. §99): quien quiere un plan, o
// pregunta algo, deja sus datos y la consulta cae en el CRM del negocio con
// el que se vende Nexo (NEXO_NEGOCIO_VENTAS), en su primera etapa, con una
// tarea para hoy. Nexo se vende con Nexo: no hace falta un mail ni un número
// público, ni un servicio externo.
//
// Es pública, así que tiene su tope por IP, un campo trampa para bots
// (`sitio`, oculto en el formulario) y largos máximos. Solo escribe en ese
// negocio, nunca en el de quien la manda.
const CONSULTAS_MAX = 5;
const consultasPorIp = new Map();
const LARGOS_CONSULTA = { nombre: 120, negocio: 120, contacto: 120, mensaje: 1000 };

app.post('/api/publico/consulta', (req, res) => {
  const cuerpo = req.body ?? {};
  // Un bot llena el campo trampa: se le contesta como si hubiera salido bien.
  if (cuerpo.sitio) return res.status(201).json({ ok: true });

  const ahora = Date.now();
  const registro = consultasPorIp.get(req.ip);
  if (!registro || ahora - registro.desde > REGISTROS_VENTANA_MS) {
    consultasPorIp.set(req.ip, { cuenta: 1, desde: ahora });
  } else if (++registro.cuenta > CONSULTAS_MAX) {
    return res.status(429).json({ error: 'Mandaste varias consultas seguidas. Probá de nuevo en un rato.' });
  }

  const organizacionId = Number(process.env.NEXO_NEGOCIO_VENTAS);
  const etapa =
    organizacionId > 0 &&
    db.prepare('SELECT id FROM crm_etapas WHERE organizacion_id = ? AND activa = 1 ORDER BY orden, id LIMIT 1').get(organizacionId);
  if (!etapa) {
    return res.status(503).json({ error: 'Las consultas todavía no están habilitadas.' });
  }

  const datos = {};
  for (const [campo, largo] of Object.entries(LARGOS_CONSULTA)) {
    const valor = cuerpo[campo];
    if (valor != null && typeof valor !== 'string') return res.status(400).json({ error: 'Los datos no son válidos.' });
    datos[campo] = (valor ?? '').trim();
    if (datos[campo].length > largo) {
      return res.status(400).json({ error: `Es demasiado largo: hasta ${largo} caracteres.` });
    }
  }
  if (!datos.nombre) return res.status(400).json({ error: 'Contanos tu nombre.' });
  // Un mail o un teléfono: con @ es mail; si no, tiene que tener números.
  const esEmail = datos.contacto.includes('@');
  if (esEmail ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.contacto) : (datos.contacto.match(/\d/g) ?? []).length < 6) {
    return res.status(400).json({ error: 'Dejanos un teléfono o un mail para responderte.' });
  }
  const plan = cuerpo.plan ?? null;
  if (plan !== null && (typeof plan !== 'string' || !esPlan(plan))) {
    return res.status(400).json({ error: 'El plan no es válido.' });
  }

  const interes = (plan ? `Quiere el plan ${PLANES[plan].nombre}` : 'Consulta desde la web') + (datos.negocio ? ` para "${datos.negocio}"` : '');
  const hoy = fechaDeHoy();
  withTransaction(() => {
    const id = Number(
      db
        .prepare(
          `INSERT INTO crm_oportunidades (contacto_nombre, contacto_telefono, contacto_email, origen, interes, etapa_id, fecha, organizacion_id)
           VALUES (?, ?, ?, 'web', ?, ?, ?, ?)`
        )
        .run(datos.nombre, esEmail ? null : datos.contacto, esEmail ? datos.contacto : null, interes, etapa.id, hoy, organizacionId)
        .lastInsertRowid
    );
    db.prepare(
      `INSERT INTO crm_actividades (oportunidad_id, tipo, descripcion, fecha, organizacion_id)
       VALUES (?, 'tarea', ?, ?, ?)`
    ).run(id, datos.mensaje ? `Responder. Escribió: "${datos.mensaje}"` : 'Responder la consulta de la web', hoy, organizacionId);
    registrarAuditoria({
      actor: 'sistema',
      accion: 'crear',
      entidad: 'organizacion',
      entidad_id: organizacionId,
      operacion_tipo: 'oportunidad',
      operacion_id: id,
      detalle: `Consulta #${id} de ${datos.nombre} desde la web: ${interes}`,
      organizacion_id: organizacionId
    });
  });
  res.status(201).json({ ok: true });
});

// A partir de acá, TODO /api/* requiere sesión — los únicos endpoints que no
// la necesitan son los de arriba (estado, login, registro y tipos de
// negocio), declarados antes de este montaje. Los ~115 endpoints de
// negocio son app.METHOD planos bajo /api, así que este único middleware
// los cubre a todos, y cualquier ruta nueva que se agregue en el futuro
// nace protegida por default sin tener que acordarse de nada.
//
// Lo estático (index.html, css/, js/, /assets) queda deliberadamente
// público — no contiene datos del negocio, y protegerlo obligaría a
// servir la pantalla de login por una vía separada del resto de la app.
// Todos los datos reales están detrás de /api.
app.use('/api', autenticar);

// Una pestaña que quedó mostrando otro negocio (hist. §77). La sesión es una
// sola por navegador: si en otra pestaña se cambió de negocio, esta seguiría
// mostrando el anterior pero escribiendo en el nuevo (un cliente cargado ahí
// iría a parar al otro negocio sin aviso). El frontend manda en cada llamada
// el negocio que está mostrando; si no es el de la sesión, 409 con una
// cabecera que sesion.js reconoce para recargar la pestaña. No autoriza nada:
// el negocio sigue saliendo solo de la sesión. Quedan afuera las rutas que no
// dependen del negocio activo: las de la sesión y las de cambiar de negocio.
app.use('/api', (req, res, next) => {
  const negocio = req.get('X-Nexo-Negocio');
  if (!negocio || req.path.startsWith('/auth/') || req.path.startsWith('/negocios')) return next();
  if (Number(negocio) !== req.usuario.organizacion_id) {
    res.set('X-Nexo-Negocio-Cambiado', '1');
    return res.status(409).json({ error: 'Cambiaste de negocio en otra pestaña.' });
  }
  next();
});

// Permisos por rol, segunda mitad (la primera es `soloAdmin` en cada
// endpoint que lo necesita — ver permisos.js): el empleado no tiene que
// ver costos, márgenes ni ganancias, y eso incluye endpoints que sí le
// hacen falta para trabajar (GET /api/productos, /api/stock, /api/ventas).
// No se puede resolver con `soloAdmin` en esos cuatro sin dejar al
// empleado sin poder cargar sus pantallas del día a día — el corte es a
// nivel de campo, no de endpoint.
//
// Filtra por NOMBRE de clave, recursivamente, en cualquier respuesta JSON
// de cualquier endpoint no-admin (montado una sola vez, acá, para que un
// endpoint nuevo nazca filtrado por default sin que nadie tenga que
// acordarse de llamarlo — mismo argumento que ya justifica el mount de
// `autenticar` arriba). Dos límites reales, no descuidos:
//   - Un campo futuro con un nombre distinto a esta lista (p. ej.
//     `utilidad`) se escaparía sin que el filtro lo note.
//   - No distingue `venta_items.precio_unitario` (precio de venta, no se
//     filtra) de `compra_items.precio_unitario` (costo) — mismo nombre,
//     significado distinto según la tabla de origen. Por eso el circuito
//     de compras entero y sus reportes van con `soloAdmin` en permisos.js
//     en vez de confiar en que este filtro los cubra.
// Se revisó que ninguna clave choque con algo inocente que el empleado sí
// necesita: `gastos.importe` y `compras.costo_envio` quedan fuera a
// propósito.
const CLAVES_SENSIBLES = new Set([
  'precio_costo',
  'valorizado',
  'margen',
  'margen_pct',
  'ganancia',
  'ganancia_bruta',
  'costo',
  'costo_total',
  'costo_mercaderia',
  'costo_unitario',
  'costo_unitario_historico',
  'margen_objetivo',
  'margen_bajo_objetivo'
]);

function podarSensibles(valor) {
  if (Array.isArray(valor)) return valor.map(podarSensibles);
  if (valor && typeof valor === 'object') {
    const limpio = {};
    for (const [clave, v] of Object.entries(valor)) {
      if (CLAVES_SENSIBLES.has(clave)) continue;
      limpio[clave] = podarSensibles(v);
    }
    return limpio;
  }
  return valor;
}

app.use('/api', (req, res, next) => {
  if (req.usuario?.rol === 'admin') return next();
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => jsonOriginal(podarSensibles(cuerpo));
  next();
});

// Compara la fila de antes de un UPDATE contra los campos nuevos y
// devuelve solo lo que cambió, listo para valor_anterior/valor_nuevo de
// registrarAuditoria (CLAUDE.md §22) — así una edición que no tocó nada
// no genera ruido en el log, y una que sí, muestra exactamente el campo
// que cambió en vez de la fila entera. `campos` es la lista de claves a
// comparar (no todo lo que trae `nuevo`, para no arrastrar campos que el
// endpoint recibe pero no persiste).
function diffCampos(anterior, nuevo, campos) {
  const previo = {};
  const actual = {};
  for (const campo of campos) {
    const valorAnterior = anterior?.[campo] ?? null;
    const valorNuevo = nuevo?.[campo] ?? null;
    if (valorAnterior !== valorNuevo) {
      previo[campo] = valorAnterior;
      actual[campo] = valorNuevo;
    }
  }
  return Object.keys(actual).length > 0
    ? { anterior: JSON.stringify(previo), nuevo: JSON.stringify(actual) }
    : null;
}

/* ---------- Edición en lote (bulk) ---------- */

// Tope de seguridad de cualquier endpoint /bulk. node:sqlite es síncrono:
// el loop que aplica el lote bloquea el event loop de punta a punta, así
// que un `ids` de 100k colgaría el servidor para todos los demás. 500 es
// más de lo que cualquier tabla real muestra filtrada — no es una regla de
// negocio, es un guardarraíl.
const LIMITE_BULK = 500;

// Error de negocio con su status HTTP al lado. Existe para que las
// funciones internas (aplicarEdicionProducto, aplicarEstadoEnvioCompra)
// puedan lanzar EXACTAMENTE el mismo mensaje que devolvía el endpoint
// singular, y que los dos consumidores lo usen distinto sin duplicar los
// textos: el handler singular lo traduce a res.status().json(), y el bulk
// lo acumula como un renglón de `fallidos`.
class ErrorBulk extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

// Un dato inválido detectado en lo profundo de una operación (por ejemplo,
// adentro de un withTransaction): el throw hace ROLLBACK, y su mensaje llega
// al usuario como 400, tanto por mensajeDeError como por el manejador final.
// Los demás errores siguen saliendo como 500 genérico.
class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.status = 400;
  }
}

// Se llegó al tope del plan del negocio (hist. §98). Es un ErrorBulk para que
// los catch que ya traducen ErrorBulk (compras, edición de productos, lotes)
// lo devuelvan con su 403 y su texto sin tocarlos. El manejador final le suma
// `codigo`, que el frontend usa para ofrecer "Tu plan".
class ErrorPlan extends ErrorBulk {
  constructor(mensaje) {
    super(mensaje, 403);
    this.codigo = 'limite_plan';
  }
}

// Traduce un error lanzado durante un item del lote al texto que ve el
// usuario. El `throw err` del final es deliberado: un error que no sabemos
// traducir es un bug, y tiene que romper el request y quedar en el log —
// disfrazarlo de "falló el producto 13" haría imposible depurarlo.
function mensajeDeError(err) {
  if (err instanceof ErrorBulk || err instanceof ErrorValidacion) return err.message;
  if (String(err.message).includes('UNIQUE constraint failed')) {
    return 'Ya existe un producto con ese SKU.';
  }
  throw err;
}

// Normaliza el `ids` que llega del cliente, o lanza ErrorBulk si no sirve.
// Deduplica a propósito: el mismo id dos veces generaría dos filas de
// auditoría para la misma entidad, y la segunda con un diff vacío.
function idsDeLote(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ErrorBulk('Seleccioná al menos un registro.');
  }
  if (ids.length > LIMITE_BULK) {
    throw new ErrorBulk(`No se pueden editar más de ${LIMITE_BULK} registros a la vez.`);
  }
  const unicos = [...new Set(ids.map(Number))].filter(Number.isInteger);
  if (unicos.length === 0) {
    throw new ErrorBulk('Ninguno de los registros seleccionados es válido.');
  }
  return unicos;
}

// El corazón de todo endpoint /bulk: corre `aplicar(id)` para cada id y
// acumula el resultado, SIN cortar cuando uno falla.
//
// Una transacción POR ITEM, nunca una envolvente. Es una consecuencia
// directa de la semántica acordada con el usuario ("si 3 de 20 fallan, se
// aplican los otros 17"): un ROLLBACK que abarcara el lote entero se
// llevaría puestos los items que YA habían pasado. Además withTransaction
// no es reentrante (ver db/index.js), así que anidar no es una opción.
//
// La atomicidad que sí importa se preserva igual: la unidad atómica real
// es UNA entidad (su UPDATE + su fila de auditoría), y eso vive adentro de
// un withTransaction. Nada tiene que cumplirse *entre* dos productos
// distintos, así que no hace falta un SAVEPOINT por item.
//
// Que el loop pueda seguir después de un fallo depende de que
// withTransaction haga ROLLBACK y re-lance (lo hace): el item fallido no
// deja una transacción abierta detrás.
function aplicarLote(ids, aplicar) {
  const aplicados = [];
  const fallidos = [];
  let sinCambios = 0;

  for (const id of ids) {
    try {
      const resultado = aplicar(id);
      if (resultado?.sinCambios) sinCambios++;
      aplicados.push(id);
    } catch (err) {
      fallidos.push({ id, error: mensajeDeError(err) });
    }
  }

  return {
    aplicados,
    fallidos,
    resumen: {
      total: ids.length,
      aplicados: aplicados.length,
      fallidos: fallidos.length,
      sin_cambios: sinCambios
    }
  };
}

/* ---------- Clientes (CRM) ---------- */

// Las ventas anuladas no cuentan para el total gastado ni la cantidad de
// compras: se dieron de baja, no representan plata que el cliente gastó.
const SELECT_CLIENTE_CON_TOTALES = `
  SELECT clientes.*,
         (SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0)
            FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS total_gastado,
         (SELECT COUNT(*) FROM ventas
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS cantidad_compras,
         (SELECT MAX(fecha) FROM ventas
           WHERE ventas.cliente_id = clientes.id AND ventas.estado = 'activa') AS ultima_compra,
         COALESCE((SELECT saldo FROM saldo_cc_clientes
                    WHERE saldo_cc_clientes.cliente_id = clientes.id), 0) AS deuda
    FROM clientes`;

// Filtro por organizacion_id (CLAUDE.md §28), mismo patrón que productos.
app.get('/api/clientes', (req, res) => {
  const clientes = db
    .prepare(`${SELECT_CLIENTE_CON_TOTALES} WHERE clientes.organizacion_id = ? ORDER BY clientes.nombre`)
    .all(req.usuario.organizacion_id);
  res.json(clientes);
});

app.get('/api/clientes/:id', (req, res) => {
  const clienteId = Number(req.params.id);
  const cliente = db
    .prepare(`${SELECT_CLIENTE_CON_TOTALES} WHERE clientes.id = ? AND clientes.organizacion_id = ?`)
    .get(clienteId, req.usuario.organizacion_id);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }

  const historial = db
    .prepare(
      `SELECT ventas.id, ventas.fecha, ventas.estado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado
         FROM ventas WHERE ventas.cliente_id = ?
        ORDER BY ventas.fecha DESC, ventas.id DESC`
    )
    .all(clienteId);

  res.json({
    ...cliente,
    historial: historial.map((v) => ({
      ...v,
      estado_cobro: v.cobrado <= 0 ? 'pendiente' : v.cobrado >= v.total ? 'cobrado' : 'parcial'
    }))
  });
});

// lista_precio_id: NULL = "usa la predeterminada", igual que en
// ventas/presupuestos (CLAUDE.md §18). Si viene un id, tiene que existir y
// ser de la organización de la operación (Etapa A, CLAUDE.md §28).
function normalizarListaPrecioId(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}
function listaPrecioValida(listaPrecioId, organizacionId) {
  return (
    listaPrecioId === null ||
    Boolean(
      db
        .prepare('SELECT 1 FROM listas_precios WHERE id = ? AND organizacion_id = ?')
        .get(listaPrecioId, organizacionId)
    )
  );
}

// condicion_pago habitual de un cliente/proveedor: NULL = "no tiene un plazo
// definido", no un valor por defecto. CONDICIONES_PAGO se define más abajo en
// el archivo (junto a calcularVencimiento), pero como es un lookup dentro de
// una función y no algo que se evalúe al cargar el módulo, no hace falta que
// esté declarado antes de este punto: para cuando esta función se llama de
// verdad (una request), el módulo ya terminó de cargar entero.
// 'manual' se rechaza a propósito: es una fecha puntual de una operación
// concreta, no algo reutilizable como plazo habitual de la entidad.
function normalizarCondicionPagoHabitual(valor) {
  return valor === undefined || valor === null || valor === '' ? null : String(valor);
}
function condicionPagoHabitualValida(condicion) {
  return condicion === null || Object.prototype.hasOwnProperty.call(CONDICIONES_PAGO, condicion);
}

app.post('/api/clientes', (req, res) => {
  const { nombre, email, telefono, direccion, documento, notas, lista_precio_id, condicion_pago } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El cliente necesita un nombre.' });
  }
  const listaPrecioId = normalizarListaPrecioId(lista_precio_id);
  if (!listaPrecioValida(listaPrecioId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
  }
  const condicionPagoHabitual = normalizarCondicionPagoHabitual(condicion_pago);
  if (!condicionPagoHabitualValida(condicionPagoHabitual)) {
    return res.status(400).json({ error: 'La condición de pago seleccionada no es válida.' });
  }

  // Con auditoría como el resto de las altas (CLAUDE.md §22): era de las pocas
  // que escribían sin dejar quién ni cuándo.
  const clienteId = withTransaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO clientes (nombre, email, telefono, direccion, documento, notas, lista_precio_id, condicion_pago, organizacion_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nombre.trim(),
        email ?? null,
        telefono ?? null,
        direccion ?? null,
        documento ?? null,
        notas ?? null,
        listaPrecioId,
        condicionPagoHabitual,
        req.usuario.organizacion_id
      );
    auditar(req, {
      accion: 'crear',
      entidad: 'cliente',
      entidad_id: Number(lastInsertRowid),
      detalle: `Cliente "${nombre.trim()}" creado`
    });
    return Number(lastInsertRowid);
  });
  res.status(201).json({ id: clienteId });
});

app.patch('/api/clientes/:id', (req, res) => {
  const clienteId = Number(req.params.id);
  const cliente = db
    .prepare('SELECT * FROM clientes WHERE id = ? AND organizacion_id = ?')
    .get(clienteId, req.usuario.organizacion_id);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }

  const { nombre, email, telefono, direccion, documento, notas, lista_precio_id, condicion_pago } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El cliente necesita un nombre.' });
  }
  const listaPrecioId = normalizarListaPrecioId(lista_precio_id);
  if (!listaPrecioValida(listaPrecioId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
  }
  const condicionPagoHabitual = normalizarCondicionPagoHabitual(condicion_pago);
  if (!condicionPagoHabitualValida(condicionPagoHabitual)) {
    return res.status(400).json({ error: 'La condición de pago seleccionada no es válida.' });
  }

  const nuevo = {
    nombre: nombre.trim(),
    email: email ?? null,
    telefono: telefono ?? null,
    direccion: direccion ?? null,
    documento: documento ?? null,
    notas: notas ?? null,
    lista_precio_id: listaPrecioId,
    condicion_pago: condicionPagoHabitual
  };
  const cambios = diffCampos(cliente, nuevo, [
    'nombre',
    'email',
    'telefono',
    'direccion',
    'documento',
    'notas',
    'lista_precio_id',
    'condicion_pago'
  ]);

  withTransaction(() => {
    db.prepare(
      `UPDATE clientes
          SET nombre = ?, email = ?, telefono = ?, direccion = ?, documento = ?, notas = ?, lista_precio_id = ?,
              condicion_pago = ?
        WHERE id = ?`
    ).run(
      nuevo.nombre,
      nuevo.email,
      nuevo.telefono,
      nuevo.direccion,
      nuevo.documento,
      nuevo.notas,
      nuevo.lista_precio_id,
      nuevo.condicion_pago,
      clienteId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'cliente',
        entidad_id: clienteId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Cliente "${nuevo.nombre}" editado`
      });
    }
  });
  res.json({ id: clienteId });
});

// El correlativo es por (organización, punto de venta, tipo, letra): cada
// combinación tiene su propia serie, como en la realidad — cada organización
// es un negocio con su propio CUIT (CLAUDE.md §28/§33), así que no comparte
// numeración con otra. El índice único (db/index.js) es la garantía real
// contra un choque; esto solo calcula el candidato — tiene que llamarse
// siempre dentro de la misma transacción que hace el INSERT, para que las
// dos cosas sean atómicas.
function siguienteNumero(organizacionId, puntoVenta, tipo, letra) {
  const { maximo } = db
    .prepare(
      'SELECT MAX(numero) AS maximo FROM facturas WHERE organizacion_id = ? AND punto_venta = ? AND tipo = ? AND letra = ?'
    )
    .get(organizacionId, puntoVenta, tipo, letra);
  return (maximo ?? 0) + 1;
}

const comprobante = (f) =>
  `${f.letra} ${String(f.punto_venta).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`;

// El estado de cobro de una factura que respalda una venta se calcula en
// vivo a partir de los cobros de esa venta (misma cuenta que ya usa
// GET /api/ventas): así nunca se desincroniza del cobro real. Una factura
// suelta no tiene cobros de dónde derivarlo, así que conserva su propio
// campo `estado`.
// facturas.neto es la foto del total de la venta al momento de facturar;
// una devolución posterior no reescribe esa foto (igual que
// costo_unitario_historico no se reescribe), pero sí tiene que descontarse
// acá para que el estado de cobro no siga pidiendo por mercadería que
// ya volvió — mismo criterio que GET /api/ventas.
const SUBQUERY_DEVUELTO_DE_VENTA_FACTURA = `
  COALESCE((
    SELECT SUM(devolucion_items.cantidad * devolucion_items.precio_unitario)
      FROM devolucion_items
      JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
      JOIN venta_items ON venta_items.id = devolucion_items.venta_item_id
     WHERE venta_items.venta_id = facturas.venta_id AND devoluciones.estado = 'activa'
  ), 0)`;

const SELECT_FACTURA = `
  SELECT facturas.id, facturas.cliente_id, clientes.nombre AS cliente,
         -- Contacto del cliente: lo necesita el membrete del comprobante
         -- impreso (a quién se le emite). Aditivo: quien no lo use lo ignora.
         clientes.documento AS cliente_documento, clientes.direccion AS cliente_direccion,
         clientes.email AS cliente_email, clientes.telefono AS cliente_telefono,
         facturas.concepto,
         facturas.neto, facturas.neto AS total, facturas.condicion, facturas.fecha,
         facturas.tipo, facturas.letra, facturas.punto_venta, facturas.numero, facturas.venta_id,
         facturas.devolucion_id,
         CASE
           WHEN facturas.venta_id IS NOT NULL THEN (
             SELECT CASE
                      WHEN COALESCE(SUM(cobros.importe), 0) <= 0 THEN 'pendiente'
                      WHEN COALESCE(SUM(cobros.importe), 0) >= facturas.neto - ${SUBQUERY_DEVUELTO_DE_VENTA_FACTURA} THEN 'cobrado'
                      ELSE 'parcial'
                    END
               FROM cobros WHERE cobros.venta_id = facturas.venta_id
           )
           ELSE facturas.estado
         END AS estado_cobro
    FROM facturas
    JOIN clientes ON clientes.id = facturas.cliente_id`;

app.get('/api/facturas', (req, res) => {
  const facturas = db
    .prepare(`${SELECT_FACTURA} WHERE facturas.organizacion_id = ? ORDER BY facturas.id DESC`)
    .all(req.usuario.organizacion_id);
  res.json(facturas.map((f) => ({ ...f, comprobante: comprobante(f) })));
});

app.get('/api/facturas/:id', (req, res) => {
  const facturaId = Number(req.params.id);
  const factura = db
    .prepare(`${SELECT_FACTURA} WHERE facturas.id = ? AND facturas.organizacion_id = ?`)
    .get(facturaId, req.usuario.organizacion_id);
  if (!factura) {
    return res.status(404).json({ error: 'Factura no encontrada.' });
  }

  // Si respalda una venta, se traen sus items para poder ver qué se
  // facturó — mismo shape que ya arma GET /api/ventas/:id.
  const items = factura.venta_id
    ? db
        .prepare(
          `SELECT venta_items.producto_id, productos.nombre AS producto,
                  venta_items.cantidad, venta_items.precio_unitario
             FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
            WHERE venta_id = ?
            ORDER BY venta_items.id`
        )
        .all(factura.venta_id)
        .map((i) => ({ ...i, subtotal: i.cantidad * i.precio_unitario }))
    : [];

  res.json({ ...factura, comprobante: comprobante(factura), items });
});

// Factura "suelta": sin venta detrás. Se conserva porque ya la usa el
// flujo de facturación rápida, pero es plata que el sistema no puede
// cruzar con stock, cuenta corriente ni resultado — por eso el listado la
// marca distinto de una factura que sí respalda una venta.
// Valores que acepta el CHECK de facturas (schema.sql). Validados acá: un
// valor fuera de la lista era un 500 en vez de un 400.
const MEDIOS_FACTURA = ['efectivo', 'transferencia', 'mercadopago'];
const TIPOS_COMPROBANTE = ['factura', 'nota_credito', 'nota_debito'];
const LETRAS_COMPROBANTE = ['A', 'B', 'C'];

app.post('/api/facturas', (req, res) => {
  const { cliente, concepto, neto, condicion, tipo, letra, punto_venta } = req.body;

  const tipoFinal = tipo || 'factura';
  const letraFinal = letra || 'B';
  const puntoVentaFinal = punto_venta === undefined || punto_venta === null || punto_venta === '' ? 1 : Number(punto_venta);
  if (typeof concepto !== 'string' || !concepto.trim()) {
    return res.status(400).json({ error: 'Indicá el concepto.' });
  }
  if (!esNumeroValido(neto) || !(Number(neto) > 0)) {
    return res.status(400).json({ error: 'El importe debe ser un número mayor a 0.' });
  }
  if (!MEDIOS_FACTURA.includes(condicion)) {
    return res.status(400).json({ error: 'Elegí un medio de pago válido.' });
  }
  if (!TIPOS_COMPROBANTE.includes(tipoFinal) || !LETRAS_COMPROBANTE.includes(letraFinal)) {
    return res.status(400).json({ error: 'Tipo o letra de comprobante inválidos.' });
  }
  if (!Number.isInteger(puntoVentaFinal) || puntoVentaFinal < 1 || puntoVentaFinal > 99999) {
    return res.status(400).json({ error: 'El punto de venta debe ser un número entero entre 1 y 99999.' });
  }

  const facturaId = withTransaction(() => {
    const clienteRow = resolverCliente(cliente, null, req.usuario.organizacion_id);

    const numero = siguienteNumero(req.usuario.organizacion_id, puntoVentaFinal, tipoFinal, letraFinal);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, tipo, letra, punto_venta, numero, organizacion_id, fecha)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ${HOY_SQL})`
      )
      .run(
        clienteRow.id,
        concepto,
        neto,
        condicion,
        tipoFinal,
        letraFinal,
        puntoVentaFinal,
        numero,
        req.usuario.organizacion_id
      );

    auditar(req, {
      accion: 'crear',
      entidad: 'factura',
      entidad_id: lastInsertRowid,
      detalle: `Factura suelta #${lastInsertRowid} creada`
    });

    return lastInsertRowid;
  });

  res.status(201).json({ id: facturaId });
});

/* ---------- Categorías de productos ---------- */
//
// Calcado de categorías de gasto (ver más abajo, sección Gastos): mismas
// tres validaciones (nombre vacío, nombre duplicado, baja lógica vía
// `activa` en vez de DELETE, para no dejar productos apuntando a una FK
// borrada). Sin `tipo`: acá no hay una razón contable que lo justifique.
//
// Los cinco catálogos (categorías, listas de precios, depósitos, cuentas de
// tesorería y categorías de gasto) son por organización (Etapa A, CLAUDE.md
// §28): cada empresa ve y edita solo los suyos, y el nombre duplicado se
// chequea dentro de la empresa — dos empresas pueden tener cada una su
// "Efectivo". Un id de otra empresa da el mismo 404 que uno inexistente.

app.get('/api/categorias', (req, res) => {
  const categorias = db
    .prepare('SELECT * FROM categorias WHERE organizacion_id = ? ORDER BY nombre')
    .all(req.usuario.organizacion_id);
  res.json(categorias);
});

app.post('/api/categorias', soloAdmin, (req, res) => {
  const { nombre } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias WHERE nombre = ? AND organizacion_id = ?')
    .get(String(nombre).trim(), req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
  }

  const lastInsertRowid = withTransaction(() => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO categorias (nombre, organizacion_id) VALUES (?, ?)')
      .run(String(nombre).trim(), req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'categoria',
      entidad_id: id,
      detalle: `Categoría "${String(nombre).trim()}" creada`
    });
    return id;
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/categorias/:id', soloAdmin, (req, res) => {
  const categoriaId = Number(req.params.id);
  const { nombre, activa } = req.body;

  const categoria = db
    .prepare('SELECT * FROM categorias WHERE id = ? AND organizacion_id = ?')
    .get(categoriaId, req.usuario.organizacion_id);
  if (!categoria) {
    return res.status(404).json({ error: 'Categoría no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias WHERE nombre = ? AND id <> ? AND organizacion_id = ?')
    .get(String(nombre).trim(), categoriaId, req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre.' });
  }

  const nuevo = {
    nombre: String(nombre).trim(),
    activa: activa === undefined ? 1 : Number(Boolean(activa))
  };
  const cambios = diffCampos(categoria, nuevo, ['nombre', 'activa']);

  withTransaction(() => {
    db.prepare('UPDATE categorias SET nombre = ?, activa = ? WHERE id = ?').run(
      nuevo.nombre,
      nuevo.activa,
      categoriaId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'categoria',
        entidad_id: categoriaId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Categoría "${nuevo.nombre}" editada`
      });
    }
  });
  res.json({ id: categoriaId });
});

/* ---------- Listas de precios (CLAUDE.md §18) ---------- */
//
// Calcado de categorías de productos (arriba): mismas dos validaciones
// (nombre vacío, nombre duplicado) y baja lógica vía `activa`. Dos reglas
// propias que categorías no tiene: (1) exactamente una lista puede ser la
// predeterminada a la vez — es el fallback de todo el sistema cuando un
// producto no tiene precio cargado en la lista elegida, así que nunca puede
// quedar sin ninguna marcada; (2) por eso mismo, la predeterminada no se
// puede desactivar ni desmarcar directamente.

app.get('/api/listas-precios', (req, res) => {
  const listas = db
    .prepare('SELECT * FROM listas_precios WHERE organizacion_id = ? ORDER BY nombre')
    .all(req.usuario.organizacion_id);
  res.json(listas);
});

app.post('/api/listas-precios', soloAdmin, (req, res) => {
  const { nombre } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La lista necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM listas_precios WHERE nombre = ? AND organizacion_id = ?')
    .get(String(nombre).trim(), req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una lista con ese nombre.' });
  }

  const lastInsertRowid = withTransaction(() => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO listas_precios (nombre, organizacion_id) VALUES (?, ?)')
      .run(String(nombre).trim(), req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'lista_precio',
      entidad_id: id,
      detalle: `Lista de precios "${String(nombre).trim()}" creada`
    });
    return id;
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/listas-precios/:id', soloAdmin, (req, res) => {
  const listaId = Number(req.params.id);
  const { nombre, activa, es_predeterminada } = req.body;

  const lista = db
    .prepare('SELECT * FROM listas_precios WHERE id = ? AND organizacion_id = ?')
    .get(listaId, req.usuario.organizacion_id);
  if (!lista) {
    return res.status(404).json({ error: 'Lista de precios no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La lista necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM listas_precios WHERE nombre = ? AND id <> ? AND organizacion_id = ?')
    .get(String(nombre).trim(), listaId, req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra lista con ese nombre.' });
  }

  const nuevaEsPredeterminada = es_predeterminada === undefined
    ? Boolean(lista.es_predeterminada)
    : Boolean(es_predeterminada);

  // La predeterminada es el fallback de todo el sistema: no puede dejar de
  // serlo sin que otra tome su lugar, ni puede quedar inactiva (una lista
  // inactiva no debería poder proponerse en una venta nueva).
  if (lista.es_predeterminada && !nuevaEsPredeterminada) {
    return res.status(400).json({
      error: 'No se puede quitar la lista predeterminada: marcá otra como predeterminada en su lugar.'
    });
  }
  // Se mira el estado final, no solo el body: marcar como predeterminada una
  // lista que ya estaba inactiva (sin mandar `activa`) la dejaba inactiva y
  // predeterminada a la vez. No se la activa sola: la API no cambia en
  // silencio un campo que nadie pidió cambiar.
  const nuevaActiva = activa === undefined ? Boolean(lista.activa) : Boolean(activa);
  if (nuevaEsPredeterminada && !nuevaActiva) {
    return res.status(400).json({
      error: activa === false
        ? 'La lista predeterminada no se puede desactivar.'
        : 'Activá la lista antes de marcarla como predeterminada.'
    });
  }

  const nuevo = {
    nombre: String(nombre).trim(),
    activa: activa === undefined ? Number(Boolean(lista.activa)) : Number(Boolean(activa)),
    es_predeterminada: Number(nuevaEsPredeterminada)
  };
  const cambios = diffCampos(lista, nuevo, ['nombre', 'activa', 'es_predeterminada']);

  withTransaction(() => {
    // Si esta lista pasa a ser la predeterminada, desmarcar cualquier otra
    // de la misma organización primero — dentro de la misma transacción, así
    // nunca hay un instante (ni una falla a mitad de camino) con dos marcadas
    // o con cero. Sin el filtro de organización, marcar una lista acá le
    // quitaba la predeterminada a todas las demás empresas.
    if (nuevaEsPredeterminada && !lista.es_predeterminada) {
      db.prepare('UPDATE listas_precios SET es_predeterminada = 0 WHERE id <> ? AND organizacion_id = ?').run(
        listaId,
        req.usuario.organizacion_id
      );
    }
    db.prepare('UPDATE listas_precios SET nombre = ?, activa = ?, es_predeterminada = ? WHERE id = ?').run(
      nuevo.nombre,
      nuevo.activa,
      nuevo.es_predeterminada,
      listaId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'lista_precio',
        entidad_id: listaId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Lista de precios "${nuevo.nombre}" editada`
      });
    }
  });
  res.json({ id: listaId });
});

/* ---------- Depósitos (CLAUDE.md §5/§19) ---------- */
//
// Calcado de listas de precios (arriba): mismas dos validaciones (nombre
// vacío, nombre duplicado), baja lógica vía `activo`, y la misma regla de
// "exactamente uno predeterminado" (no se puede desmarcar ni desactivar
// directamente). Regla propia que ni categorías ni listas tienen: un
// depósito con stock cargado no se puede desactivar — quedaría mercadería
// real escondida de cualquier pantalla que solo liste depósitos activos.

app.get('/api/depositos', (req, res) => {
  const depositos = db
    .prepare('SELECT * FROM depositos WHERE organizacion_id = ? ORDER BY nombre')
    .all(req.usuario.organizacion_id);
  res.json(depositos);
});

app.post('/api/depositos', soloAdmin, (req, res) => {
  const { nombre, direccion } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El depósito necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM depositos WHERE nombre = ? AND organizacion_id = ?')
    .get(String(nombre).trim(), req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe un depósito con ese nombre.' });
  }

  const lastInsertRowid = withTransaction(() => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO depositos (nombre, direccion, organizacion_id) VALUES (?, ?, ?)')
      .run(String(nombre).trim(), direccion ? String(direccion).trim() : null, req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'deposito',
      entidad_id: id,
      detalle: `Depósito "${String(nombre).trim()}" creado`
    });
    return id;
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/depositos/:id', soloAdmin, (req, res) => {
  const depositoId = Number(req.params.id);
  const { nombre, direccion, activo, es_predeterminado } = req.body;

  const deposito = db
    .prepare('SELECT * FROM depositos WHERE id = ? AND organizacion_id = ?')
    .get(depositoId, req.usuario.organizacion_id);
  if (!deposito) {
    return res.status(404).json({ error: 'Depósito no encontrado.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El depósito necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM depositos WHERE nombre = ? AND id <> ? AND organizacion_id = ?')
    .get(String(nombre).trim(), depositoId, req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otro depósito con ese nombre.' });
  }

  const nuevoEsPredeterminado = es_predeterminado === undefined
    ? Boolean(deposito.es_predeterminado)
    : Boolean(es_predeterminado);

  if (deposito.es_predeterminado && !nuevoEsPredeterminado) {
    return res.status(400).json({
      error: 'No se puede quitar el depósito predeterminado: marcá otro como predeterminado en su lugar.'
    });
  }
  // Mismo criterio que listas de precios: se mira el estado final, no solo el
  // body, para que un depósito inactivo no pueda quedar como predeterminado.
  const nuevoActivoFinal = activo === undefined ? Boolean(deposito.activo) : Boolean(activo);
  if (nuevoEsPredeterminado && !nuevoActivoFinal) {
    return res.status(400).json({
      error: activo === false
        ? 'El depósito predeterminado no se puede desactivar.'
        : 'Activá el depósito antes de marcarlo como predeterminado.'
    });
  }

  const nuevoActivo = activo === undefined ? Number(Boolean(deposito.activo)) : Number(Boolean(activo));
  if (deposito.activo && !nuevoActivo) {
    const { cantidad } = db
      .prepare('SELECT COALESCE(SUM(cantidad), 0) AS cantidad FROM stock_por_deposito WHERE deposito_id = ?')
      .get(depositoId);
    if (cantidad > 0) {
      return res.status(400).json({
        error: `No se puede desactivar: todavía hay stock en este depósito (${cantidad} unidades en total). Transferí el stock a otro depósito primero.`
      });
    }
  }

  const nuevo = {
    nombre: String(nombre).trim(),
    direccion: direccion === undefined ? deposito.direccion : (direccion ? String(direccion).trim() : null),
    activo: nuevoActivo,
    es_predeterminado: Number(nuevoEsPredeterminado)
  };
  const cambios = diffCampos(deposito, nuevo, ['nombre', 'direccion', 'activo', 'es_predeterminado']);

  withTransaction(() => {
    // Mismo criterio que listas de precios: si este depósito pasa a ser el
    // predeterminado, desmarcar cualquier otro de la misma organización
    // primero, dentro de la misma transacción, para que nunca haya un
    // instante con dos marcados o cero.
    if (nuevoEsPredeterminado && !deposito.es_predeterminado) {
      db.prepare('UPDATE depositos SET es_predeterminado = 0 WHERE id <> ? AND organizacion_id = ?').run(
        depositoId,
        req.usuario.organizacion_id
      );
    }
    db.prepare('UPDATE depositos SET nombre = ?, direccion = ?, activo = ?, es_predeterminado = ? WHERE id = ?').run(
      nuevo.nombre,
      nuevo.direccion,
      nuevo.activo,
      nuevo.es_predeterminado,
      depositoId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'deposito',
        entidad_id: depositoId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Depósito "${nuevo.nombre}" editado`
      });
    }
  });
  res.json({ id: depositoId });
});

// El depósito predeterminado, resuelto una sola vez y reusado por todas las
// operaciones que necesitan "el depósito de esta operación, si no se
// especificó uno". Mismo criterio que NULL en ventas.lista_precio_id: nunca
// se guarda el id copiado, siempre se resuelve en el momento. Es el de la
// organización de la operación: cada empresa tiene el suyo.
function depositoPredeterminadoId(organizacionId) {
  return (
    db
      .prepare('SELECT id FROM depositos WHERE es_predeterminado = 1 AND organizacion_id = ?')
      .get(organizacionId)?.id ?? null
  );
}

// Un id de depósito que llega del cliente tiene que existir, estar activo y
// ser de la organización de la operación. Devuelve el mismo resultado para
// "no existe" y "es de otra empresa", igual que el resto de la Etapa A.
function depositoActivoValido(depositoId, organizacionId) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM depositos WHERE id = ? AND activo = 1 AND organizacion_id = ?')
      .get(depositoId, organizacionId)
  );
}

/* ---------- Productos ---------- */

// Stock y valorizado de las variantes de cada producto, agregados una sola
// vez (no una subconsulta por fila). Un producto con variantes tiene
// precio_costo 0: el costo vive en cada variante, así que su valorizado sale
// de acá (ver valorizadoProducto).
const JOIN_STOCK_VARIANTES = `
    LEFT JOIN (
      SELECT sva.producto_id, SUM(sva.cantidad) AS stock_variantes,
             SUM(sva.cantidad * producto_variantes.precio_costo) AS valorizado_variantes
        FROM stock_variante_actual sva
        JOIN producto_variantes ON producto_variantes.id = sva.variante_id
       GROUP BY sva.producto_id
    ) AS sv ON sv.producto_id = productos.id`;

// Lo que queda sin variante va al costo del producto, y cada variante a su
// propio costo. Sin variantes es precio_costo × stock, como siempre.
function valorizadoProducto(precioCosto, stock, stockVariantes, valorizadoVariantes) {
  return precioCosto * (stock - (stockVariantes ?? 0)) + (valorizadoVariantes ?? 0);
}

const SELECT_PRODUCTO = `
  SELECT productos.id, productos.nombre, productos.sku, productos.precio_costo,
         productos.precio_venta, productos.activo,
         productos.stock_minimo, productos.stock_maximo,
         productos.categoria_id, categorias.nombre AS categoria,
         productos.margen_objetivo, productos.unidad, productos.tipo,
         productos.descripcion, productos.duracion_minutos,
         COALESCE(stock_actual.cantidad, 0) AS stock,
         (SELECT COUNT(*) FROM producto_variantes
           WHERE producto_variantes.producto_id = productos.id AND producto_variantes.activo = 1) AS variantes_count,
         sv.stock_variantes, sv.valorizado_variantes
    FROM productos
    LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id
    LEFT JOIN categorias ON categorias.id = productos.categoria_id${JOIN_STOCK_VARIANTES}`;

// Precios de los productos de una empresa en todas sus listas, indexados por
// producto_id -> { lista_precio_id: precio }. Antes leía los de todas las
// empresas: sin fuga (cada producto solo ve los suyos), pero no escalaba. Se resuelve con un segundo
// query en vez de un pivot en SQL: evita tener que generar una columna por
// lista de forma dinámica, y el número de listas es chico (típicamente unas
// pocas), así que el costo de armar el mapa en JS es despreciable.
function obtenerPreciosPorProducto(organizacionId) {
  const filas = db
    .prepare(
      `SELECT producto_precios.producto_id, producto_precios.lista_precio_id, producto_precios.precio
         FROM producto_precios
         JOIN productos ON productos.id = producto_precios.producto_id
        WHERE productos.organizacion_id = ?`
    )
    .all(organizacionId);
  const mapa = {};
  for (const fila of filas) {
    if (!mapa[fila.producto_id]) mapa[fila.producto_id] = {};
    mapa[fila.producto_id][fila.lista_precio_id] = fila.precio;
  }
  return mapa;
}

// Semáforo de stock. El mínimo avisa cuando llegás a ese número (no cuando
// lo perforás): si configurás 5, con 5 unidades ya querés reponer. El
// máximo es opcional; sin máximo, un producto nunca marca "alto".
function estadoStock(stock, stockMinimo, stockMaximo) {
  if (stock <= 0) return 'sin_stock';
  if (stockMinimo > 0 && stock <= stockMinimo) return 'bajo';
  if (stockMaximo !== null && stockMaximo > 0 && stock > stockMaximo) return 'alto';
  return 'normal';
}

// Campos calculados que no se guardan (CLAUDE.md §4: la info derivada se
// calcula, no se persiste). El margen es sobre el precio de venta:
// (precio - costo) / precio. Sin precio de venta cargado no hay margen que
// mostrar, por eso null en vez de 0 (0% sería mentira).
// `precios` es el mapa lista_precio_id -> precio de ESE producto puntual
// (viene de obtenerPreciosPorProducto, ya resuelto por producto_id antes de
// llamar acá); un objeto vacío significa que el producto todavía no tiene
// ningún precio propio cargado y todo cae al fallback de precio_venta.
// margen_bajo_objetivo compara el margen real (de la lista predeterminada)
// contra margen_objetivo: solo informativo/alerta, nunca sugiere un precio.
// null cuando falta el objetivo o no hay margen calculable (nunca false por
// defecto, sería engañoso). Igualdad exacta cuenta como "cumple".
// Un producto con stock en variantes muestra como costo el promedio ponderado
// de lo que tiene (valorizado / stock): su precio_costo propio es 0 y daba
// valorizado $0 y margen 100%. stock_variantes y valorizado_variantes no
// salen en la respuesta: el filtro de campos sensibles corta por nombre de
// clave (CLAUDE.md §35) y no los conoce.
function decorarProducto({ stock_variantes, valorizado_variantes, ...p }, precios = {}) {
  const valorizado = valorizadoProducto(p.precio_costo, p.stock, stock_variantes, valorizado_variantes);
  if (stock_variantes && p.stock > 0) p.precio_costo = valorizado / p.stock;
  const margen = p.precio_venta > 0 ? ((p.precio_venta - p.precio_costo) / p.precio_venta) * 100 : null;
  return {
    ...p,
    precios,
    valorizado,
    margen,
    margen_bajo_objetivo: p.margen_objetivo != null && margen != null ? margen < p.margen_objetivo : null,
    // Un servicio no tiene stock que vigilar.
    estado_stock: p.tipo === 'servicio' ? null : estadoStock(p.stock, p.stock_minimo, p.stock_maximo),
    tiene_variantes: p.variantes_count > 0
  };
}

// Filtro por organizacion_id: primer punto del sistema que aplica el
// aislamiento multi-tenant (CLAUDE.md §28). productos es la tabla piloto;
// otros GET de negocio todavía no filtran, se van sumando etapa por etapa.
app.get('/api/productos', (req, res) => {
  const productos = db
    .prepare(`${SELECT_PRODUCTO} WHERE productos.organizacion_id = ? ORDER BY productos.nombre`)
    .all(req.usuario.organizacion_id);
  const preciosPorProducto = obtenerPreciosPorProducto(req.usuario.organizacion_id);
  res.json(productos.map((p) => decorarProducto(p, preciosPorProducto[p.id])));
});

function normalizarPrecio(valor) {
  return valor === undefined || valor === null || valor === '' ? 0 : Number(valor);
}

// stock_maximo es opcional de verdad: vacío significa "sin tope", no 0.
function normalizarStockMaximo(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}

// categoria_id es opcional de verdad (ver schema.sql): vacío significa
// "sin categoría", no un error.
function normalizarCategoriaId(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}

// margen_objetivo es opcional de verdad: vacío significa "sin objetivo
// cargado", no 0% (0% sería un objetivo real y absurdo).
function normalizarMargenObjetivo(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}

// Unidades en las que se vende un producto (CLAUDE.md §4, §29): las que no
// son 'unidad' admiten cantidades con decimales (1,250 kg). Se validan acá y
// no con un CHECK, para no reconstruir la tabla si se suma una. 'hora' es la
// de un servicio que se cobra por tiempo (hist. §78): 1,5 horas.
const UNIDADES = ['unidad', 'kg', 'g', 'l', 'ml', 'm', 'hora'];
// Un servicio no maneja stock: se vende sin control de stock y no genera
// movimientos (ver esServicio).
const TIPOS_PRODUCTO = ['producto', 'servicio'];
const MAX_DESCRIPCION_PRODUCTO = 500;
// Una semana: más que eso ya no es la duración de un servicio, es un trabajo.
const MAX_DURACION_MINUTOS = 7 * 24 * 60;

// descripcion y duracion_minutos son opcionales de verdad: vacío es NULL.
function normalizarDescripcion(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto === '' ? null : texto;
}
function normalizarDuracion(valor) {
  return valor === undefined || valor === null || valor === '' ? null : Number(valor);
}

// Validación compartida por POST y PATCH. Devuelve el mensaje de error o
// null si está todo bien. Notar que precio_costo NO se lee del body en
// ningún lado: el costo lo fija la compra al proveedor, no esta pantalla.
function validarProducto(
  { nombre, precio_venta, stock_minimo, stock_maximo, categoria_id, margen_objetivo, unidad, tipo, descripcion, duracion_minutos },
  organizacionId
) {
  if (!nombre || !nombre.trim()) {
    return 'El producto necesita un nombre.';
  }
  if (descripcion != null && typeof descripcion !== 'string') {
    return 'La descripción no es válida.';
  }
  if (normalizarDescripcion(descripcion)?.length > MAX_DESCRIPCION_PRODUCTO) {
    return `La descripción no puede pasar de ${MAX_DESCRIPCION_PRODUCTO} caracteres.`;
  }
  const duracion = normalizarDuracion(duracion_minutos);
  if (duracion !== null && (!Number.isInteger(duracion) || duracion < 1 || duracion > MAX_DURACION_MINUTOS)) {
    return 'La duración tiene que ser una cantidad entera de minutos, de 1 a una semana.';
  }
  if (unidad != null && !UNIDADES.includes(unidad)) {
    return 'La unidad de medida no es válida.';
  }
  if (tipo != null && !TIPOS_PRODUCTO.includes(tipo)) {
    return 'El tipo de producto no es válido.';
  }
  const venta = normalizarPrecio(precio_venta);
  if (Number.isNaN(venta) || venta < 0) {
    return 'El precio de venta debe ser un número mayor o igual a 0.';
  }
  const minimo = normalizarPrecio(stock_minimo);
  const maximo = normalizarStockMaximo(stock_maximo);
  if (Number.isNaN(minimo) || minimo < 0 || (maximo !== null && (Number.isNaN(maximo) || maximo < 0))) {
    return 'El stock mínimo y máximo deben ser números mayores o iguales a 0.';
  }
  if (maximo !== null && maximo < minimo) {
    return 'El stock máximo no puede ser menor que el mínimo.';
  }
  // Mismo criterio que categoria_id en gastos (validarGasto, más abajo):
  // si viene, tiene que existir de verdad y ser de la organización del
  // producto — nunca se confía ciegamente en un id que llega del cliente.
  const categoriaId = normalizarCategoriaId(categoria_id);
  if (
    categoriaId !== null &&
    !db.prepare('SELECT 1 FROM categorias WHERE id = ? AND organizacion_id = ?').get(categoriaId, organizacionId)
  ) {
    return 'La categoría seleccionada no existe.';
  }
  const margenObjetivo = normalizarMargenObjetivo(margen_objetivo);
  if (margenObjetivo !== null && (Number.isNaN(margenObjetivo) || margenObjetivo < 0 || margenObjetivo >= 100)) {
    return 'El margen objetivo debe ser un número entre 0 y 100.';
  }
  return null;
}

app.post('/api/productos', soloAdmin, (req, res) => {
  const error = validarProducto(req.body, req.usuario.organizacion_id);
  if (error) {
    return res.status(400).json({ error });
  }

  const { nombre, sku, precio_venta, activo, stock_minimo, stock_maximo, categoria_id, margen_objetivo, unidad, tipo, descripcion, duracion_minutos } =
    req.body;
  const skuNormalizado = sku && sku.trim() ? sku.trim() : null;
  // Sin unidad ni tipo, los del tipo de negocio (una carnicería vende por kg).
  const perfil = perfilDeEmpresa(req.usuario.organizacion_id);
  // Uno inactivo no cuenta para el tope del plan (hist. §98).
  if (!(activo === false || activo === 0)) exigirLugarEnPlan(req.usuario.organizacion_id, 'productos');

  let lastInsertRowid;
  try {
    // precio_costo arranca en 0 a propósito: un producto recién creado
    // todavía no se compró, así que no tiene costo real. Lo va a fijar la
    // primera compra que lo incluya.
    ({ lastInsertRowid } = db
      .prepare(
        `INSERT INTO productos (nombre, sku, precio_costo, precio_venta, activo, stock_minimo, stock_maximo, categoria_id, margen_objetivo, organizacion_id, unidad, tipo,
                                descripcion, duracion_minutos)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nombre.trim(),
        skuNormalizado,
        normalizarPrecio(precio_venta),
        activo === false || activo === 0 ? 0 : 1,
        normalizarPrecio(stock_minimo),
        normalizarStockMaximo(stock_maximo),
        normalizarCategoriaId(categoria_id),
        normalizarMargenObjetivo(margen_objetivo),
        req.usuario.organizacion_id,
        unidad ?? perfil.unidad_defecto,
        tipo ?? perfil.tipo_defecto,
        normalizarDescripcion(descripcion),
        normalizarDuracion(duracion_minutos)
      ));
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe un producto con ese SKU.' });
    }
    throw err;
  }
  res.status(201).json({ id: lastInsertRowid });
});

// Campos que la edición EN LOTE puede tocar. Deliberadamente más chico que
// las 7 columnas del PATCH singular: nombre y sku quedan afuera porque
// ponerle el mismo nombre a 20 productos no tiene sentido, y el mismo SKU
// haría fallar con UNIQUE a partir del segundo item del lote. `precios` es
// el mismo mapa por-lista que acepta el PATCH singular — remarcar por
// porcentaje una lista puntual (ej. "+10% en Mayorista") sobre todo el
// catálogo filtrado es exactamente el caso de uso que el bulk existe para
// cubrir.
const CAMPOS_BULK_PRODUCTO = ['activo', 'categoria_id', 'precio_venta', 'stock_minimo', 'stock_maximo', 'margen_objetivo', 'precios', 'unidad'];

// `cambios.precio_venta` puede venir como número (valor fijo) o como
// { modo: 'porcentaje', valor: N } (ajuste sobre el precio actual DE ESE
// producto). Se resuelve acá, en el backend, y no en el frontend: si lo
// calculara el cliente usaría su copia en memoria de `productos`, que
// puede estar desactualizada respecto de la fila real.
function esAjustePorcentaje(valor) {
  return typeof valor === 'object' && valor !== null && valor.modo === 'porcentaje';
}

// Punto único de edición de un producto, usado tanto por el PATCH singular
// como por el bulk. Recibe `cambios` PARCIAL: cualquier clave de
// producto ausente significa "no tocar ese campo" (se detecta con
// hasOwnProperty, nunca con !== undefined, porque `null` es un valor
// legítimo acá: categoria_id: null = sin categoría, stock_maximo: null =
// sin tope).
//
// Válida el objeto FUSIONADO (fila actual + cambios encima), no solo los
// campos presentes: es lo único que permite detectar invariantes cruzadas
// como "stock_máximo no puede ser menor que el mínimo" cuando el pedido
// solo toca uno de los dos. Reusa validarProducto tal cual, sin duplicar
// ninguna regla.
//
// Lleva `req` como primer parámetro (no AsyncLocalStorage ni variable de
// módulo) por la misma razón que auditar(req, ...) lo exige: dos requests
// concurrentes no deben poder pisarse el usuario que audita.
//
// `cambios.precios`, si viene, es un mapa { lista_precio_id: precio } —
// separado de `precio_venta` a propósito: precio_venta sigue siendo LA
// columna de la lista predeterminada (ver más abajo, dentro de la
// transacción), pero el resto de las listas no tienen columna propia en
// `productos`, viven en `producto_precios`. Igual que `precio_venta`, cada
// entrada de `precios` admite el ajuste porcentual { modo:'porcentaje',
// valor:N }, calculado sobre el precio ACTUAL de ese producto en esa lista
// puntual (o sobre precio_venta como fallback si el producto todavía no
// tiene precio propio en esa lista).
function aplicarEdicionProducto(req, productoId, cambios, totalLote = 1) {
  // organizacion_id en el WHERE (no solo en el INSERT del alta): CLAUDE.md
  // §28 exige que ninguna consulta cruce datos de dos empresas, así que un
  // id de otra organización tiene que dar 404, igual que "no existe".
  const producto = db
    .prepare(
      `SELECT id, nombre, sku, precio_venta, activo, stock_minimo, stock_maximo, categoria_id, margen_objetivo, unidad, tipo,
              descripcion, duracion_minutos
         FROM productos WHERE id = ? AND organizacion_id = ?`
    )
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    throw new ErrorBulk('Producto no encontrado.', 404);
  }

  const cambiosProducto = { ...cambios };
  delete cambiosProducto.precios;

  const fusionado = { ...producto };
  for (const campo of Object.keys(cambiosProducto)) {
    if (Object.prototype.hasOwnProperty.call(cambiosProducto, campo)) fusionado[campo] = cambiosProducto[campo];
  }
  if (esAjustePorcentaje(fusionado.precio_venta)) {
    const ajuste = Number(fusionado.precio_venta.valor) / 100;
    fusionado.precio_venta = Math.round(producto.precio_venta * (1 + ajuste) * 100) / 100;
  }

  const error = validarProducto(fusionado, req.usuario.organizacion_id);
  if (error) {
    throw new ErrorBulk(error);
  }

  // Precios por lista: se resuelven ACÁ (antes de la transacción) para que
  // un ajuste porcentual lea el precio real que tiene el producto en esa
  // lista en este momento, no un valor ya modificado por este mismo pedido.
  let preciosPorLista = null;
  let cambiaPrecioDeLista = false;
  if (cambios.precios && typeof cambios.precios === 'object') {
    const preciosActuales = db
      .prepare('SELECT lista_precio_id, precio FROM producto_precios WHERE producto_id = ?')
      .all(productoId)
      .reduce((acc, fila) => ({ ...acc, [fila.lista_precio_id]: fila.precio }), {});

    preciosPorLista = {};
    for (const [listaIdStr, valor] of Object.entries(cambios.precios)) {
      const listaId = Number(listaIdStr);
      if (!listaPrecioValida(listaId, req.usuario.organizacion_id)) {
        throw new ErrorBulk('La lista de precios seleccionada no existe.');
      }
      const precioBase = preciosActuales[listaId] ?? producto.precio_venta;
      let precioNuevo;
      if (esAjustePorcentaje(valor)) {
        const ajuste = Number(valor.valor) / 100;
        precioNuevo = Math.round(precioBase * (1 + ajuste) * 100) / 100;
      } else {
        precioNuevo = normalizarPrecio(valor);
      }
      if (Number.isNaN(precioNuevo) || precioNuevo < 0) {
        throw new ErrorBulk('El precio debe ser un número mayor o igual a 0.');
      }
      preciosPorLista[listaId] = precioNuevo;
      if (precioNuevo !== precioBase) cambiaPrecioDeLista = true;
    }
  }

  const skuNormalizado = fusionado.sku && fusionado.sku.trim ? (fusionado.sku.trim() || null) : fusionado.sku;
  const nuevo = {
    nombre: fusionado.nombre.trim ? fusionado.nombre.trim() : fusionado.nombre,
    sku: skuNormalizado,
    precio_venta: normalizarPrecio(fusionado.precio_venta),
    activo: fusionado.activo === false || fusionado.activo === 0 ? 0 : 1,
    stock_minimo: normalizarPrecio(fusionado.stock_minimo),
    stock_maximo: normalizarStockMaximo(fusionado.stock_maximo),
    categoria_id: normalizarCategoriaId(fusionado.categoria_id),
    margen_objetivo: normalizarMargenObjetivo(fusionado.margen_objetivo),
    unidad: fusionado.unidad ?? 'unidad',
    tipo: fusionado.tipo ?? 'producto',
    descripcion: normalizarDescripcion(fusionado.descripcion),
    duracion_minutos: normalizarDuracion(fusionado.duracion_minutos)
  };
  // Pasar a servicio deja de controlar el stock: si todavía tiene, se perdería
  // de vista. Primero se ajusta a 0.
  if (producto.tipo !== 'servicio' && nuevo.tipo === 'servicio') {
    const stock = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?').get(productoId)?.cantidad ?? 0;
    if (Math.abs(stock) > 0.0005) {
      throw new ErrorBulk(`"${producto.nombre}" tiene stock: ajustalo a 0 antes de pasarlo a servicio.`);
    }
  }
  // El servicio de un plan de socios se vende como cuota (hist. §74): con
  // stock, cada cuota sacaría mercadería que no existe. Y su precio es el de
  // cada duración del plan (hist. §75): se cambia desde Configuración.
  const esPlanDeSocios = Boolean(db.prepare('SELECT 1 FROM planes_socio WHERE producto_id = ?').get(productoId));
  if (esPlanDeSocios && nuevo.tipo !== 'servicio') {
    throw new ErrorBulk(`"${producto.nombre}" es un plan de socios: tiene que seguir siendo un servicio.`);
  }
  // Si el pedido tocó el precio de la lista PREDETERMINADA vía `precios`,
  // ese valor también pisa precio_venta — son la misma cosa vista desde dos
  // lugares (columna suelta vs. fila de producto_precios), y no deben poder
  // desincronizarse. Se resuelve acá, antes del diff, para que quede
  // reflejado en la auditoría del producto como cualquier otro cambio de
  // precio_venta.
  const listaPredeterminada = db
    .prepare('SELECT id FROM listas_precios WHERE es_predeterminada = 1 AND organizacion_id = ?')
    .get(req.usuario.organizacion_id);
  if (preciosPorLista && listaPredeterminada && preciosPorLista[listaPredeterminada.id] !== undefined) {
    nuevo.precio_venta = preciosPorLista[listaPredeterminada.id];
  }
  if (esPlanDeSocios && (cambiaPrecioDeLista || nuevo.precio_venta !== producto.precio_venta)) {
    throw new ErrorBulk(`El precio de "${producto.nombre}" se cambia en Socios → Planes: cada duración tiene el suyo.`);
  }
  // Reactivarlo vuelve a ocupar un lugar del plan (hist. §98).
  if (!producto.activo && nuevo.activo) {
    exigirLugarEnPlan(req.usuario.organizacion_id, 'productos');
  }
  // precio_costo no entra en este diff: es el promedio ponderado que
  // recalculan las compras (recalcularCostoProducto), no algo que este
  // endpoint edite. Auditarlo acá duplicaría el acto de la compra, que
  // ya audita su propio "crear/confirmar" en la Fase B.
  const diff = diffCampos(producto, nuevo, [
    'nombre', 'sku', 'precio_venta', 'activo', 'stock_minimo', 'stock_maximo', 'categoria_id', 'margen_objetivo', 'unidad', 'tipo',
    'descripcion', 'duracion_minutos'
  ]);

  withTransaction(() => {
    // precio_costo queda deliberadamente fuera del UPDATE: es el promedio
    // ponderado que calculan las compras, editarlo a mano acá rompería la
    // trazabilidad del costo real.
    db.prepare(
      `UPDATE productos
          SET nombre = ?, sku = ?, precio_venta = ?, activo = ?, stock_minimo = ?, stock_maximo = ?, categoria_id = ?, margen_objetivo = ?,
              unidad = ?, tipo = ?, descripcion = ?, duracion_minutos = ?
        WHERE id = ?`
    ).run(
      nuevo.nombre,
      nuevo.sku,
      nuevo.precio_venta,
      nuevo.activo,
      nuevo.stock_minimo,
      nuevo.stock_maximo,
      nuevo.categoria_id,
      nuevo.margen_objetivo,
      nuevo.unidad,
      nuevo.tipo,
      nuevo.descripcion,
      nuevo.duracion_minutos,
      productoId
    );
    if (preciosPorLista) {
      const upsertPrecio = db.prepare(`
        INSERT INTO producto_precios (producto_id, lista_precio_id, precio)
        VALUES (?, ?, ?)
        ON CONFLICT(producto_id, lista_precio_id) DO UPDATE SET precio = excluded.precio
      `);
      for (const [listaId, precio] of Object.entries(preciosPorLista)) {
        upsertPrecio.run(productoId, Number(listaId), precio);
      }
    }
    if (diff) {
      auditar(req, {
        accion: 'editar',
        entidad: 'producto',
        entidad_id: productoId,
        valor_anterior: diff.anterior,
        valor_nuevo: diff.nuevo,
        detalle: totalLote > 1
          ? `Producto "${nuevo.nombre}" editado (edición en lote de ${totalLote})`
          : `Producto "${nuevo.nombre}" editado`
      });
    }
  });

  return { sinCambios: diff === null };
}

app.patch('/api/productos/:id', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  try {
    aplicarEdicionProducto(req, productoId, req.body, 1);
  } catch (err) {
    if (err instanceof ErrorBulk) {
      // `codigo` solo lo trae el tope del plan (ErrorPlan).
      return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    }
    return res.status(400).json({ error: mensajeDeError(err) });
  }
  res.json({ id: productoId });
});

// Edición en lote: aplica los mismos `cambios` a varios productos. No
// todo-o-nada — cada id se intenta de forma independiente (ver
// aplicarLote) y el response detalla cuáles se aplicaron y cuáles no,
// con el mismo mensaje de error que devolvería el PATCH singular.
app.post('/api/productos/bulk', soloAdmin, (req, res) => {
  let ids;
  try {
    ids = idsDeLote(req.body?.ids);
  } catch (err) {
    return res.status(err.status).json({ error: err.message });
  }

  const cambios = req.body?.cambios;
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
    return res.status(400).json({ error: 'No indicaste ningún cambio.' });
  }
  const cambiosValidos = {};
  for (const campo of CAMPOS_BULK_PRODUCTO) {
    if (Object.prototype.hasOwnProperty.call(cambios, campo)) cambiosValidos[campo] = cambios[campo];
  }
  if (Object.keys(cambiosValidos).length === 0) {
    return res.status(400).json({ error: 'No indicaste ningún cambio.' });
  }

  const resultado = aplicarLote(ids, (id) =>
    aplicarEdicionProducto(req, id, cambiosValidos, ids.length)
  );
  res.json(resultado);
});

// Historial de movimientos de stock de un producto. El stock resultante se
// calcula acumulando desde el movimiento más viejo (CLAUDE.md §5 pide poder
// ver el stock anterior y posterior de cada movimiento) y recién ahí se da
// vuelta la lista, para mostrar lo más reciente primero.
app.get('/api/productos/:id/movimientos', (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }

  const movimientos = db
    .prepare(
      `SELECT id, tipo, cantidad, origen, venta_id, compra_id, devolucion_id, fecha, nota
         FROM movimientos_stock
        WHERE producto_id = ?
        ORDER BY fecha, id`
    )
    .all(productoId);

  let acumulado = 0;
  const conSaldo = movimientos.map((m) => {
    const delta = m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    const stockAnterior = acumulado;
    acumulado += delta;
    return { ...m, delta, stock_anterior: stockAnterior, stock_posterior: acumulado };
  });

  res.json(conSaldo.reverse());
});

/* ---------- Atributos y variantes de producto ---------- */
//
// Un atributo (Talle, Color, ...) es propio de cada producto, no un
// catálogo compartido entre productos distintos: cada producto define los
// suyos. Una variante es una combinación concreta de exactamente un valor
// por cada atributo activo del producto (nunca parcial). ABM = admin,
// lecturas = ambos roles, mismo criterio que categorías/productos.

app.get('/api/productos/:id/atributos', (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const atributos = db
    .prepare('SELECT id, nombre, orden FROM producto_atributos WHERE producto_id = ? ORDER BY orden, nombre')
    .all(productoId);
  const valores = db
    .prepare(
      `SELECT id, atributo_id, valor, orden FROM producto_atributo_valores
        WHERE atributo_id IN (SELECT id FROM producto_atributos WHERE producto_id = ?)
        ORDER BY orden, valor`
    )
    .all(productoId);
  res.json(atributos.map((a) => ({ ...a, valores: valores.filter((v) => v.atributo_id === a.id) })));
});

app.post('/api/productos/:id/atributos', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const { nombre } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El atributo necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM producto_atributos WHERE producto_id = ? AND nombre = ? COLLATE NOCASE')
    .get(productoId, String(nombre).trim());
  if (yaExiste) {
    return res.status(400).json({ error: 'Ese producto ya tiene un atributo con ese nombre.' });
  }
  const { orden } = db
    .prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS orden FROM producto_atributos WHERE producto_id = ?')
    .get(productoId);

  let lastInsertRowid;
  withTransaction(() => {
    ({ lastInsertRowid } = db
      .prepare('INSERT INTO producto_atributos (producto_id, nombre, orden) VALUES (?, ?, ?)')
      .run(productoId, String(nombre).trim(), orden));
    auditar(req, {
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Atributo "${String(nombre).trim()}" agregado`
    });
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/productos/:id/atributos/:atributoId', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const atributoId = Number(req.params.atributoId);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const atributo = db.prepare('SELECT * FROM producto_atributos WHERE id = ? AND producto_id = ?').get(atributoId, productoId);
  if (!atributo) {
    return res.status(404).json({ error: 'Atributo no encontrado.' });
  }
  const { nombre } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El atributo necesita un nombre.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM producto_atributos WHERE producto_id = ? AND nombre = ? COLLATE NOCASE AND id <> ?')
    .get(productoId, String(nombre).trim(), atributoId);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ese producto ya tiene un atributo con ese nombre.' });
  }

  withTransaction(() => {
    db.prepare('UPDATE producto_atributos SET nombre = ? WHERE id = ?').run(String(nombre).trim(), atributoId);
    auditar(req, {
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Atributo "${atributo.nombre}" renombrado a "${String(nombre).trim()}"`
    });
  });
  res.json({ id: atributoId });
});

app.delete('/api/productos/:id/atributos/:atributoId', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const atributoId = Number(req.params.atributoId);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const atributo = db.prepare('SELECT * FROM producto_atributos WHERE id = ? AND producto_id = ?').get(atributoId, productoId);
  if (!atributo) {
    return res.status(404).json({ error: 'Atributo no encontrado.' });
  }
  const enUso = db.prepare('SELECT 1 FROM producto_variante_valores WHERE atributo_id = ?').get(atributoId);
  if (enUso) {
    return res.status(400).json({ error: 'No se puede borrar un atributo que ya tiene variantes creadas con él.' });
  }

  withTransaction(() => {
    db.prepare('DELETE FROM producto_atributo_valores WHERE atributo_id = ?').run(atributoId);
    db.prepare('DELETE FROM producto_atributos WHERE id = ?').run(atributoId);
    auditar(req, {
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Atributo "${atributo.nombre}" eliminado`
    });
  });
  res.json({ ok: true });
});

app.post('/api/productos/:id/atributos/:atributoId/valores', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const atributoId = Number(req.params.atributoId);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const atributo = db.prepare('SELECT * FROM producto_atributos WHERE id = ? AND producto_id = ?').get(atributoId, productoId);
  if (!atributo) {
    return res.status(404).json({ error: 'Atributo no encontrado.' });
  }
  const { valor } = req.body;
  if (!valor || !String(valor).trim()) {
    return res.status(400).json({ error: 'El valor no puede estar vacío.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM producto_atributo_valores WHERE atributo_id = ? AND valor = ? COLLATE NOCASE')
    .get(atributoId, String(valor).trim());
  if (yaExiste) {
    return res.status(400).json({ error: 'Ese valor ya existe para este atributo.' });
  }
  const { orden } = db
    .prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS orden FROM producto_atributo_valores WHERE atributo_id = ?')
    .get(atributoId);

  let lastInsertRowid;
  withTransaction(() => {
    ({ lastInsertRowid } = db
      .prepare('INSERT INTO producto_atributo_valores (atributo_id, valor, orden) VALUES (?, ?, ?)')
      .run(atributoId, String(valor).trim(), orden));
    auditar(req, {
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Valor "${String(valor).trim()}" agregado a "${atributo.nombre}"`
    });
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.delete('/api/productos/:id/atributos/:atributoId/valores/:valorId', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const atributoId = Number(req.params.atributoId);
  const valorId = Number(req.params.valorId);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const atributo = db.prepare('SELECT * FROM producto_atributos WHERE id = ? AND producto_id = ?').get(atributoId, productoId);
  if (!atributo) {
    return res.status(404).json({ error: 'Atributo no encontrado.' });
  }
  const valor = db.prepare('SELECT * FROM producto_atributo_valores WHERE id = ? AND atributo_id = ?').get(valorId, atributoId);
  if (!valor) {
    return res.status(404).json({ error: 'Valor no encontrado.' });
  }
  const enUso = db.prepare('SELECT 1 FROM producto_variante_valores WHERE valor_id = ?').get(valorId);
  if (enUso) {
    return res.status(400).json({ error: 'No se puede borrar un valor que ya tiene variantes creadas con él.' });
  }

  withTransaction(() => {
    db.prepare('DELETE FROM producto_atributo_valores WHERE id = ?').run(valorId);
    auditar(req, {
      accion: 'editar',
      entidad: 'producto',
      entidad_id: productoId,
      detalle: `Valor "${valor.valor}" eliminado de "${atributo.nombre}"`
    });
  });
  res.json({ ok: true });
});

const SELECT_VARIANTE = `
  SELECT producto_variantes.id, producto_variantes.producto_id, producto_variantes.sku,
         producto_variantes.precio_costo, producto_variantes.precio_venta, producto_variantes.activo,
         COALESCE(stock_variante_actual.cantidad, 0) AS stock
    FROM producto_variantes
    LEFT JOIN stock_variante_actual ON stock_variante_actual.variante_id = producto_variantes.id`;

// Espejo de obtenerPreciosPorProducto contra variante_precios, para las
// variantes de un producto (el que la ruta ya validó como de la empresa).
function obtenerPreciosPorVariante(productoId) {
  const filas = db
    .prepare(
      `SELECT variante_precios.variante_id, variante_precios.lista_precio_id, variante_precios.precio
         FROM variante_precios
         JOIN producto_variantes ON producto_variantes.id = variante_precios.variante_id
        WHERE producto_variantes.producto_id = ?`
    )
    .all(productoId);
  const mapa = {};
  for (const fila of filas) {
    if (!mapa[fila.variante_id]) mapa[fila.variante_id] = {};
    mapa[fila.variante_id][fila.lista_precio_id] = fila.precio;
  }
  return mapa;
}

// Texto legible de una combinación ("Talle: M / Color: Rojo"), en el orden
// en que están definidos los atributos del producto.
function combinacionVariante(varianteId) {
  const partes = db
    .prepare(
      `SELECT producto_atributos.nombre AS atributo, producto_atributo_valores.valor AS valor
         FROM producto_variante_valores
         JOIN producto_atributos ON producto_atributos.id = producto_variante_valores.atributo_id
         JOIN producto_atributo_valores ON producto_atributo_valores.id = producto_variante_valores.valor_id
        WHERE producto_variante_valores.variante_id = ?
        ORDER BY producto_atributos.orden`
    )
    .all(varianteId);
  return partes.map((p) => `${p.atributo}: ${p.valor}`).join(' / ');
}

function decorarVariante(v, precios = {}) {
  return {
    ...v,
    precios,
    combinacion: combinacionVariante(v.id),
    valorizado: v.precio_costo * v.stock
  };
}

// Valida que `valores` (array de {atributo_id, valor_id}) cubra exactamente
// los atributos del producto, uno por uno: las variantes son siempre
// completas, nunca parciales (decisión del plan de esta etapa).
function validarCombinacionVariante(productoId, valores) {
  if (!Array.isArray(valores) || valores.length === 0) {
    return 'Elegí un valor para cada atributo del producto.';
  }
  const atributosProducto = db
    .prepare('SELECT id FROM producto_atributos WHERE producto_id = ?')
    .all(productoId)
    .map((a) => a.id);
  if (atributosProducto.length === 0) {
    return 'Este producto todavía no tiene atributos definidos.';
  }
  const atributosElegidos = new Set();
  for (const { atributo_id, valor_id } of valores) {
    if (!atributosProducto.includes(Number(atributo_id))) {
      return 'Uno de los atributos elegidos no pertenece a este producto.';
    }
    const valorValido = db
      .prepare('SELECT 1 FROM producto_atributo_valores WHERE id = ? AND atributo_id = ?')
      .get(Number(valor_id), Number(atributo_id));
    if (!valorValido) {
      return 'Uno de los valores elegidos no pertenece a ese atributo.';
    }
    atributosElegidos.add(Number(atributo_id));
  }
  if (atributosElegidos.size !== atributosProducto.length || atributosElegidos.size !== valores.length) {
    return 'Elegí un valor para cada atributo del producto.';
  }
  return null;
}

// No hay forma declarativa en SQLite de garantizar "sin combinación
// repetida" (es un unique sobre un conjunto de filas, no sobre una
// columna), así que se valida acá antes de insertar.
function combinacionYaExiste(productoId, valores, excluirVarianteId = null) {
  const valorIds = valores.map((v) => Number(v.valor_id)).sort((a, b) => a - b);
  const variantesActivas = excluirVarianteId
    ? db.prepare('SELECT id FROM producto_variantes WHERE producto_id = ? AND activo = 1 AND id <> ?').all(productoId, excluirVarianteId)
    : db.prepare('SELECT id FROM producto_variantes WHERE producto_id = ? AND activo = 1').all(productoId);
  for (const variante of variantesActivas) {
    const otrosValorIds = db
      .prepare('SELECT valor_id FROM producto_variante_valores WHERE variante_id = ?')
      .all(variante.id)
      .map((v) => v.valor_id)
      .sort((a, b) => a - b);
    if (otrosValorIds.length === valorIds.length && otrosValorIds.every((id, i) => id === valorIds[i])) {
      return true;
    }
  }
  return false;
}

app.get('/api/productos/:id/variantes', (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const variantes = db
    .prepare(`${SELECT_VARIANTE} WHERE producto_variantes.producto_id = ? ORDER BY producto_variantes.id`)
    .all(productoId);
  const precios = obtenerPreciosPorVariante(productoId);
  res.json(variantes.map((v) => decorarVariante(v, precios[v.id])));
});

app.post('/api/productos/:id/variantes', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const producto = db
    .prepare('SELECT id, nombre FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const { valores, sku, precio_venta, activo } = req.body;
  const errorCombinacion = validarCombinacionVariante(productoId, valores);
  if (errorCombinacion) {
    return res.status(400).json({ error: errorCombinacion });
  }
  if (combinacionYaExiste(productoId, valores)) {
    return res.status(400).json({ error: 'Ya existe una variante con esa combinación de valores.' });
  }
  const skuNormalizado = sku && String(sku).trim() ? String(sku).trim() : null;
  const precioVentaNormalizado =
    precio_venta === undefined || precio_venta === null || precio_venta === '' ? null : Number(precio_venta);
  if (precioVentaNormalizado !== null && (Number.isNaN(precioVentaNormalizado) || precioVentaNormalizado < 0)) {
    return res.status(400).json({ error: 'El precio de venta debe ser un número mayor o igual a 0.' });
  }

  let lastInsertRowid;
  try {
    withTransaction(() => {
      ({ lastInsertRowid } = db
        .prepare(
          'INSERT INTO producto_variantes (producto_id, sku, precio_venta, activo, organizacion_id) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          productoId,
          skuNormalizado,
          precioVentaNormalizado,
          activo === false || activo === 0 ? 0 : 1,
          req.usuario.organizacion_id
        ));
      const insertValor = db.prepare(
        'INSERT INTO producto_variante_valores (variante_id, atributo_id, valor_id) VALUES (?, ?, ?)'
      );
      for (const { atributo_id, valor_id } of valores) {
        insertValor.run(lastInsertRowid, Number(atributo_id), Number(valor_id));
      }
      auditar(req, {
        accion: 'crear',
        entidad: 'producto',
        entidad_id: productoId,
        detalle: `Variante "${combinacionVariante(lastInsertRowid)}" agregada a "${producto.nombre}"`
      });
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe una variante con ese SKU.' });
    }
    throw err;
  }
  res.status(201).json({ id: lastInsertRowid });
});

// La combinación de valores de una variante no se edita después de creada
// (evitaría corromper el significado de variante_id en movimientos ya
// generados); para corregir un error se desactiva y se crea una nueva. Acá
// solo se editan sku, precio_venta, activo y el precio por lista.
app.patch('/api/productos/:id/variantes/:varianteId', soloAdmin, (req, res) => {
  const productoId = Number(req.params.id);
  const varianteId = Number(req.params.varianteId);
  const producto = db
    .prepare('SELECT id FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(productoId, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(404).json({ error: 'Producto no encontrado.' });
  }
  const variante = db.prepare('SELECT * FROM producto_variantes WHERE id = ? AND producto_id = ?').get(varianteId, productoId);
  if (!variante) {
    return res.status(404).json({ error: 'Variante no encontrada.' });
  }
  const { sku, precio_venta, activo, precios } = req.body;
  const skuNormalizado = sku === undefined ? variante.sku : sku && String(sku).trim() ? String(sku).trim() : null;
  let precioVentaNormalizado = variante.precio_venta;
  if (precio_venta !== undefined) {
    precioVentaNormalizado = precio_venta === null || precio_venta === '' ? null : Number(precio_venta);
    if (precioVentaNormalizado !== null && (Number.isNaN(precioVentaNormalizado) || precioVentaNormalizado < 0)) {
      return res.status(400).json({ error: 'El precio de venta debe ser un número mayor o igual a 0.' });
    }
  }
  const activoNormalizado = activo === undefined ? variante.activo : activo === false || activo === 0 ? 0 : 1;

  let preciosPorLista = null;
  if (precios && typeof precios === 'object') {
    preciosPorLista = {};
    for (const [listaIdStr, valor] of Object.entries(precios)) {
      const listaId = Number(listaIdStr);
      if (!listaPrecioValida(listaId, req.usuario.organizacion_id)) {
        return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
      }
      const precioNuevo = normalizarPrecio(valor);
      if (Number.isNaN(precioNuevo) || precioNuevo < 0) {
        return res.status(400).json({ error: 'El precio debe ser un número mayor o igual a 0.' });
      }
      preciosPorLista[listaId] = precioNuevo;
    }
  }

  const nuevo = { sku: skuNormalizado, precio_venta: precioVentaNormalizado, activo: activoNormalizado };
  const cambios = diffCampos(variante, nuevo, ['sku', 'precio_venta', 'activo']);

  try {
    withTransaction(() => {
      db.prepare('UPDATE producto_variantes SET sku = ?, precio_venta = ?, activo = ? WHERE id = ?').run(
        nuevo.sku,
        nuevo.precio_venta,
        nuevo.activo,
        varianteId
      );
      if (preciosPorLista) {
        const upsertPrecio = db.prepare(`
          INSERT INTO variante_precios (variante_id, lista_precio_id, precio)
          VALUES (?, ?, ?)
          ON CONFLICT(variante_id, lista_precio_id) DO UPDATE SET precio = excluded.precio
        `);
        for (const [listaId, precio] of Object.entries(preciosPorLista)) {
          upsertPrecio.run(varianteId, Number(listaId), precio);
        }
      }
      if (cambios) {
        auditar(req, {
          accion: 'editar',
          entidad: 'producto',
          entidad_id: productoId,
          valor_anterior: cambios.anterior,
          valor_nuevo: cambios.nuevo,
          detalle: `Variante "${combinacionVariante(varianteId)}" editada`
        });
      }
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Ya existe una variante con ese SKU.' });
    }
    throw err;
  }
  res.json({ id: varianteId });
});

// Espejo de GET /api/productos/:id/movimientos (1535), filtrado por variante.
app.get('/api/productos/:id/variantes/:varianteId/movimientos', (req, res) => {
  const productoId = Number(req.params.id);
  const varianteId = Number(req.params.varianteId);
  const variante = db
    .prepare(
      `SELECT producto_variantes.id
         FROM producto_variantes
         JOIN productos ON productos.id = producto_variantes.producto_id
        WHERE producto_variantes.id = ? AND producto_variantes.producto_id = ?
          AND productos.organizacion_id = ?`
    )
    .get(varianteId, productoId, req.usuario.organizacion_id);
  if (!variante) {
    return res.status(404).json({ error: 'Variante no encontrada.' });
  }

  const movimientos = db
    .prepare(
      `SELECT id, tipo, cantidad, origen, venta_id, compra_id, devolucion_id, fecha, nota
         FROM movimientos_stock
        WHERE variante_id = ?
        ORDER BY fecha, id`
    )
    .all(varianteId);

  let acumulado = 0;
  const conSaldo = movimientos.map((m) => {
    const delta = m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    const stockAnterior = acumulado;
    acumulado += delta;
    return { ...m, delta, stock_anterior: stockAnterior, stock_posterior: acumulado };
  });

  res.json(conSaldo.reverse());
});

/* ---------- Proveedores ---------- */

// Espejo de SELECT_CLIENTE_CON_TOTALES. Igual que aquel ignora las ventas
// anuladas, este ignora las compras que no están activas: un borrador
// todavía no es plata comprometida y una anulada ya se revirtió.
// El total comprado suma el envío, porque es lo que realmente se le pagó
// al proveedor, no solo la mercadería.
const SELECT_PROVEEDOR_CON_TOTALES = `
  SELECT proveedores.*,
         (SELECT COALESCE(SUM(compra_items.cantidad * compra_items.precio_unitario), 0)
            FROM compras JOIN compra_items ON compra_items.compra_id = compras.id
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa')
         + (SELECT COALESCE(SUM(costo_envio), 0) FROM compras
             WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS total_comprado,
         (SELECT COUNT(*) FROM compras
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS cantidad_compras,
         (SELECT MAX(fecha) FROM compras
           WHERE compras.proveedor_id = proveedores.id AND compras.estado = 'activa') AS ultima_compra,
         COALESCE((SELECT saldo FROM saldo_cc_proveedores
                    WHERE saldo_cc_proveedores.proveedor_id = proveedores.id), 0) AS deuda
    FROM proveedores`;

// Filtro por organizacion_id (CLAUDE.md §28), mismo patrón que clientes.
app.get('/api/proveedores', (req, res) => {
  const proveedores = db
    .prepare(`${SELECT_PROVEEDOR_CON_TOTALES} WHERE proveedores.organizacion_id = ? ORDER BY proveedores.nombre`)
    .all(req.usuario.organizacion_id);
  res.json(proveedores);
});

app.get('/api/proveedores/:id', (req, res) => {
  const proveedorId = Number(req.params.id);
  const proveedor = db
    .prepare(`${SELECT_PROVEEDOR_CON_TOTALES} WHERE proveedores.id = ? AND proveedores.organizacion_id = ?`)
    .get(proveedorId, req.usuario.organizacion_id);
  if (!proveedor) {
    return res.status(404).json({ error: 'Proveedor no encontrado.' });
  }

  const historial = db
    .prepare(
      `SELECT compras.id, compras.fecha, compras.estado, compras.estado_envio,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM compra_items WHERE compra_items.compra_id = compras.id) + compras.costo_envio AS total,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado
         FROM compras WHERE compras.proveedor_id = ?
        ORDER BY compras.fecha DESC, compras.id DESC`
    )
    .all(proveedorId);

  const pagos = db
    .prepare(
      `SELECT pagos.id, pagos.fecha, pagos.importe, pagos.compra_id, pagos.nota,
              cuentas_tesoreria.nombre AS cuenta
         FROM pagos
         JOIN compras ON compras.id = pagos.compra_id
         JOIN cuentas_tesoreria ON cuentas_tesoreria.id = pagos.cuenta_tesoreria_id
        WHERE compras.proveedor_id = ?
        ORDER BY pagos.fecha DESC, pagos.id DESC`
    )
    .all(proveedorId);

  res.json({
    ...proveedor,
    historial: historial.map((c) => ({
      ...c,
      estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= c.total ? 'pagado' : 'parcial'
    })),
    pagos
  });
});

app.post('/api/proveedores', (req, res) => {
  const { nombre, email, telefono, direccion, documento, notas, condicion_pago } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El proveedor necesita un nombre.' });
  }
  const condicionPagoHabitual = normalizarCondicionPagoHabitual(condicion_pago);
  if (!condicionPagoHabitualValida(condicionPagoHabitual)) {
    return res.status(400).json({ error: 'La condición de pago seleccionada no es válida.' });
  }

  // Con auditoría, igual que el alta de clientes (CLAUDE.md §22).
  const proveedorNuevoId = withTransaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO proveedores (nombre, email, telefono, direccion, documento, notas, condicion_pago, organizacion_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(nombre).trim(),
        email ?? null,
        telefono ?? null,
        direccion ?? null,
        documento ?? null,
        notas ?? null,
        condicionPagoHabitual,
        req.usuario.organizacion_id
      );
    auditar(req, {
      accion: 'crear',
      entidad: 'proveedor',
      entidad_id: Number(lastInsertRowid),
      detalle: `Proveedor "${String(nombre).trim()}" creado`
    });
    return Number(lastInsertRowid);
  });
  res.status(201).json({ id: proveedorNuevoId });
});

app.patch('/api/proveedores/:id', (req, res) => {
  const proveedorId = Number(req.params.id);
  const { nombre, email, telefono, direccion, documento, notas, condicion_pago } = req.body;

  const proveedor = db
    .prepare('SELECT * FROM proveedores WHERE id = ? AND organizacion_id = ?')
    .get(proveedorId, req.usuario.organizacion_id);
  if (!proveedor) {
    return res.status(404).json({ error: 'Proveedor no encontrado.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El proveedor necesita un nombre.' });
  }
  const condicionPagoHabitual = normalizarCondicionPagoHabitual(condicion_pago);
  if (!condicionPagoHabitualValida(condicionPagoHabitual)) {
    return res.status(400).json({ error: 'La condición de pago seleccionada no es válida.' });
  }

  const nuevo = {
    nombre: String(nombre).trim(),
    email: email ?? null,
    telefono: telefono ?? null,
    direccion: direccion ?? null,
    documento: documento ?? null,
    notas: notas ?? null,
    condicion_pago: condicionPagoHabitual
  };
  const cambios = diffCampos(proveedor, nuevo, [
    'nombre',
    'email',
    'telefono',
    'direccion',
    'documento',
    'notas',
    'condicion_pago'
  ]);

  withTransaction(() => {
    db.prepare(
      `UPDATE proveedores
          SET nombre = ?, email = ?, telefono = ?, direccion = ?, documento = ?, notas = ?, condicion_pago = ?
        WHERE id = ?`
    ).run(
      nuevo.nombre,
      nuevo.email,
      nuevo.telefono,
      nuevo.direccion,
      nuevo.documento,
      nuevo.notas,
      nuevo.condicion_pago,
      proveedorId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'proveedor',
        entidad_id: proveedorId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Proveedor "${nuevo.nombre}" editado`
      });
    }
  });
  res.json({ id: proveedorId });
});

/* ---------- Stock ---------- */

// Punto único de inserción a movimientos_stock (CLAUDE.md §5/§19): antes
// de esta etapa cada operación armaba su propio INSERT literal (14 sitios
// distintos), lo que hacía fácil olvidarse de una columna nueva en alguno.
// Con deposito_id sumándose al ledger, centralizar acá es lo que garantiza
// que ningún movimiento pueda insertarse sin saber de qué depósito es.
// Recibe siempre deposito_id explícito (nunca lo resuelve solo): quien
// llama ya tiene que haber decidido "el predeterminado" o uno puntual
// antes de esto, para que la decisión quede en un solo lugar por operación
// y no repetida acá adentro.
// Un servicio no maneja stock (CLAUDE.md §4): no se valida ni se mueve.
function esServicio(productoId) {
  return db.prepare("SELECT 1 FROM productos WHERE id = ? AND tipo = 'servicio'").get(productoId) !== undefined;
}

const errorServicioSinStock = (nombre) => `"${nombre}" es un servicio: no maneja stock.`;

function registrarMovimientoStock({
  producto_id,
  variante_id = null,
  deposito_id,
  tipo,
  cantidad,
  origen,
  venta_id = null,
  compra_id = null,
  devolucion_id = null,
  devolucion_proveedor_id = null,
  transferencia_id = null,
  costo_unitario = null,
  nota = null,
  organizacion_id
}) {
  // Es el único punto que escribe stock, así que cortar acá cubre venta,
  // edición, anulación y devolución de un servicio sin tocar cada una.
  if (esServicio(producto_id)) return { changes: 0, lastInsertRowid: null };
  return db
    .prepare(
      `INSERT INTO movimientos_stock
         (producto_id, variante_id, deposito_id, tipo, cantidad, origen, venta_id, compra_id,
          devolucion_id, devolucion_proveedor_id, transferencia_id, costo_unitario, nota, organizacion_id, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${HOY_SQL})`
    )
    .run(
      producto_id,
      variante_id,
      deposito_id,
      tipo,
      cantidad,
      origen,
      venta_id,
      compra_id,
      devolucion_id,
      devolucion_proveedor_id,
      transferencia_id,
      costo_unitario,
      nota,
      organizacion_id
    );
}

// Stock no devuelve precio_venta a propósito: esta pantalla es sobre
// cuánta mercadería hay y cuánto vale, no sobre a cuánto se vende (eso
// vive en Productos).
// Una fila por producto Y depósito (CLAUDE.md §19), más el total del
// producto (stock/valorizado/estado_stock siguen siendo sobre el total:
// CLAUDE.md §5 mantiene el mínimo/máximo global, no por depósito) — así la
// tabla puede mostrar el desglose sin perder el semáforo de siempre.
app.get('/api/stock', (req, res) => {
  const productos = db
    .prepare(
      `SELECT productos.id, productos.nombre, productos.precio_costo, productos.unidad,
              productos.stock_minimo, productos.stock_maximo,
              COALESCE(stock_actual.cantidad, 0) AS stock_total,
              sv.stock_variantes, sv.valorizado_variantes
       FROM productos
       LEFT JOIN stock_actual ON stock_actual.producto_id = productos.id${JOIN_STOCK_VARIANTES}
       WHERE productos.organizacion_id = ? AND productos.tipo = 'producto'
       ORDER BY productos.nombre`
    )
    .all(req.usuario.organizacion_id)
    // Mismo valorizado y mismo costo que GET /api/productos (decorarProducto).
    .map(({ stock_variantes, valorizado_variantes, ...p }) => {
      const valorizado = valorizadoProducto(p.precio_costo, p.stock_total, stock_variantes, valorizado_variantes);
      return {
        ...p,
        precio_costo: stock_variantes && p.stock_total > 0 ? valorizado / p.stock_total : p.precio_costo,
        valorizado
      };
    });
  // stock_por_deposito no tiene organizacion_id propia (se agrupa por
  // producto_id, que ya está filtrado arriba): acotarla a los productos de
  // esta organización evita traer filas de depósitos de otra empresa.
  const idsProductos = productos.map((p) => p.id);
  const porDeposito = idsProductos.length === 0
    ? []
    : db
        .prepare(
          `SELECT stock_por_deposito.producto_id, stock_por_deposito.deposito_id,
                  depositos.nombre AS deposito, stock_por_deposito.cantidad AS stock
             FROM stock_por_deposito
             JOIN depositos ON depositos.id = stock_por_deposito.deposito_id
            WHERE depositos.activo = 1 AND stock_por_deposito.producto_id IN (${idsProductos.map(() => '?').join(',')})`
        )
        .all(...idsProductos);
  const filasPorProducto = new Map();
  for (const fila of porDeposito) {
    if (!filasPorProducto.has(fila.producto_id)) filasPorProducto.set(fila.producto_id, []);
    filasPorProducto.get(fila.producto_id).push(fila);
  }

  const resultado = [];
  for (const p of productos) {
    const estado_stock = estadoStock(p.stock_total, p.stock_minimo, p.stock_maximo);
    const filas = filasPorProducto.get(p.id) ?? [];
    if (filas.length === 0) {
      // Producto sin ningún movimiento todavía en ningún depósito activo:
      // igual tiene que aparecer (en 0), para no esconderlo de la pantalla.
      resultado.push({
        producto_id: p.id,
        nombre: p.nombre,
        unidad: p.unidad,
        precio_costo: p.precio_costo,
        stock_minimo: p.stock_minimo,
        stock_maximo: p.stock_maximo,
        deposito_id: null,
        deposito: null,
        stock: 0,
        stock_total: p.stock_total,
        valorizado: p.valorizado,
        estado_stock
      });
      continue;
    }
    for (const fila of filas) {
      resultado.push({
        producto_id: p.id,
        nombre: p.nombre,
        unidad: p.unidad,
        precio_costo: p.precio_costo,
        stock_minimo: p.stock_minimo,
        stock_maximo: p.stock_maximo,
        deposito_id: fila.deposito_id,
        deposito: fila.deposito,
        stock: fila.stock,
        stock_total: p.stock_total,
        valorizado: p.valorizado,
        estado_stock
      });
    }
  }
  res.json(resultado);
});

app.post('/api/stock/ajuste', soloAdmin, (req, res) => {
  const { producto_id, deposito_id, cantidad, nota } = req.body;

  const producto = db
    .prepare('SELECT id, nombre, tipo FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(producto_id, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(400).json({ error: 'El producto no existe.' });
  }
  if (producto.tipo === 'servicio') {
    return res.status(400).json({ error: errorServicioSinStock(producto.nombre) });
  }
  if (!Number(cantidad) || Number(cantidad) === 0) {
    return res.status(400).json({ error: 'La cantidad del ajuste no puede ser 0.' });
  }
  const depositoIdResuelto = deposito_id ? Number(deposito_id) : depositoPredeterminadoId(req.usuario.organizacion_id);
  const deposito = db
    .prepare('SELECT id, nombre FROM depositos WHERE id = ? AND activo = 1 AND organizacion_id = ?')
    .get(depositoIdResuelto, req.usuario.organizacion_id);
  if (!deposito) {
    return res.status(400).json({ error: 'El depósito no existe o está inactivo.' });
  }

  // El ejemplo literal de CLAUDE.md §22 ("de 20 a 15"): hace falta el
  // stock ANTES del ajuste, que movimientos_stock por sí solo no guarda
  // (solo guarda el delta) — se lee acá, antes de insertar el movimiento.
  // Es el stock de ESE depósito puntual, no el total del producto: es lo
  // que el ajuste está corrigiendo.
  const stockAnterior = db
    .prepare('SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?')
    .get(producto_id, depositoIdResuelto)?.cantidad ?? 0;
  const stockNuevo = stockAnterior + Number(cantidad);

  let lastInsertRowid;
  withTransaction(() => {
    ({ lastInsertRowid } = registrarMovimientoStock({
      producto_id: Number(producto_id),
      deposito_id: depositoIdResuelto,
      tipo: 'ajuste',
      cantidad: Number(cantidad),
      origen: 'ajuste_manual',
      nota: nota ?? null,
      organizacion_id: req.usuario.organizacion_id
    }));
    auditar(req, {
      accion: 'editar',
      entidad: 'stock',
      entidad_id: Number(producto_id),
      valor_anterior: JSON.stringify({ stock: stockAnterior, deposito: deposito.nombre }),
      valor_nuevo: JSON.stringify({ stock: stockNuevo, deposito: deposito.nombre }),
      detalle: `Ajuste de stock de "${producto.nombre}" en "${deposito.nombre}": ${stockAnterior} → ${stockNuevo}`
    });
  });
  res.status(201).json({ id: lastInsertRowid });
});

// Historial general de movimientos de stock, de todos los productos. La
// misma info que ya existe por producto (GET /api/productos/:id/movimientos)
// pero sin filtrar, para verla toda junta desde la página de Stock.
// El filtrado lo hace el navegador con el mismo motor que el resto de las
// pantallas: los operadores (contiene, mayor que, entre, períodos
// relativos…) serían mucho SQL y, sobre todo, tener dos motores haría que
// el mismo filtro se comporte distinto según la pantalla.
// Para que filtrar en memoria no mienta, el tope se sube a algo que cubre
// la operación real de una PyME. Si algún día una base supera las 2000
// filas de movimientos, hay que volver a bajar el filtrado al servidor.
const TOPE_MOVIMIENTOS = 2000;

// `?limit=` de los listados con tope. Antes era `Number(x) || 2000` con
// Math.min: un `-1` pasaba tal cual y SQLite lo interpreta como "sin límite".
function limiteDeConsulta(valor) {
  const n = Math.floor(Number(valor));
  return n >= 1 ? Math.min(n, 5000) : TOPE_MOVIMIENTOS;
}

app.get('/api/movimientos-stock', (req, res) => {
  const limite = limiteDeConsulta(req.query.limit);
  const movimientos = db
    .prepare(
      `SELECT movimientos_stock.id, movimientos_stock.fecha, movimientos_stock.tipo,
              movimientos_stock.cantidad, movimientos_stock.origen, movimientos_stock.nota,
              movimientos_stock.venta_id, movimientos_stock.compra_id, movimientos_stock.devolucion_id,
              movimientos_stock.devolucion_proveedor_id, movimientos_stock.transferencia_id,
              movimientos_stock.producto_id, movimientos_stock.deposito_id,
              productos.nombre AS producto, depositos.nombre AS deposito
         FROM movimientos_stock
         JOIN productos ON productos.id = movimientos_stock.producto_id
         LEFT JOIN depositos ON depositos.id = movimientos_stock.deposito_id
        WHERE movimientos_stock.organizacion_id = ?
        ORDER BY movimientos_stock.fecha DESC, movimientos_stock.id DESC
        LIMIT ?`
    )
    .all(req.usuario.organizacion_id, limite);
  res.json(movimientos);
});

/* ---------- Transferencias entre depósitos (CLAUDE.md §19) ---------- */
//
// Una transferencia mueve mercadería entre dos depósitos y se modela como
// operación propia (no como dos ajustes sueltos) para que sea auditable y
// anulable como cualquier otra: genera exactamente dos movimientos de
// stock (salida en origen + entrada en destino) que la referencian por
// transferencia_id. Nexo NO transfiere solo desde ningún otro endpoint
// (una venta sin stock en su depósito se rechaza, no se resuelve moviendo
// mercadería sin que nadie la haya movido físicamente) — esta es la única
// vía por la que el stock cambia de depósito.

app.get('/api/transferencias', (req, res) => {
  const transferencias = db
    .prepare(
      `SELECT transferencias.id, transferencias.fecha, transferencias.estado, transferencias.nota,
              transferencias.deposito_origen_id, origen.nombre AS deposito_origen,
              transferencias.deposito_destino_id, destino.nombre AS deposito_destino,
              mov.producto_id, productos.nombre AS producto, mov.cantidad
         FROM transferencias
         JOIN depositos AS origen ON origen.id = transferencias.deposito_origen_id
         JOIN depositos AS destino ON destino.id = transferencias.deposito_destino_id
         -- Solo el movimiento ORIGINAL de la transferencia (el primero, por
         -- id): anular agrega un segundo movimiento 'salida' de reversión
         -- (la entrada original se revierte con una salida), así que sin
         -- este MIN() una transferencia anulada aparecería dos veces.
         JOIN movimientos_stock AS mov ON mov.id = (
           SELECT MIN(id) FROM movimientos_stock
            WHERE transferencia_id = transferencias.id AND tipo = 'salida'
         )
         JOIN productos ON productos.id = mov.producto_id
        WHERE transferencias.organizacion_id = ?
        ORDER BY transferencias.fecha DESC, transferencias.id DESC`
    )
    .all(req.usuario.organizacion_id);
  res.json(transferencias);
});

app.post('/api/transferencias', (req, res) => {
  const { deposito_origen_id, deposito_destino_id, producto_id, cantidad, nota } = req.body;

  if (!deposito_origen_id || !deposito_destino_id) {
    return res.status(400).json({ error: 'Elegí depósito de origen y de destino.' });
  }
  if (Number(deposito_origen_id) === Number(deposito_destino_id)) {
    return res.status(400).json({ error: 'El depósito de origen y de destino no pueden ser el mismo.' });
  }
  const origen = db
    .prepare('SELECT id, nombre FROM depositos WHERE id = ? AND activo = 1 AND organizacion_id = ?')
    .get(deposito_origen_id, req.usuario.organizacion_id);
  if (!origen) {
    return res.status(400).json({ error: 'El depósito de origen no existe o está inactivo.' });
  }
  const destino = db
    .prepare('SELECT id, nombre FROM depositos WHERE id = ? AND activo = 1 AND organizacion_id = ?')
    .get(deposito_destino_id, req.usuario.organizacion_id);
  if (!destino) {
    return res.status(400).json({ error: 'El depósito de destino no existe o está inactivo.' });
  }
  const producto = db
    .prepare('SELECT id, nombre, tipo FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(producto_id, req.usuario.organizacion_id);
  if (!producto) {
    return res.status(400).json({ error: 'El producto no existe.' });
  }
  if (producto.tipo === 'servicio') {
    return res.status(400).json({ error: errorServicioSinStock(producto.nombre) });
  }
  if (!Number(cantidad) || Number(cantidad) <= 0) {
    return res.status(400).json({ error: 'La cantidad a transferir tiene que ser mayor a 0.' });
  }
  const stockOrigen = db
    .prepare('SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?')
    .get(producto_id, deposito_origen_id)?.cantidad ?? 0;
  if (Number(cantidad) > stockOrigen) {
    return res.status(400).json({
      error: `No hay suficiente stock de "${producto.nombre}" en "${origen.nombre}" (disponible: ${stockOrigen}).`
    });
  }

  let lastInsertRowid;
  withTransaction(() => {
    ({ lastInsertRowid } = db
      .prepare(
        `INSERT INTO transferencias (deposito_origen_id, deposito_destino_id, nota, organizacion_id, fecha) VALUES (?, ?, ?, ?, ${HOY_SQL})`
      )
      .run(Number(deposito_origen_id), Number(deposito_destino_id), nota ?? null, req.usuario.organizacion_id));
    registrarMovimientoStock({
      producto_id: Number(producto_id),
      deposito_id: Number(deposito_origen_id),
      tipo: 'salida',
      cantidad: Number(cantidad),
      origen: 'transferencia',
      transferencia_id: lastInsertRowid,
      organizacion_id: req.usuario.organizacion_id
    });
    registrarMovimientoStock({
      producto_id: Number(producto_id),
      deposito_id: Number(deposito_destino_id),
      tipo: 'entrada',
      cantidad: Number(cantidad),
      origen: 'transferencia',
      transferencia_id: lastInsertRowid,
      organizacion_id: req.usuario.organizacion_id
    });
    auditar(req, {
      accion: 'crear',
      entidad: 'transferencia',
      entidad_id: lastInsertRowid,
      detalle: `Transferencia de ${cantidad} "${producto.nombre}" de "${origen.nombre}" a "${destino.nombre}"`
    });
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.post('/api/transferencias/:id/anular', soloAdmin, (req, res) => {
  const transferenciaId = Number(req.params.id);
  const transferencia = db
    .prepare('SELECT * FROM transferencias WHERE id = ? AND organizacion_id = ?')
    .get(transferenciaId, req.usuario.organizacion_id);
  if (!transferencia) {
    return res.status(404).json({ error: 'Transferencia no encontrada.' });
  }
  if (transferencia.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta transferencia ya está anulada.' });
  }

  const movimientos = db
    .prepare('SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_stock WHERE transferencia_id = ?')
    .all(transferenciaId);

  withTransaction(() => {
    // Revierte con el par contrario, nunca borra filas — mismo criterio
    // que revertirDevolucion: la salida original se revierte con una
    // entrada en ese mismo depósito, y viceversa.
    for (const mov of movimientos) {
      registrarMovimientoStock({
        producto_id: mov.producto_id,
        deposito_id: mov.deposito_id,
        tipo: mov.tipo === 'salida' ? 'entrada' : 'salida',
        cantidad: mov.cantidad,
        origen: 'transferencia',
        transferencia_id: transferenciaId,
        nota: 'Reversión por anulación',
        organizacion_id: transferencia.organizacion_id
      });
    }
    db.prepare("UPDATE transferencias SET estado = 'anulada' WHERE id = ?").run(transferenciaId);
    auditar(req, {
      accion: 'anular',
      entidad: 'transferencia',
      entidad_id: transferenciaId,
      detalle: `Transferencia #${transferenciaId} anulada`
    });
  });
  res.json({ id: transferenciaId });
});

/* ---------- Ventas ---------- */

// devuelto: plata acreditada por devoluciones activas de esta venta (ver
// sección Devoluciones más abajo). neto = total - devuelto, y es lo que
// realmente se le puede reclamar al cliente — el estado_cobro compara
// contra neto, no contra total, para no seguir pidiendo plata por
// mercadería que ya volvió.
const SUBQUERY_DEVUELTO_VENTA = `
  (SELECT COALESCE(SUM(devolucion_items.cantidad * devolucion_items.precio_unitario), 0)
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
     JOIN venta_items ON venta_items.id = devolucion_items.venta_item_id
    WHERE venta_items.venta_id = ventas.id AND devoluciones.estado = 'activa')`;

app.get('/api/ventas', (req, res) => {
  const ventas = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id, clientes.nombre AS cliente, ventas.fecha, ventas.estado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM((precio_unitario - costo_unitario_historico) * cantidad), 0)
                 FROM venta_items WHERE venta_items.venta_id = ventas.id) AS margen,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado,
              ${SUBQUERY_DEVUELTO_VENTA} AS devuelto,
              (SELECT GROUP_CONCAT(
                        (CASE WHEN venta_items.cantidad = CAST(venta_items.cantidad AS INTEGER)
                              THEN CAST(venta_items.cantidad AS INTEGER)
                              ELSE venta_items.cantidad END) || ' × ' || productos.nombre, ', ')
                 FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
                WHERE venta_items.venta_id = ventas.id) AS items_resumen,
              EXISTS (SELECT 1 FROM facturas WHERE facturas.venta_id = ventas.id) AS facturada,
              EXISTS (SELECT 1 FROM devoluciones
                       WHERE devoluciones.venta_id = ventas.id AND devoluciones.estado = 'activa') AS tiene_devolucion
       FROM ventas
       JOIN clientes ON clientes.id = ventas.cliente_id
       WHERE ventas.organizacion_id = ?
       ORDER BY ventas.id DESC`
    )
    .all(req.usuario.organizacion_id);
  res.json(
    ventas.map((v) => {
      const neto = v.total - v.devuelto;
      return {
        ...v,
        costo_total: v.total - v.margen,
        facturada: Boolean(v.facturada),
        tiene_devolucion: Boolean(v.tiene_devolucion),
        neto,
        estado_cobro: v.cobrado <= 0 ? 'pendiente' : v.cobrado >= neto ? 'cobrado' : 'parcial'
      };
    })
  );
});

app.get('/api/ventas/:id', (req, res) => {
  const ventaId = Number(req.params.id);
  const venta = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id, clientes.nombre AS cliente, ventas.fecha, ventas.estado,
              ventas.lista_precio_id, ventas.deposito_id, depositos.nombre AS deposito,
              ventas.condicion_pago, ventas.fecha_vencimiento,
              EXISTS (SELECT 1 FROM devoluciones
                       WHERE devoluciones.venta_id = ventas.id AND devoluciones.estado = 'activa') AS tiene_devolucion
         FROM ventas
         JOIN clientes ON clientes.id = ventas.cliente_id
         LEFT JOIN depositos ON depositos.id = ventas.deposito_id
        WHERE ventas.id = ? AND ventas.organizacion_id = ?`
    )
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  // cantidad_devuelta: cuánto de este renglón ya se devolvió (solo cuenta
  // devoluciones activas). Es lo que alimenta el modal de devolución para
  // topar la cantidad a devolver a lo que realmente queda.
  const items = db
    .prepare(
      `SELECT venta_items.id, venta_items.producto_id, venta_items.variante_id, productos.nombre AS producto,
              venta_items.cantidad, venta_items.precio_unitario, venta_items.costo_unitario_historico,
              COALESCE((
                SELECT SUM(devolucion_items.cantidad)
                  FROM devolucion_items JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
                 WHERE devolucion_items.venta_item_id = venta_items.id AND devoluciones.estado = 'activa'
              ), 0) AS cantidad_devuelta
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_id = ?
        ORDER BY venta_items.id`
    )
    .all(ventaId);

  const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const costoTotal = items.reduce((acc, i) => acc + i.cantidad * i.costo_unitario_historico, 0);
  const devuelto = items.reduce((acc, i) => acc + i.cantidad_devuelta * i.precio_unitario, 0);
  const neto = total - devuelto;
  const { cobrado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS cobrado FROM cobros WHERE venta_id = ?')
    .get(ventaId);
  const facturada = Boolean(db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId));

  res.json({
    ...venta,
    tiene_devolucion: Boolean(venta.tiene_devolucion),
    items: items.map((i) => ({
      ...i,
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null,
      subtotal: i.cantidad * i.precio_unitario,
      ganancia: (i.precio_unitario - i.costo_unitario_historico) * i.cantidad,
      disponible_devolucion: i.cantidad - i.cantidad_devuelta
    })),
    total,
    costo_total: costoTotal,
    margen: total - costoTotal,
    devuelto,
    neto,
    cobrado,
    facturada,
    estado_cobro: cobrado <= 0 ? 'pendiente' : cobrado >= neto ? 'cobrado' : 'parcial'
  });
});

// Dónde más hay stock de un producto, para el mensaje de error de una
// venta que no puede completarse en el depósito elegido (CLAUDE.md §19,
// decisión del usuario: bloquear y avisar dónde sí hay, nunca transferir
// solo). Devuelve algo como "Depósito Central: 8" o "" si no hay en
// ningún otro lado.
function dondeHayStock(productoId, excluirDepositoId, varianteId = null) {
  const filas = varianteId
    ? db
        .prepare(
          `SELECT depositos.nombre, stock_variante_por_deposito.cantidad
             FROM stock_variante_por_deposito
             JOIN depositos ON depositos.id = stock_variante_por_deposito.deposito_id
            WHERE stock_variante_por_deposito.variante_id = ? AND stock_variante_por_deposito.deposito_id <> ?
              AND depositos.activo = 1 AND stock_variante_por_deposito.cantidad > 0
            ORDER BY stock_variante_por_deposito.cantidad DESC`
        )
        .all(varianteId, excluirDepositoId)
    : db
        .prepare(
          `SELECT depositos.nombre, stock_por_deposito.cantidad
             FROM stock_por_deposito
             JOIN depositos ON depositos.id = stock_por_deposito.deposito_id
            WHERE stock_por_deposito.producto_id = ? AND stock_por_deposito.deposito_id <> ?
              AND depositos.activo = 1 AND stock_por_deposito.cantidad > 0
            ORDER BY stock_por_deposito.cantidad DESC`
        )
        .all(productoId, excluirDepositoId);
  if (filas.length === 0) return '';
  return ` Hay stock en: ${filas.map((f) => `${f.nombre} (${f.cantidad})`).join(', ')}.`;
}

// Valida que haya stock para todos los items pedidos, EN EL DEPÓSITO
// ELEGIDO. Devuelve un mensaje de error o null si está todo bien. Se suman
// las cantidades por producto+variante primero, por si el mismo renglón
// aparece más de una vez. La usan el alta de venta y la conversión de un
// presupuesto: las dos tienen que rechazar por el mismo motivo y con el
// mismo texto.
//
// Igual que en compras: un producto con variantes activas exige que cada
// item traiga una variante puntual, y uno sin variantes rechaza si igual
// llegó una.
//
// El producto se busca dentro de la organización de la venta: sin ese
// filtro, un producto de otra empresa sin stock controlado entraba a la
// venta y exponía su nombre y su costo (venta_items.costo_unitario_historico).
// Forma de los renglones de una venta, ANTES de tocar nada. Sin esto, una
// cantidad 0 o negativa pasaba la validación de stock (`cantidad > stock` es
// falso) y registraba una "salida" que sumaba stock, y un precio negativo
// dejaba total y cuenta corriente en negativo. Un valor no numérico llegaba al
// INSERT y salía como 500. `Number.isFinite` además corta `1e999` (Infinity).
// Misma regla que ya aplicaban presupuestos, compras y el asistente.
//
// Solo se aceptan números JSON de verdad, no texto que `Number()` sabe leer: un
// "0x5" o "0b11" pasa `Number()` pero SQLite lo guarda como TEXT en la columna
// REAL (y un TEXT siempre es "mayor que" un número en el CHECK), con lo que la
// venta quedaba en total 0 con una deuda de por medio. El frontend siempre
// manda Number. El tope de 1e9 evita que dos valores finitos grandes se
// desborden al multiplicarse y dejen total, saldo y dashboard en null.
const LIMITE_NUMERICO = 1e9;
const esNumeroValido = (valor) =>
  typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= LIMITE_NUMERICO;
const esIdValido = (valor) => typeof valor === 'number' && Number.isInteger(valor) && valor > 0;

function validarItemsVenta(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'La venta necesita al menos un item.';
  }
  for (const item of items) {
    if (!esIdValido(item?.producto_id)) {
      return 'Todos los items necesitan un producto.';
    }
    if (item.variante_id != null && !esIdValido(item.variante_id)) {
      return 'La variante de un item no es válida.';
    }
    if (!esNumeroValido(item.cantidad) || !(Number(item.cantidad) > 0)) {
      return 'La cantidad de cada item debe ser un número mayor a 0.';
    }
    if (!esNumeroValido(item.precio_unitario) || !(Number(item.precio_unitario) >= 0)) {
      return 'El precio unitario de cada item debe ser un número, y no puede ser negativo.';
    }
  }
  return null;
}

function validarStockDisponible(items, depositoId, organizacionId) {
  const buscarProducto = db.prepare('SELECT nombre, tipo FROM productos WHERE id = ? AND organizacion_id = ?');
  const contarVariantesActivas = db.prepare(
    'SELECT COUNT(*) AS n FROM producto_variantes WHERE producto_id = ? AND activo = 1'
  );
  const buscarStockDisponible = db.prepare(
    `SELECT COALESCE(stock_por_deposito.cantidad, 0) AS stock
       FROM stock_por_deposito
      WHERE stock_por_deposito.producto_id = ? AND stock_por_deposito.deposito_id = ?`
  );
  const buscarVarianteStock = db.prepare(
    `SELECT producto_variantes.id,
            COALESCE(stock_variante_por_deposito.cantidad, 0) AS stock
       FROM producto_variantes
       LEFT JOIN stock_variante_por_deposito
         ON stock_variante_por_deposito.variante_id = producto_variantes.id
        AND stock_variante_por_deposito.deposito_id = ?
      WHERE producto_variantes.id = ? AND producto_variantes.producto_id = ? AND producto_variantes.activo = 1`
  );

  const cantidadPorClave = new Map();
  for (const item of items) {
    const clave = `${item.producto_id}:${item.variante_id ?? ''}`;
    cantidadPorClave.set(clave, {
      producto_id: item.producto_id,
      variante_id: item.variante_id ?? null,
      cantidad: (cantidadPorClave.get(clave)?.cantidad ?? 0) + Number(item.cantidad)
    });
  }

  for (const { producto_id, variante_id, cantidad: cantidadPedida } of cantidadPorClave.values()) {
    const producto = buscarProducto.get(producto_id, organizacionId);
    if (!producto) {
      return 'Uno de los productos de la venta no existe.';
    }
    const tieneVariantes = contarVariantesActivas.get(producto_id).n > 0;
    if (!variante_id && tieneVariantes) {
      return `"${producto.nombre}" tiene variantes: elegí una para vender.`;
    }
    if (producto.tipo === 'servicio') continue;
    if (variante_id) {
      const variante = buscarVarianteStock.get(depositoId, variante_id, producto_id);
      if (!variante) {
        return `La variante elegida para "${producto.nombre}" no existe o no le pertenece.`;
      }
      if (cantidadPedida > variante.stock) {
        return `No hay suficiente stock de "${producto.nombre}" (${combinacionVariante(variante_id)}) (disponible: ${variante.stock}).${dondeHayStock(producto_id, depositoId, variante_id)}`;
      }
    } else {
      const stock = buscarStockDisponible.get(producto_id, depositoId)?.stock ?? 0;
      if (cantidadPedida > stock) {
        return `No hay suficiente stock de "${producto.nombre}" (disponible: ${stock}).${dondeHayStock(producto_id, depositoId)}`;
      }
    }
  }
  return null;
}

// Crea la venta con todos sus efectos: items, salida de stock, costo
// histórico congelado y deuda en la cuenta corriente.
// IMPORTANTE: asume que el stock ya se validó y que se la llama DENTRO de
// una transacción — así la conversión de un presupuesto puede meter en la
// misma transacción la venta y la marca del presupuesto, sin que quede
// una venta creada con el presupuesto sin convertir.
function crearVenta({
  cliente,
  cliente_id,
  items,
  fecha,
  lista_precio_id,
  deposito_id,
  condicion_pago,
  fecha_vencimiento,
  organizacion_id
}) {
  // Resuelve el cliente igual que resolverCliente (presupuestos): id
  // directo si ya se eligió de la lista, si no por nombre, creándolo si no
  // existe. organizacion_id es obligatorio (CLAUDE.md §28): un cliente
  // resuelto o creado acá queda siempre en la organización de quien vende.
  const clienteRow = resolverCliente(cliente, cliente_id, organizacion_id);

  // lista_precio_id es NULLABLE a propósito (CLAUDE.md §18 y §8): NULL
  // significa "se hizo con la predeterminada de ese momento", no una lista
  // fija. Si viene un id, tiene que existir de verdad — nunca se confía
  // ciegamente en un id que llega del cliente.
  // ErrorBulk (no Error genérico): es la clase que mensajeDeError sabe
  // traducir a un mensaje de usuario sin relanzar — un Error a secas
  // escapa del catch de POST /api/ventas y termina en el handler default
  // de Express (HTML de stack trace en vez de un 400 con JSON).
  const listaPrecioId = lista_precio_id ? Number(lista_precio_id) : null;
  if (listaPrecioId && !listaPrecioValida(listaPrecioId, organizacion_id)) {
    throw new ErrorBulk('La lista de precios seleccionada no existe.');
  }

  // Mismo criterio que lista_precio_id: nullable, NULL = "el predeterminado
  // de ese momento" (CLAUDE.md §19). Si viene un id, tiene que existir y
  // estar activo.
  const depositoId = deposito_id ? Number(deposito_id) : null;
  if (depositoId && !depositoActivoValido(depositoId, organizacion_id)) {
    throw new ErrorBulk('El depósito seleccionado no existe o está inactivo.');
  }
  const depositoResuelto = depositoId ?? depositoPredeterminadoId(organizacion_id);

  // El vencimiento se calcula sobre la fecha real de la venta, así que hay
  // que resolverla antes del INSERT: el vencimiento tiene que salir de esa
  // misma fecha y no de otra.
  const fechaVenta = fecha ?? fechaDeHoy();
  const venc = calcularVencimiento(fechaVenta, condicion_pago, fecha_vencimiento);

  const { lastInsertRowid: nuevaVentaId } = db
    .prepare(
      `INSERT INTO ventas (cliente_id, fecha, lista_precio_id, deposito_id, condicion_pago, fecha_vencimiento, organizacion_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(clienteRow.id, fechaVenta, listaPrecioId, depositoId, venc.condicion, venc.vencimiento, organizacion_id);

  const buscarCostoActual = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
  // Espejo de buscarCostoActual, pero a nivel variante: el costo congelado
  // de un item con variante es el promedio ponderado de ESA variante, no el
  // del producto padre.
  const buscarCostoVariante = db.prepare('SELECT precio_costo FROM producto_variantes WHERE id = ?');
  const insertItem = db.prepare(
    `INSERT INTO venta_items (venta_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario_historico)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  let total = 0;
  for (const item of items) {
    const varianteId = item.variante_id ? Number(item.variante_id) : null;
    // El costo se congela ACA, antes de tocar nada más del producto: es
    // la foto del momento de la venta, no se vuelve a recalcular después.
    const costoActual = varianteId
      ? buscarCostoVariante.get(varianteId).precio_costo
      : buscarCostoActual.get(item.producto_id).precio_costo;
    insertItem.run(nuevaVentaId, item.producto_id, varianteId, item.cantidad, item.precio_unitario, costoActual);
    registrarMovimientoStock({
      producto_id: item.producto_id,
      variante_id: varianteId,
      deposito_id: depositoResuelto,
      tipo: 'salida',
      cantidad: item.cantidad,
      origen: 'venta',
      venta_id: nuevaVentaId,
      organizacion_id
    });
    // Ya NO se pisa productos.precio_venta con el precio de esta venta
    // (CLAUDE.md §18): con varias listas de precios, una venta con un
    // precio puntual (descuento, negociación) bajaría en silencio el
    // precio de TODAS las listas. Los precios se administran solo desde
    // Productos; el precio de este item queda congelado acá, en
    // venta_items, como siempre.
    total += item.cantidad * item.precio_unitario;
  }

  // Toda venta aumenta la deuda del cliente; se salda con cobros. No
  // hace falta un flag "es a crédito": una venta cobrada al instante
  // simplemente tiene su cobro registrado enseguida.
  db.prepare(
    `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'venta', ?, ?, ${HOY_SQL})`
  ).run(clienteRow.id, total, nuevaVentaId);

  return nuevaVentaId;
}

app.post('/api/ventas', (req, res) => {
  const { cliente, cliente_id, items, fecha, lista_precio_id, deposito_id, condicion_pago, fecha_vencimiento } =
    req.body;

  const errorItems = validarItemsVenta(items);
  if (errorItems) {
    return res.status(400).json({ error: errorItems });
  }
  exigirLugarEnPlan(req.usuario.organizacion_id, 'ventas_mes');
  const depositoId = deposito_id ? Number(deposito_id) : depositoPredeterminadoId(req.usuario.organizacion_id);
  if (deposito_id && !depositoActivoValido(depositoId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'El depósito seleccionado no existe o está inactivo.' });
  }

  // No se puede vender más de lo que hay EN ESE DEPÓSITO: se valida antes
  // de tocar nada, así una venta que falla no deja nada a mitad de camino.
  const errorStock = validarStockDisponible(items, depositoId, req.usuario.organizacion_id);
  if (errorStock) {
    return res.status(400).json({ error: errorStock });
  }
  // Desde una consulta (hist. §89): la venta la gana.
  const oportunidad = oportunidadParaVincular(req.body.crm_oportunidad_id, req.usuario.organizacion_id);

  let ventaId;
  try {
    ventaId = withTransaction(() => {
      const id = crearVenta({
        cliente,
        cliente_id,
        items,
        fecha,
        lista_precio_id,
        deposito_id,
        condicion_pago,
        fecha_vencimiento,
        organizacion_id: req.usuario.organizacion_id
      });
      auditar(req, { accion: 'crear', entidad: 'venta', entidad_id: id, detalle: `Venta #${id} creada` });
      if (oportunidad) {
        const { cliente_id: clienteId } = db.prepare('SELECT cliente_id FROM ventas WHERE id = ?').get(id);
        vincularOportunidad(req, oportunidad, { cliente_id: clienteId, venta_id: id });
      }
      return id;
    });
  } catch (err) {
    return res.status(400).json({ error: mensajeDeError(err) });
  }

  res.status(201).json({ id: ventaId });
});

// Editar una venta ya cargada, mientras no esté facturada ni anulada. El
// total nuevo no puede quedar por debajo de lo ya cobrado (no tendría
// sentido: sería cobrar más de lo que vale la venta). Se resuelve
// revirtiendo el stock y la cuenta corriente actuales y volviendo a
// aplicar con los items nuevos, mismo patrón que la edición de compras.
app.put('/api/ventas/:id', (req, res) => {
  const ventaId = Number(req.params.id);
  const { cliente, cliente_id, items, fecha, lista_precio_id, deposito_id, condicion_pago, fecha_vencimiento } =
    req.body;

  const listaPrecioId = lista_precio_id ? Number(lista_precio_id) : null;
  if (listaPrecioId && !listaPrecioValida(listaPrecioId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
  }

  const venta = db
    .prepare(
      'SELECT id, cliente_id, deposito_id, estado, fecha, condicion_pago, fecha_vencimiento FROM ventas WHERE id = ? AND organizacion_id = ?'
    )
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }

  // El vencimiento se recalcula porque depende de la fecha de la venta y
  // editar puede haberla movido: dejar el vencimiento viejo con una fecha de
  // operación nueva daría un plazo distinto al pactado. Si el request no
  // manda condición, se conserva la que ya tenía la venta — y en el caso
  // 'manual' se conserva también la fecha guardada, porque una fecha suelta
  // no se puede derivar de ninguna condición.
  const condicionEdicion = condicion_pago === undefined ? venta.condicion_pago : condicion_pago;
  const fechaManualEdicion =
    fecha_vencimiento === undefined && condicionEdicion === 'manual' ? venta.fecha_vencimiento : fecha_vencimiento;
  let vencEdicion;
  try {
    vencEdicion = calcularVencimiento(fecha || venta.fecha, condicionEdicion, fechaManualEdicion);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: mensajeDeError(err) });
  }
  // Editar mantiene el depósito original si no se manda uno nuevo — no se
  // recalcula al predeterminado ACTUAL en silencio, porque el predeterminado
  // pudo haber cambiado desde que se cargó la venta.
  const depositoId = deposito_id !== undefined
    ? (deposito_id ? Number(deposito_id) : null)
    : venta.deposito_id;
  const depositoResuelto = depositoId ?? depositoPredeterminadoId(req.usuario.organizacion_id);
  if (depositoId && !depositoActivoValido(depositoId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'El depósito seleccionado no existe o está inactivo.' });
  }
  if (venta.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta venta está anulada. Restaurala primero si querés editarla.' });
  }
  const facturada = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (facturada) {
    return res.status(400).json({ error: 'Esta venta ya tiene una factura asociada, no se puede editar.' });
  }
  // Editar reemplaza venta_items enteros (ver más abajo), y
  // devolucion_items.venta_item_id apunta a esas filas exactas: si se
  // permitiera editar, las devoluciones ya cargadas quedarían apuntando a
  // renglones que ya no existen.
  const tieneDevolucionEdicion = db
    .prepare("SELECT 1 FROM devoluciones WHERE venta_id = ? AND estado = 'activa'")
    .get(ventaId);
  if (tieneDevolucionEdicion) {
    return res
      .status(400)
      .json({ error: 'Esta venta tiene una devolución asociada, no se puede editar.' });
  }
  const errorItems = validarItemsVenta(items);
  if (errorItems) {
    return res.status(400).json({ error: errorItems });
  }

  const { cobrado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS cobrado FROM cobros WHERE venta_id = ?')
    .get(ventaId);
  const nuevoTotal = items.reduce((acc, i) => acc + Number(i.cantidad) * Number(i.precio_unitario), 0);
  if (nuevoTotal < cobrado) {
    return res.status(400).json({
      error: `El total no puede quedar por debajo de lo ya cobrado (${cobrado.toFixed(2)}).`
    });
  }

  const itemsViejos = db
    .prepare('SELECT producto_id, variante_id, cantidad FROM venta_items WHERE venta_id = ?')
    .all(ventaId);

  // Stock disponible para los items nuevos, contemplando que el stock de
  // los items viejos de esta misma venta se libera primero. Se agrupa por
  // la misma clave compuesta producto+variante que usa validarStockDisponible.
  const liberadoPorClave = new Map();
  for (const item of itemsViejos) {
    const clave = `${item.producto_id}:${item.variante_id ?? ''}`;
    liberadoPorClave.set(clave, (liberadoPorClave.get(clave) ?? 0) + item.cantidad);
  }
  const pedidoPorClave = new Map();
  for (const item of items) {
    const varianteId = item.variante_id ? Number(item.variante_id) : null;
    const clave = `${item.producto_id}:${varianteId ?? ''}`;
    pedidoPorClave.set(clave, {
      producto_id: item.producto_id,
      variante_id: varianteId,
      cantidad: (pedidoPorClave.get(clave)?.cantidad ?? 0) + Number(item.cantidad)
    });
  }
  // El stock liberado por los items viejos solo cuenta si eran del MISMO
  // depósito que se va a usar ahora: si la venta cambia de depósito al
  // editarse, lo que libera en el depósito viejo no está disponible en el
  // nuevo.
  const liberadoEnDepositoResuelto = venta.deposito_id === depositoResuelto || (!venta.deposito_id && depositoResuelto === depositoPredeterminadoId(req.usuario.organizacion_id))
    ? liberadoPorClave
    : new Map();
  // Mismo filtro de organización que validarStockDisponible: un producto de
  // otra empresa tiene que dar el mismo error que uno inexistente.
  const buscarProductoEdicion = db.prepare('SELECT nombre, tipo FROM productos WHERE id = ? AND organizacion_id = ?');
  const contarVariantesActivasEdicion = db.prepare(
    'SELECT COUNT(*) AS n FROM producto_variantes WHERE producto_id = ? AND activo = 1'
  );
  const buscarStockDisponible = db.prepare(
    `SELECT COALESCE(stock_por_deposito.cantidad, 0) AS stock
       FROM stock_por_deposito
      WHERE stock_por_deposito.producto_id = ? AND stock_por_deposito.deposito_id = ?`
  );
  const buscarVarianteStockEdicion = db.prepare(
    `SELECT producto_variantes.id,
            COALESCE(stock_variante_por_deposito.cantidad, 0) AS stock
       FROM producto_variantes
       LEFT JOIN stock_variante_por_deposito
         ON stock_variante_por_deposito.variante_id = producto_variantes.id
        AND stock_variante_por_deposito.deposito_id = ?
      WHERE producto_variantes.id = ? AND producto_variantes.producto_id = ? AND producto_variantes.activo = 1`
  );
  for (const [clave, { producto_id: productoId, variante_id: varianteId, cantidad: cantidadPedida }] of pedidoPorClave) {
    const producto = buscarProductoEdicion.get(productoId, req.usuario.organizacion_id);
    if (!producto) {
      return res.status(400).json({ error: 'Uno de los productos de la venta no existe.' });
    }
    const tieneVariantes = contarVariantesActivasEdicion.get(productoId).n > 0;
    if (!varianteId && tieneVariantes) {
      return res.status(400).json({ error: `"${producto.nombre}" tiene variantes: elegí una para vender.` });
    }
    if (producto.tipo === 'servicio') continue;
    const liberado = liberadoEnDepositoResuelto.get(clave) ?? 0;
    if (varianteId) {
      const variante = buscarVarianteStockEdicion.get(depositoResuelto, varianteId, productoId);
      if (!variante) {
        return res
          .status(400)
          .json({ error: `La variante elegida para "${producto.nombre}" no existe o no le pertenece.` });
      }
      const disponible = variante.stock + liberado;
      if (cantidadPedida > disponible) {
        return res.status(400).json({
          error: `No hay suficiente stock de "${producto.nombre}" (${combinacionVariante(varianteId)}) (disponible: ${disponible}).${dondeHayStock(productoId, depositoResuelto, varianteId)}`
        });
      }
    } else {
      const stock = buscarStockDisponible.get(productoId, depositoResuelto)?.stock ?? 0;
      const disponible = stock + liberado;
      if (cantidadPedida > disponible) {
        return res.status(400).json({
          error: `No hay suficiente stock de "${producto.nombre}" (disponible: ${disponible}).${dondeHayStock(productoId, depositoResuelto)}`
        });
      }
    }
  }

  withTransaction(() => {
    const { subtotal: totalViejo } = db
      .prepare(
        'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM venta_items WHERE venta_id = ?'
      )
      .get(ventaId);

    // 1) Revertir el stock que se había descontado, en el depósito ORIGINAL
    // de la venta (no en el nuevo, si cambió al editar).
    const depositoOriginal = venta.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);
    for (const item of itemsViejos) {
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        deposito_id: depositoOriginal,
        tipo: 'entrada',
        cantidad: item.cantidad,
        origen: 'venta',
        venta_id: ventaId,
        nota: 'Reversión por edición',
        organizacion_id: req.usuario.organizacion_id
      });
    }

    // 2) Reemplazar cliente, fecha e items.
    const clienteRow = resolverCliente(cliente, cliente_id, req.usuario.organizacion_id);
    db.prepare(
      `UPDATE ventas
          SET cliente_id = ?, fecha = COALESCE(?, fecha), lista_precio_id = ?, deposito_id = ?,
              condicion_pago = ?, fecha_vencimiento = ?
        WHERE id = ?`
    ).run(
      clienteRow.id,
      fecha || null,
      listaPrecioId,
      depositoId,
      vencEdicion.condicion,
      vencEdicion.vencimiento,
      ventaId
    );

    db.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(ventaId);

    const buscarCostoActual = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
    const buscarCostoVariante = db.prepare('SELECT precio_costo FROM producto_variantes WHERE id = ?');
    const insertItem = db.prepare(
      `INSERT INTO venta_items (venta_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario_historico)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    let total = 0;
    for (const item of items) {
      const varianteId = item.variante_id ? Number(item.variante_id) : null;
      // Mismo criterio que crear una venta: el costo se congela con el
      // costo actual del producto/variante en este momento, no el que tenía antes.
      const costoActual = varianteId
        ? buscarCostoVariante.get(varianteId).precio_costo
        : buscarCostoActual.get(item.producto_id).precio_costo;
      insertItem.run(ventaId, item.producto_id, varianteId, item.cantidad, item.precio_unitario, costoActual);
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: varianteId,
        deposito_id: depositoResuelto,
        tipo: 'salida',
        cantidad: item.cantidad,
        origen: 'venta',
        venta_id: ventaId,
        organizacion_id: req.usuario.organizacion_id
      });
      // Ya NO se pisa productos.precio_venta acá tampoco — mismo motivo que
      // en crearVenta (CLAUDE.md §18).
      total += item.cantidad * item.precio_unitario;
    }

    // 3) Ajustar la cuenta corriente (no se reemplaza el movimiento
    // original, se compensa — mismo criterio que anular). Si el cliente
    // cambió, la deuda vieja tiene que revertirse contra el cliente VIEJO
    // y la nueva cargarse contra el NUEVO — insertar un solo ajuste neto
    // contra clienteRow.id (como se hacía antes) le dejaba al cliente
    // viejo una deuda fantasma y al nuevo la venta sin reflejar. Mismo
    // patrón de dos asientos que ya usa la edición de compras (dos
    // proveedores distintos). Cuando el cliente no cambia, los dos caen
    // sobre la misma entidad y la suma neta es idéntica a un solo ajuste.
    const insertAjusteCC = db.prepare(
      `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    );
    insertAjusteCC.run(venta.cliente_id, -totalViejo, ventaId);
    insertAjusteCC.run(clienteRow.id, total, ventaId);

    auditar(req, {
      accion: 'editar',
      entidad: 'venta',
      entidad_id: ventaId,
      valor_anterior: JSON.stringify({ total: totalViejo, cliente_id: venta.cliente_id }),
      valor_nuevo: JSON.stringify({ total, cliente_id: clienteRow.id }),
      detalle: `Venta #${ventaId} editada`
    });
  });

  res.json({ id: ventaId });
});

app.get('/api/ventas/:id/cobros', (req, res) => {
  const cobros = db
    .prepare(
      `SELECT cobros.id, cobros.fecha, cobros.importe, cobros.nota,
              cuentas_tesoreria.nombre AS cuenta
       FROM cobros
       JOIN cuentas_tesoreria ON cuentas_tesoreria.id = cobros.cuenta_tesoreria_id
       JOIN ventas ON ventas.id = cobros.venta_id
       WHERE cobros.venta_id = ? AND ventas.organizacion_id = ?
       ORDER BY cobros.id`
    )
    .all(Number(req.params.id), req.usuario.organizacion_id);
  res.json(cobros);
});

app.post('/api/ventas/:id/cobros', (req, res) => {
  const ventaId = Number(req.params.id);
  const { importe, cuenta_tesoreria_id, nota } = req.body;

  const venta = db
    .prepare(
      `SELECT ventas.id, ventas.cliente_id, ventas.estado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM venta_items WHERE venta_id = ventas.id) AS total,
              (SELECT COALESCE(SUM(importe), 0) FROM cobros WHERE venta_id = ventas.id) AS cobrado,
              ${SUBQUERY_DEVUELTO_VENTA} AS devuelto
       FROM ventas WHERE ventas.id = ? AND ventas.organizacion_id = ?`
    )
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  // Anular solo se bloquea si ya había cobros o factura, pero después de
  // anulada la venta ya no es plata a cobrar: un cobro acá deja tesorería y
  // cuenta corriente con un ingreso de una operación que no existe.
  if (venta.estado === 'anulada') {
    return res.status(400).json({ error: 'No se puede cobrar una venta anulada.' });
  }

  // La mercadería devuelta ya no es plata que se le pueda reclamar al
  // cliente: el saldo pendiente se calcula sobre el neto, no sobre el
  // total bruto de la venta.
  const saldoPendiente = venta.total - venta.devuelto - venta.cobrado;
  if (!esNumeroValido(importe) || !(importe > 0)) {
    return res.status(400).json({ error: 'El importe del cobro tiene que ser un número mayor a 0.' });
  }
  if (importe > saldoPendiente) {
    return res.status(400).json({
      error: `El importe supera el saldo pendiente de la venta (${saldoPendiente.toFixed(2)}).`
    });
  }
  // registrarCobro no valida la cuenta (ver su comentario): se valida acá.
  // Hasta la Etapa A de catálogos solo la frenaba la FK (una inexistente
  // reventaba en el INSERT como 500); ahora además tiene que ser de la
  // organización, o el ingreso subiría la caja de otra empresa.
  const cuenta = db
    .prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(cuenta_tesoreria_id), req.usuario.organizacion_id);
  if (!cuenta) {
    return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
  }

  const cobroId = withTransaction(() => {
    const id = registrarCobro(ventaId, venta.cliente_id, importe, cuenta_tesoreria_id, nota, req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'cobro',
      entidad_id: id,
      operacion_tipo: 'venta',
      operacion_id: ventaId,
      detalle: `Cobro #${id} de $${importe} sobre la venta #${ventaId}`
    });
    return id;
  });

  res.status(201).json({ id: cobroId });
});

// Inserta el cobro y sus dos efectos (ingreso a tesorería, baja de la
// cuenta corriente del cliente). Sin validación propia — el llamador ya
// tiene que haber verificado importe/saldo pendiente/existencia de la
// cuenta. Asume que se la llama DENTRO de una transacción.
function registrarCobro(ventaId, clienteId, importe, cuentaTesoreriaId, nota, organizacionId) {
  const { lastInsertRowid: nuevoCobroId } = db
    .prepare(`INSERT INTO cobros (venta_id, importe, cuenta_tesoreria_id, nota, fecha) VALUES (?, ?, ?, ?, ${HOY_SQL})`)
    .run(ventaId, importe, cuentaTesoreriaId, nota ?? null);

  db.prepare(
    `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, cobro_id, origen, organizacion_id, fecha) VALUES (?, 'ingreso', ?, ?, 'cobro', ?, ${HOY_SQL})`
  ).run(cuentaTesoreriaId, importe, nuevoCobroId, organizacionId);

  db.prepare(
    `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, cobro_id, fecha) VALUES (?, 'cobro', ?, ?, ?, ${HOY_SQL})`
  ).run(clienteId, -importe, ventaId, nuevoCobroId);

  return nuevoCobroId;
}

app.post('/api/ventas/:id/facturar', (req, res) => {
  const ventaId = Number(req.params.id);
  const { condicion, tipo, letra, punto_venta } = req.body;
  const tipoFinal = tipo || 'factura';
  const letraFinal = letra || 'B';
  const puntoVentaFinal = Number(punto_venta) || 1;

  const venta = db
    .prepare('SELECT ventas.id, ventas.cliente_id, ventas.estado FROM ventas WHERE ventas.id = ? AND ventas.organizacion_id = ?')
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res.status(400).json({ error: 'No se puede facturar una venta anulada.' });
  }

  const yaFacturada = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (yaFacturada) {
    return res.status(409).json({ error: 'Esta venta ya tiene una factura asociada.' });
  }

  let facturaId;
  try {
    facturaId = withTransaction(() => {
      const { total } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total FROM venta_items WHERE venta_id = ?'
        )
        .get(ventaId);

      const numero = siguienteNumero(req.usuario.organizacion_id, puntoVentaFinal, tipoFinal, letraFinal);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, venta_id, tipo, letra, punto_venta, numero, organizacion_id, fecha)
           VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ${HOY_SQL})`
        )
        .run(
          venta.cliente_id,
          `Venta #${ventaId}`,
          total,
          condicion,
          ventaId,
          tipoFinal,
          letraFinal,
          puntoVentaFinal,
          numero,
          req.usuario.organizacion_id
        );

      auditar(req, {
        accion: 'crear',
        entidad: 'factura',
        entidad_id: lastInsertRowid,
        operacion_tipo: 'venta',
        operacion_id: ventaId,
        detalle: `Factura #${lastInsertRowid} para la venta #${ventaId}`
      });

      return lastInsertRowid;
    });
  } catch (err) {
    // Última línea de defensa contra dos facturaciones simultáneas: el
    // chequeo de arriba no es atómico, los índices únicos sí (el de
    // venta_id contra facturar dos veces la misma venta, el de
    // numeración contra repetir un número — este último prácticamente
    // imposible con SQLite de un solo proceso, pero cubierto igual).
    if (String(err.message).includes('idx_facturas_venta_id') || String(err.message).includes('facturas.venta_id')) {
      return res.status(409).json({ error: 'Esta venta ya tiene una factura asociada.' });
    }
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'No se pudo asignar el número de comprobante, probá de nuevo.' });
    }
    throw err;
  }

  res.status(201).json({ id: facturaId });
});

app.post('/api/ventas/:id/anular', soloAdmin, (req, res) => {
  const ventaId = Number(req.params.id);

  const venta = db
    .prepare('SELECT id, cliente_id, deposito_id, estado FROM ventas WHERE id = ? AND organizacion_id = ?')
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta venta ya está anulada.' });
  }

  const tieneFactura = db.prepare('SELECT 1 FROM facturas WHERE venta_id = ?').get(ventaId);
  if (tieneFactura) {
    return res.status(400).json({ error: 'Esta venta tiene una factura asociada, no se puede anular.' });
  }

  const tieneCobros = db.prepare('SELECT 1 FROM cobros WHERE venta_id = ?').get(ventaId);
  if (tieneCobros) {
    return res.status(400).json({ error: 'Esta venta tiene cobros registrados, no se puede anular.' });
  }

  const tieneDevolucionAnular = db
    .prepare("SELECT 1 FROM devoluciones WHERE venta_id = ? AND estado = 'activa'")
    .get(ventaId);
  if (tieneDevolucionAnular) {
    return res
      .status(400)
      .json({ error: 'Esta venta tiene una devolución asociada, no se puede anular.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE ventas SET estado = 'anulada' WHERE id = ?").run(ventaId);

    const depositoVenta = venta.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);
    const items = db
      .prepare('SELECT producto_id, variante_id, cantidad, precio_unitario FROM venta_items WHERE venta_id = ?')
      .all(ventaId);
    let total = 0;
    for (const item of items) {
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        deposito_id: depositoVenta,
        tipo: 'entrada',
        cantidad: item.cantidad,
        origen: 'venta',
        venta_id: ventaId,
        nota: 'Reversión por anulación',
        organizacion_id: req.usuario.organizacion_id
      });
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(venta.cliente_id, -total, ventaId);

    auditar(req, {
      accion: 'anular',
      entidad: 'venta',
      entidad_id: ventaId,
      detalle: `Venta #${ventaId} anulada, stock devuelto`
    });
  });

  res.json({ id: ventaId, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo de la
// venta, o sea descuenta el stock otra vez y regenera la deuda del cliente.
// Puede fallar si en el medio se vendió el stock que había vuelto.
app.post('/api/ventas/:id/restaurar', soloAdmin, (req, res) => {
  const ventaId = Number(req.params.id);
  // Una venta restaurada vuelve a contar en el mes (hist. §98).
  exigirLugarEnPlan(req.usuario.organizacion_id, 'ventas_mes');

  const venta = db
    .prepare('SELECT id, cliente_id, deposito_id, estado FROM ventas WHERE id = ? AND organizacion_id = ?')
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta venta no está en la papelera.' });
  }
  const depositoVenta = venta.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);

  const items = db
    .prepare(
      `SELECT venta_items.producto_id, venta_items.variante_id, venta_items.cantidad,
              venta_items.precio_unitario, productos.nombre
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_id = ?`
    )
    .all(ventaId);

  const buscarStockDeposito = db.prepare(
    'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
  );
  const buscarStockVarianteDeposito = db.prepare(
    'SELECT cantidad FROM stock_variante_por_deposito WHERE variante_id = ? AND deposito_id = ?'
  );
  for (const item of items) {
    if (esServicio(item.producto_id)) continue;
    const stockActual = item.variante_id
      ? buscarStockVarianteDeposito.get(item.variante_id, depositoVenta)?.cantidad ?? 0
      : buscarStockDeposito.get(item.producto_id, depositoVenta)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta venta.${dondeHayStock(item.producto_id, depositoVenta, item.variante_id)}`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE ventas SET estado = 'activa' WHERE id = ?").run(ventaId);

    let total = 0;
    for (const item of items) {
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        deposito_id: depositoVenta,
        tipo: 'salida',
        cantidad: item.cantidad,
        origen: 'venta',
        venta_id: ventaId,
        nota: 'Restaurada desde la papelera',
        organizacion_id: req.usuario.organizacion_id
      });
      total += item.cantidad * item.precio_unitario;
    }

    db.prepare(
      `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(venta.cliente_id, total, ventaId);

    auditar(req, {
      accion: 'restaurar',
      entidad: 'venta',
      entidad_id: ventaId,
      detalle: `Venta #${ventaId} restaurada desde la papelera`
    });
  });

  res.json({ id: ventaId, estado: 'activa' });
});

/* ---------- Presupuestos ---------- */

// Un presupuesto es una oferta: no toca stock, ni cuenta corriente, ni
// resultado (CLAUDE.md §15). Todo eso pasa recién al convertirlo en venta.

const SELECT_PRESUPUESTO = `
  SELECT presupuestos.id, presupuestos.cliente_id, clientes.nombre AS cliente,
         -- Contacto del cliente: lo necesita el membrete del comprobante
         -- impreso (a quién se le cotiza). Aditivo: quien no lo use lo ignora.
         clientes.documento AS cliente_documento, clientes.direccion AS cliente_direccion,
         clientes.email AS cliente_email, clientes.telefono AS cliente_telefono,
         presupuestos.fecha, presupuestos.vencimiento, presupuestos.estado,
         presupuestos.venta_id, presupuestos.notas,
         -- El trabajo que salió de este presupuesto, si hay uno sin cancelar
         -- (hist. §78): mientras exista, se termina desde ahí.
         (SELECT trabajos.id FROM trabajos
           WHERE trabajos.presupuesto_id = presupuestos.id AND trabajos.estado <> 'cancelado') AS trabajo_id,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM presupuesto_items WHERE presupuesto_items.presupuesto_id = presupuestos.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN presupuesto_items.cantidad = CAST(presupuesto_items.cantidad AS INTEGER)
                         THEN CAST(presupuesto_items.cantidad AS INTEGER)
                         ELSE presupuesto_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM presupuesto_items JOIN productos ON productos.id = presupuesto_items.producto_id
           WHERE presupuesto_items.presupuesto_id = presupuestos.id) AS items_resumen
    FROM presupuestos
    JOIN clientes ON clientes.id = presupuestos.cliente_id`;

// "Vencido" no se guarda: se calcula. Solo aplica a un presupuesto que
// sigue esperando respuesta — uno aceptado o rechazado ya tuvo la suya, y
// uno convertido ya es una venta, así que la fecha deja de importar.
function estadoEfectivoPresupuesto(presupuesto, hoy) {
  if (
    presupuesto.estado === 'enviado' &&
    presupuesto.vencimiento &&
    presupuesto.vencimiento < hoy
  ) {
    return 'vencido';
  }
  return presupuesto.estado;
}

function decorarPresupuesto(p, hoy) {
  return { ...p, estado_efectivo: estadoEfectivoPresupuesto(p, hoy) };
}

app.get('/api/presupuestos', (req, res) => {
  const hoy = fechaDeHoy();
  const presupuestos = db
    .prepare(
      `${SELECT_PRESUPUESTO} WHERE presupuestos.organizacion_id = ? ORDER BY presupuestos.fecha DESC, presupuestos.id DESC`
    )
    .all(req.usuario.organizacion_id);
  res.json(presupuestos.map((p) => decorarPresupuesto(p, hoy)));
});

app.get('/api/presupuestos/:id', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const presupuesto = db
    .prepare(`${SELECT_PRESUPUESTO} WHERE presupuestos.id = ? AND presupuestos.organizacion_id = ?`)
    .get(presupuestoId, req.usuario.organizacion_id);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }

  const items = db
    .prepare(
      `SELECT presupuesto_items.id, presupuesto_items.producto_id, presupuesto_items.variante_id,
              productos.nombre AS producto,
              presupuesto_items.cantidad, presupuesto_items.precio_unitario
         FROM presupuesto_items JOIN productos ON productos.id = presupuesto_items.producto_id
        WHERE presupuesto_id = ?
        ORDER BY presupuesto_items.id`
    )
    .all(presupuestoId);

  res.json({
    ...decorarPresupuesto(presupuesto, fechaDeHoy()),
    items: items.map((i) => ({
      ...i,
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null,
      subtotal: i.cantidad * i.precio_unitario
    }))
  });
});

// Valida el cuerpo de un presupuesto. A diferencia de una venta, NO valida
// stock: se puede cotizar algo que todavía no está en el depósito.
// organizacionId es obligatorio: producto_id y variante_id vienen del cliente y
// hay que comprobar que son de ESTA empresa. Sin eso el GET del presupuesto
// (que hace JOIN a productos) devolvía el nombre y los atributos de un producto
// de otra empresa enumerando ids (CLAUDE.md §28), y un id inexistente salía
// como 500 por la FK.
function validarPresupuesto(body, organizacionId) {
  const { items } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return 'El presupuesto necesita al menos un item.';
  }
  return errorEnItemsCotizados(items, organizacionId);
}

// Los renglones de un presupuesto o de un trabajo (hist. §78): un producto de
// esta empresa, cantidad mayor a 0 y precio no negativo. Sin stock: se cotiza
// lo que todavía no está, y el tope se valida al pasar a venta.
function errorEnItemsCotizados(items, organizacionId) {
  for (const item of items) {
    if (!esIdValido(item?.producto_id)) {
      return 'Todos los items necesitan un producto.';
    }
    if (!esNumeroValido(item.cantidad) || !(Number(item.cantidad) > 0)) {
      return 'La cantidad de cada item debe ser un número mayor a 0.';
    }
    if (!esNumeroValido(item.precio_unitario) || !(Number(item.precio_unitario) >= 0)) {
      return 'El precio unitario de cada item debe ser un número, y no puede ser negativo.';
    }
    if (!existeId('productos', item.producto_id, organizacionId)) {
      return 'Uno de los productos no existe.';
    }
    if (item.variante_id) {
      const variante = db
        .prepare('SELECT 1 FROM producto_variantes WHERE id = ? AND producto_id = ?')
        .get(Number(item.variante_id), Number(item.producto_id));
      if (!variante) {
        return 'La variante elegida no existe o no pertenece al producto.';
      }
    }
  }
  return null;
}

function guardarItemsPresupuesto(presupuestoId, items) {
  const insertItem = db.prepare(
    `INSERT INTO presupuesto_items (presupuesto_id, producto_id, variante_id, cantidad, precio_unitario)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const item of items) {
    insertItem.run(
      presupuestoId,
      Number(item.producto_id),
      item.variante_id ? Number(item.variante_id) : null,
      Number(item.cantidad),
      Number(item.precio_unitario)
    );
  }
}

// Resuelve el cliente igual que la venta: si el frontend ya sabe cuál es
// se usa su id (evita duplicados por diferencias de tipeo), si no se busca
// por nombre y se crea si no existe.
// organizacionId es obligatorio: un cliente resuelto por nombre o creado
// acá tiene que quedar en la organización de quien hace el pedido (CLAUDE.md
// §28), igual que el resto de las altas de clientes/proveedores/productos.
// Un cliente_id que no es de la empresa responde lo mismo que uno que no
// existe (CLAUDE.md §28). Sin id, el nombre es obligatorio: antes un alta sin
// cliente enlazaba undefined y salía como 500.
function resolverCliente(cliente, cliente_id, organizacionId) {
  if (cliente_id) {
    const clienteRow = db
      .prepare('SELECT id FROM clientes WHERE id = ? AND organizacion_id = ?')
      .get(Number(cliente_id), organizacionId);
    if (!clienteRow) throw new ErrorValidacion('El cliente no existe.');
    return clienteRow;
  }
  const nombre = typeof cliente === 'string' ? cliente.trim() : '';
  if (!nombre) throw new ErrorValidacion('Indicá el cliente.');
  const clienteRow = db.prepare('SELECT id FROM clientes WHERE nombre = ? AND organizacion_id = ?').get(nombre, organizacionId);
  if (clienteRow) return clienteRow;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO clientes (nombre, organizacion_id) VALUES (?, ?)')
    .run(nombre, organizacionId);
  return { id: lastInsertRowid };
}

app.post('/api/presupuestos', (req, res) => {
  const { cliente, cliente_id, items, fecha, vencimiento, notas, lista_precio_id } = req.body;

  const error = validarPresupuesto(req.body, req.usuario.organizacion_id);
  if (error) {
    return res.status(400).json({ error });
  }
  const listaPrecioId = lista_precio_id ? Number(lista_precio_id) : null;
  if (listaPrecioId && !listaPrecioValida(listaPrecioId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
  }
  // Desde una consulta (hist. §89): queda vinculada al presupuesto.
  const oportunidad = oportunidadParaVincular(req.body.crm_oportunidad_id, req.usuario.organizacion_id);

  const presupuestoId = withTransaction(() => {
    const clienteRow = resolverCliente(cliente, cliente_id, req.usuario.organizacion_id);

    const columnas = ['cliente_id', 'vencimiento', 'notas', 'lista_precio_id', 'organizacion_id'];
    const valores = [
      clienteRow.id,
      vencimiento || null,
      notas?.trim() || null,
      listaPrecioId,
      req.usuario.organizacion_id
    ];
    columnas.push('fecha');
      valores.push(fecha || fechaDeHoy());
    const { lastInsertRowid: nuevoId } = db
      .prepare(
        `INSERT INTO presupuestos (${columnas.join(', ')}) VALUES (${columnas
          .map(() => '?')
          .join(', ')})`
      )
      .run(...valores);

    guardarItemsPresupuesto(nuevoId, items);
    auditar(req, {
      accion: 'crear',
      entidad: 'presupuesto',
      entidad_id: nuevoId,
      detalle: `Presupuesto #${nuevoId} creado`
    });
    vincularOportunidad(req, oportunidad, { cliente_id: Number(clienteRow.id), presupuesto_id: nuevoId });
    return nuevoId;
  });

  res.status(201).json({ id: presupuestoId });
});

// Editar. Se rechaza si ya se convirtió: a partir de ahí la venta es la
// que manda, y el presupuesto queda como registro de lo que se ofreció.
app.put('/api/presupuestos/:id', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const { cliente, cliente_id, items, fecha, vencimiento, notas, lista_precio_id } = req.body;

  const presupuesto = db
    .prepare('SELECT id, estado FROM presupuestos WHERE id = ? AND organizacion_id = ?')
    .get(presupuestoId, req.usuario.organizacion_id);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res
      .status(400)
      .json({ error: 'Este presupuesto ya se convirtió en venta, no se puede editar.' });
  }

  const error = validarPresupuesto(req.body, req.usuario.organizacion_id);
  if (error) {
    return res.status(400).json({ error });
  }
  const listaPrecioId = lista_precio_id ? Number(lista_precio_id) : null;
  if (listaPrecioId && !listaPrecioValida(listaPrecioId, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
  }

  withTransaction(() => {
    const clienteRow = resolverCliente(cliente, cliente_id, req.usuario.organizacion_id);

    db.prepare(
      `UPDATE presupuestos
          SET cliente_id = ?, vencimiento = ?, notas = ?, fecha = COALESCE(?, fecha), lista_precio_id = ?
        WHERE id = ?`
    ).run(clienteRow.id, vencimiento || null, notas?.trim() || null, fecha || null, listaPrecioId, presupuestoId);

    // Un presupuesto no tiene efectos que revertir (no movió stock ni
    // cuenta corriente), así que sus items se reemplazan directamente —
    // no hace falta el revertir-y-reaplicar de ventas y compras.
    db.prepare('DELETE FROM presupuesto_items WHERE presupuesto_id = ?').run(presupuestoId);
    guardarItemsPresupuesto(presupuestoId, items);

    auditar(req, {
      accion: 'editar',
      entidad: 'presupuesto',
      entidad_id: presupuestoId,
      detalle: `Presupuesto #${presupuestoId} editado`
    });
  });

  res.json({ id: presupuestoId });
});

const ESTADOS_PRESUPUESTO_MANUALES = ['borrador', 'enviado', 'aceptado', 'rechazado'];

app.patch('/api/presupuestos/:id/estado', (req, res) => {
  const presupuestoId = Number(req.params.id);
  const { estado } = req.body;

  const presupuesto = db
    .prepare('SELECT id, estado FROM presupuestos WHERE id = ? AND organizacion_id = ?')
    .get(presupuestoId, req.usuario.organizacion_id);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res.status(400).json({ error: 'Este presupuesto ya se convirtió en venta.' });
  }
  // 'convertido' no se puede poner a mano: lo pone solo la conversión, que
  // es la única que además crea la venta. Si se pudiera setear por acá,
  // quedaría un presupuesto marcado como convertido sin venta detrás.
  if (!ESTADOS_PRESUPUESTO_MANUALES.includes(estado)) {
    return res.status(400).json({ error: 'El estado no es válido.' });
  }

  withTransaction(() => {
    db.prepare('UPDATE presupuestos SET estado = ? WHERE id = ?').run(estado, presupuestoId);
    if (estado !== presupuesto.estado) {
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'presupuesto',
        entidad_id: presupuestoId,
        valor_anterior: JSON.stringify({ estado: presupuesto.estado }),
        valor_nuevo: JSON.stringify({ estado }),
        detalle: `Presupuesto #${presupuestoId}: ${presupuesto.estado} → ${estado}`
      });
    }
  });
  res.json({ id: presupuestoId, estado });
});

// Convertir en venta. Acá sí se valida stock y se congela el costo: es el
// momento en que la mercadería realmente sale. El precio, en cambio, es el
// que se cotizó — es lo que se le prometió al cliente.
app.post('/api/presupuestos/:id/convertir', (req, res) => {
  const presupuestoId = Number(req.params.id);
  exigirLugarEnPlan(req.usuario.organizacion_id, 'ventas_mes');

  const presupuesto = db
    .prepare('SELECT id, cliente_id, estado, lista_precio_id FROM presupuestos WHERE id = ? AND organizacion_id = ?')
    .get(presupuestoId, req.usuario.organizacion_id);
  if (!presupuesto) {
    return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  }
  if (presupuesto.estado === 'convertido') {
    return res.status(400).json({ error: 'Este presupuesto ya se convirtió en venta.' });
  }
  if (presupuesto.estado === 'rechazado') {
    return res
      .status(400)
      .json({ error: 'Este presupuesto está rechazado. Reabrilo antes de convertirlo.' });
  }
  // Con un trabajo en marcha, la venta sale al terminarlo: convertir acá
  // cobraría dos veces lo mismo.
  if (trabajoVivoDelPresupuesto(presupuestoId)) {
    return res.status(400).json({ error: 'Este presupuesto tiene un trabajo: la venta sale al terminarlo.' });
  }

  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, precio_unitario FROM presupuesto_items WHERE presupuesto_id = ?'
    )
    .all(presupuestoId);
  if (items.length === 0) {
    return res.status(400).json({ error: 'El presupuesto no tiene items para convertir.' });
  }

  // Los presupuestos no llevan depósito propio (son una oferta, no
  // comprometen mercadería de un lugar concreto): al convertir se usa el
  // predeterminado del momento, igual que cualquier venta sin depósito
  // elegido a mano.
  const depositoConversion = depositoPredeterminadoId(req.usuario.organizacion_id);
  const errorStock = validarStockDisponible(items, depositoConversion, req.usuario.organizacion_id);
  if (errorStock) {
    return res.status(400).json({ error: errorStock });
  }

  // La venta y la marca del presupuesto van en la misma transacción: si
  // algo falla, no queda una venta creada con el presupuesto sin convertir.
  const ventaId = withTransaction(() => {
    const nuevaVentaId = crearVenta({
      cliente_id: presupuesto.cliente_id,
      items,
      fecha: null,
      deposito_id: depositoConversion,
      lista_precio_id: presupuesto.lista_precio_id,
      organizacion_id: req.usuario.organizacion_id
    });
    db.prepare("UPDATE presupuestos SET estado = 'convertido', venta_id = ? WHERE id = ?").run(
      nuevaVentaId,
      presupuestoId
    );
    auditar(req, {
      accion: 'crear',
      entidad: 'venta',
      entidad_id: nuevaVentaId,
      operacion_tipo: 'presupuesto',
      operacion_id: presupuestoId,
      detalle: `Venta #${nuevaVentaId} creada al convertir el presupuesto #${presupuestoId}`
    });
    auditar(req, {
      accion: 'cambiar_estado',
      entidad: 'presupuesto',
      entidad_id: presupuestoId,
      valor_anterior: JSON.stringify({ estado: presupuesto.estado }),
      valor_nuevo: JSON.stringify({ estado: 'convertido' }),
      operacion_tipo: 'venta',
      operacion_id: nuevaVentaId,
      detalle: `Presupuesto #${presupuestoId} convertido en la venta #${nuevaVentaId}`
    });
    ganarOportunidadesDelPresupuesto(req, presupuestoId, nuevaVentaId);
    return nuevaVentaId;
  });

  res.status(201).json({ id: presupuestoId, venta_id: ventaId });
});


/* ---------- Trabajos (órdenes de trabajo, CLAUDE.md §29, hist. §78) ---------- */

// El módulo `trabajos` (ver la tabla en schema.sql): lo que hay que hacer para
// un cliente, cuándo y quién. Sale de un presupuesto aceptado o se carga
// directo, y al terminarlo pasa a una venta con sus renglones, que cobran los
// cobros de siempre. Hasta ese momento no toca stock ni cuenta corriente, como
// un presupuesto. Es de los dos roles: programar y cerrar trabajos es el día a
// día. La auditoría va como entidad cliente con operacion_tipo trabajo, igual
// que los socios (sin reconstruir auditoria).

const LARGOS_TRABAJO = { titulo: 120, notas: 1000 };
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
// Lo que se cambia a mano; 'terminado' solo lo pone POST .../terminar.
const ESTADOS_TRABAJO_A_MANO = ['pendiente', 'en_curso', 'cancelado'];
const NOMBRES_ESTADO_TRABAJO = { pendiente: 'pendiente', en_curso: 'en curso', terminado: 'terminado', cancelado: 'cancelado' };

const SELECT_TRABAJO = `
  SELECT trabajos.id, trabajos.cliente_id, clientes.nombre AS cliente,
         clientes.telefono AS cliente_telefono, clientes.direccion AS cliente_direccion,
         trabajos.presupuesto_id, trabajos.titulo, trabajos.fecha, trabajos.hora,
         trabajos.responsable_id, usuarios.nombre AS responsable, trabajos.estado, trabajos.notas,
         trabajos.lista_precio_id, trabajos.venta_id, trabajos.fecha_creacion,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM trabajo_items WHERE trabajo_items.trabajo_id = trabajos.id) AS total,
         -- Cuánto lleva, en minutos, para el largo del bloque en la agenda
         -- (hist. §80): lo que se cobra por hora son esas horas; el resto, la
         -- duración estimada de cada servicio por su cantidad. NULL = sin dato.
         (SELECT SUM(CASE WHEN productos.unidad = 'hora' THEN trabajo_items.cantidad * 60
                          ELSE productos.duracion_minutos * trabajo_items.cantidad END)
            FROM trabajo_items JOIN productos ON productos.id = trabajo_items.producto_id
           WHERE trabajo_items.trabajo_id = trabajos.id) AS duracion_estimada,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN trabajo_items.cantidad = CAST(trabajo_items.cantidad AS INTEGER)
                         THEN CAST(trabajo_items.cantidad AS INTEGER)
                         ELSE trabajo_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM trabajo_items JOIN productos ON productos.id = trabajo_items.producto_id
           WHERE trabajo_items.trabajo_id = trabajos.id) AS items_resumen
    FROM trabajos
    JOIN clientes ON clientes.id = trabajos.cliente_id
    LEFT JOIN usuarios ON usuarios.id = trabajos.responsable_id`;

const trabajoVivoDelPresupuesto = (presupuestoId) =>
  db.prepare("SELECT id FROM trabajos WHERE presupuesto_id = ? AND estado <> 'cancelado'").get(presupuestoId)?.id ?? null;

function trabajoDeLaEmpresa(id, organizacionId) {
  return db.prepare(`${SELECT_TRABAJO} WHERE trabajos.id = ? AND trabajos.organizacion_id = ?`).get(id, organizacionId);
}

function itemsDelTrabajo(trabajoId) {
  return db
    .prepare(
      `SELECT trabajo_items.id, trabajo_items.producto_id, trabajo_items.variante_id, productos.nombre AS producto,
              productos.unidad, productos.tipo, trabajo_items.cantidad, trabajo_items.precio_unitario
         FROM trabajo_items JOIN productos ON productos.id = trabajo_items.producto_id
        WHERE trabajo_items.trabajo_id = ?
        ORDER BY trabajo_items.id`
    )
    .all(trabajoId)
    .map((i) => ({
      ...i,
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null,
      subtotal: i.cantidad * i.precio_unitario
    }));
}

// Los renglones se reemplazan enteros, como los de un presupuesto: un trabajo
// no tiene efectos que revertir hasta que se termina.
function guardarItemsTrabajo(trabajoId, items) {
  db.prepare('DELETE FROM trabajo_items WHERE trabajo_id = ?').run(trabajoId);
  const insertar = db.prepare(
    'INSERT INTO trabajo_items (trabajo_id, producto_id, variante_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)'
  );
  for (const item of items) {
    insertar.run(
      trabajoId,
      Number(item.producto_id),
      item.variante_id ? Number(item.variante_id) : null,
      Number(item.cantidad),
      Number(item.precio_unitario)
    );
  }
}

// Valida lo que se carga a mano de un trabajo, para el alta y la edición.
// Devuelve { error } o { datos }. Con `parcial` el título puede faltar: el de
// un trabajo que sale de un presupuesto lo pone el servidor. Los renglones
// pueden quedar vacíos hasta terminarlo.
function validarTrabajo(cuerpo, organizacionId, { parcial }) {
  const datos = {};
  for (const campo of ['titulo', 'notas']) {
    const valor = cuerpo?.[campo];
    if (valor !== undefined && valor !== null && typeof valor !== 'string') {
      return { error: 'Los datos del trabajo no son válidos.' };
    }
    const texto = (valor ?? '').trim();
    if (texto.length > LARGOS_TRABAJO[campo]) {
      return { error: `${campo === 'titulo' ? 'El título' : 'Las notas'} no puede pasar de ${LARGOS_TRABAJO[campo]} caracteres.` };
    }
    datos[campo] = texto === '' ? null : texto;
  }
  if (!parcial && !datos.titulo) return { error: 'Contá qué hay que hacer: el trabajo necesita un título.' };

  const fecha = cuerpo?.fecha || null;
  const hora = cuerpo?.hora || null;
  if (fecha !== null && !validarFecha(fecha)) return { error: 'La fecha no es válida.' };
  if (hora !== null && (typeof hora !== 'string' || !HORA_VALIDA.test(hora))) return { error: 'La hora no es válida.' };
  if (hora && !fecha) return { error: 'Elegí también el día del trabajo.' };
  datos.fecha = fecha;
  datos.hora = hora;

  const responsable = cuerpo?.responsable_id ?? null;
  datos.responsable_id = null;
  if (responsable !== null && responsable !== '') {
    const activo = db
      .prepare('SELECT 1 FROM usuario_organizaciones WHERE usuario_id = ? AND organizacion_id = ? AND activo = 1')
      .get(Number(responsable), organizacionId);
    if (!activo) return { error: 'El responsable no es un usuario de este negocio.' };
    datos.responsable_id = Number(responsable);
  }

  if (cuerpo?.items !== undefined) {
    if (!Array.isArray(cuerpo.items)) return { error: 'Los renglones del trabajo no son válidos.' };
    const error = errorEnItemsCotizados(cuerpo.items, organizacionId);
    if (error) return { error };
    datos.items = cuerpo.items;
  }
  return { datos };
}

// El título de un trabajo que sale de un presupuesto: su primer renglón, y
// cuántos más tiene.
function tituloDesdeItems(items) {
  const primero = db.prepare('SELECT nombre FROM productos WHERE id = ?').get(items[0].producto_id).nombre;
  return items.length > 1 ? `${primero} y ${items.length - 1} más` : primero;
}

// Los que tienen fecha primero, del más próximo al más lejano; los que no, al
// final, del más nuevo al más viejo.
app.get('/api/trabajos', (req, res) => {
  res.json(
    db
      .prepare(
        `${SELECT_TRABAJO} WHERE trabajos.organizacion_id = ?
          ORDER BY trabajos.fecha IS NULL, trabajos.fecha, trabajos.hora IS NULL, trabajos.hora, trabajos.id DESC`
      )
      .all(req.usuario.organizacion_id)
  );
});

// Quiénes pueden quedar a cargo: los usuarios activos del negocio. Aparte de
// GET /api/usuarios, que es de admin y trae el rol y los accesos.
app.get('/api/trabajos/responsables', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT usuarios.id, usuarios.nombre
           FROM usuario_organizaciones JOIN usuarios ON usuarios.id = usuario_organizaciones.usuario_id
          WHERE usuario_organizaciones.organizacion_id = ? AND usuario_organizaciones.activo = 1
          ORDER BY usuarios.nombre`
      )
      .all(req.usuario.organizacion_id)
  );
});

app.get('/api/trabajos/:id', (req, res) => {
  const trabajo = trabajoDeLaEmpresa(Number(req.params.id), req.usuario.organizacion_id);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  res.json({ ...trabajo, items: itemsDelTrabajo(trabajo.id) });
});

// Alta directa (cliente, título, renglones) o desde un presupuesto
// (presupuesto_id): ahí el cliente, los renglones y la lista son los del
// presupuesto, que pasa a aceptado si todavía no lo estaba.
app.post('/api/trabajos', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const desdePresupuesto = req.body?.presupuesto_id != null;
  const { error, datos } = validarTrabajo(req.body, organizacionId, { parcial: desdePresupuesto });
  if (error) return res.status(400).json({ error });

  let presupuesto = null;
  let items = datos.items ?? [];
  let listaPrecioId = null;
  if (desdePresupuesto) {
    presupuesto = db
      .prepare('SELECT id, cliente_id, estado, lista_precio_id FROM presupuestos WHERE id = ? AND organizacion_id = ?')
      .get(Number(req.body.presupuesto_id), organizacionId);
    if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    if (presupuesto.estado === 'convertido') {
      return res.status(400).json({ error: 'Este presupuesto ya se convirtió en venta.' });
    }
    if (presupuesto.estado === 'rechazado') {
      return res.status(400).json({ error: 'Este presupuesto está rechazado. Reabrilo antes de programar el trabajo.' });
    }
    if (trabajoVivoDelPresupuesto(presupuesto.id)) {
      return res.status(400).json({ error: 'Este presupuesto ya tiene un trabajo.' });
    }
    items = db
      .prepare('SELECT producto_id, variante_id, cantidad, precio_unitario FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id')
      .all(presupuesto.id);
    if (items.length === 0) return res.status(400).json({ error: 'El presupuesto no tiene renglones.' });
    listaPrecioId = presupuesto.lista_precio_id;
  } else if (req.body.lista_precio_id) {
    listaPrecioId = Number(req.body.lista_precio_id);
    if (!listaPrecioValida(listaPrecioId, organizacionId)) {
      return res.status(400).json({ error: 'La lista de precios seleccionada no existe.' });
    }
  }

  const id = withTransaction(() => {
    const clienteId = presupuesto
      ? presupuesto.cliente_id
      : resolverCliente(req.body.cliente, req.body.cliente_id, organizacionId).id;
    const titulo = datos.titulo ?? tituloDesdeItems(items);
    const { lastInsertRowid: nuevoId } = db
      .prepare(
        `INSERT INTO trabajos (cliente_id, presupuesto_id, titulo, fecha, hora, responsable_id, notas, lista_precio_id, organizacion_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(clienteId, presupuesto?.id ?? null, titulo, datos.fecha, datos.hora, datos.responsable_id, datos.notas, listaPrecioId, organizacionId);
    guardarItemsTrabajo(nuevoId, items);
    if (presupuesto && presupuesto.estado !== 'aceptado') {
      db.prepare("UPDATE presupuestos SET estado = 'aceptado' WHERE id = ?").run(presupuesto.id);
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'presupuesto',
        entidad_id: presupuesto.id,
        valor_anterior: JSON.stringify({ estado: presupuesto.estado }),
        valor_nuevo: JSON.stringify({ estado: 'aceptado' }),
        operacion_tipo: 'trabajo',
        operacion_id: nuevoId,
        detalle: `Presupuesto #${presupuesto.id} aceptado al programar el trabajo #${nuevoId}`
      });
    }
    auditar(req, {
      accion: 'crear',
      entidad: 'cliente',
      entidad_id: clienteId,
      operacion_tipo: 'trabajo',
      operacion_id: nuevoId,
      detalle: `Trabajo #${nuevoId} "${titulo}" ` + (presupuesto ? `programado desde el presupuesto #${presupuesto.id}` : 'creado')
    });
    return nuevoId;
  });
  res.status(201).json({ id });
});

// Editar lo que falta hacer: título, fecha, responsable, notas y renglones (las
// horas reales, un material de más). El cliente se cambia solo si el trabajo
// no salió de un presupuesto. Uno terminado o cancelado no se edita.
app.put('/api/trabajos/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const trabajo = trabajoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  if (trabajo.estado === 'terminado' || trabajo.estado === 'cancelado') {
    return res.status(400).json({ error: `Este trabajo está ${NOMBRES_ESTADO_TRABAJO[trabajo.estado]}: ya no se edita.` });
  }
  const { error, datos } = validarTrabajo(req.body, organizacionId, { parcial: false });
  if (error) return res.status(400).json({ error });
  const cambiaCliente = !trabajo.presupuesto_id && (req.body.cliente_id != null || req.body.cliente != null);

  withTransaction(() => {
    const clienteId = cambiaCliente ? resolverCliente(req.body.cliente, req.body.cliente_id, organizacionId).id : trabajo.cliente_id;
    const nuevo = { ...datos, cliente_id: clienteId };
    db.prepare(
      'UPDATE trabajos SET cliente_id = ?, titulo = ?, fecha = ?, hora = ?, responsable_id = ?, notas = ? WHERE id = ?'
    ).run(clienteId, nuevo.titulo, nuevo.fecha, nuevo.hora, nuevo.responsable_id, nuevo.notas, trabajo.id);
    if (datos.items) guardarItemsTrabajo(trabajo.id, datos.items);
    const diff = diffCampos(trabajo, nuevo, ['cliente_id', 'titulo', 'fecha', 'hora', 'responsable_id', 'notas']);
    if (diff || datos.items) {
      auditar(req, {
        accion: 'editar',
        entidad: 'cliente',
        entidad_id: clienteId,
        valor_anterior: diff?.anterior ?? null,
        valor_nuevo: diff?.nuevo ?? null,
        operacion_tipo: 'trabajo',
        operacion_id: trabajo.id,
        detalle: `Trabajo #${trabajo.id} "${nuevo.titulo}" editado`
      });
    }
  });
  res.json({ id: trabajo.id });
});

// Empezar, volver a pendiente, cancelar o retomar uno cancelado. Terminar va
// aparte, porque crea la venta.
app.patch('/api/trabajos/:id/estado', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const trabajo = trabajoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  const estado = req.body?.estado;
  if (!ESTADOS_TRABAJO_A_MANO.includes(estado)) return res.status(400).json({ error: 'El estado no es válido.' });
  if (trabajo.estado === 'terminado') {
    return res.status(400).json({ error: 'Este trabajo ya está terminado: lo que cambie, cambialo en su venta.' });
  }
  if (trabajo.estado === estado) return res.json({ id: trabajo.id, estado });
  // Retomar uno cancelado: su presupuesto puede tener ya otro trabajo, o
  // haberse convertido en venta mientras tanto.
  if (trabajo.estado === 'cancelado' && trabajo.presupuesto_id) {
    const presupuesto = db.prepare('SELECT estado FROM presupuestos WHERE id = ?').get(trabajo.presupuesto_id);
    if (presupuesto.estado === 'convertido' || trabajoVivoDelPresupuesto(trabajo.presupuesto_id)) {
      return res.status(400).json({ error: 'Su presupuesto ya tiene otro trabajo o se convirtió en venta.' });
    }
  }
  withTransaction(() => {
    db.prepare('UPDATE trabajos SET estado = ? WHERE id = ?').run(estado, trabajo.id);
    auditar(req, {
      accion: 'cambiar_estado',
      entidad: 'cliente',
      entidad_id: trabajo.cliente_id,
      valor_anterior: JSON.stringify({ estado: trabajo.estado }),
      valor_nuevo: JSON.stringify({ estado }),
      operacion_tipo: 'trabajo',
      operacion_id: trabajo.id,
      detalle: `Trabajo #${trabajo.id} "${trabajo.titulo}" ${NOMBRES_ESTADO_TRABAJO[estado]}`
    });
  });
  res.json({ id: trabajo.id, estado });
});

// Terminar: la venta con los renglones del trabajo, desde el depósito
// predeterminado (como la conversión de un presupuesto) y con la lista del
// trabajo. Su presupuesto, si tiene, queda convertido en esa misma venta. Todo
// en una transacción: no queda una venta sin su trabajo terminado.
app.post('/api/trabajos/:id/terminar', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const trabajo = trabajoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado.' });
  if (trabajo.estado === 'terminado') return res.status(400).json({ error: 'Este trabajo ya está terminado.' });
  if (trabajo.estado === 'cancelado') {
    return res.status(400).json({ error: 'Este trabajo está cancelado: retomalo antes de terminarlo.' });
  }
  const items = db
    .prepare('SELECT producto_id, variante_id, cantidad, precio_unitario FROM trabajo_items WHERE trabajo_id = ? ORDER BY id')
    .all(trabajo.id);
  if (items.length === 0) {
    return res.status(400).json({ error: 'Cargale al trabajo lo que se cobra antes de terminarlo.' });
  }
  exigirLugarEnPlan(organizacionId, 'ventas_mes');
  const deposito = depositoPredeterminadoId(organizacionId);
  const errorStock = validarStockDisponible(items, deposito, organizacionId);
  if (errorStock) return res.status(400).json({ error: errorStock });

  const ventaId = withTransaction(() => {
    const nuevaVentaId = crearVenta({
      cliente_id: trabajo.cliente_id,
      items,
      fecha: null,
      deposito_id: deposito,
      lista_precio_id: trabajo.lista_precio_id,
      organizacion_id: organizacionId
    });
    db.prepare("UPDATE trabajos SET estado = 'terminado', venta_id = ? WHERE id = ?").run(nuevaVentaId, trabajo.id);
    auditar(req, {
      accion: 'crear',
      entidad: 'venta',
      entidad_id: nuevaVentaId,
      operacion_tipo: 'trabajo',
      operacion_id: trabajo.id,
      detalle: `Venta #${nuevaVentaId} creada al terminar el trabajo #${trabajo.id} "${trabajo.titulo}"`
    });
    auditar(req, {
      accion: 'cambiar_estado',
      entidad: 'cliente',
      entidad_id: trabajo.cliente_id,
      valor_anterior: JSON.stringify({ estado: trabajo.estado }),
      valor_nuevo: JSON.stringify({ estado: 'terminado' }),
      operacion_tipo: 'trabajo',
      operacion_id: trabajo.id,
      detalle: `Trabajo #${trabajo.id} "${trabajo.titulo}" terminado, en la venta #${nuevaVentaId}`
    });
    if (trabajo.presupuesto_id) {
      const { estado } = db.prepare('SELECT estado FROM presupuestos WHERE id = ?').get(trabajo.presupuesto_id);
      db.prepare("UPDATE presupuestos SET estado = 'convertido', venta_id = ? WHERE id = ?").run(nuevaVentaId, trabajo.presupuesto_id);
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'presupuesto',
        entidad_id: trabajo.presupuesto_id,
        valor_anterior: JSON.stringify({ estado }),
        valor_nuevo: JSON.stringify({ estado: 'convertido' }),
        operacion_tipo: 'venta',
        operacion_id: nuevaVentaId,
        detalle: `Presupuesto #${trabajo.presupuesto_id} convertido en la venta #${nuevaVentaId} al terminar su trabajo`
      });
      ganarOportunidadesDelPresupuesto(req, trabajo.presupuesto_id, nuevaVentaId);
    }
    return nuevaVentaId;
  });
  res.status(201).json({ id: trabajo.id, venta_id: ventaId });
});

/* ---------- Devoluciones ---------- */

// Una devolución revierte parte (o todo) de una venta ya confirmada
// (CLAUDE.md §17). A diferencia de anular, es parcial por renglón y puede
// convivir con cobros y con una factura ya emitida.

const SELECT_DEVOLUCION = `
  SELECT devoluciones.id, devoluciones.venta_id, devoluciones.fecha, devoluciones.estado,
         devoluciones.motivo, devoluciones.cuenta_tesoreria_id,
         cuentas_tesoreria.nombre AS cuenta,
         ventas.cliente_id, clientes.nombre AS cliente,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM devolucion_items WHERE devolucion_items.devolucion_id = devoluciones.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN devolucion_items.cantidad = CAST(devolucion_items.cantidad AS INTEGER)
                         THEN CAST(devolucion_items.cantidad AS INTEGER)
                         ELSE devolucion_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
           WHERE devolucion_items.devolucion_id = devoluciones.id) AS items_resumen,
         EXISTS (SELECT 1 FROM facturas WHERE facturas.devolucion_id = devoluciones.id) AS tiene_nota_credito
    FROM devoluciones
    JOIN ventas ON ventas.id = devoluciones.venta_id
    JOIN clientes ON clientes.id = ventas.cliente_id
    LEFT JOIN cuentas_tesoreria ON cuentas_tesoreria.id = devoluciones.cuenta_tesoreria_id`;

function decorarDevolucion(d) {
  return {
    ...d,
    tiene_nota_credito: Boolean(d.tiene_nota_credito),
    reintegrada: d.cuenta_tesoreria_id != null
  };
}

app.get('/api/devoluciones', (req, res) => {
  const devoluciones = db
    .prepare(`${SELECT_DEVOLUCION} WHERE devoluciones.organizacion_id = ? ORDER BY devoluciones.id DESC`)
    .all(req.usuario.organizacion_id);
  res.json(devoluciones.map(decorarDevolucion));
});

app.get('/api/devoluciones/:id', (req, res) => {
  const devolucionId = Number(req.params.id);
  const devolucion = db
    .prepare(`${SELECT_DEVOLUCION} WHERE devoluciones.id = ? AND devoluciones.organizacion_id = ?`)
    .get(devolucionId, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_items.id, devolucion_items.venta_item_id, devolucion_items.producto_id,
              devolucion_items.variante_id, productos.nombre AS producto, devolucion_items.cantidad,
              devolucion_items.precio_unitario, devolucion_items.vuelve_stock
         FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
        WHERE devolucion_id = ?
        ORDER BY devolucion_items.id`
    )
    .all(devolucionId);

  res.json({
    ...decorarDevolucion(devolucion),
    items: items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precio_unitario,
      vuelve_stock: Boolean(i.vuelve_stock),
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null
    }))
  });
});

// Cuánto queda disponible para devolver de cada renglón de una venta: lo
// vendido menos lo ya devuelto por devoluciones activas. venta_item_id (no
// producto_id) es la clave, para que el tope sea correcto aunque el mismo
// producto aparezca en más de un renglón de la venta.
function itemsDevolviblesDeVenta(ventaId) {
  return db
    .prepare(
      `SELECT venta_items.id AS venta_item_id, venta_items.producto_id, venta_items.variante_id, productos.nombre,
              venta_items.precio_unitario, venta_items.costo_unitario_historico,
              venta_items.cantidad - COALESCE((
                SELECT SUM(devolucion_items.cantidad)
                  FROM devolucion_items JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
                 WHERE devolucion_items.venta_item_id = venta_items.id AND devoluciones.estado = 'activa'
              ), 0) AS disponible
         FROM venta_items JOIN productos ON productos.id = venta_items.producto_id
        WHERE venta_items.venta_id = ?`
    )
    .all(ventaId);
}

// Aplica los efectos de una devolución ya cargada: entrada de stock (solo
// en los renglones marcados vuelve_stock), crédito en la cuenta corriente
// del cliente, y egreso de caja si se marcó devolver la plata. Asume que
// se la llama DENTRO de una transacción — la usan tanto el alta como
// restaurar desde la papelera (mismo criterio que crearVenta).
function aplicarDevolucion(devolucionId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones.venta_id, devoluciones.cuenta_tesoreria_id, devoluciones.deposito_id,
              ventas.cliente_id, ventas.organizacion_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ?`
    )
    .get(devolucionId);

  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, precio_unitario, vuelve_stock FROM devolucion_items WHERE devolucion_id = ?'
    )
    .all(devolucionId);

  let total = 0;
  for (const item of items) {
    if (item.vuelve_stock) {
      // Reingresa al mismo depósito de donde salió con la venta original:
      // es la mercadería físicamente volviendo al lugar del que se fue.
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        deposito_id: devolucion.deposito_id,
        tipo: 'entrada',
        cantidad: item.cantidad,
        origen: 'devolucion',
        devolucion_id: devolucionId,
        nota: 'Devolución de venta',
        organizacion_id: devolucion.organizacion_id
      });
    }
    total += item.cantidad * item.precio_unitario;
  }

  // Crédito a favor del cliente: baja la deuda, igual signo que un cobro.
  db.prepare(
    `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
  ).run(devolucion.cliente_id, -total, devolucion.venta_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Reintegrar en efectivo salda al instante el crédito que se acaba de
    // generar arriba: sin este segundo ajuste (+total, que cancela el
    // -total de arriba) quedaría un saldo a favor fantasma en la cuenta
    // corriente del cliente ADEMÁS de la plata que ya salió de la caja.
    db.prepare(
      `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cliente_id, total, devolucion.venta_id);

    db.prepare(
      `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_id, organizacion_id, fecha) VALUES (?, 'egreso', ?, 'devolucion', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionId, devolucion.organizacion_id);
  }
}

// El espejo exacto de aplicarDevolucion: lo usa anular. No se borran los
// movimientos originales (se conserva la auditoría), se insertan los de
// reversión — mismo criterio que anular una venta o una compra.
function revertirDevolucion(devolucionId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones.venta_id, devoluciones.cuenta_tesoreria_id, devoluciones.deposito_id,
              ventas.cliente_id, ventas.organizacion_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ?`
    )
    .get(devolucionId);

  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, precio_unitario, vuelve_stock FROM devolucion_items WHERE devolucion_id = ?'
    )
    .all(devolucionId);

  let total = 0;
  for (const item of items) {
    if (item.vuelve_stock) {
      registrarMovimientoStock({
        producto_id: item.producto_id,
        variante_id: item.variante_id,
        deposito_id: devolucion.deposito_id,
        tipo: 'salida',
        cantidad: item.cantidad,
        origen: 'devolucion',
        devolucion_id: devolucionId,
        nota: 'Reversión por anulación',
        organizacion_id: devolucion.organizacion_id
      });
    }
    total += item.cantidad * item.precio_unitario;
  }

  // Vuelve a subir la deuda del cliente (se había bajado al aplicar).
  db.prepare(
    `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
  ).run(devolucion.cliente_id, total, devolucion.venta_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Espejo del ajuste de reintegro en aplicarDevolucion: vuelve a bajar
    // la cuenta corriente para deshacer la reconciliación de arriba.
    db.prepare(
      `INSERT INTO movimientos_cc_clientes (cliente_id, tipo, importe, venta_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cliente_id, -total, devolucion.venta_id);

    db.prepare(
      `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_id, organizacion_id, fecha) VALUES (?, 'ingreso', ?, 'devolucion', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionId, devolucion.organizacion_id);
  }
}

app.post('/api/devoluciones', (req, res) => {
  const { venta_id, items, motivo, cuenta_tesoreria_id } = req.body;
  const ventaId = Number(venta_id);

  const venta = db
    .prepare('SELECT id, deposito_id, estado FROM ventas WHERE id = ? AND organizacion_id = ?')
    .get(ventaId, req.usuario.organizacion_id);
  if (!venta) {
    return res.status(404).json({ error: 'Venta no encontrada.' });
  }
  if (venta.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta venta está anulada, no se le puede registrar una devolución.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La devolución necesita al menos un item.' });
  }
  // La devolución reingresa al MISMO depósito de la venta original: no es
  // una elección del operador, es de dónde salió físicamente la mercadería.
  const depositoDevolucion = venta.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);

  const vistos = new Set();
  for (const item of items) {
    const id = Number(item.venta_item_id);
    if (vistos.has(id)) {
      return res.status(400).json({ error: 'No se puede repetir el mismo item de la venta.' });
    }
    vistos.add(id);
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad a devolver debe ser mayor a 0.' });
    }
  }

  if (cuenta_tesoreria_id) {
    const cuenta = db
      .prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
      .get(cuenta_tesoreria_id, req.usuario.organizacion_id);
    if (!cuenta) {
      return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
    }
  }

  const disponibles = new Map(
    itemsDevolviblesDeVenta(ventaId).map((r) => [r.venta_item_id, r])
  );
  for (const item of items) {
    const renglon = disponibles.get(Number(item.venta_item_id));
    if (!renglon) {
      return res.status(400).json({ error: 'Uno de los items no pertenece a esta venta.' });
    }
    if (Number(item.cantidad) > renglon.disponible) {
      const detalle = renglon.variante_id ? ` (${combinacionVariante(renglon.variante_id)})` : '';
      return res.status(400).json({
        error: `No se puede devolver más de lo vendido de "${renglon.nombre}"${detalle} (disponible: ${renglon.disponible}).`
      });
    }
  }

  const devolucionId = withTransaction(() => {
    const { lastInsertRowid: nuevaId } = db
      .prepare(
        `INSERT INTO devoluciones (venta_id, cuenta_tesoreria_id, motivo, deposito_id, organizacion_id, fecha) VALUES (?, ?, ?, ?, ?, ${HOY_SQL})`
      )
      .run(ventaId, cuenta_tesoreria_id || null, motivo?.trim() || null, depositoDevolucion, req.usuario.organizacion_id);

    const insertItem = db.prepare(
      `INSERT INTO devolucion_items
              (devolucion_id, venta_item_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario_historico, vuelve_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      const renglon = disponibles.get(Number(item.venta_item_id));
      const vuelveStock = item.vuelve_stock === false || item.vuelve_stock === 0 ? 0 : 1;
      insertItem.run(
        nuevaId,
        renglon.venta_item_id,
        renglon.producto_id,
        renglon.variante_id,
        Number(item.cantidad),
        renglon.precio_unitario,
        renglon.costo_unitario_historico,
        vuelveStock
      );
    }

    aplicarDevolucion(nuevaId);
    auditar(req, {
      accion: 'crear',
      entidad: 'devolucion',
      entidad_id: nuevaId,
      operacion_tipo: 'venta',
      operacion_id: ventaId,
      detalle: `Devolución #${nuevaId} sobre la venta #${ventaId}`
    });
    return nuevaId;
  });

  res.status(201).json({ id: devolucionId });
});

// Nota de crédito: comprobante fiscal aparte, opcional — igual que
// "Facturar" en una venta (CLAUDE.md §16). Arranca su propia numeración
// (tipo 'nota_credito'), independiente de la de las facturas.
app.post('/api/devoluciones/:id/nota-credito', (req, res) => {
  const devolucionId = Number(req.params.id);
  const { condicion, letra, punto_venta } = req.body;
  const letraFinal = letra || 'B';
  const puntoVentaFinal = Number(punto_venta) || 1;

  const devolucion = db
    .prepare(
      `SELECT devoluciones.id, devoluciones.estado, ventas.cliente_id
         FROM devoluciones JOIN ventas ON ventas.id = devoluciones.venta_id
        WHERE devoluciones.id = ? AND ventas.organizacion_id = ?`
    )
    .get(devolucionId, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución está anulada.' });
  }

  const yaTiene = db.prepare('SELECT 1 FROM facturas WHERE devolucion_id = ?').get(devolucionId);
  if (yaTiene) {
    return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
  }

  const { total } = db
    .prepare('SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total FROM devolucion_items WHERE devolucion_id = ?')
    .get(devolucionId);

  let facturaId;
  try {
    facturaId = withTransaction(() => {
      const numero = siguienteNumero(req.usuario.organizacion_id, puntoVentaFinal, 'nota_credito', letraFinal);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO facturas (cliente_id, concepto, neto, condicion, estado, devolucion_id, tipo, letra, punto_venta, numero, organizacion_id, fecha)
           VALUES (?, ?, ?, ?, 'cobrado', ?, 'nota_credito', ?, ?, ?, ?, ${HOY_SQL})`
        )
        .run(
          devolucion.cliente_id,
          `Devolución #${devolucionId}`,
          total,
          condicion || 'efectivo',
          devolucionId,
          letraFinal,
          puntoVentaFinal,
          numero,
          req.usuario.organizacion_id
        );
      auditar(req, {
        accion: 'crear',
        entidad: 'factura',
        entidad_id: lastInsertRowid,
        operacion_tipo: 'devolucion',
        operacion_id: devolucionId,
        detalle: `Nota de crédito #${lastInsertRowid} para la devolución #${devolucionId}`
      });
      return lastInsertRowid;
    });
  } catch (err) {
    if (String(err.message).includes('idx_facturas_devolucion_id')) {
      return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
    }
    if (String(err.message).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'No se pudo asignar el número de comprobante, probá de nuevo.' });
    }
    throw err;
  }

  res.status(201).json({ id: facturaId });
});

app.post('/api/devoluciones/:id/anular', soloAdmin, (req, res) => {
  const devolucionId = Number(req.params.id);

  const devolucion = db
    .prepare('SELECT id, estado FROM devoluciones WHERE id = ? AND organizacion_id = ?')
    .get(devolucionId, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución ya está anulada.' });
  }

  const tieneNotaCredito = db.prepare('SELECT 1 FROM facturas WHERE devolucion_id = ?').get(devolucionId);
  if (tieneNotaCredito) {
    return res
      .status(400)
      .json({ error: 'Esta devolución tiene una nota de crédito asociada, no se puede anular.' });
  }

  withTransaction(() => {
    revertirDevolucion(devolucionId);
    db.prepare("UPDATE devoluciones SET estado = 'anulada' WHERE id = ?").run(devolucionId);
    auditar(req, {
      accion: 'anular',
      entidad: 'devolucion',
      entidad_id: devolucionId,
      detalle: `Devolución #${devolucionId} anulada`
    });
  });

  res.json({ id: devolucionId, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo (stock,
// cuenta corriente y, si correspondía, el egreso de caja). Puede fallar si
// en el medio se volvió a vender el stock que había entrado por acá —
// mismo cuidado que restaurar una venta.
app.post('/api/devoluciones/:id/restaurar', soloAdmin, (req, res) => {
  const devolucionId = Number(req.params.id);

  const devolucion = db
    .prepare('SELECT id, estado, deposito_id FROM devoluciones WHERE id = ? AND organizacion_id = ?')
    .get(devolucionId, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución no encontrada.' });
  }
  if (devolucion.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta devolución no está en la papelera.' });
  }
  const depositoDevolucionVentaRestaurar = devolucion.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);

  const items = db
    .prepare(
      `SELECT devolucion_items.producto_id, devolucion_items.cantidad, devolucion_items.vuelve_stock,
              productos.nombre
         FROM devolucion_items JOIN productos ON productos.id = devolucion_items.producto_id
        WHERE devolucion_id = ?`
    )
    .all(devolucionId);

  const buscarStockDeposito = db.prepare(
    'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
  );
  for (const item of items) {
    if (!item.vuelve_stock || esServicio(item.producto_id)) continue;
    const stockActual = buscarStockDeposito.get(item.producto_id, depositoDevolucionVentaRestaurar)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta devolución.${dondeHayStock(item.producto_id, depositoDevolucionVentaRestaurar)}`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE devoluciones SET estado = 'activa' WHERE id = ?").run(devolucionId);
    aplicarDevolucion(devolucionId);
    auditar(req, {
      accion: 'restaurar',
      entidad: 'devolucion',
      entidad_id: devolucionId,
      detalle: `Devolución #${devolucionId} restaurada desde la papelera`
    });
  });

  res.json({ id: devolucionId, estado: 'activa' });
});


/* ---------- Compras ---------- */

const ESTADOS_ENVIO = ['pedido', 'en_camino', 'recibido'];

// devuelto: plata acreditada por devoluciones a proveedor activas de esta
// compra (ver sección Devoluciones a proveedor más abajo). neto = total -
// devuelto: es lo que realmente se le sigue debiendo al proveedor — el
// estado_pago (y el saldo pendiente para pagar) compara contra neto, no
// contra el total bruto. Mismo criterio que SUBQUERY_DEVUELTO_VENTA.
const SUBQUERY_DEVUELTO_COMPRA = `
  (SELECT COALESCE(SUM(devolucion_proveedor_items.cantidad * devolucion_proveedor_items.precio_unitario), 0)
     FROM devolucion_proveedor_items
     JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
     JOIN compra_items ON compra_items.id = devolucion_proveedor_items.compra_item_id
    WHERE compra_items.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa')`;

// El total de una compra incluye el envío: es plata que se le debe al
// proveedor igual que la mercadería (CLAUDE.md §6 lo lista como "costos
// adicionales" dentro de la cabecera de la compra).
app.get('/api/compras', soloAdmin, (req, res) => {
  const compras = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, proveedores.nombre AS proveedor, compras.fecha,
              compras.estado, compras.estado_envio, compras.costo_envio, compras.stock_aplicado,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
                 FROM compra_items WHERE compra_items.compra_id = compras.id) AS subtotal,
              (SELECT COALESCE(SUM(importe), 0)
                 FROM pagos WHERE pagos.compra_id = compras.id) AS pagado,
              ${SUBQUERY_DEVUELTO_COMPRA} AS devuelto,
              EXISTS (SELECT 1 FROM devoluciones_proveedor
                       WHERE devoluciones_proveedor.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa') AS tiene_devolucion
       FROM compras
       JOIN proveedores ON proveedores.id = compras.proveedor_id
       WHERE compras.organizacion_id = ?
       ORDER BY compras.id DESC`
    )
    .all(req.usuario.organizacion_id);
  res.json(
    compras.map((c) => {
      const total = c.subtotal + c.costo_envio;
      const neto = total - c.devuelto;
      return {
        ...c,
        total,
        neto,
        tiene_devolucion: Boolean(c.tiene_devolucion),
        estado_pago: c.pagado <= 0 ? 'pendiente' : c.pagado >= neto ? 'pagado' : 'parcial'
      };
    })
  );
});

app.get('/api/compras/:id', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);
  const compra = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, proveedores.nombre AS proveedor, compras.fecha,
              compras.estado, compras.estado_envio, compras.costo_envio, compras.stock_aplicado,
              compras.deposito_id, depositos.nombre AS deposito,
              compras.condicion_pago, compras.fecha_vencimiento,
              EXISTS (SELECT 1 FROM devoluciones_proveedor
                       WHERE devoluciones_proveedor.compra_id = compras.id AND devoluciones_proveedor.estado = 'activa') AS tiene_devolucion
         FROM compras
         JOIN proveedores ON proveedores.id = compras.proveedor_id
         LEFT JOIN depositos ON depositos.id = compras.deposito_id
        WHERE compras.id = ? AND compras.organizacion_id = ?`
    )
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  // cantidad_devuelta: cuánto de este renglón ya se devolvió al proveedor
  // (solo cuenta devoluciones activas) — alimenta el modal de devolución
  // para topar la cantidad a devolver a lo que realmente queda.
  const items = db
    .prepare(
      `SELECT compra_items.id, compra_items.producto_id, compra_items.variante_id, productos.nombre AS producto,
              compra_items.cantidad, compra_items.precio_unitario, compra_items.costo_real_unitario,
              COALESCE((
                SELECT SUM(devolucion_proveedor_items.cantidad)
                  FROM devolucion_proveedor_items
                  JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
                 WHERE devolucion_proveedor_items.compra_item_id = compra_items.id
                   AND devoluciones_proveedor.estado = 'activa'
              ), 0) AS cantidad_devuelta
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_id = ?
        ORDER BY compra_items.id`
    )
    .all(compraId);

  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const total = subtotal + compra.costo_envio;
  const devuelto = items.reduce((acc, i) => acc + i.cantidad_devuelta * i.precio_unitario, 0);
  const neto = total - devuelto;
  const { pagado } = db
    .prepare('SELECT COALESCE(SUM(importe), 0) AS pagado FROM pagos WHERE compra_id = ?')
    .get(compraId);

  res.json({
    ...compra,
    tiene_devolucion: Boolean(compra.tiene_devolucion),
    items: items.map((i) => ({
      ...i,
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null,
      subtotal: i.cantidad * i.precio_unitario,
      disponible_devolucion: i.cantidad - i.cantidad_devuelta
    })),
    subtotal,
    total,
    devuelto,
    neto,
    pagado,
    estado_pago: pagado <= 0 ? 'pendiente' : pagado >= neto ? 'pagado' : 'parcial'
  });
});

// Prorrateo del costo de envío por valor del ítem (CLAUDE.md §7): si el
// producto A vale el 80% de la compra, absorbe el 80% del envío. El caso
// borde de una compra con subtotal 0 (todo a precio cero) se reparte por
// cantidad, para no perder el costo del envío.
function prorratearEnvio(items, costoEnvio) {
  const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  const cantidadTotal = items.reduce((acc, i) => acc + i.cantidad, 0);

  return items.map((item) => {
    const proporcion =
      subtotal > 0 ? (item.cantidad * item.precio_unitario) / subtotal : item.cantidad / cantidadTotal;
    const envioAsignado = costoEnvio * proporcion;
    return { ...item, costo_real_unitario: item.precio_unitario + envioAsignado / item.cantidad };
  });
}

// Una compra nace como borrador: no toca stock, ni costo, ni deuda. Es
// nada más el papel armado. Los efectos aparecen recién al efectuar el
// pedido (deuda) y al recibir la mercadería (stock y costo).
// Crea la compra en estado 'borrador' con sus items (envío ya prorrateado):
// da de alta proveedor/producto por nombre si no existen. IMPORTANTE: igual
// que crearVenta, asume que ya se validó todo y que se la llama DENTRO de
// una transacción — así el asistente por texto (§21) puede encadenar
// crear+confirmar+recibir en una sola transacción atómica.
function crearCompra({
  proveedor,
  items,
  costoEnvio,
  fecha,
  deposito_id,
  condicion_pago,
  fecha_vencimiento,
  organizacion_id
}) {
  // organizacion_id es obligatorio (CLAUDE.md §28): proveedor y productos
  // resueltos/creados acá quedan siempre en la organización de quien compra.
  let proveedorRow = db
    .prepare('SELECT id FROM proveedores WHERE nombre = ? AND organizacion_id = ?')
    .get(proveedor, organizacion_id);
  if (!proveedorRow) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO proveedores (nombre, organizacion_id) VALUES (?, ?)')
      .run(proveedor, organizacion_id);
    proveedorRow = { id: lastInsertRowid };
  }

  // Mismo criterio que en ventas: nullable, NULL = "el predeterminado de
  // ese momento" (CLAUDE.md §19).
  const depositoId = deposito_id ? Number(deposito_id) : null;
  if (depositoId && !depositoActivoValido(depositoId, organizacion_id)) {
    throw new ErrorBulk('El depósito seleccionado no existe o está inactivo.');
  }

  // Igual que en crearVenta: la fecha se resuelve antes del INSERT porque el
  // vencimiento tiene que calcularse sobre la fecha real de esta compra.
  const fechaCompra = fecha ?? fechaDeHoy();
  const venc = calcularVencimiento(fechaCompra, condicion_pago, fecha_vencimiento);

  const { lastInsertRowid: nuevaCompraId } = db
    .prepare(
      `INSERT INTO compras (proveedor_id, costo_envio, deposito_id, fecha, condicion_pago, fecha_vencimiento, organizacion_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(proveedorRow.id, costoEnvio, depositoId, fechaCompra, venc.condicion, venc.vencimiento, organizacion_id);

  const buscarProducto = db.prepare('SELECT id FROM productos WHERE nombre = ? AND organizacion_id = ?');
  // Un producto nuevo nace con costo 0: todavía no entró nada al
  // depósito, su costo lo va a fijar la recepción de esta compra.
  const crearProducto = db.prepare(
    'INSERT INTO productos (nombre, precio_costo, precio_venta, organizacion_id) VALUES (?, 0, 0, ?)'
  );
  const insertItem = db.prepare(
    `INSERT INTO compra_items (compra_id, producto_id, variante_id, cantidad, precio_unitario, costo_real_unitario)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  // Variante resuelta por el frontend (no se autocrea a ciegas desde un
  // nombre libre, a diferencia del producto): tiene que existir, estar
  // activa y pertenecer al producto ya resuelto de este ítem.
  const buscarVariante = db.prepare(
    'SELECT id FROM producto_variantes WHERE id = ? AND producto_id = ? AND activo = 1'
  );
  const contarVariantesActivas = db.prepare(
    'SELECT COUNT(*) AS n FROM producto_variantes WHERE producto_id = ? AND activo = 1'
  );

  const itemsProrrateados = prorratearEnvio(
    items.map((i) => ({
      producto: String(i.producto).trim(),
      variante_id: i.variante_id ? Number(i.variante_id) : null,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    })),
    costoEnvio
  );

  for (const item of itemsProrrateados) {
    let productoRow = buscarProducto.get(item.producto, organizacion_id);
    if (!productoRow) {
      const { lastInsertRowid } = crearProducto.run(item.producto, organizacion_id);
      productoRow = { id: lastInsertRowid };
      // El producto que la compra crea por nombre ocupa un lugar del plan
      // (hist. §98): pasado el tope, el throw deshace toda la compra.
      exigirLugarEnPlan(organizacion_id, 'productos', 0);
    }
    if (esServicio(productoRow.id)) throw new ErrorBulk(errorServicioSinStock(item.producto));
    if (item.variante_id && !buscarVariante.get(item.variante_id, productoRow.id)) {
      throw new ErrorBulk(`La variante elegida para "${item.producto}" no existe o no le pertenece.`);
    }
    if (!item.variante_id && contarVariantesActivas.get(productoRow.id).n > 0) {
      throw new ErrorBulk(`"${item.producto}" tiene variantes: elegí una para comprar.`);
    }
    insertItem.run(
      nuevaCompraId,
      productoRow.id,
      item.variante_id,
      item.cantidad,
      item.precio_unitario,
      item.costo_real_unitario
    );
  }

  return nuevaCompraId;
}

app.post('/api/compras', soloAdmin, (req, res) => {
  const { proveedor, items, fecha, costo_envio, deposito_id, condicion_pago, fecha_vencimiento } = req.body;

  if (!proveedor || !String(proveedor).trim()) {
    return res.status(400).json({ error: 'La compra necesita un proveedor.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La compra necesita al menos un item.' });
  }
  for (const item of items) {
    if (!item.producto || !String(item.producto).trim()) {
      return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
    }
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad de cada item debe ser mayor a 0.' });
    }
    if (!(Number(item.precio_unitario) >= 0)) {
      return res.status(400).json({ error: 'El costo unitario no puede ser negativo.' });
    }
  }
  const costoEnvio = normalizarPrecio(costo_envio);
  if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
    return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
  }

  let compraId;
  try {
    compraId = withTransaction(() => {
      const id = crearCompra({
        proveedor,
        items,
        costoEnvio,
        fecha,
        deposito_id,
        condicion_pago,
        fecha_vencimiento,
        organizacion_id: req.usuario.organizacion_id
      });
      auditar(req, {
        accion: 'crear',
        entidad: 'compra',
        entidad_id: id,
        detalle: `Compra #${id} creada (borrador)`
      });
      return id;
    });
  } catch (err) {
    // El tope del plan (un producto nuevo por nombre) sale con su 403.
    if (err instanceof ErrorPlan) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    return res.status(400).json({ error: mensajeDeError(err) });
  }

  res.status(201).json({ id: compraId, estado: 'borrador' });
});

// Editar una compra existente, en cualquier estado (incluso ya recibida).
// Se resuelve como revertir los efectos actuales (deuda si se había
// efectuado, stock+costo si se había recibido) y volver a aplicarlos con
// los datos nuevos, dentro de la misma transacción — el mismo patrón que
// ya usan anular/restaurar. El costo se recalcula con
// recalcularCostoProducto (no con la resta incremental) porque un
// promedio ponderado no se puede "restar" de forma exacta.
app.put('/api/compras/:id', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);
  const { proveedor, items, fecha, costo_envio, deposito_id, condicion_pago, fecha_vencimiento } = req.body;

  const compra = db
    .prepare(
      `SELECT id, proveedor_id, deposito_id, estado, costo_envio, stock_aplicado, fecha, condicion_pago,
              fecha_vencimiento
         FROM compras WHERE id = ? AND organizacion_id = ?`
    )
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }

  // Mismo criterio que en la edición de ventas (ver ahí el porqué).
  const condicionEdicionCompra = condicion_pago === undefined ? compra.condicion_pago : condicion_pago;
  const fechaManualEdicionCompra =
    fecha_vencimiento === undefined && condicionEdicionCompra === 'manual'
      ? compra.fecha_vencimiento
      : fecha_vencimiento;
  let vencEdicionCompra;
  try {
    vencEdicionCompra = calcularVencimiento(fecha || compra.fecha, condicionEdicionCompra, fechaManualEdicionCompra);
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: mensajeDeError(err) });
  }
  // Mismo criterio que ventas: mantiene el depósito original si no se
  // manda uno nuevo, nunca recalcula al predeterminado actual en silencio.
  const depositoIdNuevo = deposito_id !== undefined
    ? (deposito_id ? Number(deposito_id) : null)
    : compra.deposito_id;
  const depositoResueltoCompra = depositoIdNuevo ?? depositoPredeterminadoId(req.usuario.organizacion_id);
  if (depositoIdNuevo && !depositoActivoValido(depositoIdNuevo, req.usuario.organizacion_id)) {
    return res.status(400).json({ error: 'El depósito seleccionado no existe o está inactivo.' });
  }
  if (compra.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta compra está anulada. Restaurala primero si querés editarla.' });
  }
  // Editar reemplaza compra_items enteros (ver más abajo), y
  // devolucion_proveedor_items.compra_item_id apunta a esas filas exactas:
  // si se permitiera editar, las devoluciones ya cargadas quedarían
  // apuntando a renglones que ya no existen. Mismo criterio que ventas.
  const tieneDevolucionEdicion = db
    .prepare("SELECT 1 FROM devoluciones_proveedor WHERE compra_id = ? AND estado = 'activa'")
    .get(compraId);
  if (tieneDevolucionEdicion) {
    return res
      .status(400)
      .json({ error: 'Esta compra tiene una devolución a proveedor asociada, no se puede editar.' });
  }

  if (!proveedor || !String(proveedor).trim()) {
    return res.status(400).json({ error: 'La compra necesita un proveedor.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La compra necesita al menos un item.' });
  }
  for (const item of items) {
    if (!item.producto || !String(item.producto).trim()) {
      return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
    }
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad de cada item debe ser mayor a 0.' });
    }
    if (!(Number(item.precio_unitario) >= 0)) {
      return res.status(400).json({ error: 'El costo unitario no puede ser negativo.' });
    }
  }
  const costoEnvio = normalizarPrecio(costo_envio);
  if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
    return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
  }

  const itemsViejos = db
    .prepare(
      `SELECT compra_items.producto_id, compra_items.variante_id, compra_items.cantidad, productos.nombre
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_id = ?`
    )
    .all(compraId);

  // Si esta compra ya sumó stock, hay que poder sacarlo antes de aplicar
  // los items nuevos — mismo chequeo que ya usa anular. Se valida contra el
  // depósito ORIGINAL de la compra (de ahí es de donde va a salir la
  // reversión), no contra el nuevo si cambió de depósito al editar.
  if (compra.stock_aplicado) {
    const depositoCompraOriginal = compra.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);
    const buscarStockDeposito = db.prepare(
      'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
    );
    for (const item of itemsViejos) {
      if (esServicio(item.producto_id)) continue;
      const stockActual = buscarStockDeposito.get(item.producto_id, depositoCompraOriginal)?.cantidad ?? 0;
      if (stockActual - item.cantidad < 0) {
        return res.status(400).json({
          error: `"${item.nombre}" ya se vendió parcial o totalmente, no se puede editar esta compra.`
        });
      }
    }
  }

  const itemsProrrateados = prorratearEnvio(
    items.map((i) => ({
      producto: String(i.producto).trim(),
      variante_id: i.variante_id ? Number(i.variante_id) : null,
      cantidad: Number(i.cantidad),
      precio_unitario: Number(i.precio_unitario)
    })),
    costoEnvio
  );

  withTransaction(() => {
    // 1) Revertir los efectos actuales, en el depósito ORIGINAL de la compra.
    const depositoCompraOriginal = compra.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);
    if (compra.stock_aplicado) {
      for (const item of itemsViejos) {
        registrarMovimientoStock({
          producto_id: item.producto_id,
          variante_id: item.variante_id,
          deposito_id: depositoCompraOriginal,
          tipo: 'salida',
          cantidad: item.cantidad,
          origen: 'compra',
          compra_id: compraId,
          nota: 'Reversión por edición',
          organizacion_id: req.usuario.organizacion_id
        });
      }
    }
    if (compra.estado === 'activa') {
      const { subtotal: subtotalViejo } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?'
        )
        .get(compraId);
      db.prepare(
        `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
      ).run(compra.proveedor_id, -(subtotalViejo + compra.costo_envio), compraId);
    }

    // 2) Reemplazar proveedor, fecha, envío e items.
    let proveedorRow = db
      .prepare('SELECT id FROM proveedores WHERE nombre = ? AND organizacion_id = ?')
      .get(proveedor, req.usuario.organizacion_id);
    if (!proveedorRow) {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO proveedores (nombre, organizacion_id) VALUES (?, ?)')
        .run(proveedor, req.usuario.organizacion_id);
      proveedorRow = { id: lastInsertRowid };
    }
    db.prepare(
      `UPDATE compras
          SET proveedor_id = ?, costo_envio = ?, fecha = COALESCE(?, fecha), deposito_id = ?,
              condicion_pago = ?, fecha_vencimiento = ?
        WHERE id = ?`
    ).run(
      proveedorRow.id,
      costoEnvio,
      fecha || null,
      depositoIdNuevo,
      vencEdicionCompra.condicion,
      vencEdicionCompra.vencimiento,
      compraId
    );

    db.prepare('DELETE FROM compra_items WHERE compra_id = ?').run(compraId);

    const buscarProducto = db.prepare('SELECT id FROM productos WHERE nombre = ? AND organizacion_id = ?');
    const crearProducto = db.prepare(
      'INSERT INTO productos (nombre, precio_costo, precio_venta, organizacion_id) VALUES (?, 0, 0, ?)'
    );
    const insertItem = db.prepare(
      `INSERT INTO compra_items (compra_id, producto_id, variante_id, cantidad, precio_unitario, costo_real_unitario)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const buscarVariante = db.prepare(
      'SELECT id FROM producto_variantes WHERE id = ? AND producto_id = ? AND activo = 1'
    );
    const contarVariantesActivas = db.prepare(
      'SELECT COUNT(*) AS n FROM producto_variantes WHERE producto_id = ? AND activo = 1'
    );

    const productosNuevos = [];
    const variantesNuevas = [];
    for (const item of itemsProrrateados) {
      let productoRow = buscarProducto.get(item.producto, req.usuario.organizacion_id);
      if (!productoRow) {
        const { lastInsertRowid } = crearProducto.run(item.producto, req.usuario.organizacion_id);
        productoRow = { id: lastInsertRowid };
        exigirLugarEnPlan(req.usuario.organizacion_id, 'productos', 0);
      }
      if (esServicio(productoRow.id)) throw new ErrorBulk(errorServicioSinStock(item.producto));
      if (item.variante_id && !buscarVariante.get(item.variante_id, productoRow.id)) {
        throw new ErrorBulk(`La variante elegida para "${item.producto}" no existe o no le pertenece.`);
      }
      if (!item.variante_id && contarVariantesActivas.get(productoRow.id).n > 0) {
        throw new ErrorBulk(`"${item.producto}" tiene variantes: elegí una para comprar.`);
      }
      insertItem.run(
        compraId,
        productoRow.id,
        item.variante_id,
        item.cantidad,
        item.precio_unitario,
        item.costo_real_unitario
      );
      productosNuevos.push(productoRow.id);
      if (item.variante_id) variantesNuevas.push(item.variante_id);
    }

    // 3) Reaplicar según el estado actual (editar no cambia de estado).
    if (compra.estado === 'activa') {
      const { subtotal: subtotalNuevo } = db
        .prepare(
          'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?'
        )
        .get(compraId);
      db.prepare(
        `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'compra', ?, ?, ${HOY_SQL})`
      ).run(proveedorRow.id, subtotalNuevo + costoEnvio, compraId);
    }

    if (compra.stock_aplicado) {
      const nuevos = db
        .prepare('SELECT producto_id, variante_id, cantidad, costo_real_unitario FROM compra_items WHERE compra_id = ?')
        .all(compraId);
      for (const item of nuevos) {
        registrarMovimientoStock({
          producto_id: item.producto_id,
          variante_id: item.variante_id,
          deposito_id: depositoResueltoCompra,
          tipo: 'entrada',
          cantidad: item.cantidad,
          origen: 'compra',
          compra_id: compraId,
          costo_unitario: item.costo_real_unitario,
          organizacion_id: req.usuario.organizacion_id
        });
      }

      // Recalcular el costo de todos los productos y variantes tocados: los
      // que salían antes y los que entran ahora (pueden repetirse, un Set
      // alcanza).
      const productosTocados = new Set([...itemsViejos.map((i) => i.producto_id), ...productosNuevos]);
      for (const productoId of productosTocados) {
        recalcularCostoProducto(productoId);
      }
      const variantesTocadas = new Set([
        ...itemsViejos.filter((i) => i.variante_id).map((i) => i.variante_id),
        ...variantesNuevas
      ]);
      for (const varianteId of variantesTocadas) {
        recalcularCostoVariante(varianteId);
      }
    }

    auditar(req, {
      accion: 'editar',
      entidad: 'compra',
      entidad_id: compraId,
      detalle: `Compra #${compraId} editada`
    });
  });

  res.json({ id: compraId });
});

// "Efectuar el pedido": el borrador pasa a ser una compra real y nace la
// deuda con el proveedor. El stock todavía no se toca — la mercadería no
// llegó.
// Pasa una compra de 'borrador' a 'activa' y genera la deuda con el
// proveedor (subtotal + envío). Asume que ya se validó el estado y que se
// la llama DENTRO de una transacción — mismo criterio que crearCompra, para
// que el asistente por texto pueda encadenar crear+confirmar sin abrir una
// segunda transacción.
function confirmarCompra(compraId) {
  db.prepare("UPDATE compras SET estado = 'activa' WHERE id = ?").run(compraId);

  const compra = db.prepare('SELECT proveedor_id, costo_envio FROM compras WHERE id = ?').get(compraId);
  const { subtotal } = db
    .prepare(`SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal FROM compra_items WHERE compra_id = ?`)
    .get(compraId);

  db.prepare(
    `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'compra', ?, ?, ${HOY_SQL})`
  ).run(compra.proveedor_id, subtotal + compra.costo_envio, compraId);
}

app.post('/api/compras/:id/confirmar', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare('SELECT id, estado FROM compras WHERE id = ? AND organizacion_id = ?')
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado !== 'borrador') {
    return res.status(400).json({ error: 'Esta compra ya fue efectuada.' });
  }

  withTransaction(() => {
    confirmarCompra(compraId);
    auditar(req, {
      accion: 'confirmar',
      entidad: 'compra',
      entidad_id: compraId,
      valor_anterior: JSON.stringify({ estado: 'borrador' }),
      valor_nuevo: JSON.stringify({ estado: 'activa' }),
      detalle: `Compra #${compraId} confirmada (pedido efectuado)`
    });
  });

  res.json({ id: compraId, estado: 'activa' });
});

// Suma el stock de una compra y recalcula el costo promedio ponderado de
// cada producto. Usa costo_real_unitario (con el envío ya prorrateado), no
// el precio unitario pelado. Se llama dentro de una transacción.
//
// El costo promedio ponderado sigue siendo GLOBAL a propósito (lee
// stock_actual, no stock_por_deposito): el costo es un atributo del
// producto, no de en qué depósito está guardado físicamente — un mismo
// producto no vale distinto según el estante (CLAUDE.md §5/§19, decisión
// del usuario). El movimiento de stock en sí sí va al depósito de la compra.
function aplicarStockCompra(compraId) {
  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, costo_real_unitario, precio_unitario FROM compra_items WHERE compra_id = ?'
    )
    .all(compraId);
  const { deposito_id: depositoCompra, organizacion_id: organizacionCompra } = db
    .prepare('SELECT deposito_id, organizacion_id FROM compras WHERE id = ?')
    .get(compraId);
  const depositoResuelto = depositoCompra ?? depositoPredeterminadoId(organizacionCompra);

  const buscarProducto = db.prepare('SELECT precio_costo FROM productos WHERE id = ?');
  const buscarStockActual = db.prepare('SELECT cantidad FROM stock_actual WHERE producto_id = ?');
  const actualizarPrecioCosto = db.prepare('UPDATE productos SET precio_costo = ? WHERE id = ?');
  // Espejo exacto de lo anterior, pero a nivel variante: el promedio
  // ponderado de una variante es independiente del de su producto padre y
  // del de sus variantes hermanas.
  const buscarVariante = db.prepare('SELECT precio_costo FROM producto_variantes WHERE id = ?');
  const buscarStockVariante = db.prepare(
    'SELECT cantidad FROM stock_variante_actual WHERE variante_id = ?'
  );
  const actualizarPrecioCostoVariante = db.prepare('UPDATE producto_variantes SET precio_costo = ? WHERE id = ?');

  for (const item of items) {
    const costoReal = item.costo_real_unitario ?? item.precio_unitario;
    if (item.variante_id) {
      const stockPrevio = Math.max(buscarStockVariante.get(item.variante_id)?.cantidad ?? 0, 0);
      const costoAnterior = buscarVariante.get(item.variante_id).precio_costo;
      const costoPromedio =
        (stockPrevio * costoAnterior + item.cantidad * costoReal) / (stockPrevio + item.cantidad);
      actualizarPrecioCostoVariante.run(costoPromedio, item.variante_id);
    } else {
      // El stock previo se acota a 0: si quedó negativo por un ajuste, no
      // tiene sentido que arrastre el promedio hacia valores absurdos.
      const stockPrevio = Math.max(buscarStockActual.get(item.producto_id)?.cantidad ?? 0, 0);
      const costoAnterior = buscarProducto.get(item.producto_id).precio_costo;
      const costoPromedio =
        (stockPrevio * costoAnterior + item.cantidad * costoReal) / (stockPrevio + item.cantidad);
      actualizarPrecioCosto.run(costoPromedio, item.producto_id);
    }
    registrarMovimientoStock({
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      deposito_id: depositoResuelto,
      tipo: 'entrada',
      cantidad: item.cantidad,
      origen: 'compra',
      compra_id: compraId,
      costo_unitario: costoReal,
      organizacion_id: organizacionCompra
    });
  }

  db.prepare('UPDATE compras SET stock_aplicado = 1 WHERE id = ?').run(compraId);
}

// Reproduce el costo promedio ponderado de un producto desde cero,
// repasando su historial de movimientos en orden cronológico, en vez de
// arrastrar el cálculo incremental. Da exactamente el mismo resultado que
// aplicarStockCompra en el camino normal, pero es lo que permite editar o
// revertir una compra ya recibida sin degradar el costo: en vez de tratar
// de "restar" un promedio ponderado (no es reversible de forma exacta),
// se recalcula todo desde el historial real que quedó en movimientos_stock.
//
// Solo las entradas mueven el costo (salidas y ajustes solo cantidad, es
// el comportamiento estándar de costo promedio ponderado). Los
// movimientos viejos, de antes de que existiera la columna
// movimientos_stock.costo_unitario, caen en cascada al
// costo_real_unitario que quedó guardado en compra_items de esa compra.
function recalcularCostoProducto(productoId) {
  const movimientos = db
    .prepare(
      `SELECT tipo, cantidad, costo_unitario, compra_id
         FROM movimientos_stock
        WHERE producto_id = ? AND variante_id IS NULL
        ORDER BY fecha, id`
    )
    .all(productoId);

  const buscarCostoCompra = db.prepare(
    'SELECT costo_real_unitario FROM compra_items WHERE compra_id = ? AND producto_id = ? AND variante_id IS NULL'
  );

  let stock = 0;
  let costo = 0;
  for (const m of movimientos) {
    if (m.tipo === 'entrada') {
      let costoEntrada = m.costo_unitario;
      if (costoEntrada === null && m.compra_id) {
        costoEntrada = buscarCostoCompra.get(m.compra_id, productoId)?.costo_real_unitario ?? null;
      }
      if (costoEntrada !== null) {
        const stockPrevio = Math.max(stock, 0);
        costo = (stockPrevio * costo + m.cantidad * costoEntrada) / (stockPrevio + m.cantidad);
      }
      stock += m.cantidad;
    } else {
      // 'salida' resta, 'ajuste' ya viene con signo — ninguno toca el costo.
      stock += m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    }
  }

  db.prepare('UPDATE productos SET precio_costo = ? WHERE id = ?').run(costo, productoId);
  return costo;
}

// Espejo exacto de recalcularCostoProducto, a nivel variante: mismo
// algoritmo de costo promedio ponderado reconstruido desde el historial,
// filtrando movimientos_stock/compra_items por variante_id en vez de por
// "producto en general" (variante_id IS NULL).
function recalcularCostoVariante(varianteId) {
  const movimientos = db
    .prepare(
      `SELECT tipo, cantidad, costo_unitario, compra_id
         FROM movimientos_stock
        WHERE variante_id = ?
        ORDER BY fecha, id`
    )
    .all(varianteId);

  const buscarCostoCompra = db.prepare(
    'SELECT costo_real_unitario FROM compra_items WHERE compra_id = ? AND variante_id = ?'
  );

  let stock = 0;
  let costo = 0;
  for (const m of movimientos) {
    if (m.tipo === 'entrada') {
      let costoEntrada = m.costo_unitario;
      if (costoEntrada === null && m.compra_id) {
        costoEntrada = buscarCostoCompra.get(m.compra_id, varianteId)?.costo_real_unitario ?? null;
      }
      if (costoEntrada !== null) {
        const stockPrevio = Math.max(stock, 0);
        costo = (stockPrevio * costo + m.cantidad * costoEntrada) / (stockPrevio + m.cantidad);
      }
      stock += m.cantidad;
    } else {
      stock += m.tipo === 'salida' ? -m.cantidad : m.cantidad;
    }
  }

  db.prepare('UPDATE producto_variantes SET precio_costo = ? WHERE id = ?').run(costo, varianteId);
  return costo;
}

app.post('/api/compras/:id/anular', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare(
      'SELECT id, proveedor_id, deposito_id, estado, costo_envio, stock_aplicado FROM compras WHERE id = ? AND organizacion_id = ?'
    )
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta compra ya está anulada.' });
  }

  const tienePagos = db.prepare('SELECT 1 FROM pagos WHERE compra_id = ?').get(compraId);
  if (tienePagos) {
    return res.status(400).json({ error: 'Esta compra tiene pagos registrados, no se puede anular.' });
  }

  const tieneDevolucionAnular = db
    .prepare("SELECT 1 FROM devoluciones_proveedor WHERE compra_id = ? AND estado = 'activa'")
    .get(compraId);
  if (tieneDevolucionAnular) {
    return res
      .status(400)
      .json({ error: 'Esta compra tiene una devolución a proveedor asociada, no se puede anular.' });
  }

  const items = db
    .prepare(
      `SELECT compra_items.producto_id, compra_items.variante_id, compra_items.cantidad,
              compra_items.precio_unitario, productos.nombre
       FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
       WHERE compra_id = ?`
    )
    .all(compraId);
  const depositoCompraAnular = compra.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);

  // El stock solo hay que devolverlo si esta compra llegó a sumarlo (o sea,
  // si se marcó recibida). Un borrador o un pedido en camino no tocaron el
  // depósito, así que no hay nada que revertir ni que validar.
  if (compra.stock_aplicado) {
    const buscarStockDeposito = db.prepare(
      'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
    );
    for (const item of items) {
      if (esServicio(item.producto_id)) continue;
      const stockActual = buscarStockDeposito.get(item.producto_id, depositoCompraAnular)?.cantidad ?? 0;
      if (stockActual - item.cantidad < 0) {
        return res.status(400).json({
          error: `"${item.nombre}" ya se vendió parcial o totalmente, no se puede anular la compra.`
        });
      }
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE compras SET estado = 'anulada' WHERE id = ?").run(compraId);

    if (compra.stock_aplicado) {
      for (const item of items) {
        registrarMovimientoStock({
          producto_id: item.producto_id,
          variante_id: item.variante_id,
          deposito_id: depositoCompraAnular,
          tipo: 'salida',
          cantidad: item.cantidad,
          origen: 'compra',
          compra_id: compraId,
          nota: 'Reversión por anulación',
          organizacion_id: req.usuario.organizacion_id
        });
      }
      // Queda en 0 para que, si se restaura desde la papelera, el stock se
      // vuelva a aplicar en vez de darse por aplicado.
      db.prepare('UPDATE compras SET stock_aplicado = 0 WHERE id = ?').run(compraId);
    }

    // La deuda solo existe si el pedido se llegó a efectuar: un borrador
    // anulado no le debe nada a nadie.
    if (compra.estado === 'activa') {
      const subtotal = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
      db.prepare(
        `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
      ).run(compra.proveedor_id, -(subtotal + compra.costo_envio), compraId);
    }

    auditar(req, {
      accion: 'anular',
      entidad: 'compra',
      entidad_id: compraId,
      detalle: `Compra #${compraId} anulada`
    });
  });

  res.json({ id: compraId, estado: 'anulada' });
});

// Restaurar desde la papelera. Una compra que se anuló siendo borrador
// vuelve a ser borrador (nunca tuvo deuda ni stock); una que ya se había
// efectuado vuelve a estar activa, con su deuda, y si además estaba
// recibida se le vuelve a sumar el stock.
app.post('/api/compras/:id/restaurar', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);

  const compra = db
    .prepare(
      'SELECT id, proveedor_id, estado, estado_envio, costo_envio FROM compras WHERE id = ? AND organizacion_id = ?'
    )
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  if (compra.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta compra no está en la papelera.' });
  }

  // No se guarda el estado previo a la anulación: se deduce de si llegó a
  // generar deuda. Si nunca hubo un movimiento 'compra' en la cuenta
  // corriente, era un borrador.
  const fueEfectuada = db
    .prepare("SELECT 1 FROM movimientos_cc_proveedores WHERE compra_id = ? AND tipo = 'compra'")
    .get(compraId);

  if (!fueEfectuada) {
    withTransaction(() => {
      db.prepare("UPDATE compras SET estado = 'borrador' WHERE id = ?").run(compraId);
      auditar(req, {
        accion: 'restaurar',
        entidad: 'compra',
        entidad_id: compraId,
        detalle: `Compra #${compraId} restaurada desde la papelera (borrador)`
      });
    });
    return res.json({ id: compraId, estado: 'borrador' });
  }

  withTransaction(() => {
    db.prepare("UPDATE compras SET estado = 'activa' WHERE id = ?").run(compraId);

    const { subtotal } = db
      .prepare(
        `SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS subtotal
           FROM compra_items WHERE compra_id = ?`
      )
      .get(compraId);
    db.prepare(
      `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(compra.proveedor_id, subtotal + compra.costo_envio, compraId);

    if (compra.estado_envio === 'recibido') {
      aplicarStockCompra(compraId);
    }

    auditar(req, {
      accion: 'restaurar',
      entidad: 'compra',
      entidad_id: compraId,
      detalle: `Compra #${compraId} restaurada desde la papelera`
    });
  });

  res.json({ id: compraId, estado: 'activa' });
});

// El estado de envío es el que gobierna el stock: al marcar 'recibido' la
// mercadería entra al depósito y recién ahí se recalcula el costo.
// Punto único de cambio de estado de envío, usado por el PATCH singular y
// por el bulk. Las 4 guardas de negocio van ANTES de abrir la transacción
// (lanzan con throw, no hay nada que deshacer) — así el catch del loop de
// aplicarLote nunca tiene que preocuparse por una transacción a medio
// abrir.
//
// Efecto colateral a tener presente: marcar varias compras como
// "recibido" en un mismo lote dispara aplicarStockCompra() una vez por
// compra, y esa función recalcula el costo promedio ponderado. Si dos
// compras del MISMO producto caen en el mismo lote, el resultado depende
// del orden en que se procesan — acá se usa el orden de `ids` tal como
// llega, que en el caso de uso real (selección de la tabla) es el orden
// visible que ve el usuario (crearSeleccion.ids, en el frontend).
function aplicarEstadoEnvioCompra(req, compraId, estadoEnvio, totalLote = 1) {
  if (!ESTADOS_ENVIO.includes(estadoEnvio)) {
    throw new ErrorBulk('Estado de envío inválido.');
  }

  const compra = db
    .prepare('SELECT id, estado, estado_envio, stock_aplicado FROM compras WHERE id = ? AND organizacion_id = ?')
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    throw new ErrorBulk('Compra no encontrada.', 404);
  }
  if (compra.estado === 'borrador') {
    throw new ErrorBulk('Esta compra todavía es un borrador: primero hay que efectuar el pedido.');
  }
  if (compra.estado === 'anulada') {
    throw new ErrorBulk('Esta compra está anulada.');
  }
  // Volver atrás desde "recibido" obligaría a deshacer el costo promedio
  // ponderado, que se sobrescribe de forma destructiva y no tiene historial
  // para reconstruirlo. Si hay que corregir, se anula la compra.
  if (compra.estado_envio === 'recibido' && estadoEnvio !== 'recibido') {
    throw new ErrorBulk('Una compra ya recibida no puede volver atrás. Si te equivocaste, anulá la compra.');
  }

  let sinCambios = true;
  withTransaction(() => {
    db.prepare('UPDATE compras SET estado_envio = ? WHERE id = ?').run(estadoEnvio, compraId);
    if (estadoEnvio === 'recibido' && !compra.stock_aplicado) {
      aplicarStockCompra(compraId);
    }
    if (estadoEnvio !== compra.estado_envio) {
      sinCambios = false;
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'compra',
        entidad_id: compraId,
        valor_anterior: JSON.stringify({ estado_envio: compra.estado_envio }),
        valor_nuevo: JSON.stringify({ estado_envio: estadoEnvio }),
        detalle: totalLote > 1
          ? `Compra #${compraId}, estado de envío: ${compra.estado_envio} → ${estadoEnvio} (edición en lote de ${totalLote})`
          : `Compra #${compraId}, estado de envío: ${compra.estado_envio} → ${estadoEnvio}`
      });
    }
  });

  return { sinCambios };
}

app.patch('/api/compras/:id/estado-envio', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);
  let resultado;
  try {
    resultado = aplicarEstadoEnvioCompra(req, compraId, req.body.estado_envio, 1);
  } catch (err) {
    if (err instanceof ErrorBulk) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }
  res.json({ id: compraId, estado_envio: req.body.estado_envio, sinCambios: resultado.sinCambios });
});

// Edición en lote del estado de envío. Mismo criterio de éxito parcial que
// /api/productos/bulk: cada compra se intenta de forma independiente.
app.post('/api/compras/bulk/estado-envio', soloAdmin, (req, res) => {
  let ids;
  try {
    ids = idsDeLote(req.body?.ids);
  } catch (err) {
    return res.status(err.status).json({ error: err.message });
  }

  const estadoEnvio = req.body?.estado_envio;
  if (!ESTADOS_ENVIO.includes(estadoEnvio)) {
    return res.status(400).json({ error: 'Estado de envío inválido.' });
  }

  const resultado = aplicarLote(ids, (id) =>
    aplicarEstadoEnvioCompra(req, id, estadoEnvio, ids.length)
  );
  res.json(resultado);
});

app.get('/api/compras/:id/pagos', soloAdmin, (req, res) => {
  const pagos = db
    .prepare(
      `SELECT pagos.id, pagos.fecha, pagos.importe, pagos.nota,
              cuentas_tesoreria.nombre AS cuenta
       FROM pagos
       JOIN cuentas_tesoreria ON cuentas_tesoreria.id = pagos.cuenta_tesoreria_id
       JOIN compras ON compras.id = pagos.compra_id
       WHERE pagos.compra_id = ? AND compras.organizacion_id = ?
       ORDER BY pagos.id`
    )
    .all(Number(req.params.id), req.usuario.organizacion_id);
  res.json(pagos);
});

app.post('/api/compras/:id/pagos', soloAdmin, (req, res) => {
  const compraId = Number(req.params.id);
  const { importe, cuenta_tesoreria_id, nota } = req.body;

  const compra = db
    .prepare(
      `SELECT compras.id, compras.proveedor_id, compras.estado, compras.costo_envio,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM compra_items WHERE compra_id = compras.id) AS total,
              (SELECT COALESCE(SUM(importe), 0) FROM pagos WHERE compra_id = compras.id) AS pagado,
              ${SUBQUERY_DEVUELTO_COMPRA} AS devuelto
       FROM compras WHERE compras.id = ? AND compras.organizacion_id = ?`
    )
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  // Un borrador todavía no es deuda con el proveedor y una anulada ya no lo es:
  // pagarlas deja tesorería con un egreso de una operación que no vale.
  if (compra.estado !== 'activa') {
    return res.status(400).json({
      error: compra.estado === 'borrador'
        ? 'Confirmá la compra antes de registrar pagos.'
        : 'No se puede pagar una compra anulada.'
    });
  }

  // La mercadería devuelta ya no es plata que el proveedor pueda cobrar:
  // el saldo pendiente se calcula sobre el neto, no sobre el total bruto. El
  // envío es parte de lo que se le debe al proveedor (confirmarCompra y los
  // listados lo suman): sin él, una compra con envío quedaba "parcial" para
  // siempre porque el último tramo nunca se podía pagar.
  const saldoPendiente = compra.total + compra.costo_envio - compra.devuelto - compra.pagado;
  if (!esNumeroValido(importe) || !(importe > 0)) {
    return res.status(400).json({ error: 'El importe del pago tiene que ser un número mayor a 0.' });
  }
  if (importe > saldoPendiente) {
    return res.status(400).json({
      error: `El importe supera el saldo pendiente de la compra (${saldoPendiente.toFixed(2)}).`
    });
  }
  // Hasta la Etapa A de catálogos la cuenta solo la frenaba la FK (una
  // inexistente reventaba en el INSERT como 500): ahora además tiene que ser
  // de la organización, o el egreso bajaría la caja de otra empresa.
  const cuenta = db
    .prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(cuenta_tesoreria_id), req.usuario.organizacion_id);
  if (!cuenta) {
    return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
  }

  const pagoId = withTransaction(() => {
    const { lastInsertRowid: nuevoPagoId } = db
      .prepare(`INSERT INTO pagos (compra_id, importe, cuenta_tesoreria_id, nota, fecha) VALUES (?, ?, ?, ?, ${HOY_SQL})`)
      .run(compraId, importe, cuenta_tesoreria_id, nota ?? null);

    db.prepare(
      `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, pago_id, origen, organizacion_id, fecha) VALUES (?, 'egreso', ?, ?, 'pago', ?, ${HOY_SQL})`
    ).run(cuenta_tesoreria_id, importe, nuevoPagoId, req.usuario.organizacion_id);

    db.prepare(
      `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, pago_id, fecha) VALUES (?, 'pago', ?, ?, ?, ${HOY_SQL})`
    ).run(compra.proveedor_id, -importe, compraId, nuevoPagoId);

    auditar(req, {
      accion: 'crear',
      entidad: 'pago',
      entidad_id: nuevoPagoId,
      operacion_tipo: 'compra',
      operacion_id: compraId,
      detalle: `Pago #${nuevoPagoId} de $${importe} sobre la compra #${compraId}`
    });

    return nuevoPagoId;
  });

  res.status(201).json({ id: pagoId });
});

/* ---------- Devoluciones a proveedor ---------- */

// Espejo de Devoluciones (venta) del lado de compras: revierte parte de
// una compra ya recibida, devolviéndole mercadería al proveedor. A
// diferencia de la devolución de venta, acá no hay un equivalente de
// vuelve_stock: el movimiento es siempre una salida (se le devuelve al
// proveedor, sin importar el motivo).
//
// El comprobante asociado es una referencia libre al número que te dio el
// proveedor en su propia nota de crédito — no algo que Nexo emita ni
// prepare para ARCA, así que no reutiliza la tabla facturas ni tiene
// numeración propia (ver el comentario largo en schema.sql).

const SELECT_DEVOLUCION_PROVEEDOR = `
  SELECT devoluciones_proveedor.id, devoluciones_proveedor.compra_id, devoluciones_proveedor.fecha,
         devoluciones_proveedor.estado, devoluciones_proveedor.motivo,
         devoluciones_proveedor.cuenta_tesoreria_id, devoluciones_proveedor.nota_credito_proveedor_numero,
         cuentas_tesoreria.nombre AS cuenta,
         compras.proveedor_id, proveedores.nombre AS proveedor,
         (SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
            FROM devolucion_proveedor_items
           WHERE devolucion_proveedor_items.devolucion_proveedor_id = devoluciones_proveedor.id) AS total,
         (SELECT GROUP_CONCAT(
                   (CASE WHEN devolucion_proveedor_items.cantidad = CAST(devolucion_proveedor_items.cantidad AS INTEGER)
                         THEN CAST(devolucion_proveedor_items.cantidad AS INTEGER)
                         ELSE devolucion_proveedor_items.cantidad END) || ' × ' || productos.nombre, ', ')
            FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
           WHERE devolucion_proveedor_items.devolucion_proveedor_id = devoluciones_proveedor.id) AS items_resumen
    FROM devoluciones_proveedor
    JOIN compras ON compras.id = devoluciones_proveedor.compra_id
    JOIN proveedores ON proveedores.id = compras.proveedor_id
    LEFT JOIN cuentas_tesoreria ON cuentas_tesoreria.id = devoluciones_proveedor.cuenta_tesoreria_id`;

function decorarDevolucionProveedor(d) {
  return {
    ...d,
    tiene_nota_credito: d.nota_credito_proveedor_numero != null,
    reintegrada: d.cuenta_tesoreria_id != null
  };
}

app.get('/api/devoluciones-proveedor', soloAdmin, (req, res) => {
  const devoluciones = db
    .prepare(
      `${SELECT_DEVOLUCION_PROVEEDOR} WHERE devoluciones_proveedor.organizacion_id = ? ORDER BY devoluciones_proveedor.id DESC`
    )
    .all(req.usuario.organizacion_id);
  res.json(devoluciones.map(decorarDevolucionProveedor));
});

app.get('/api/devoluciones-proveedor/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const devolucion = db
    .prepare(
      `${SELECT_DEVOLUCION_PROVEEDOR} WHERE devoluciones_proveedor.id = ? AND devoluciones_proveedor.organizacion_id = ?`
    )
    .get(id, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }

  const items = db
    .prepare(
      `SELECT devolucion_proveedor_items.id, devolucion_proveedor_items.compra_item_id,
              devolucion_proveedor_items.producto_id, devolucion_proveedor_items.variante_id,
              productos.nombre AS producto, devolucion_proveedor_items.cantidad,
              devolucion_proveedor_items.precio_unitario
         FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
        WHERE devolucion_proveedor_id = ?
        ORDER BY devolucion_proveedor_items.id`
    )
    .all(id);

  res.json({
    ...decorarDevolucionProveedor(devolucion),
    items: items.map((i) => ({
      ...i,
      subtotal: i.cantidad * i.precio_unitario,
      combinacion: i.variante_id ? combinacionVariante(i.variante_id) : null
    }))
  });
});

// Cuánto queda disponible para devolver de cada renglón de una compra: lo
// comprado menos lo ya devuelto por devoluciones a proveedor activas.
// compra_item_id (no producto_id) para que el tope sea correcto aunque el
// mismo producto aparezca en más de un renglón de la compra.
function itemsDevolviblesDeCompra(compraId) {
  return db
    .prepare(
      `SELECT compra_items.id AS compra_item_id, compra_items.producto_id, compra_items.variante_id, productos.nombre,
              compra_items.precio_unitario, compra_items.costo_real_unitario,
              compra_items.cantidad - COALESCE((
                SELECT SUM(devolucion_proveedor_items.cantidad)
                  FROM devolucion_proveedor_items
                  JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
                 WHERE devolucion_proveedor_items.compra_item_id = compra_items.id
                   AND devoluciones_proveedor.estado = 'activa'
              ), 0) AS disponible
         FROM compra_items JOIN productos ON productos.id = compra_items.producto_id
        WHERE compra_items.compra_id = ?`
    )
    .all(compraId);
}

// Aplica los efectos de una devolución a proveedor ya cargada: salida de
// stock, recálculo del costo promedio del producto (a diferencia de la
// devolución de venta, acá SÍ hay que tocarlo: se está revirtiendo parte
// de lo que una compra sumó al costeo, con recalcularCostoProducto en vez
// de restar el promedio a mano, por la misma razón que anular una compra
// no lo hace a mano), crédito en la cuenta corriente del proveedor, y si
// se marcó reintegro, ingreso de caja. Asume que se la llama DENTRO de una
// transacción — la usan tanto el alta como restaurar.
function aplicarDevolucionProveedor(devolucionProveedorId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones_proveedor.compra_id, devoluciones_proveedor.cuenta_tesoreria_id,
              devoluciones_proveedor.deposito_id, compras.proveedor_id, compras.organizacion_id
         FROM devoluciones_proveedor JOIN compras ON compras.id = devoluciones_proveedor.compra_id
        WHERE devoluciones_proveedor.id = ?`
    )
    .get(devolucionProveedorId);

  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, precio_unitario FROM devolucion_proveedor_items WHERE devolucion_proveedor_id = ?'
    )
    .all(devolucionProveedorId);

  let total = 0;
  const productosTocados = new Set();
  const variantesTocadas = new Set();
  for (const item of items) {
    // Sale del mismo depósito donde entró con la compra original: es la
    // mercadería físicamente volviendo al proveedor desde ahí.
    registrarMovimientoStock({
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      deposito_id: devolucion.deposito_id,
      tipo: 'salida',
      cantidad: item.cantidad,
      origen: 'devolucion_proveedor',
      devolucion_proveedor_id: devolucionProveedorId,
      nota: 'Devolución a proveedor',
      organizacion_id: devolucion.organizacion_id
    });
    productosTocados.add(item.producto_id);
    if (item.variante_id) variantesTocadas.add(item.variante_id);
    total += item.cantidad * item.precio_unitario;
  }
  for (const productoId of productosTocados) {
    recalcularCostoProducto(productoId);
  }
  for (const varianteId of variantesTocadas) {
    recalcularCostoVariante(varianteId);
  }

  // Crédito a favor con el proveedor: baja la deuda, igual signo que un pago.
  db.prepare(
    `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
  ).run(devolucion.proveedor_id, -total, devolucion.compra_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Mismo doble asiento que aplicarDevolucion (venta): si el proveedor
    // reintegra la plata en el acto, hace falta un segundo ajuste (+total)
    // que cancele el crédito recién generado — si no, además de la plata
    // que entró a caja quedaría un saldo a favor fantasma en la cuenta
    // corriente del proveedor.
    db.prepare(
      `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(devolucion.proveedor_id, total, devolucion.compra_id);

    db.prepare(
      `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_proveedor_id, organizacion_id, fecha) VALUES (?, 'ingreso', ?, 'devolucion_proveedor', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionProveedorId, devolucion.organizacion_id);
  }
}

// El espejo exacto de aplicarDevolucionProveedor: lo usa anular. No se
// borran los movimientos originales (se conserva la auditoría), se
// insertan los de reversión — mismo criterio que revertirDevolucion.
function revertirDevolucionProveedor(devolucionProveedorId) {
  const devolucion = db
    .prepare(
      `SELECT devoluciones_proveedor.compra_id, devoluciones_proveedor.cuenta_tesoreria_id,
              devoluciones_proveedor.deposito_id, compras.proveedor_id, compras.organizacion_id
         FROM devoluciones_proveedor JOIN compras ON compras.id = devoluciones_proveedor.compra_id
        WHERE devoluciones_proveedor.id = ?`
    )
    .get(devolucionProveedorId);

  const items = db
    .prepare(
      'SELECT producto_id, variante_id, cantidad, precio_unitario FROM devolucion_proveedor_items WHERE devolucion_proveedor_id = ?'
    )
    .all(devolucionProveedorId);

  let total = 0;
  const productosTocados = new Set();
  const variantesTocadas = new Set();
  for (const item of items) {
    registrarMovimientoStock({
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      deposito_id: devolucion.deposito_id,
      tipo: 'entrada',
      cantidad: item.cantidad,
      origen: 'devolucion_proveedor',
      devolucion_proveedor_id: devolucionProveedorId,
      nota: 'Reversión por anulación',
      organizacion_id: devolucion.organizacion_id
    });
    productosTocados.add(item.producto_id);
    if (item.variante_id) variantesTocadas.add(item.variante_id);
    total += item.cantidad * item.precio_unitario;
  }
  for (const productoId of productosTocados) {
    recalcularCostoProducto(productoId);
  }
  for (const varianteId of variantesTocadas) {
    recalcularCostoVariante(varianteId);
  }

  // Vuelve a subir la deuda del proveedor (se había bajado al aplicar).
  db.prepare(
    `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
  ).run(devolucion.proveedor_id, total, devolucion.compra_id);

  if (devolucion.cuenta_tesoreria_id) {
    // Espejo del ajuste de reintegro en aplicarDevolucionProveedor: vuelve
    // a bajar la cuenta corriente para deshacer la reconciliación de arriba.
    db.prepare(
      `INSERT INTO movimientos_cc_proveedores (proveedor_id, tipo, importe, compra_id, fecha) VALUES (?, 'ajuste', ?, ?, ${HOY_SQL})`
    ).run(devolucion.proveedor_id, -total, devolucion.compra_id);

    db.prepare(
      `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, devolucion_proveedor_id, organizacion_id, fecha) VALUES (?, 'egreso', ?, 'devolucion_proveedor', ?, ?, ${HOY_SQL})`
    ).run(devolucion.cuenta_tesoreria_id, total, devolucionProveedorId, devolucion.organizacion_id);
  }
}

app.post('/api/devoluciones-proveedor', soloAdmin, (req, res) => {
  const { compra_id, items, motivo, cuenta_tesoreria_id } = req.body;
  const compraId = Number(compra_id);

  const compra = db
    .prepare('SELECT id, estado, stock_aplicado, deposito_id FROM compras WHERE id = ? AND organizacion_id = ?')
    .get(compraId, req.usuario.organizacion_id);
  if (!compra) {
    return res.status(404).json({ error: 'Compra no encontrada.' });
  }
  const depositoDevolucionProveedor = compra.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);
  if (compra.estado === 'anulada') {
    return res
      .status(400)
      .json({ error: 'Esta compra está anulada, no se le puede registrar una devolución.' });
  }
  if (compra.estado !== 'activa' || !compra.stock_aplicado) {
    return res.status(400).json({
      error: 'Esta compra todavía no fue recibida, no hay mercadería ni deuda que devolver.'
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La devolución necesita al menos un item.' });
  }

  const vistos = new Set();
  for (const item of items) {
    const id = Number(item.compra_item_id);
    if (vistos.has(id)) {
      return res.status(400).json({ error: 'No se puede repetir el mismo item de la compra.' });
    }
    vistos.add(id);
    if (!(Number(item.cantidad) > 0)) {
      return res.status(400).json({ error: 'La cantidad a devolver debe ser mayor a 0.' });
    }
  }

  if (cuenta_tesoreria_id) {
    const cuenta = db
      .prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
      .get(cuenta_tesoreria_id, req.usuario.organizacion_id);
    if (!cuenta) {
      return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
    }
  }

  const disponibles = new Map(itemsDevolviblesDeCompra(compraId).map((r) => [r.compra_item_id, r]));
  // A diferencia de una devolución de venta (que solo agrega stock), acá se
  // saca stock: si parte de esta mercadería ya se vendió, no se puede sacar
  // más de lo que efectivamente sigue en el depósito de la compra original.
  const buscarStockDeposito = db.prepare(
    'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
  );
  const buscarStockVarianteDeposito = db.prepare(
    'SELECT cantidad FROM stock_variante_por_deposito WHERE variante_id = ? AND deposito_id = ?'
  );
  for (const item of items) {
    const renglon = disponibles.get(Number(item.compra_item_id));
    if (!renglon) {
      return res.status(400).json({ error: 'Uno de los items no pertenece a esta compra.' });
    }
    const detalle = renglon.variante_id ? ` (${combinacionVariante(renglon.variante_id)})` : '';
    if (Number(item.cantidad) > renglon.disponible) {
      return res.status(400).json({
        error: `No se puede devolver más de lo comprado de "${renglon.nombre}"${detalle} (disponible: ${renglon.disponible}).`
      });
    }
    const stockActual = renglon.variante_id
      ? buscarStockVarianteDeposito.get(renglon.variante_id, depositoDevolucionProveedor)?.cantidad ?? 0
      : buscarStockDeposito.get(renglon.producto_id, depositoDevolucionProveedor)?.cantidad ?? 0;
    if (Number(item.cantidad) > stockActual) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${renglon.nombre}"${detalle} para devolver (stock actual: ${stockActual}).`
      });
    }
  }

  const devolucionId = withTransaction(() => {
    const { lastInsertRowid: nuevaId } = db
      .prepare(
        `INSERT INTO devoluciones_proveedor (compra_id, cuenta_tesoreria_id, motivo, deposito_id, organizacion_id, fecha) VALUES (?, ?, ?, ?, ?, ${HOY_SQL})`
      )
      .run(
        compraId,
        cuenta_tesoreria_id || null,
        motivo?.trim() || null,
        depositoDevolucionProveedor,
        req.usuario.organizacion_id
      );

    const insertItem = db.prepare(
      `INSERT INTO devolucion_proveedor_items
              (devolucion_proveedor_id, compra_item_id, producto_id, variante_id, cantidad, precio_unitario, costo_real_unitario)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of items) {
      const renglon = disponibles.get(Number(item.compra_item_id));
      insertItem.run(
        nuevaId,
        renglon.compra_item_id,
        renglon.producto_id,
        renglon.variante_id,
        Number(item.cantidad),
        renglon.precio_unitario,
        renglon.costo_real_unitario ?? renglon.precio_unitario
      );
    }

    aplicarDevolucionProveedor(nuevaId);
    auditar(req, {
      accion: 'crear',
      entidad: 'devolucion_proveedor',
      entidad_id: nuevaId,
      operacion_tipo: 'compra',
      operacion_id: compraId,
      detalle: `Devolución a proveedor #${nuevaId} sobre la compra #${compraId}`
    });
    return nuevaId;
  });

  res.status(201).json({ id: devolucionId });
});

app.post('/api/devoluciones-proveedor/:id/nota-credito', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { numero } = req.body;

  if (!numero || !String(numero).trim()) {
    return res.status(400).json({ error: 'Hace falta el número de la nota de crédito.' });
  }

  const devolucion = db
    .prepare('SELECT id, estado, nota_credito_proveedor_numero FROM devoluciones_proveedor WHERE id = ? AND organizacion_id = ?')
    .get(id, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución está anulada.' });
  }
  if (devolucion.nota_credito_proveedor_numero) {
    return res.status(409).json({ error: 'Esta devolución ya tiene una nota de crédito asociada.' });
  }

  const numeroFinal = String(numero).trim();
  db.prepare('UPDATE devoluciones_proveedor SET nota_credito_proveedor_numero = ? WHERE id = ?').run(
    numeroFinal,
    id
  );

  res.json({ id, nota_credito_proveedor_numero: numeroFinal });
});

app.post('/api/devoluciones-proveedor/:id/anular', soloAdmin, (req, res) => {
  const id = Number(req.params.id);

  const devolucion = db
    .prepare('SELECT id, estado, nota_credito_proveedor_numero FROM devoluciones_proveedor WHERE id = ? AND organizacion_id = ?')
    .get(id, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado === 'anulada') {
    return res.status(400).json({ error: 'Esta devolución ya está anulada.' });
  }
  if (devolucion.nota_credito_proveedor_numero) {
    return res
      .status(400)
      .json({ error: 'Esta devolución tiene una nota de crédito asociada, no se puede anular.' });
  }

  // Anular hace ENTRAR stock de nuevo (revertirDevolucionProveedor: se
  // deshace la salida hacia el proveedor), así que a diferencia de
  // restaurar (que vuelve a sacarlo) nunca puede fallar por falta de
  // stock — mismo criterio que anular una devolución de venta.
  withTransaction(() => {
    revertirDevolucionProveedor(id);
    db.prepare("UPDATE devoluciones_proveedor SET estado = 'anulada' WHERE id = ?").run(id);
    auditar(req, {
      accion: 'anular',
      entidad: 'devolucion_proveedor',
      entidad_id: id,
      detalle: `Devolución a proveedor #${id} anulada`
    });
  });

  res.json({ id, estado: 'anulada' });
});

// Restaurar desde la papelera: vuelve a aplicar el efecto completo (salida
// de stock, costo, cuenta corriente y, si correspondía, el ingreso de
// caja). Puede fallar si en el medio se volvió a comprar/vender ese
// producto de forma que ya no alcanza el stock — mismo cuidado que
// restaurar una compra.
app.post('/api/devoluciones-proveedor/:id/restaurar', soloAdmin, (req, res) => {
  const id = Number(req.params.id);

  const devolucion = db
    .prepare('SELECT id, estado, deposito_id FROM devoluciones_proveedor WHERE id = ? AND organizacion_id = ?')
    .get(id, req.usuario.organizacion_id);
  if (!devolucion) {
    return res.status(404).json({ error: 'Devolución a proveedor no encontrada.' });
  }
  if (devolucion.estado !== 'anulada') {
    return res.status(400).json({ error: 'Esta devolución no está en la papelera.' });
  }
  const depositoDevolucionRestaurar = devolucion.deposito_id ?? depositoPredeterminadoId(req.usuario.organizacion_id);

  const items = db
    .prepare(
      `SELECT devolucion_proveedor_items.producto_id, devolucion_proveedor_items.cantidad, productos.nombre
         FROM devolucion_proveedor_items JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
        WHERE devolucion_proveedor_id = ?`
    )
    .all(id);
  const buscarStockDeposito = db.prepare(
    'SELECT cantidad FROM stock_por_deposito WHERE producto_id = ? AND deposito_id = ?'
  );
  for (const item of items) {
    if (esServicio(item.producto_id)) continue;
    const stockActual = buscarStockDeposito.get(item.producto_id, depositoDevolucionRestaurar)?.cantidad ?? 0;
    if (stockActual - item.cantidad < 0) {
      return res.status(400).json({
        error: `No hay stock suficiente de "${item.nombre}" para restaurar esta devolución.${dondeHayStock(item.producto_id, depositoDevolucionRestaurar)}`
      });
    }
  }

  withTransaction(() => {
    db.prepare("UPDATE devoluciones_proveedor SET estado = 'activa' WHERE id = ?").run(id);
    aplicarDevolucionProveedor(id);
    auditar(req, {
      accion: 'restaurar',
      entidad: 'devolucion_proveedor',
      entidad_id: id,
      detalle: `Devolución a proveedor #${id} restaurada desde la papelera`
    });
  });

  res.json({ id, estado: 'activa' });
});

/* ---------- Cuentas de tesorería ---------- */

app.get('/api/cuentas-tesoreria', (req, res) => {
  const cuentas = db
    .prepare('SELECT * FROM cuentas_tesoreria WHERE organizacion_id = ? ORDER BY id')
    .all(req.usuario.organizacion_id);
  res.json(cuentas);
});

const TIPOS_CUENTA = ['efectivo', 'banco', 'mercadopago', 'otro'];

app.post('/api/cuentas-tesoreria', soloAdmin, (req, res) => {
  const { nombre, tipo, saldo_inicial } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La cuenta necesita un nombre.' });
  }
  if (!TIPOS_CUENTA.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' });
  }
  const saldoInicial = normalizarPrecio(saldo_inicial);
  if (Number.isNaN(saldoInicial)) {
    return res.status(400).json({ error: 'El saldo inicial tiene que ser un número.' });
  }
  // nombre es UNIQUE dentro de la organización: se chequea acá para devolver
  // un mensaje entendible en vez de dejar que reviente la constraint.
  const yaExiste = db
    .prepare('SELECT 1 FROM cuentas_tesoreria WHERE nombre = ? AND organizacion_id = ?')
    .get(String(nombre).trim(), req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una cuenta con ese nombre.' });
  }

  const lastInsertRowid = withTransaction(() => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO cuentas_tesoreria (nombre, tipo, saldo_inicial, organizacion_id) VALUES (?, ?, ?, ?)')
      .run(String(nombre).trim(), tipo, saldoInicial, req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'cuenta_tesoreria',
      entidad_id: id,
      detalle: `Cuenta "${String(nombre).trim()}" (${tipo}) creada con saldo inicial $${saldoInicial}`
    });
    return id;
  });
  res.status(201).json({ id: lastInsertRowid });
});

app.patch('/api/cuentas-tesoreria/:id', soloAdmin, (req, res) => {
  const cuentaId = Number(req.params.id);
  const { nombre, tipo, saldo_inicial } = req.body;

  const cuenta = db
    .prepare('SELECT * FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(cuentaId, req.usuario.organizacion_id);
  if (!cuenta) {
    return res.status(404).json({ error: 'Cuenta no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La cuenta necesita un nombre.' });
  }
  if (!TIPOS_CUENTA.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' });
  }
  const saldoInicial = normalizarPrecio(saldo_inicial);
  if (Number.isNaN(saldoInicial)) {
    return res.status(400).json({ error: 'El saldo inicial tiene que ser un número.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM cuentas_tesoreria WHERE nombre = ? AND id <> ? AND organizacion_id = ?')
    .get(String(nombre).trim(), cuentaId, req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra cuenta con ese nombre.' });
  }

  const nuevo = { nombre: String(nombre).trim(), tipo, saldo_inicial: saldoInicial };
  // saldo_inicial es el campo más sensible acá: tocarlo mueve el saldo de
  // toda la cuenta sin generar un solo movimiento_tesoreria (§22, "editar
  // cuenta de tesorería" está en Fase A justo por esto).
  const cambios = diffCampos(cuenta, nuevo, ['nombre', 'tipo', 'saldo_inicial']);

  withTransaction(() => {
    db.prepare('UPDATE cuentas_tesoreria SET nombre = ?, tipo = ?, saldo_inicial = ? WHERE id = ?').run(
      nuevo.nombre,
      nuevo.tipo,
      nuevo.saldo_inicial,
      cuentaId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'cuenta_tesoreria',
        entidad_id: cuentaId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Cuenta de tesorería "${nuevo.nombre}" editada`
      });
    }
  });
  res.json({ id: cuentaId });
});

/* ---------- Tesorería (caja) ---------- */

// Dónde está la plata. El saldo sale de la vista saldo_tesoreria
// (saldo_inicial + movimientos), nunca de un campo editable a mano
// (CLAUDE.md §12/§13): se puede reconstruir siempre desde el historial.
app.get('/api/tesoreria', (req, res) => {
  // Las cuentas son de la organización (cada una con su "Efectivo"), así que
  // el saldo de cada fila ya es solo de esa empresa: saldo_tesoreria agrupa
  // por cuenta, y una cuenta nunca recibe movimientos de otra organización
  // (todo alta de movimiento valida la cuenta contra la sesión).
  const cuentas = db
    .prepare(
      `SELECT cuentas_tesoreria.*,
              COALESCE((SELECT saldo FROM saldo_tesoreria
                         WHERE saldo_tesoreria.cuenta_tesoreria_id = cuentas_tesoreria.id), 0) AS saldo
         FROM cuentas_tesoreria
        WHERE cuentas_tesoreria.organizacion_id = ?
        ORDER BY cuentas_tesoreria.id`
    )
    .all(req.usuario.organizacion_id);

  // Las transferencias se excluyen de los totales de ingresos/egresos a
  // propósito: mover plata de una cuenta propia a otra no es plata que
  // entre ni salga del negocio, y contarla infla las dos columnas.
  const { ingresos, egresos } = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe END), 0) AS ingresos,
              COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN importe END), 0) AS egresos
         FROM movimientos_tesoreria
        WHERE origen <> 'transferencia' AND organizacion_id = ?`
    )
    .get(req.usuario.organizacion_id);

  res.json({
    cuentas,
    total: cuentas.reduce((acc, c) => acc + c.saldo, 0),
    ingresos,
    egresos
  });
});

// Igual que movimientos-stock: se devuelve el historial y el navegador lo
// filtra con el motor común (ver el comentario de TOPE_MOVIMIENTOS).
app.get('/api/tesoreria/movimientos', (req, res) => {
  const limit = limiteDeConsulta(req.query.limit);

  // La contraparte de una transferencia es la otra pata que comparte
  // transferencia_id: se busca su cuenta para poder mostrar
  // "Transferencia a Banco" en vez de un egreso suelto sin explicación.
  const movimientos = db
    .prepare(
      `SELECT movimientos_tesoreria.id, movimientos_tesoreria.fecha, movimientos_tesoreria.tipo,
              movimientos_tesoreria.importe, movimientos_tesoreria.origen, movimientos_tesoreria.concepto,
              movimientos_tesoreria.cuenta_tesoreria_id,
              cuentas_tesoreria.nombre AS cuenta,
              cobros.venta_id AS venta_id,
              pagos.compra_id AS compra_id,
              (SELECT c2.nombre
                 FROM movimientos_tesoreria AS otra
                 JOIN cuentas_tesoreria AS c2 ON c2.id = otra.cuenta_tesoreria_id
                WHERE otra.transferencia_id = movimientos_tesoreria.transferencia_id
                  AND otra.id <> movimientos_tesoreria.id) AS contraparte
         FROM movimientos_tesoreria
         JOIN cuentas_tesoreria ON cuentas_tesoreria.id = movimientos_tesoreria.cuenta_tesoreria_id
         LEFT JOIN cobros ON cobros.id = movimientos_tesoreria.cobro_id
         LEFT JOIN pagos ON pagos.id = movimientos_tesoreria.pago_id
        WHERE movimientos_tesoreria.organizacion_id = ?
        ORDER BY movimientos_tesoreria.fecha DESC, movimientos_tesoreria.id DESC
        LIMIT ?`
    )
    .all(req.usuario.organizacion_id, limit);

  res.json(movimientos);
});

// Ingreso o egreso cargado a mano: aporte del dueño, retiro, un gasto
// pagado de la caja. No tiene venta ni compra detrás, por eso lleva
// concepto: es lo único que explica de qué se trata.
app.post('/api/tesoreria/movimientos', soloAdmin, (req, res) => {
  const { cuenta_tesoreria_id, tipo, importe, fecha, concepto } = req.body;

  if (tipo !== 'ingreso' && tipo !== 'egreso') {
    return res.status(400).json({ error: 'El tipo tiene que ser ingreso o egreso.' });
  }
  const monto = Number(importe);
  if (!(monto > 0)) {
    return res.status(400).json({ error: 'El importe tiene que ser mayor a 0.' });
  }
  const cuenta = db
    .prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(cuenta_tesoreria_id), req.usuario.organizacion_id);
  if (!cuenta) {
    return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
  }

  const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'concepto', 'organizacion_id'];
  const valores = [cuenta.id, tipo, monto, 'manual', concepto?.trim() || null, req.usuario.organizacion_id];
  columnas.push('fecha');
    valores.push(fecha || fechaDeHoy());

  let lastInsertRowid;
  withTransaction(() => {
    ({ lastInsertRowid } = db
      .prepare(
        `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
          .map(() => '?')
          .join(', ')})`
      )
      .run(...valores));
    auditar(req, {
      accion: 'crear',
      entidad: 'tesoreria',
      entidad_id: lastInsertRowid,
      detalle: `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} manual de $${monto} en "${cuenta.nombre}"`
    });
  });

  res.status(201).json({ id: lastInsertRowid });
});

// Transferencia entre cuentas propias: sale de una y entra en la otra.
// Son dos movimientos y no uno porque cada cuenta tiene que ver su propio
// lado del movimiento en su historial. Van juntos en una transacción: una
// transferencia a medias dejaría plata desaparecida.
app.post('/api/tesoreria/transferencias', soloAdmin, (req, res) => {
  const { origen_id, destino_id, importe, fecha, concepto } = req.body;

  const monto = Number(importe);
  if (!(monto > 0)) {
    return res.status(400).json({ error: 'El importe tiene que ser mayor a 0.' });
  }
  if (Number(origen_id) === Number(destino_id)) {
    return res.status(400).json({ error: 'La cuenta de origen y la de destino tienen que ser distintas.' });
  }
  const buscarCuenta = db.prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?');
  const cuentaOrigen = buscarCuenta.get(Number(origen_id), req.usuario.organizacion_id);
  const cuentaDestino = buscarCuenta.get(Number(destino_id), req.usuario.organizacion_id);
  if (!cuentaOrigen || !cuentaDestino) {
    return res.status(400).json({ error: 'Alguna de las cuentas de la transferencia no existe.' });
  }

  const transferenciaId = withTransaction(() => {
    const insertMovimiento = (cuentaId, tipo, grupo) => {
      const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'concepto', 'organizacion_id'];
      const valores = [cuentaId, tipo, monto, 'transferencia', concepto?.trim() || null, req.usuario.organizacion_id];
      columnas.push('fecha');
        valores.push(fecha || fechaDeHoy());
      if (grupo !== null) {
        columnas.push('transferencia_id');
        valores.push(grupo);
      }
      return db
        .prepare(
          `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
            .map(() => '?')
            .join(', ')})`
        )
        .run(...valores).lastInsertRowid;
    };

    // El id del egreso hace de id de la transferencia: se inserta primero
    // sin grupo, se marca a sí mismo, y el ingreso nace ya apuntando ahí.
    const egresoId = insertMovimiento(cuentaOrigen.id, 'egreso', null);
    db.prepare('UPDATE movimientos_tesoreria SET transferencia_id = ? WHERE id = ?').run(egresoId, egresoId);
    insertMovimiento(cuentaDestino.id, 'ingreso', egresoId);

    auditar(req, {
      accion: 'crear',
      entidad: 'tesoreria',
      entidad_id: egresoId,
      detalle: `Transferencia de $${monto} de "${cuentaOrigen.nombre}" a "${cuentaDestino.nombre}"`
    });

    return egresoId;
  });

  res.status(201).json({ transferencia_id: transferenciaId });
});

/* ---------- Categorías de gasto ---------- */

const TIPOS_GASTO = ['operativo', 'inversion', 'retiro'];

app.get('/api/categorias-gasto', (req, res) => {
  const categorias = db
    .prepare('SELECT * FROM categorias_gasto WHERE organizacion_id = ? ORDER BY nombre')
    .all(req.usuario.organizacion_id);
  res.json(categorias);
});

app.post('/api/categorias-gasto', soloAdmin, (req, res) => {
  const { nombre, tipo } = req.body;

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  if (!TIPOS_GASTO.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de gasto no es válido.' });
  }
  // nombre es UNIQUE dentro de la organización: se chequea acá para devolver
  // un mensaje entendible en vez de dejar que reviente la constraint.
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias_gasto WHERE nombre = ? AND organizacion_id = ?')
    .get(String(nombre).trim(), req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
  }

  const lastInsertRowid = withTransaction(() => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO categorias_gasto (nombre, tipo, organizacion_id) VALUES (?, ?, ?)')
      .run(String(nombre).trim(), tipo, req.usuario.organizacion_id);
    auditar(req, {
      accion: 'crear',
      entidad: 'categoria_gasto',
      entidad_id: id,
      detalle: `Categoría de gasto "${String(nombre).trim()}" (${tipo}) creada`
    });
    return id;
  });
  res.status(201).json({ id: lastInsertRowid });
});

// Cambiar el tipo de una categoría afecta solo a los gastos futuros: los
// ya cargados guardan su propio tipo (ver schema.sql), justamente para no
// reescribir resultados de meses cerrados.
app.patch('/api/categorias-gasto/:id', soloAdmin, (req, res) => {
  const categoriaId = Number(req.params.id);
  const { nombre, tipo, activa } = req.body;

  const categoria = db
    .prepare('SELECT * FROM categorias_gasto WHERE id = ? AND organizacion_id = ?')
    .get(categoriaId, req.usuario.organizacion_id);
  if (!categoria) {
    return res.status(404).json({ error: 'Categoría no encontrada.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'La categoría necesita un nombre.' });
  }
  if (!TIPOS_GASTO.includes(tipo)) {
    return res.status(400).json({ error: 'El tipo de gasto no es válido.' });
  }
  const yaExiste = db
    .prepare('SELECT 1 FROM categorias_gasto WHERE nombre = ? AND id <> ? AND organizacion_id = ?')
    .get(String(nombre).trim(), categoriaId, req.usuario.organizacion_id);
  if (yaExiste) {
    return res.status(400).json({ error: 'Ya existe otra categoría con ese nombre.' });
  }

  const nuevo = {
    nombre: String(nombre).trim(),
    tipo,
    activa: activa === undefined ? 1 : Number(Boolean(activa))
  };
  const cambios = diffCampos(categoria, nuevo, ['nombre', 'tipo', 'activa']);

  withTransaction(() => {
    db.prepare('UPDATE categorias_gasto SET nombre = ?, tipo = ?, activa = ? WHERE id = ?').run(
      nuevo.nombre,
      nuevo.tipo,
      nuevo.activa,
      categoriaId
    );
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'categoria_gasto',
        entidad_id: categoriaId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Categoría de gasto "${nuevo.nombre}" editada`
      });
    }
  });
  res.json({ id: categoriaId });
});

/* ---------- Gastos ---------- */

const SELECT_GASTO = `
  SELECT gastos.*,
         categorias_gasto.nombre AS categoria,
         cuentas_tesoreria.nombre AS cuenta,
         proveedores.nombre AS proveedor
    FROM gastos
    JOIN categorias_gasto ON categorias_gasto.id = gastos.categoria_id
    JOIN cuentas_tesoreria ON cuentas_tesoreria.id = gastos.cuenta_tesoreria_id
    LEFT JOIN proveedores ON proveedores.id = gastos.proveedor_id`;

app.get('/api/gastos', (req, res) => {
  const gastos = db
    .prepare(`${SELECT_GASTO} WHERE gastos.organizacion_id = ? ORDER BY gastos.fecha DESC, gastos.id DESC`)
    .all(req.usuario.organizacion_id);
  res.json(gastos);
});

// Valida el cuerpo de un gasto y resuelve la categoría. Lo comparten el
// alta y la edición, que exigen exactamente lo mismo. Categoría, cuenta y
// proveedor tienen que ser de la organización del gasto: uno de otra
// empresa da el mismo error que uno inexistente.
function validarGasto(body, organizacionId) {
  const { categoria_id, cuenta_tesoreria_id, proveedor_id, importe, tipo } = body;

  const categoria = db
    .prepare('SELECT id, tipo FROM categorias_gasto WHERE id = ? AND organizacion_id = ?')
    .get(Number(categoria_id), organizacionId);
  if (!categoria) {
    return { error: 'La categoría del gasto no existe.' };
  }
  const cuenta = db
    .prepare('SELECT id FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(cuenta_tesoreria_id), organizacionId);
  if (!cuenta) {
    return { error: 'La cuenta de tesorería no existe.' };
  }
  const monto = Number(importe);
  if (!(monto > 0)) {
    return { error: 'El importe del gasto tiene que ser mayor a 0.' };
  }
  // El tipo se hereda de la categoría salvo que venga uno explícito, que
  // es lo que permite corregir un gasto puntual sin tocar la categoría.
  const tipoFinal = tipo === undefined || tipo === null || tipo === '' ? categoria.tipo : tipo;
  if (!TIPOS_GASTO.includes(tipoFinal)) {
    return { error: 'El tipo de gasto no es válido.' };
  }
  let proveedorFinal = null;
  if (proveedor_id) {
    const proveedor = db
      .prepare('SELECT id FROM proveedores WHERE id = ? AND organizacion_id = ?')
      .get(Number(proveedor_id), organizacionId);
    if (!proveedor) {
      return { error: 'El proveedor del gasto no existe.' };
    }
    proveedorFinal = proveedor.id;
  }

  return { categoriaId: categoria.id, cuentaId: cuenta.id, proveedorId: proveedorFinal, monto, tipo: tipoFinal };
}

// Un gasto se paga en el momento (decisión del equipo): además de la fila
// en gastos genera su egreso de tesorería, los dos en la misma
// transacción para que no quede plata descontada sin gasto ni al revés.
app.post('/api/gastos', (req, res) => {
  const { fecha, descripcion, comprobante } = req.body;
  const validacion = validarGasto(req.body, req.usuario.organizacion_id);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }
  const { categoriaId, cuentaId, proveedorId, monto, tipo } = validacion;

  const gastoId = withTransaction(() => {
    const id = crearGasto({
      categoriaId,
      cuentaId,
      proveedorId,
      monto,
      tipo,
      fecha,
      descripcion,
      comprobante,
      organizacionId: req.usuario.organizacion_id
    });
    auditar(req, { accion: 'crear', entidad: 'gasto', entidad_id: id, detalle: `Gasto #${id} creado` });
    return id;
  });

  res.status(201).json({ id: gastoId });
});

// Inserta el gasto y su egreso de tesorería. Espera los datos ya
// validados por validarGasto() (categoriaId/cuentaId/proveedorId/monto/
// tipo con nombres resueltos a ID). Asume que se la llama DENTRO de una
// transacción.
function crearGasto({ categoriaId, cuentaId, proveedorId, monto, tipo, fecha, descripcion, comprobante, organizacionId }) {
  const columnas = [
    'categoria_id',
    'cuenta_tesoreria_id',
    'proveedor_id',
    'importe',
    'tipo',
    'descripcion',
    'comprobante',
    'organizacion_id'
  ];
  const valores = [
    categoriaId,
    cuentaId,
    proveedorId,
    monto,
    tipo,
    descripcion?.trim() || null,
    comprobante?.trim() || null,
    organizacionId
  ];
  columnas.push('fecha');
    valores.push(fecha || fechaDeHoy());
  const { lastInsertRowid: nuevoGastoId } = db
    .prepare(`INSERT INTO gastos (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`)
    .run(...valores);

  insertarMovimientoGasto(nuevoGastoId, cuentaId, monto, fecha, descripcion, organizacionId);
  return nuevoGastoId;
}

function insertarMovimientoGasto(gastoId, cuentaId, monto, fecha, descripcion, organizacionId) {
  const columnas = ['cuenta_tesoreria_id', 'tipo', 'importe', 'origen', 'gasto_id', 'concepto', 'organizacion_id'];
  const valores = [cuentaId, 'egreso', monto, 'gasto', gastoId, descripcion?.trim() || null, organizacionId];
  columnas.push('fecha');
    valores.push(fecha || fechaDeHoy());
  db.prepare(
    `INSERT INTO movimientos_tesoreria (${columnas.join(', ')}) VALUES (${columnas
      .map(() => '?')
      .join(', ')})`
  ).run(...valores);
}

// Editar un gasto: se borra su movimiento de tesorería y se inserta el
// nuevo, dentro de una transacción. Acá sí se puede borrar el movimiento
// (a diferencia de stock o cuenta corriente, donde se compensa) porque un
// gasto es dueño exclusivo de su egreso: nadie más lo referencia y no hay
// un saldo intermedio que alguien haya visto entre medio.
app.put('/api/gastos/:id', (req, res) => {
  const gastoId = Number(req.params.id);
  const { fecha, descripcion, comprobante } = req.body;

  const gasto = db
    .prepare('SELECT id, estado FROM gastos WHERE id = ? AND organizacion_id = ?')
    .get(gastoId, req.usuario.organizacion_id);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado === 'anulado') {
    return res.status(400).json({ error: 'Este gasto está anulado. Restauralo primero si querés editarlo.' });
  }

  const validacion = validarGasto(req.body, req.usuario.organizacion_id);
  if (validacion.error) {
    return res.status(400).json({ error: validacion.error });
  }
  const { categoriaId, cuentaId, proveedorId, monto, tipo } = validacion;

  withTransaction(() => {
    db.prepare(
      `UPDATE gastos
          SET categoria_id = ?, cuenta_tesoreria_id = ?, proveedor_id = ?, importe = ?,
              tipo = ?, descripcion = ?, comprobante = ?, fecha = COALESCE(?, fecha)
        WHERE id = ?`
    ).run(
      categoriaId,
      cuentaId,
      proveedorId,
      monto,
      tipo,
      descripcion?.trim() || null,
      comprobante?.trim() || null,
      fecha || null,
      gastoId
    );

    db.prepare('DELETE FROM movimientos_tesoreria WHERE gasto_id = ?').run(gastoId);
    insertarMovimientoGasto(gastoId, cuentaId, monto, fecha, descripcion, req.usuario.organizacion_id);

    auditar(req, {
      accion: 'editar',
      entidad: 'gasto',
      entidad_id: gastoId,
      detalle: `Gasto #${gastoId} editado`
    });
  });

  res.json({ id: gastoId });
});

app.post('/api/gastos/:id/anular', soloAdmin, (req, res) => {
  const gastoId = Number(req.params.id);
  const gasto = db
    .prepare('SELECT id, estado FROM gastos WHERE id = ? AND organizacion_id = ?')
    .get(gastoId, req.usuario.organizacion_id);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado === 'anulado') {
    return res.status(400).json({ error: 'Este gasto ya está anulado.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE gastos SET estado = 'anulado' WHERE id = ?").run(gastoId);
    // La plata vuelve a la cuenta: se saca el egreso que lo había bajado.
    db.prepare('DELETE FROM movimientos_tesoreria WHERE gasto_id = ?').run(gastoId);
    auditar(req, {
      accion: 'anular',
      entidad: 'gasto',
      entidad_id: gastoId,
      detalle: `Gasto #${gastoId} anulado`
    });
  });

  res.json({ id: gastoId, estado: 'anulado' });
});

app.post('/api/gastos/:id/restaurar', soloAdmin, (req, res) => {
  const gastoId = Number(req.params.id);
  const gasto = db
    .prepare(
      'SELECT id, estado, cuenta_tesoreria_id, importe, fecha, descripcion FROM gastos WHERE id = ? AND organizacion_id = ?'
    )
    .get(gastoId, req.usuario.organizacion_id);
  if (!gasto) {
    return res.status(404).json({ error: 'Gasto no encontrado.' });
  }
  if (gasto.estado !== 'anulado') {
    return res.status(400).json({ error: 'Este gasto no está anulado.' });
  }

  withTransaction(() => {
    db.prepare("UPDATE gastos SET estado = 'activo' WHERE id = ?").run(gastoId);
    insertarMovimientoGasto(
      gastoId,
      gasto.cuenta_tesoreria_id,
      gasto.importe,
      gasto.fecha,
      gasto.descripcion,
      req.usuario.organizacion_id
    );
    auditar(req, {
      accion: 'restaurar',
      entidad: 'gasto',
      entidad_id: gastoId,
      detalle: `Gasto #${gastoId} restaurado desde la papelera`
    });
  });

  res.json({ id: gastoId, estado: 'activo' });
});

/* ---------- Cuentas corrientes (a cobrar y a pagar) ---------- */

// Aging medido contra el vencimiento pactado de cada operación, no contra su
// fecha: una venta a 30 días hecha ayer no está atrasada, y una de contado
// impaga hace 20 días sí. `dias` es la distancia desde el vencimiento hasta
// hoy, así que un número negativo significa que todavía no venció.
// Los cuatro tramos se mapean a las clases .status-* que ya existen en el
// frontend (verde/amarillo/rojo), para no agregar CSS nueva.
function tramoDeVencimiento(dias) {
  if (dias < 0) return 'a_vencer';
  if (dias <= 30) return 'vencido_30';
  if (dias <= 60) return 'vencido_60';
  return 'vencido_mas';
}

// Saldo pendiente por operación (venta o compra), no por entidad: es la
// base para poder mostrar el detalle y para calcular la antigüedad desde
// la operación impaga más vieja. No se filtra por estado de la operación
// a propósito: anular una venta o una compra ya inserta el movimiento de
// reversión que deja el saldo en cero (ver los endpoints .../anular), así
// que las anuladas se caen solas acá por el HAVING — filtrar por estado
// sería redundante y más frágil si ese criterio cambia en otro lado.
// `> 0.005` en vez de `<> 0` porque importe es REAL: una operación saldada
// al centavo puede dejar un residuo de coma flotante.
//
// El GROUP BY incluye la entidad además de la operación: si solo
// agrupara por operación, m.${columnaEntidad} sería una bare column bajo
// SQLite y devolvería el valor de una fila arbitraria del grupo. Con
// datos normales todos los movimientos de una operación son de la misma
// entidad y no se nota, pero editar una venta cambiando de cliente deja
// dos asientos de 'ajuste' en la misma operación con cliente_id distinto
// (ver PUT /api/ventas/:id) — sin la entidad en el GROUP BY, esta
// consulta sumaría los dos juntos y se los adjudicaría a cualquiera de
// los dos en vez de partirlos correctamente entre ambos.
function saldosPorOperacion(tablaMovimientos, columnaEntidad, columnaOperacion, tablaOperacion, organizacionId) {
  return db
    .prepare(
      `SELECT m.${columnaOperacion} AS operacion_id, m.${columnaEntidad} AS entidad_id,
              o.fecha AS fecha, COALESCE(o.fecha_vencimiento, o.fecha) AS vencimiento,
              ROUND(SUM(m.importe), 2) AS pendiente
         FROM ${tablaMovimientos} m
         JOIN ${tablaOperacion} o ON o.id = m.${columnaOperacion}
        WHERE o.organizacion_id = ?
        GROUP BY m.${columnaOperacion}, m.${columnaEntidad}
       HAVING ABS(SUM(m.importe)) > 0.005`
    )
    .all(organizacionId);
}

// Agrupa los saldos por operación (arriba) en uno por entidad: saldo total,
// los días vencidos de la deuda más atrasada (solo entre las operaciones que
// SÍ son deuda: un saldo negativo es crédito a favor, no vence), y el detalle
// ordenado por vencimiento para la fila expandible.
function agruparPorEntidad(saldos, tablaEntidad, hoy, organizacionId) {
  const porEntidad = new Map();
  for (const s of saldos) {
    if (!porEntidad.has(s.entidad_id)) porEntidad.set(s.entidad_id, []);
    porEntidad.get(s.entidad_id).push(s);
  }

  const resultado = [];
  for (const [entidadId, operacionesRaw] of porEntidad) {
    const entidad = db
      .prepare(`SELECT id, nombre, telefono, email FROM ${tablaEntidad} WHERE id = ? AND organizacion_id = ?`)
      .get(entidadId, organizacionId);
    if (!entidad) continue; // defensivo: no debería pasar, la FK lo garantiza

    const operaciones = operacionesRaw
      .map((o) => {
        // Negativo = todavía no venció (le faltan N días).
        const dias = diffDias(o.vencimiento, hoy);
        return {
          id: o.operacion_id,
          fecha: o.fecha,
          vencimiento: o.vencimiento,
          pendiente: o.pendiente,
          dias: o.pendiente > 0 ? dias : null,
          tramo: o.pendiente > 0 ? tramoDeVencimiento(dias) : null
        };
      })
      .sort((a, b) =>
        a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : a.id - b.id
      );

    const saldo = Math.round(operaciones.reduce((acc, o) => acc + o.pendiente, 0) * 100) / 100;
    const diasDeuda = operaciones.filter((o) => o.pendiente > 0).map((o) => o.dias);

    resultado.push({
      id: entidad.id,
      nombre: entidad.nombre,
      telefono: entidad.telefono,
      email: entidad.email,
      saldo,
      dias_max: diasDeuda.length ? Math.max(...diasDeuda) : null,
      operaciones
    });
  }

  return resultado.sort((a, b) => (b.dias_max ?? -1) - (a.dias_max ?? -1));
}

app.get('/api/cuentas-corrientes', (req, res) => {
  const hoy = fechaDeHoy();
  // La cuota de un abono que empezó hoy ya se debe (hist. §79): se arma antes
  // de mirar los saldos, aunque nadie haya entrado a Abonos.
  ponerAbonosAlDia(req.usuario.organizacion_id);

  const entidadesClientes = agruparPorEntidad(
    saldosPorOperacion('movimientos_cc_clientes', 'cliente_id', 'venta_id', 'ventas', req.usuario.organizacion_id),
    'clientes',
    hoy,
    req.usuario.organizacion_id
  );
  const entidadesProveedores = agruparPorEntidad(
    saldosPorOperacion('movimientos_cc_proveedores', 'proveedor_id', 'compra_id', 'compras', req.usuario.organizacion_id),
    'proveedores',
    hoy,
    req.usuario.organizacion_id
  );

  // Los totales solo suman deuda real (saldo > 0); un saldo a favor va
  // aparte y no compensa la deuda de otra entidad.
  const porCobrar = entidadesClientes.filter((e) => e.saldo > 0);
  const porPagar = entidadesProveedores.filter((e) => e.saldo > 0);
  const aFavorClientes = entidadesClientes.filter((e) => e.saldo < 0);
  const aFavorProveedores = entidadesProveedores.filter((e) => e.saldo < 0);

  const sumaSaldo = (lista) => Math.round(lista.reduce((acc, e) => acc + e.saldo, 0) * 100) / 100;
  const totalPorCobrar = sumaSaldo(porCobrar);
  const totalPorPagar = sumaSaldo(porPagar);

  res.json({
    por_cobrar: porCobrar,
    por_pagar: porPagar,
    a_favor_clientes: aFavorClientes,
    a_favor_proveedores: aFavorProveedores,
    totales: {
      por_cobrar: totalPorCobrar,
      por_pagar: totalPorPagar,
      a_favor_clientes: Math.abs(sumaSaldo(aFavorClientes)),
      a_favor_proveedores: Math.abs(sumaSaldo(aFavorProveedores)),
      neto: Math.round((totalPorCobrar - totalPorPagar) * 100) / 100
    }
  });
});

/* ---------- Resumen (resultado del negocio) ---------- */

// El resultado real del negocio. La distinción importante está en qué se
// resta y qué no: solo los gastos operativos bajan el resultado. Las
// inversiones y los retiros salieron de la caja, pero no son gasto del
// período — se informan aparte para que se vean sin ensuciar el número.
//
// Las siguientes sentencias se preparan una sola vez a propósito, acá
// arriba y no dentro de calcularResultado(): esa función corre en loop
// (una vez por período de la serie de /api/resumen/evolucion), y
// re-preparar las mismas sentencias en cada vuelta sería trabajo de
// parseo puro por nada. Es seguro hoistear el statement (no solo el
// string SQL, que es lo que se hace en el resto del archivo) porque este
// módulo se importa después de que db/index.js termina de correr las
// migraciones.
const SQL_RESULTADO_VENTAS = db.prepare(
  `SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0) AS total,
          COALESCE(SUM(venta_items.cantidad * venta_items.costo_unitario_historico), 0) AS costo
     FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
      AND ventas.organizacion_id = ?`
);

const SQL_RESULTADO_GASTOS = db.prepare(
  `SELECT COALESCE(SUM(CASE WHEN tipo = 'operativo' THEN importe END), 0) AS operativos,
          COALESCE(SUM(CASE WHEN tipo = 'inversion' THEN importe END), 0) AS inversiones,
          COALESCE(SUM(CASE WHEN tipo = 'retiro' THEN importe END), 0) AS retiros
     FROM gastos
    WHERE estado = 'activo'
      AND (? IS NULL OR fecha >= ?)
      AND (? IS NULL OR fecha <= ?)
      AND organizacion_id = ?`
);

// Una devolución activa borra la venta que revierte (y su costo, si esa
// mercadería volvió al depósito) del resultado del período en que se
// hizo la devolución — no del período de la venta original, que ya
// cerró. Si vino fallada (vuelve_stock = 0), el costo NO se resta: la
// venta se borra pero el costo queda puesto, o sea la pérdida completa
// de esa mercadería (CLAUDE.md §17).
const SQL_RESULTADO_DEVOLUCIONES = db.prepare(
  `SELECT COALESCE(SUM(devolucion_items.cantidad * devolucion_items.precio_unitario), 0) AS importe,
          COALESCE(SUM(CASE WHEN devolucion_items.vuelve_stock
                            THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                            ELSE 0 END), 0) AS costo
     FROM devoluciones JOIN devolucion_items ON devolucion_items.devolucion_id = devoluciones.id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
      AND devoluciones.organizacion_id = ?`
);

// Fuente de verdad única del resultado del negocio: la usan tanto
// GET /api/resumen (un solo período) como GET /api/resumen/evolucion (uno
// por período de la serie, más el total y el período de comparación). Las
// reglas contables de arriba viven acá y en ningún otro lado — si el día
// de mañana cambian, cambian una sola vez.
function calcularResultado(desde, hasta, organizacionId) {
  // El mismo par de parámetros se repite en cada consulta; con
  // (? IS NULL OR campo >= ?) el filtro se apaga solo cuando no viene.
  // organizacionId NO es opcional: va plano y sin IS NULL a propósito
  // (ver CLAUDE.md §28) para que un llamador que lo pase undefined
  // explote en el bind en vez de mezclar organizaciones en silencio.
  const rango = [desde ?? null, desde ?? null, hasta ?? null, hasta ?? null, organizacionId];

  const ventas = SQL_RESULTADO_VENTAS.get(...rango);
  const gastos = SQL_RESULTADO_GASTOS.get(...rango);
  const devoluciones = SQL_RESULTADO_DEVOLUCIONES.get(...rango);

  const ventasNetas = ventas.total - devoluciones.importe;
  const costoNeto = ventas.costo - devoluciones.costo;
  const gananciaBruta = ventasNetas - costoNeto;

  return {
    ventas: ventasNetas,
    costo_mercaderia: costoNeto,
    ganancia_bruta: gananciaBruta,
    gastos_operativos: gastos.operativos,
    resultado: gananciaBruta - gastos.operativos,
    inversiones: gastos.inversiones,
    retiros: gastos.retiros
  };
}

app.get('/api/resumen', soloAdmin, (req, res) => {
  const { desde, hasta } = req.query;
  res.json(calcularResultado(desde ?? null, hasta ?? null, req.usuario.organizacion_id));
});

/* ---------- Resumen: evolución y comparación de períodos ---------- */

const CAMPOS_RESULTADO = [
  'ventas',
  'costo_mercaderia',
  'ganancia_bruta',
  'gastos_operativos',
  'resultado',
  'inversiones',
  'retiros'
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// Tope duro de períodos en la serie: no es un número que se vaya a
// alcanzar en uso normal (2 años en granularidad mensual son 25), es el
// seguro contra un ?desde= absurdamente viejo que generaría miles de
// iteraciones.
const MAX_BUCKETS = 40;

// Cuánto abarca el período pedido, para no traer más operaciones ni
// menos ventas/gastos/devoluciones de las que corresponden (mismas tres
// tablas que calcularResultado — compras y pagos no entran acá tampoco).
// Ampliada para incluir compras y devoluciones a proveedor (Reportes:
// compras, CLAUDE.md §20): antes solo miraba ventas/gastos/devoluciones de
// venta, así que un negocio con compras anteriores a su primera venta
// hubiera visto el "rango abierto" arrancar tarde y perder esas compras en
// silencio. También amplía (correctamente) el rango por defecto de
// /api/resumen/evolucion y /api/reportes/ventas, que ya usaban esta misma
// query preparada.
const SQL_LIMITES_OPERACIONES = db.prepare(
  `SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima FROM (
     SELECT fecha FROM ventas WHERE estado = 'activa' AND organizacion_id = ?
     UNION ALL SELECT fecha FROM gastos WHERE estado = 'activo' AND organizacion_id = ?
     UNION ALL SELECT fecha FROM devoluciones WHERE estado = 'activa' AND organizacion_id = ?
     UNION ALL SELECT fecha FROM compras WHERE estado = 'activa' AND organizacion_id = ?
     UNION ALL SELECT fecha FROM devoluciones_proveedor WHERE estado = 'activa' AND organizacion_id = ?
   )`
);

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
function validarFecha(valor) {
  return typeof valor === 'string' && FECHA_VALIDA.test(valor) ? valor : null;
}

// Condiciones de pago aceptadas en ventas y compras. El valor guardado es
// lo que se pactó ("30 días"); la fecha de vencimiento que sale de acá es su
// resultado sobre la fecha de esa operación puntual. 'manual' existe para el
// caso en que el plazo no cae en ninguno de los redondos.
const CONDICIONES_PAGO = { contado: 0, 15: 15, 30: 30, 60: 60 };

// Devuelve la fecha ISO en que vence una operación con esta condición.
// Lanza ErrorBulk (nunca Error a secas) porque se llama desde crearVenta /
// crearCompra, que están dentro del try/catch que pasa por mensajeDeError:
// un Error genérico se relanza y termina como HTML de stack trace de Express
// en vez de un 400 con JSON.
function calcularVencimiento(fecha, condicion, fechaManual) {
  const cond = condicion == null || condicion === '' ? 'contado' : String(condicion);

  if (cond === 'manual') {
    const manual = validarFecha(fechaManual);
    if (!manual) {
      throw new ErrorBulk('La fecha de vencimiento no es válida (formato AAAA-MM-DD).');
    }
    // Un vencimiento anterior a la operación no describe ningún acuerdo
    // real y ensuciaría el aging con deuda "vencida" desde antes de existir.
    if (manual < fecha) {
      throw new ErrorBulk('La fecha de vencimiento no puede ser anterior a la fecha de la operación.');
    }
    return { condicion: 'manual', vencimiento: manual };
  }

  if (!Object.prototype.hasOwnProperty.call(CONDICIONES_PAGO, cond)) {
    throw new ErrorBulk('La condición de pago no es válida.');
  }
  return { condicion: cond, vencimiento: sumarDias(fecha, CONDICIONES_PAGO[cond]) };
}

const maxISO = (a, b) => (a > b ? a : b);
const minISO = (a, b) => (a < b ? a : b);
// Los componentes de fecha se comparan como strings (maxISO/minISO,
// generarBuckets), lo que solo da el orden cronológico correcto si el año
// está siempre a 4 dígitos — si no, "999" ordena después de "1000" porque
// '9' > '1' en la primera posición.
const anioISO = (y) => String(y).padStart(4, '0');

// {y, m, d} con m 0-indexado (para pasarlo directo a Date.UTC).
function partesISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d };
}

// Arma una fecha ISO a partir de partes que pueden desbordar (mes 12,
// día 0, día 32...) y deja que el motor de fechas resuelva el corrimiento
// — así no hay que calcular a mano cuántos días tiene cada mes.
// fechaISO(y, m, 0) da el último día del mes anterior a m; fechaISO(y,
// m + 1, 0) da el último día del mes m.
//
// A propósito NO se usa `Date.UTC(y, m, d)` directo: para 0 <= y <= 99,
// Date.UTC (y el constructor de Date) interpreta el año como 1900+y por
// compatibilidad histórica de JS ("año 1" se vuelve 1901). setUTCFullYear
// no tiene esa regla — toma el año tal cual — así que es el único camino
// correcto para fechas de años chicos, que sí pueden aparecer acá vía un
// ?desde= mal tipeado (validarFecha solo exige el formato, no un año
// razonable).
function fechaISO(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m, d);
  return dt.toISOString().slice(0, 10);
}

function sumarDias(iso, n) {
  const { y, m, d } = partesISO(iso);
  return fechaISO(y, m, d + n);
}

// Inclusivo: diffDias(x, x) === 0.
function diffDias(desde, hasta) {
  const { y: y1, m: m1, d: d1 } = partesISO(desde);
  const { y: y2, m: m2, d: d2 } = partesISO(hasta);
  return Math.round((Date.UTC(y2, m2, d2) - Date.UTC(y1, m1, d1)) / 86400000);
}

function granularidadDe(desde, hasta) {
  const dias = diffDias(desde, hasta) + 1;
  if (dias <= 31) return 'dia';
  if (dias <= 731) return 'mes'; // ~2 años, hasta 25 buckets
  return 'anio';
}

// Genera los períodos de la serie, cada uno recortado contra [desde,
// hasta]: es lo único que garantiza que la suma de la serie sea
// exactamente igual al total del rango pedido — si un bucket usara el mes
// calendario completo, contaría operaciones fuera del rango. `parcial`
// marca los bordes recortados (por ejemplo, el mes en curso).
function generarBuckets(desde, hasta, granularidad) {
  const buckets = [];

  if (granularidad === 'dia') {
    let cursor = desde;
    while (cursor <= hasta && buckets.length < MAX_BUCKETS) {
      const { d, m } = partesISO(cursor);
      buckets.push({
        clave: cursor,
        etiqueta: `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}`,
        desde: cursor,
        hasta: cursor,
        parcial: false
      });
      cursor = sumarDias(cursor, 1);
    }
    return buckets;
  }

  if (granularidad === 'mes') {
    let { y, m } = partesISO(desde);
    while (fechaISO(y, m, 1) <= hasta && buckets.length < MAX_BUCKETS) {
      const inicioCal = fechaISO(y, m, 1);
      const finCal = fechaISO(y, m + 1, 0);
      const bDesde = maxISO(inicioCal, desde);
      const bHasta = minISO(finCal, hasta);
      buckets.push({
        clave: `${anioISO(y)}-${String(m + 1).padStart(2, '0')}`,
        etiqueta: `${MESES_CORTOS[m]} ${anioISO(y).slice(-2)}`,
        desde: bDesde,
        hasta: bHasta,
        parcial: bDesde !== inicioCal || bHasta !== finCal
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return buckets;
  }

  // 'anio'
  let y = partesISO(desde).y;
  while (anioISO(y) + '-01-01' <= hasta && buckets.length < MAX_BUCKETS) {
    const inicioCal = anioISO(y) + '-01-01';
    const finCal = anioISO(y) + '-12-31';
    const bDesde = maxISO(inicioCal, desde);
    const bHasta = minISO(finCal, hasta);
    buckets.push({
      clave: anioISO(y),
      etiqueta: anioISO(y),
      desde: bDesde,
      hasta: bHasta,
      parcial: bDesde !== inicioCal || bHasta !== finCal
    });
    y += 1;
  }
  return buckets;
}

// El período anterior "natural" al pedido: si es un año calendario
// completo, el año anterior; si es un mes calendario completo, el mes
// calendario anterior (así marzo compara contra el 1-28/29 de febrero, no
// contra "31 días para atrás", que caería a fines de enero); si no,
// desplaza por la duración exacta del rango, contiguo y sin solape.
function periodoAnterior(desde, hasta) {
  const d = partesISO(desde);
  const h = partesISO(hasta);

  if (d.m === 0 && d.d === 1 && h.m === 11 && h.d === 31 && d.y === h.y) {
    return { desde: anioISO(d.y - 1) + '-01-01', hasta: anioISO(d.y - 1) + '-12-31' };
  }

  const finDeEseMes = fechaISO(d.y, d.m + 1, 0);
  if (d.d === 1 && hasta === finDeEseMes) {
    let ay = d.y;
    let am = d.m - 1;
    if (am < 0) {
      am = 11;
      ay -= 1;
    }
    return { desde: fechaISO(ay, am, 1), hasta: fechaISO(ay, am + 1, 0) };
  }

  const n = diffDias(desde, hasta) + 1;
  return { desde: sumarDias(desde, -n), hasta: sumarDias(desde, -1) };
}

// Compara actual contra anterior. El denominador usa el VALOR ABSOLUTO de
// `anterior` a propósito: con el signo puesto, mejorar de -100 a -50 daría
// -50% y se leería como un empeoramiento; en valor absoluto da +50%, y así
// el signo del porcentaje siempre significa "mejoró"/"empeoró", nunca al
// revés. anterior=0 no es divisible: en vez de Infinity/NaN, pct queda en
// null y comparable en false. Cuando el resultado cambia de signo
// (pérdida → ganancia o viceversa) el porcentaje es matemáticamente
// correcto pero engañoso (-1000 → +10 da +101%): cruza_cero avisa para que
// el frontend muestre solo el delta absoluto en ese caso.
function variacion(actual, anterior) {
  const abs = actual - anterior;
  if (anterior === 0) {
    return { abs, pct: null, comparable: false, cruza_cero: false };
  }
  const cruzaCero = Math.sign(actual) !== Math.sign(anterior) && actual !== 0;
  return { abs, pct: (abs / Math.abs(anterior)) * 100, comparable: true, cruza_cero: cruzaCero };
}

app.get('/api/resumen/evolucion', soloAdmin, (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  const organizacionId = req.usuario.organizacion_id;
  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get(
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId
  );
  const hoy = fechaDeHoy();

  // Cuando falta un extremo (el caso por defecto: el filtro del Resumen
  // arranca sin fecha), se acota contra la primera/última operación
  // registrada en vez de dejar el rango abierto — así siempre hay una
  // granularidad concreta que elegir. El extremo alto usa un máximo, no
  // un tope: si hubiera una operación con fecha futura, un tope la dejaría
  // fuera de la serie pero dentro del total (que no tiene límite), y la
  // suma de la serie dejaría de coincidir con el total.
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);

  const granularidad = granularidadDe(desde, hasta);
  const buckets = generarBuckets(desde, hasta, granularidad);
  const serie = buckets.map((b) => ({ ...b, ...calcularResultado(b.desde, b.hasta, organizacionId) }));
  const total = calcularResultado(desde, hasta, organizacionId);

  let anterior = null;
  let delta = null;
  // Comparar contra "antes" solo tiene sentido cuando el usuario fijó el
  // inicio del rango a mano: si es abierto, el período anterior sería
  // vacío por construcción (no hay nada antes del comienzo del historial)
  // y mostrar 0 o -100% ahí sería mentir, no informar.
  if (desdeParam) {
    const rangoAnterior = periodoAnterior(desde, hasta);
    const hayOperacionAntes = primera !== null && primera <= rangoAnterior.hasta;
    if (hayOperacionAntes) {
      const resultadoAnterior = calcularResultado(rangoAnterior.desde, rangoAnterior.hasta, organizacionId);
      anterior = { rango: rangoAnterior, ...resultadoAnterior };
      delta = {};
      for (const campo of CAMPOS_RESULTADO) {
        delta[campo] = variacion(total[campo], resultadoAnterior[campo]);
      }
    }
  }

  res.json({ rango: { desde, hasta, acotado }, granularidad, total, serie, anterior, delta });
});

/* ---------- Reportes: qué se vende y a quién (CLAUDE.md §20) ---------- */
//
// Familia de reportes que faltaba (ranking de productos, mejores clientes,
// ticket promedio) y no requiere migrar el esquema: todo sale de
// venta_items, que ya guarda cantidad, precio_unitario y
// costo_unitario_historico. El costo NUNCA se lee de productos.precio_costo
// (el costo de HOY) — mismo criterio no negociable que calcularResultado
// (CLAUDE.md §8: no recalcular rentabilidad histórica con el costo actual).
//
// Los totales de plata (ventas_netas, ganancia_bruta) se calculan
// literalmente llamando a calcularResultado(desde, hasta) — la única
// fuente de verdad de las reglas contables (ver su comentario más
// arriba) — en vez de reimplementar la resta de devoluciones: así este
// endpoint cierra exacto contra GET /api/resumen para el mismo rango por
// construcción, no por casualidad.

const SQL_REPORTE_UNIDADES_VENTAS = db.prepare(
  `SELECT COUNT(DISTINCT ventas.id) AS cantidad_ventas,
          COALESCE(SUM(venta_items.cantidad), 0) AS unidades
     FROM ventas JOIN venta_items ON venta_items.venta_id = ventas.id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
      AND ventas.organizacion_id = ?`
);

const SQL_REPORTE_UNIDADES_DEVOLUCIONES = db.prepare(
  `SELECT COALESCE(SUM(devolucion_items.cantidad), 0) AS unidades
     FROM devoluciones JOIN devolucion_items ON devolucion_items.devolucion_id = devoluciones.id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
      AND devoluciones.organizacion_id = ?`
);

const SQL_REPORTE_VENTAS_POR_PRODUCTO = db.prepare(
  `SELECT venta_items.producto_id AS id, productos.nombre AS nombre,
          SUM(venta_items.cantidad) AS unidades,
          SUM(venta_items.cantidad * venta_items.precio_unitario) AS ventas,
          SUM(venta_items.cantidad * venta_items.costo_unitario_historico) AS costo
     FROM venta_items
     JOIN ventas ON ventas.id = venta_items.venta_id
     JOIN productos ON productos.id = venta_items.producto_id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
      AND ventas.organizacion_id = ?
    GROUP BY venta_items.producto_id`
);

const SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO = db.prepare(
  `SELECT devolucion_items.producto_id AS id,
          SUM(devolucion_items.cantidad) AS unidades,
          SUM(devolucion_items.cantidad * devolucion_items.precio_unitario) AS ventas,
          SUM(CASE WHEN devolucion_items.vuelve_stock
                   THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                   ELSE 0 END) AS costo
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
      AND devoluciones.organizacion_id = ?
    GROUP BY devolucion_items.producto_id`
);

// Agrupa por categoria_id, no por producto. Un producto sin categoría
// tiene categoria_id NULL, y SQLite agrupa todos los NULL de un GROUP BY
// en un solo grupo — es justo el balde "Sin categoría" que se necesita,
// sin tener que armarlo a mano. COALESCE le pone nombre a ese grupo.
const SQL_REPORTE_VENTAS_POR_CATEGORIA = db.prepare(
  `SELECT productos.categoria_id AS id,
          COALESCE(categorias.nombre, 'Sin categoría') AS nombre,
          SUM(venta_items.cantidad) AS unidades,
          SUM(venta_items.cantidad * venta_items.precio_unitario) AS ventas,
          SUM(venta_items.cantidad * venta_items.costo_unitario_historico) AS costo
     FROM venta_items
     JOIN ventas ON ventas.id = venta_items.venta_id
     JOIN productos ON productos.id = venta_items.producto_id
     LEFT JOIN categorias ON categorias.id = productos.categoria_id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
      AND ventas.organizacion_id = ?
    GROUP BY productos.categoria_id`
);

const SQL_REPORTE_DEVOLUCIONES_POR_CATEGORIA = db.prepare(
  `SELECT productos.categoria_id AS id,
          SUM(devolucion_items.cantidad) AS unidades,
          SUM(devolucion_items.cantidad * devolucion_items.precio_unitario) AS ventas,
          SUM(CASE WHEN devolucion_items.vuelve_stock
                   THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                   ELSE 0 END) AS costo
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
     JOIN productos ON productos.id = devolucion_items.producto_id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
      AND devoluciones.organizacion_id = ?
    GROUP BY productos.categoria_id`
);

const SQL_REPORTE_VENTAS_POR_CLIENTE = db.prepare(
  `SELECT ventas.cliente_id AS id, clientes.nombre AS nombre,
          COUNT(DISTINCT ventas.id) AS cantidad_ventas,
          SUM(venta_items.cantidad * venta_items.precio_unitario) AS ventas,
          SUM(venta_items.cantidad * venta_items.costo_unitario_historico) AS costo,
          MAX(ventas.fecha) AS ultima_compra
     FROM venta_items
     JOIN ventas ON ventas.id = venta_items.venta_id
     JOIN clientes ON clientes.id = ventas.cliente_id
    WHERE ventas.estado = 'activa'
      AND (? IS NULL OR ventas.fecha >= ?)
      AND (? IS NULL OR ventas.fecha <= ?)
      AND ventas.organizacion_id = ?
    GROUP BY ventas.cliente_id`
);

// devolucion_items no guarda cliente_id propio: se atribuye a través de
// devoluciones.venta_id -> ventas.cliente_id, igual que en cuentas
// corrientes se atribuye todo movimiento a través de su operación.
const SQL_REPORTE_DEVOLUCIONES_POR_CLIENTE = db.prepare(
  `SELECT ventas.cliente_id AS id,
          SUM(devolucion_items.cantidad * devolucion_items.precio_unitario) AS ventas,
          SUM(CASE WHEN devolucion_items.vuelve_stock
                   THEN devolucion_items.cantidad * devolucion_items.costo_unitario_historico
                   ELSE 0 END) AS costo
     FROM devolucion_items
     JOIN devoluciones ON devoluciones.id = devolucion_items.devolucion_id
     JOIN ventas ON ventas.id = devoluciones.venta_id
    WHERE devoluciones.estado = 'activa'
      AND (? IS NULL OR devoluciones.fecha >= ?)
      AND (? IS NULL OR devoluciones.fecha <= ?)
      AND devoluciones.organizacion_id = ?
    GROUP BY ventas.cliente_id`
);

const redondear2 = (n) => Math.round(n * 100) / 100;
const margenPct = (ganancia, ventas) => (ventas > 0 ? redondear2((ganancia / ventas) * 100) : 0);

// Neteo genérico por id: resta las filas de devoluciones (por producto o
// por cliente, según se llame) contra las filas de venta correspondientes.
// Una entidad que solo tiene devolución en este rango (la venta original
// es de un período anterior, pero se devolvió dentro de este) entra con
// base en cero para que el neto —negativo— no se pierda del reporte:
// mismo criterio que calcularResultado, la devolución pesa en el período
// en que se hizo, no en el de la venta.
function netearPorId(filasVentas, filasDevoluciones, resolverNombre) {
  const porId = new Map(filasVentas.map((f) => [f.id, { ...f }]));
  for (const dev of filasDevoluciones) {
    let fila = porId.get(dev.id);
    if (!fila) {
      fila = {
        id: dev.id,
        nombre: resolverNombre(dev.id),
        unidades: 0,
        cantidad_ventas: 0,
        ventas: 0,
        costo: 0,
        ultima_compra: null
      };
      porId.set(dev.id, fila);
    }
    fila.unidades = (fila.unidades ?? 0) - (dev.unidades ?? 0);
    fila.ventas -= dev.ventas;
    fila.costo -= dev.costo;
  }
  return [...porId.values()];
}

app.get('/api/reportes/ventas', soloAdmin, (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  // Mismo tratamiento de rango abierto que /api/resumen/evolucion: sin
  // desde/hasta, se acota contra la primera/última operación registrada.
  const organizacionId = req.usuario.organizacion_id;
  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get(
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId
  );
  const hoy = fechaDeHoy();
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);
  const rango = [desde, desde, hasta, hasta, organizacionId];

  const resultado = calcularResultado(desde, hasta, organizacionId);
  const ventasUnid = SQL_REPORTE_UNIDADES_VENTAS.get(...rango);
  const devolucionesUnid = SQL_REPORTE_UNIDADES_DEVOLUCIONES.get(...rango);
  const cantidadVentas = ventasUnid.cantidad_ventas;

  const buscarNombreProducto = db.prepare('SELECT nombre FROM productos WHERE id = ? AND organizacion_id = ?');
  const buscarNombreCliente = db.prepare('SELECT nombre FROM clientes WHERE id = ? AND organizacion_id = ?');

  const productos = netearPorId(
    SQL_REPORTE_VENTAS_POR_PRODUCTO.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO.all(...rango),
    (id) => buscarNombreProducto.get(id, organizacionId)?.nombre ?? '(producto eliminado)'
  )
    .map((p) => {
      const ganancia = redondear2(p.ventas - p.costo);
      return {
        id: p.id,
        nombre: p.nombre,
        unidades: p.unidades,
        ventas: redondear2(p.ventas),
        costo: redondear2(p.costo),
        ganancia,
        margen_pct: margenPct(ganancia, p.ventas),
        participacion_pct: resultado.ventas > 0 ? redondear2((p.ventas / resultado.ventas) * 100) : 0
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  // resolverNombre recibe id === null para el balde "Sin categoría" (ver
  // el comentario del GROUP BY arriba) — no es "categoría eliminada", así
  // que se lo distingue explícitamente antes de ir a buscar el nombre.
  const buscarNombreCategoria = db.prepare('SELECT nombre FROM categorias WHERE id = ? AND organizacion_id = ?');
  const categorias = netearPorId(
    SQL_REPORTE_VENTAS_POR_CATEGORIA.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_POR_CATEGORIA.all(...rango),
    (id) => (id === null ? 'Sin categoría' : buscarNombreCategoria.get(id, organizacionId)?.nombre ?? '(categoría eliminada)')
  )
    .map((c) => {
      const ganancia = redondear2(c.ventas - c.costo);
      return {
        id: c.id,
        nombre: c.nombre,
        unidades: c.unidades,
        ventas: redondear2(c.ventas),
        costo: redondear2(c.costo),
        ganancia,
        margen_pct: margenPct(ganancia, c.ventas),
        participacion_pct: resultado.ventas > 0 ? redondear2((c.ventas / resultado.ventas) * 100) : 0
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  const clientes = netearPorId(
    SQL_REPORTE_VENTAS_POR_CLIENTE.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_POR_CLIENTE.all(...rango),
    (id) => buscarNombreCliente.get(id, organizacionId)?.nombre ?? '(cliente eliminado)'
  )
    .map((c) => {
      const ganancia = redondear2(c.ventas - c.costo);
      return {
        id: c.id,
        nombre: c.nombre,
        cantidad_ventas: c.cantidad_ventas ?? 0,
        ventas: redondear2(c.ventas),
        ganancia,
        margen_pct: margenPct(ganancia, c.ventas),
        ticket_promedio: c.cantidad_ventas > 0 ? redondear2(c.ventas / c.cantidad_ventas) : 0,
        ultima_compra: c.ultima_compra
      };
    })
    .sort((a, b) => b.ventas - a.ventas);

  res.json({
    rango: { desde, hasta, acotado },
    totales: {
      ventas_netas: resultado.ventas,
      cantidad_ventas: cantidadVentas,
      ticket_promedio: cantidadVentas > 0 ? redondear2(resultado.ventas / cantidadVentas) : 0,
      unidades: ventasUnid.unidades - devolucionesUnid.unidades,
      ganancia_bruta: resultado.ganancia_bruta,
      margen_pct: margenPct(resultado.ganancia_bruta, resultado.ventas)
    },
    productos,
    categorias,
    clientes
  });
});

/* ---------- Reportes: compras (CLAUDE.md §20) ---------- */
//
// Espejo exacto de "Reportes: qué se vende y a quién" de arriba, del lado
// de compras. compra_items.costo_real_unitario YA trae el envío
// prorrateado (prorratearEnvio, al crear la compra) — se suma directo con
// SUM(), sin recalcular nada, mismo criterio que venta_items.
// costo_unitario_historico en el reporte de ventas.
//
// No hay equivalente a calcularResultado() del lado de compras (esa
// función existe para el resultado del NEGOCIO, no tiene sentido "costo de
// comprar"), así que los totales salen directo de estas queries, netaados
// contra devoluciones a proveedor con la misma netearPorId() de arriba.
//
// Toda devolución a proveedor saca stock siempre (a diferencia de
// devolucion_items del lado de venta, que tiene un flag vuelve_stock
// condicional) — confirmado en aplicarDevolucionProveedor: no hay CASE
// WHEN acá, se resta directo.

const SQL_REPORTE_UNIDADES_COMPRAS = db.prepare(
  `SELECT COUNT(DISTINCT compras.id) AS cantidad_compras,
          COALESCE(SUM(compra_items.cantidad), 0) AS unidades
     FROM compras JOIN compra_items ON compra_items.compra_id = compras.id
    WHERE compras.estado = 'activa'
      AND (? IS NULL OR compras.fecha >= ?)
      AND (? IS NULL OR compras.fecha <= ?)
      AND compras.organizacion_id = ?`
);

const SQL_REPORTE_UNIDADES_DEVOLUCIONES_PROVEEDOR = db.prepare(
  `SELECT COALESCE(SUM(devolucion_proveedor_items.cantidad), 0) AS unidades
     FROM devoluciones_proveedor
     JOIN devolucion_proveedor_items ON devolucion_proveedor_items.devolucion_proveedor_id = devoluciones_proveedor.id
    WHERE devoluciones_proveedor.estado = 'activa'
      AND (? IS NULL OR devoluciones_proveedor.fecha >= ?)
      AND (? IS NULL OR devoluciones_proveedor.fecha <= ?)
      AND devoluciones_proveedor.organizacion_id = ?`
);

const SQL_REPORTE_COMPRAS_POR_PROVEEDOR = db.prepare(
  `SELECT compras.proveedor_id AS id, proveedores.nombre AS nombre,
          COUNT(DISTINCT compras.id) AS cantidad_compras,
          SUM(compra_items.cantidad * COALESCE(compra_items.costo_real_unitario, compra_items.precio_unitario)) AS compras,
          MAX(compras.fecha) AS ultima_compra
     FROM compra_items
     JOIN compras ON compras.id = compra_items.compra_id
     JOIN proveedores ON proveedores.id = compras.proveedor_id
    WHERE compras.estado = 'activa'
      AND (? IS NULL OR compras.fecha >= ?)
      AND (? IS NULL OR compras.fecha <= ?)
      AND compras.organizacion_id = ?
    GROUP BY compras.proveedor_id`
);

// devolucion_proveedor_items no tiene cantidad_compras propio (una
// devolución no es "una compra"): se resta solo el monto, cantidad_compras
// se conserva tal cual venía del lado de compras en netearPorId.
const SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_PROVEEDOR = db.prepare(
  `SELECT compras.proveedor_id AS id,
          SUM(devolucion_proveedor_items.cantidad * devolucion_proveedor_items.precio_unitario) AS compras
     FROM devolucion_proveedor_items
     JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
     JOIN compras ON compras.id = devoluciones_proveedor.compra_id
    WHERE devoluciones_proveedor.estado = 'activa'
      AND (? IS NULL OR devoluciones_proveedor.fecha >= ?)
      AND (? IS NULL OR devoluciones_proveedor.fecha <= ?)
      AND devoluciones_proveedor.organizacion_id = ?
    GROUP BY compras.proveedor_id`
);

const SQL_REPORTE_COMPRAS_POR_PRODUCTO = db.prepare(
  `SELECT compra_items.producto_id AS id, productos.nombre AS nombre,
          SUM(compra_items.cantidad) AS unidades,
          SUM(compra_items.cantidad * COALESCE(compra_items.costo_real_unitario, compra_items.precio_unitario)) AS compras
     FROM compra_items
     JOIN compras ON compras.id = compra_items.compra_id
     JOIN productos ON productos.id = compra_items.producto_id
    WHERE compras.estado = 'activa'
      AND (? IS NULL OR compras.fecha >= ?)
      AND (? IS NULL OR compras.fecha <= ?)
      AND compras.organizacion_id = ?
    GROUP BY compra_items.producto_id`
);

const SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_PRODUCTO = db.prepare(
  `SELECT devolucion_proveedor_items.producto_id AS id,
          SUM(devolucion_proveedor_items.cantidad) AS unidades,
          SUM(devolucion_proveedor_items.cantidad * devolucion_proveedor_items.precio_unitario) AS compras
     FROM devolucion_proveedor_items
     JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
    WHERE devoluciones_proveedor.estado = 'activa'
      AND (? IS NULL OR devoluciones_proveedor.fecha >= ?)
      AND (? IS NULL OR devoluciones_proveedor.fecha <= ?)
      AND devoluciones_proveedor.organizacion_id = ?
    GROUP BY devolucion_proveedor_items.producto_id`
);

// Igual que en ventas: agrupa por categoria_id (no por producto), un
// producto sin categoría cae en el balde NULL, que SQLite ya agrupa solo.
const SQL_REPORTE_COMPRAS_POR_CATEGORIA = db.prepare(
  `SELECT productos.categoria_id AS id,
          COALESCE(categorias.nombre, 'Sin categoría') AS nombre,
          SUM(compra_items.cantidad) AS unidades,
          SUM(compra_items.cantidad * COALESCE(compra_items.costo_real_unitario, compra_items.precio_unitario)) AS compras
     FROM compra_items
     JOIN compras ON compras.id = compra_items.compra_id
     JOIN productos ON productos.id = compra_items.producto_id
     LEFT JOIN categorias ON categorias.id = productos.categoria_id
    WHERE compras.estado = 'activa'
      AND (? IS NULL OR compras.fecha >= ?)
      AND (? IS NULL OR compras.fecha <= ?)
      AND compras.organizacion_id = ?
    GROUP BY productos.categoria_id`
);

const SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_CATEGORIA = db.prepare(
  `SELECT productos.categoria_id AS id,
          SUM(devolucion_proveedor_items.cantidad) AS unidades,
          SUM(devolucion_proveedor_items.cantidad * devolucion_proveedor_items.precio_unitario) AS compras
     FROM devolucion_proveedor_items
     JOIN devoluciones_proveedor ON devoluciones_proveedor.id = devolucion_proveedor_items.devolucion_proveedor_id
     JOIN productos ON productos.id = devolucion_proveedor_items.producto_id
    WHERE devoluciones_proveedor.estado = 'activa'
      AND (? IS NULL OR devoluciones_proveedor.fecha >= ?)
      AND (? IS NULL OR devoluciones_proveedor.fecha <= ?)
      AND devoluciones_proveedor.organizacion_id = ?
    GROUP BY productos.categoria_id`
);

// netearPorId (definida arriba, en Reportes: qué se vende) espera filas con
// {id, ventas, costo, unidades, ...} y resta "ventas"/"costo". Acá las
// queries de compras usan la clave "compras" en vez de "ventas", así que se
// arma un adaptador chico en vez de tocar netearPorId (que ya es genérica y
// la usa el reporte de ventas: mejor no acoplarla a un nombre de campo
// nuevo).
function netearComprasPorId(filasCompras, filasDevoluciones, resolverNombre) {
  const porId = new Map(filasCompras.map((f) => [f.id, { ...f }]));
  for (const dev of filasDevoluciones) {
    let fila = porId.get(dev.id);
    if (!fila) {
      fila = {
        id: dev.id,
        nombre: resolverNombre(dev.id),
        unidades: 0,
        cantidad_compras: 0,
        compras: 0,
        ultima_compra: null
      };
      porId.set(dev.id, fila);
    }
    fila.unidades = (fila.unidades ?? 0) - (dev.unidades ?? 0);
    fila.compras -= dev.compras;
  }
  return [...porId.values()];
}

app.get('/api/reportes/compras', soloAdmin, (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  const organizacionId = req.usuario.organizacion_id;
  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get(
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId
  );
  const hoy = fechaDeHoy();
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);
  const rango = [desde, desde, hasta, hasta, organizacionId];

  const comprasUnid = SQL_REPORTE_UNIDADES_COMPRAS.get(...rango);
  const devolucionesUnid = SQL_REPORTE_UNIDADES_DEVOLUCIONES_PROVEEDOR.get(...rango);
  const cantidadCompras = comprasUnid.cantidad_compras;

  const buscarNombreProducto = db.prepare('SELECT nombre FROM productos WHERE id = ? AND organizacion_id = ?');
  const buscarNombreProveedor = db.prepare('SELECT nombre FROM proveedores WHERE id = ? AND organizacion_id = ?');
  const buscarNombreCategoria = db.prepare('SELECT nombre FROM categorias WHERE id = ? AND organizacion_id = ?');

  // Los totales de plata (compras_netas) se recalculan sumando las mismas
  // filas por-proveedor ya neteadas, en vez de una query aparte: así el
  // total y el desglose por proveedor cierran exacto por construcción.
  const proveedoresNeteados = netearComprasPorId(
    SQL_REPORTE_COMPRAS_POR_PROVEEDOR.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_PROVEEDOR.all(...rango),
    (id) => buscarNombreProveedor.get(id, organizacionId)?.nombre ?? '(proveedor eliminado)'
  );
  const comprasNetas = redondear2(proveedoresNeteados.reduce((acc, p) => acc + p.compras, 0));

  const proveedores = proveedoresNeteados
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      cantidad_compras: p.cantidad_compras ?? 0,
      compras: redondear2(p.compras),
      ticket_promedio: p.cantidad_compras > 0 ? redondear2(p.compras / p.cantidad_compras) : 0,
      ultima_compra: p.ultima_compra
    }))
    .sort((a, b) => b.compras - a.compras);

  const productos = netearComprasPorId(
    SQL_REPORTE_COMPRAS_POR_PRODUCTO.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_PRODUCTO.all(...rango),
    (id) => buscarNombreProducto.get(id, organizacionId)?.nombre ?? '(producto eliminado)'
  )
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      unidades: p.unidades,
      compras: redondear2(p.compras),
      participacion_pct: comprasNetas > 0 ? redondear2((p.compras / comprasNetas) * 100) : 0
    }))
    .sort((a, b) => b.compras - a.compras);

  // id === null es el balde "Sin categoría" del GROUP BY, no una categoría
  // eliminada — mismo tratamiento explícito que el reporte de ventas.
  const categorias = netearComprasPorId(
    SQL_REPORTE_COMPRAS_POR_CATEGORIA.all(...rango),
    SQL_REPORTE_DEVOLUCIONES_PROVEEDOR_POR_CATEGORIA.all(...rango),
    (id) => (id === null ? 'Sin categoría' : buscarNombreCategoria.get(id, organizacionId)?.nombre ?? '(categoría eliminada)')
  )
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      unidades: c.unidades,
      compras: redondear2(c.compras),
      participacion_pct: comprasNetas > 0 ? redondear2((c.compras / comprasNetas) * 100) : 0
    }))
    .sort((a, b) => b.compras - a.compras);

  res.json({
    rango: { desde, hasta, acotado },
    totales: {
      compras_netas: comprasNetas,
      cantidad_compras: cantidadCompras,
      ticket_promedio: cantidadCompras > 0 ? redondear2(comprasNetas / cantidadCompras) : 0,
      unidades: comprasUnid.unidades - devolucionesUnid.unidades
    },
    proveedores,
    productos,
    categorias
  });
});

/* ---------- Reportes: stock (qué reponer, valorizado, rotación) ---------- */
//
// "Valorizado" y "qué reponer" ya existían por producto (decorarProducto,
// estadoStock, más abajo en la sección Productos) — lo que faltaba era el
// agregado (total del inventario, cuántos productos hay que reponer) y la
// rotación, que no existía en ningún lado. Reusa las mismas consultas de
// ventas/devoluciones por producto que /api/reportes/ventas (mismo
// neteo, mismo criterio) para no duplicar "cuánto se vendió de cada
// producto en el rango".
//
// Rotación = días de inventario: al ritmo de venta del período, cuántos
// días dura el stock actual — stock / (unidades_netas / días_del_período).
// Sin ventas netas positivas en el rango no hay ritmo con el que dividir,
// así que queda null (no "infinito" ni 0, que mentirían para los dos
// lados); el frontend lo muestra como "—". Con stock en 0 el resultado es
// 0 días sin importar el ritmo: no queda nada, sea cual sea el consumo.

app.get('/api/reportes/stock', soloAdmin, (req, res) => {
  const desdeParam = validarFecha(req.query.desde);
  const hastaParam = validarFecha(req.query.hasta);

  const organizacionId = req.usuario.organizacion_id;
  const { primera, ultima } = SQL_LIMITES_OPERACIONES.get(
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId,
    organizacionId
  );
  const hoy = fechaDeHoy();
  const desde = desdeParam ?? minISO(primera ?? hoy, hoy);
  const hasta = hastaParam ?? maxISO(ultima ?? hoy, hoy);
  const acotado = Boolean(desdeParam && hastaParam);
  const rango = [desde, desde, hasta, hasta, organizacionId];
  const diasPeriodo = diffDias(desde, hasta) + 1;

  const unidadesNetasPorProducto = new Map(
    netearPorId(
      SQL_REPORTE_VENTAS_POR_PRODUCTO.all(...rango),
      SQL_REPORTE_DEVOLUCIONES_POR_PRODUCTO.all(...rango),
      () => null
    ).map((fila) => [fila.id, fila.unidades])
  );

  const productosBase = db
    .prepare(`${SELECT_PRODUCTO} WHERE productos.organizacion_id = ? AND productos.tipo = 'producto' ORDER BY productos.nombre`)
    .all(req.usuario.organizacion_id)
    .map(decorarProducto);

  const productos = productosBase
    .map((p) => {
      const unidadesVendidas = unidadesNetasPorProducto.get(p.id) ?? 0;
      const ritmoDiario = unidadesVendidas / diasPeriodo;
      const diasInventario = p.stock <= 0 ? 0 : ritmoDiario > 0 ? Math.round(p.stock / ritmoDiario) : null;
      return {
        id: p.id,
        nombre: p.nombre,
        stock: p.stock,
        precio_costo: p.precio_costo,
        valorizado: redondear2(p.valorizado),
        estado_stock: p.estado_stock,
        unidades_vendidas: unidadesVendidas,
        dias_inventario: diasInventario
      };
    })
    .sort((a, b) => {
      // Sin ventas en el rango (null) queda al final: no es "no urgente",
      // es "no se puede estimar" — mezclarlo con los calculables mentiría.
      if (a.dias_inventario === null && b.dias_inventario === null) return a.nombre.localeCompare(b.nombre, 'es');
      if (a.dias_inventario === null) return 1;
      if (b.dias_inventario === null) return -1;
      return a.dias_inventario - b.dias_inventario;
    });

  const resumen = {
    total_valorizado: redondear2(productosBase.reduce((acc, p) => acc + p.valorizado, 0)),
    cantidad_productos: productosBase.length,
    cantidad_sin_stock: productosBase.filter((p) => p.estado_stock === 'sin_stock').length,
    cantidad_bajo: productosBase.filter((p) => p.estado_stock === 'bajo').length,
    cantidad_alto: productosBase.filter((p) => p.estado_stock === 'alto').length
  };

  res.json({ rango: { desde, hasta, acotado }, resumen, productos });
});

/* ---------- Asistente (operaciones por texto) ---------- */
//
// CLAUDE.md §21: la IA interpreta, pero NUNCA escribe en la base — el
// circuito tiene dos pasos separados a propósito:
//
//   POST /api/asistente/interpretar → de solo lectura. Le pasa el texto y
//   el contexto del negocio al intérprete (backend/interprete.js, el único
//   archivo que sabe que existe un proveedor de IA) y devuelve una
//   propuesta con cada nombre ya resuelto (o no) contra la base real.
//
//   POST /api/asistente/ejecutar → recibe la propuesta que el usuario
//   confirmó (ya corregida si hizo falta) y NO le cree ciegamente: vuelve
//   a validar todo con las mismas funciones que usan los endpoints
//   normales (validarStockDisponible, validarGasto, crearVenta,
//   crearCompra...) antes de ejecutar, todo en una sola transacción. Una
//   propuesta manipulada no puede saltearse ninguna regla de negocio.
//
// Cada mensaje interpretado queda en asistente_mensajes (schema.sql), que
// es a la vez la entidad "Mensaje/Confirmación" de §21 y el registro de
// auditoría de esta puerta de entrada (§22).

// Busca `nombre` en `tabla` (nombre de tabla fijo, siempre uno de los
// strings de abajo — nunca viene del usuario) por coincidencia exacta
// primero y aproximada después. Devuelve el ESTADO de la resolución, no
// solo el resultado: la UI necesita distinguir "no existe" de "hay varios
// que matchean" para poder pedirle al usuario que elija.
// Busca solo dentro de la organización de la sesión (Etapa A, CLAUDE.md
// §28): todas las tablas que recibe tienen organizacion_id. Sin el filtro,
// los `candidatos` de un nombre ambiguo le mostraban a la UI clientes,
// productos o proveedores de otras empresas, y con un "Efectivo" por empresa
// toda cuenta de tesorería quedaba ambigua.
function buscarPorNombre(tabla, nombreCrudo, organizacionId) {
  const nombre = nombreCrudo === undefined || nombreCrudo === null ? '' : String(nombreCrudo).trim();
  if (!nombre) {
    return { estado: 'no_dado', valor: nombreCrudo ?? null, id: null, nombre_resuelto: null, candidatos: [] };
  }
  const exactos = db
    .prepare(`SELECT id, nombre FROM ${tabla} WHERE nombre = ? COLLATE NOCASE AND organizacion_id = ?`)
    .all(nombre, organizacionId);
  if (exactos.length === 1) {
    return { estado: 'resuelto', valor: nombre, id: exactos[0].id, nombre_resuelto: exactos[0].nombre, candidatos: [] };
  }
  if (exactos.length > 1) {
    return { estado: 'ambiguo', valor: nombre, id: null, nombre_resuelto: null, candidatos: exactos };
  }
  const parciales = db
    .prepare(`SELECT id, nombre FROM ${tabla} WHERE nombre LIKE ? COLLATE NOCASE AND organizacion_id = ?`)
    .all(`%${nombre}%`, organizacionId);
  if (parciales.length === 1) {
    return { estado: 'resuelto', valor: nombre, id: parciales[0].id, nombre_resuelto: parciales[0].nombre, candidatos: [] };
  }
  if (parciales.length > 1) {
    return { estado: 'ambiguo', valor: nombre, id: null, nombre_resuelto: null, candidatos: parciales };
  }
  return { estado: 'no_encontrado', valor: nombre, id: null, nombre_resuelto: null, candidatos: [] };
}

// Mismo criterio que buscarPorNombre: un id de otra organización no existe.
function existeId(tabla, id, organizacionId) {
  if (id === null || id === undefined || id === '') return false;
  return Boolean(
    db.prepare(`SELECT 1 FROM ${tabla} WHERE id = ? AND organizacion_id = ?`).get(Number(id), organizacionId)
  );
}

function tieneVariantesActivas(productoId) {
  return db.prepare('SELECT COUNT(*) AS n FROM producto_variantes WHERE producto_id = ? AND activo = 1').get(productoId).n > 0;
}

// Convierte la propuesta cruda del intérprete (solo nombres, ver
// interprete.js) en una propuesta resuelta contra la base real: cada
// referencia queda marcada resuelta/ambigua/no encontrada/no dada, y se
// arma `problemas` con lo que bloquea la ejecución. Cliente (venta) y
// proveedor/producto (compra) pueden ser "nuevos" — igual que el
// formulario manual, esos SÍ se crean por nombre. Producto en una venta y
// categoría/cuenta en un gasto NO se crean solos: si no existen, bloquea.
function resolverPropuesta(tipo, datos, organizacionId) {
  const problemas = [];

  if (tipo === 'venta') {
    const cliente = buscarPorNombre('clientes', datos.cliente, organizacionId);
    if (cliente.estado === 'no_dado') problemas.push('Falta el nombre del cliente.');
    if (cliente.estado === 'ambiguo') problemas.push(`Hay más de un cliente que coincide con "${cliente.valor}".`);

    const items = (Array.isArray(datos.items) ? datos.items : []).map((item) => {
      const producto = buscarPorNombre('productos', item.producto, organizacionId);
      if (producto.estado === 'no_dado' || producto.estado === 'no_encontrado') {
        problemas.push(
          `El producto "${item.producto ?? '(sin nombre)'}" no existe en el catálogo. Cargalo primero o corregí el nombre.`
        );
      }
      if (producto.estado === 'ambiguo') {
        problemas.push(`Hay más de un producto que coincide con "${item.producto}".`);
      }
      if (producto.estado === 'resuelto' && tieneVariantesActivas(producto.id)) {
        problemas.push(`"${producto.nombre_resuelto}" tiene variantes: elegí la variante exacta a mano.`);
      }
      if (!(Number(item.cantidad) > 0)) problemas.push(`La cantidad de "${item.producto ?? '?'}" tiene que ser mayor a 0.`);
      if (!(Number(item.precio_unitario) >= 0)) problemas.push(`El precio de "${item.producto ?? '?'}" no puede ser negativo.`);
      return { producto, cantidad: item.cantidad, precio_unitario: item.precio_unitario };
    });
    if (items.length === 0) problemas.push('La venta necesita al menos un producto.');

    let cobro = null;
    if (datos.cobro) {
      const cuenta = buscarPorNombre('cuentas_tesoreria', datos.cobro.cuenta, organizacionId);
      if (cuenta.estado !== 'resuelto') {
        problemas.push(`No encontré la cuenta de tesorería "${datos.cobro.cuenta ?? '?'}" para el cobro.`);
      }
      cobro = { cuenta, importe: datos.cobro.importe ?? null };
    }

    return { cliente, items, cobro, fecha: datos.fecha ?? null, ejecutable: problemas.length === 0, problemas };
  }

  if (tipo === 'compra') {
    const proveedor = buscarPorNombre('proveedores', datos.proveedor, organizacionId);
    if (proveedor.estado === 'no_dado') problemas.push('Falta el nombre del proveedor.');
    if (proveedor.estado === 'ambiguo') problemas.push(`Hay más de un proveedor que coincide con "${proveedor.valor}".`);

    const items = (Array.isArray(datos.items) ? datos.items : []).map((item) => {
      const producto = buscarPorNombre('productos', item.producto, organizacionId);
      // Acá "no encontrado" no bloquea: la compra da de alta el producto
      // nuevo por nombre, es lo que le fija el costo inicial (CLAUDE.md §6).
      if (producto.estado === 'ambiguo') {
        problemas.push(`Hay más de un producto que coincide con "${item.producto}".`);
      }
      if (producto.estado === 'resuelto' && tieneVariantesActivas(producto.id)) {
        problemas.push(`"${producto.nombre_resuelto}" tiene variantes: elegí la variante exacta a mano.`);
      }
      if (!item.producto || !String(item.producto).trim()) problemas.push('Todos los items necesitan un producto.');
      if (!(Number(item.cantidad) > 0)) problemas.push(`La cantidad de "${item.producto ?? '?'}" tiene que ser mayor a 0.`);
      if (!(Number(item.precio_unitario) >= 0)) problemas.push(`El costo de "${item.producto ?? '?'}" no puede ser negativo.`);
      return { producto, cantidad: item.cantidad, precio_unitario: item.precio_unitario };
    });
    if (items.length === 0) problemas.push('La compra necesita al menos un item.');

    const costoEnvio = normalizarPrecio(datos.costo_envio);
    if (Number.isNaN(costoEnvio) || costoEnvio < 0) problemas.push('El costo de envío no puede ser negativo.');

    return {
      proveedor,
      items,
      costo_envio: costoEnvio,
      fecha: datos.fecha ?? null,
      ejecutable: problemas.length === 0,
      problemas
    };
  }

  if (tipo === 'gasto') {
    const categoria = buscarPorNombre('categorias_gasto', datos.categoria, organizacionId);
    if (categoria.estado !== 'resuelto') {
      problemas.push(`No encontré la categoría de gasto "${datos.categoria ?? '?'}" (las categorías no se crean solas).`);
    }
    const cuenta = buscarPorNombre('cuentas_tesoreria', datos.cuenta, organizacionId);
    if (cuenta.estado !== 'resuelto') {
      problemas.push(`No encontré la cuenta de tesorería "${datos.cuenta ?? '?'}".`);
    }
    // El proveedor de un gasto es opcional y tampoco se crea por nombre
    // (validarGasto exige un proveedor_id existente): si no matchea, el
    // gasto se puede confirmar igual sin proveedor, no bloquea.
    const proveedor = datos.proveedor ? buscarPorNombre('proveedores', datos.proveedor, organizacionId) : null;
    if (proveedor && proveedor.estado === 'ambiguo') {
      problemas.push(`Hay más de un proveedor que coincide con "${proveedor.valor}"; se puede confirmar sin proveedor.`);
    }
    if (!(Number(datos.importe) > 0)) problemas.push('El importe del gasto tiene que ser mayor a 0.');

    return {
      categoria,
      cuenta,
      proveedor,
      importe: datos.importe,
      tipo: datos.tipo === 'heredar_de_categoria' ? null : datos.tipo,
      descripcion: datos.descripcion ?? null,
      fecha: datos.fecha ?? null,
      ejecutable: problemas.length === 0,
      problemas
    };
  }

  return { ejecutable: false, problemas: ['Tipo de operación desconocido.'] };
}

// Lo que viaja a Gemini como contexto del negocio: solo lo de la
// organización de la sesión (Etapa A, CLAUDE.md §28) — nombres de otra
// empresa no pueden salir hacia el proveedor de IA.
function contextoParaInterprete(organizacionId) {
  return {
    cuentas: db
      .prepare('SELECT nombre, tipo FROM cuentas_tesoreria WHERE organizacion_id = ? ORDER BY nombre')
      .all(organizacionId),
    categoriasGasto: db
      .prepare('SELECT nombre, tipo FROM categorias_gasto WHERE activa = 1 AND organizacion_id = ? ORDER BY nombre')
      .all(organizacionId),
    productos: db
      .prepare('SELECT nombre FROM productos WHERE activo = 1 AND organizacion_id = ? ORDER BY nombre')
      .all(organizacionId)
  };
}

app.post('/api/asistente/interpretar', asincrono(async (req, res) => {
  const { texto } = req.body;

  let resultado;
  try {
    resultado = await interpretar(texto, contextoParaInterprete(req.usuario.organizacion_id));
  } catch (err) {
    if (err instanceof InterpreteError) {
      return res.status(err.status).json({ error: err.message });
    }
    throw err;
  }

  if (!resultado.tipo) {
    return res.json({
      mensaje_id: null,
      tipo: null,
      mensaje: resultado.mensaje,
      propuesta: null,
      ejecutable: false,
      problemas: []
    });
  }

  const propuesta = resolverPropuesta(resultado.tipo, resultado.datos, req.usuario.organizacion_id);

  const { lastInsertRowid: mensajeId } = db
    .prepare(
      `INSERT INTO asistente_mensajes (texto, propuesta_json, estado, operacion_tipo, organizacion_id)
       VALUES (?, ?, 'interpretado', ?, ?)`
    )
    .run(texto, JSON.stringify(propuesta), resultado.tipo, req.usuario.organizacion_id);

  res.json({
    mensaje_id: Number(mensajeId),
    tipo: resultado.tipo,
    mensaje: null,
    propuesta,
    ejecutable: propuesta.ejecutable,
    problemas: propuesta.problemas
  });
}));

app.post('/api/asistente/:id/descartar', (req, res) => {
  const mensajeId = Number(req.params.id);
  // organizacion_id en el WHERE (Etapa A, CLAUDE.md §28): sin este filtro,
  // un usuario de otra empresa podía descartar una propuesta pendiente que
  // no era suya pasando el id a mano.
  const { changes } = db
    .prepare(
      `UPDATE asistente_mensajes SET estado = 'descartado'
        WHERE id = ? AND estado = 'interpretado' AND organizacion_id = ?`
    )
    .run(mensajeId, req.usuario.organizacion_id);
  if (changes === 0) {
    return res.status(404).json({ error: 'Este mensaje no existe o ya fue procesado.' });
  }
  res.json({ id: mensajeId, estado: 'descartado' });
});

// Ejecuta una propuesta ya confirmada (y eventualmente corregida) por el
// usuario. `propuesta` tiene que tener la MISMA forma que devolvió
// /interpretar (ver resolverPropuesta) — este endpoint no vuelve a
// resolver nombres (el usuario ya desambiguó lo que hacía falta), pero sí
// vuelve a verificar que cada id referenciado exista de verdad antes de
// usarlo, y corre las mismas validaciones de negocio que los endpoints
// manuales. Todo dentro de una única transacción (CLAUDE.md §23).
app.post('/api/asistente/ejecutar', (req, res) => {
  const { mensaje_id: mensajeId, tipo, propuesta } = req.body;

  // organizacion_id en el lookup (Etapa A, CLAUDE.md §28): sin este filtro,
  // un usuario de la empresa B podía ejecutar una propuesta de la empresa A
  // pasando su mensaje_id — era escritura cruzada entre inquilinos, no solo
  // lectura. Un id de otra empresa cae en el mismo 404 de siempre, sin
  // revelar que existe en otra parte. Los UPDATE de marcarFallido/
  // marcarConfirmado de abajo operan sobre mensaje.id, que ya salió de este
  // lookup acotado, así que no necesitan su propio filtro.
  const mensaje = db
    .prepare(
      "SELECT id FROM asistente_mensajes WHERE id = ? AND estado = 'interpretado' AND organizacion_id = ?"
    )
    .get(Number(mensajeId), req.usuario.organizacion_id);
  if (!mensaje) {
    return res.status(404).json({ error: 'Este mensaje no existe o ya fue procesado.' });
  }

  const marcarFallido = (error) => {
    db.prepare("UPDATE asistente_mensajes SET estado = 'fallido', error = ? WHERE id = ?").run(
      String(error),
      mensaje.id
    );
  };
  const marcarConfirmado = (operacionId) => {
    db.prepare(
      "UPDATE asistente_mensajes SET estado = 'confirmado', operacion_id = ?, propuesta_json = ? WHERE id = ?"
    ).run(operacionId, JSON.stringify(propuesta), mensaje.id);
  };

  if (tipo === 'venta') {
    if (!Array.isArray(propuesta?.items) || propuesta.items.length === 0) {
      return res.status(400).json({ error: 'La venta necesita al menos un item.' });
    }
    exigirLugarEnPlan(req.usuario.organizacion_id, 'ventas_mes');
    const items = [];
    for (const item of propuesta.items) {
      if (!existeId('productos', item.producto?.id, req.usuario.organizacion_id)) {
        marcarFallido(`Producto inválido: "${item.producto?.valor ?? '?'}".`);
        return res.status(400).json({ error: `El producto "${item.producto?.valor ?? '?'}" no existe.` });
      }
      if (
        !Number.isFinite(Number(item.cantidad)) || !(Number(item.cantidad) > 0) || Number(item.cantidad) > LIMITE_NUMERICO ||
        !Number.isFinite(Number(item.precio_unitario)) || !(Number(item.precio_unitario) >= 0) || Number(item.precio_unitario) > LIMITE_NUMERICO
      ) {
        return res.status(400).json({ error: 'Cantidad y precio de cada item tienen que ser válidos.' });
      }
      items.push({
        producto_id: Number(item.producto.id),
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario)
      });
    }

    const clienteId = existeId('clientes', propuesta.cliente?.id, req.usuario.organizacion_id) ? Number(propuesta.cliente.id) : null;
    const clienteNombre = propuesta.cliente?.nombre_resuelto || propuesta.cliente?.valor || null;
    if (!clienteId && (!clienteNombre || !clienteNombre.trim())) {
      return res.status(400).json({ error: 'La venta necesita un cliente.' });
    }

    // El asistente todavía no interpreta depósito desde el texto (CLAUDE.md
    // §19 y §21 son etapas separadas): usa el predeterminado, igual que la
    // conversión de un presupuesto.
    const depositoAsistente = depositoPredeterminadoId(req.usuario.organizacion_id);
    const errorStock = validarStockDisponible(items, depositoAsistente, req.usuario.organizacion_id);
    if (errorStock) {
      return res.status(400).json({ error: errorStock });
    }

    const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
    let cuentaCobroId = null;
    let importeCobro = null;
    if (propuesta.cobro) {
      if (!existeId('cuentas_tesoreria', propuesta.cobro.cuenta?.id, req.usuario.organizacion_id)) {
        return res.status(400).json({ error: 'La cuenta de tesorería del cobro no existe.' });
      }
      cuentaCobroId = Number(propuesta.cobro.cuenta.id);
      importeCobro = propuesta.cobro.importe ?? total;
      if (!(importeCobro > 0)) {
        return res.status(400).json({ error: 'El importe del cobro tiene que ser mayor a 0.' });
      }
      if (importeCobro > total) {
        return res
          .status(400)
          .json({ error: `El cobro (${importeCobro}) supera el total de la venta (${total.toFixed(2)}).` });
      }
    }

    let ventaId;
    try {
      ventaId = withTransaction(() => {
        const nuevaVentaId = crearVenta({
          cliente: clienteNombre,
          cliente_id: clienteId,
          items,
          fecha: propuesta.fecha,
          deposito_id: depositoAsistente,
          organizacion_id: req.usuario.organizacion_id
        });
        auditar(req, {
          accion: 'crear',
          entidad: 'venta',
          entidad_id: nuevaVentaId,
          actor: 'asistente',
          operacion_tipo: 'asistente_mensaje',
          operacion_id: mensaje.id,
          detalle: `Venta #${nuevaVentaId} creada por el asistente`
        });
        if (cuentaCobroId) {
          const { cliente_id: clienteIdCreado } = db
            .prepare('SELECT cliente_id FROM ventas WHERE id = ?')
            .get(nuevaVentaId);
          const nuevoCobroId = registrarCobro(nuevaVentaId, clienteIdCreado, importeCobro, cuentaCobroId, 'Cargado por el asistente', req.usuario.organizacion_id);
          auditar(req, {
            accion: 'crear',
            entidad: 'cobro',
            entidad_id: nuevoCobroId,
            actor: 'asistente',
            operacion_tipo: 'asistente_mensaje',
            operacion_id: mensaje.id,
            detalle: `Cobro #${nuevoCobroId} cargado por el asistente sobre la venta #${nuevaVentaId}`
          });
        }
        return nuevaVentaId;
      });
    } catch (err) {
      marcarFallido(err.message);
      return res.status(500).json({ error: 'No se pudo registrar la venta.' });
    }

    marcarConfirmado(ventaId);
    return res.status(201).json({ id: ventaId, tipo: 'venta' });
  }

  if (tipo === 'compra') {
    // El circuito de compras es solo admin por HTTP (crear, confirmar y
    // recibir mueven stock, recalculan el costo y generan deuda con el
    // proveedor). Este endpoint es 'ambos' en permisos.js porque ventas y
    // gastos sí son del empleado, así que la restricción de la rama de compra
    // se aplica acá: sin esto el asistente era un atajo alrededor de esa
    // política (CLAUDE.md §21, §35).
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Necesitás ser administrador para registrar compras.' });
    }
    if (!Array.isArray(propuesta?.items) || propuesta.items.length === 0) {
      return res.status(400).json({ error: 'La compra necesita al menos un item.' });
    }
    const proveedorNombre = propuesta.proveedor?.nombre_resuelto || propuesta.proveedor?.valor;
    if (!proveedorNombre || !proveedorNombre.trim()) {
      return res.status(400).json({ error: 'La compra necesita un proveedor.' });
    }
    const items = [];
    for (const item of propuesta.items) {
      const productoNombre = item.producto?.nombre_resuelto || item.producto?.valor;
      if (!productoNombre || !productoNombre.trim()) {
        return res.status(400).json({ error: 'Todos los items necesitan un producto.' });
      }
      if (!(Number(item.cantidad) > 0) || !(Number(item.precio_unitario) >= 0)) {
        return res.status(400).json({ error: 'Cantidad y costo de cada item tienen que ser válidos.' });
      }
      items.push({ producto: productoNombre, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) });
    }
    const costoEnvio = normalizarPrecio(propuesta.costo_envio);
    if (Number.isNaN(costoEnvio) || costoEnvio < 0) {
      return res.status(400).json({ error: 'El costo de envío debe ser un número mayor o igual a 0.' });
    }

    let compraId;
    try {
      compraId = withTransaction(() => {
        const nuevaCompraId = crearCompra({
          proveedor: proveedorNombre,
          items,
          costoEnvio,
          fecha: propuesta.fecha,
          organizacion_id: req.usuario.organizacion_id
        });
        confirmarCompra(nuevaCompraId);
        aplicarStockCompra(nuevaCompraId);
        auditar(req, {
          accion: 'crear',
          entidad: 'compra',
          entidad_id: nuevaCompraId,
          actor: 'asistente',
          operacion_tipo: 'asistente_mensaje',
          operacion_id: mensaje.id,
          detalle: `Compra #${nuevaCompraId} creada y confirmada por el asistente`
        });
        return nuevaCompraId;
      });
    } catch (err) {
      marcarFallido(err.message);
      // El tope del plan (un producto nuevo por nombre) se explica tal cual.
      if (err instanceof ErrorPlan) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
      return res.status(500).json({ error: 'No se pudo registrar la compra.' });
    }

    marcarConfirmado(compraId);
    return res.status(201).json({ id: compraId, tipo: 'compra' });
  }

  if (tipo === 'gasto') {
    if (!existeId('categorias_gasto', propuesta?.categoria?.id, req.usuario.organizacion_id)) {
      return res.status(400).json({ error: 'La categoría del gasto no existe.' });
    }
    if (!existeId('cuentas_tesoreria', propuesta?.cuenta?.id, req.usuario.organizacion_id)) {
      return res.status(400).json({ error: 'La cuenta de tesorería del gasto no existe.' });
    }
    const proveedorId = existeId('proveedores', propuesta?.proveedor?.id, req.usuario.organizacion_id) ? Number(propuesta.proveedor.id) : null;

    const validacion = validarGasto(
      {
        categoria_id: propuesta.categoria.id,
        cuenta_tesoreria_id: propuesta.cuenta.id,
        proveedor_id: proveedorId,
        importe: propuesta.importe,
        tipo: propuesta.tipo
      },
      req.usuario.organizacion_id
    );
    if (validacion.error) {
      return res.status(400).json({ error: validacion.error });
    }
    const { categoriaId, cuentaId, proveedorId: proveedorIdValidado, monto, tipo: tipoValidado } = validacion;

    let gastoId;
    try {
      gastoId = withTransaction(() => {
        const nuevoGastoId = crearGasto({
          categoriaId,
          cuentaId,
          proveedorId: proveedorIdValidado,
          monto,
          tipo: tipoValidado,
          fecha: propuesta.fecha,
          descripcion: propuesta.descripcion,
          comprobante: null,
          organizacionId: req.usuario.organizacion_id
        });
        auditar(req, {
          accion: 'crear',
          entidad: 'gasto',
          entidad_id: nuevoGastoId,
          actor: 'asistente',
          operacion_tipo: 'asistente_mensaje',
          operacion_id: mensaje.id,
          detalle: `Gasto #${nuevoGastoId} creado por el asistente`
        });
        return nuevoGastoId;
      });
    } catch (err) {
      marcarFallido(err.message);
      return res.status(500).json({ error: 'No se pudo registrar el gasto.' });
    }

    marcarConfirmado(gastoId);
    return res.status(201).json({ id: gastoId, tipo: 'gasto' });
  }

  return res.status(400).json({ error: 'Tipo de operación desconocido.' });
});

/* ---------- Auditoría (CLAUDE.md §22) ---------- */

// Solo lectura, sin POST: la auditoría se escribe únicamente desde adentro
// de las transacciones (ver registrarAuditoria en db/index.js), nunca
// directo desde un endpoint — exponer un POST acá sería una puerta para
// falsificar el log. Mismo patrón que /api/movimientos-stock: trae todo
// hasta TOPE_MOVIMIENTOS y el filtrado fino lo hace el navegador.
// LEFT JOIN (no INNER): las filas de auditoría anteriores a la etapa de
// usuarios tienen usuario_id NULL, y con INNER desaparecerían del
// listado en vez de mostrar "—". Columnas calificadas con auditoria.*
// porque las dos tablas comparten la columna id — sin calificar, el id
// que llega al frontend podría terminar siendo el del usuario, no el de
// la fila de auditoría.
//
// Es de los dos roles (hist. §93). valor_anterior/valor_nuevo son texto JSON
// y el filtro de campos sensibles de res.json no entra en un string: para el
// empleado se parsean y se podan acá con el mismo podarSensibles (CLAUDE.md
// §35). Las filas del circuito de compras no le llegan: ahí precio_unitario
// es un costo, y el filtro por nombre de clave no lo distingue del precio de
// venta (por eso ese circuito ya es admin entero). Filtro por
// organizacion_id: las filas con NULL (ver el comentario de login_fallido más
// arriba) quedan afuera del listado de cualquier empresa, por diseño.
const ENTIDADES_AUDITORIA_SOLO_ADMIN = ['compra', 'pago', 'devolucion_proveedor'];

function podarValorAuditoria(json) {
  if (!json) return json;
  try {
    const podado = podarSensibles(JSON.parse(json));
    return podado && typeof podado === 'object' && Object.keys(podado).length === 0 ? null : JSON.stringify(podado);
  } catch {
    return null;
  }
}

app.get('/api/auditoria', (req, res) => {
  const limite = limiteDeConsulta(req.query.limit);
  const esAdmin = req.usuario.rol === 'admin';
  const sinCompras = esAdmin
    ? ''
    : `AND auditoria.entidad NOT IN (${ENTIDADES_AUDITORIA_SOLO_ADMIN.map(() => '?').join(', ')})`;
  const registros = db
    .prepare(
      `SELECT auditoria.id, auditoria.fecha, auditoria.actor, auditoria.accion,
              auditoria.entidad, auditoria.entidad_id, auditoria.usuario_id,
              usuarios.nombre AS usuario_nombre,
              auditoria.valor_anterior, auditoria.valor_nuevo,
              auditoria.operacion_tipo, auditoria.operacion_id, auditoria.detalle
         FROM auditoria
         LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id
        WHERE auditoria.organizacion_id = ? ${sinCompras}
        ORDER BY auditoria.fecha DESC, auditoria.id DESC
        LIMIT ?`
    )
    .all(req.usuario.organizacion_id, ...(esAdmin ? [] : ENTIDADES_AUDITORIA_SOLO_ADMIN), limite);
  if (esAdmin) return res.json(registros);
  res.json(
    registros.map((r) => ({
      ...r,
      valor_anterior: podarValorAuditoria(r.valor_anterior),
      valor_nuevo: podarValorAuditoria(r.valor_nuevo)
    }))
  );
});

/* ---------- Auth: sesión en curso (requieren estar logueado) ---------- */
// Van después de app.use('/api', autenticar) más abajo, así que req.usuario
// ya está garantizado acá.

app.post('/api/auth/logout', (req, res) => {
  const token = leerCookie(req, COOKIE_SESION);
  if (token) {
    withTransaction(() => {
      db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
      auditar(req, { accion: 'logout', entidad: 'usuario', entidad_id: req.usuario.id, detalle: 'Cerró sesión' });
    });
  }
  borrarCookieSesion(res);
  res.status(204).end();
});

app.post('/api/auth/cambiar-password', (req, res) => {
  const { actual, nueva } = req.body ?? {};
  if (!actual || !nueva) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva son obligatorias.' });
  }
  if (nueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña tiene que tener al menos 8 caracteres.' });
  }
  const fila = db
    .prepare('SELECT password_hash, password_salt FROM usuarios WHERE id = ?')
    .get(req.usuario.id);
  if (!verificarPassword(actual, fila.password_hash, fila.password_salt)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
  }

  const token = leerCookie(req, COOKIE_SESION);
  withTransaction(() => {
    const { hash, salt } = hashPassword(nueva);
    db.prepare(
      'UPDATE usuarios SET password_hash = ?, password_salt = ?, debe_cambiar_password = 0 WHERE id = ?'
    ).run(hash, salt, req.usuario.id);
    // Cierra las demás sesiones abiertas de este usuario (otro dispositivo,
    // otra pestaña) pero conserva la actual, para no desloguear a quien
    // acaba de cambiar su propia contraseña.
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token != ?').run(req.usuario.id, token);
    // La contraseña nunca entra en la auditoría, ni en valor_anterior/
    // valor_nuevo ni en detalle.
    auditar(req, { accion: 'editar', entidad: 'usuario', entidad_id: req.usuario.id, detalle: 'Cambió su contraseña' });
  });

  res.status(204).end();
});

// Sumar o cambiar el mail de la cuenta (hist. §102). La primera vez es la
// página obligatoria "Sumá tu mail" y no pide la contraseña (recién entró con
// ella); cambiarlo sí, porque con el mail se recupera la cuenta: alguien que
// encuentra una sesión abierta no puede quedársela. El mail nuevo queda sin
// verificar, y al anterior le llega un aviso.
app.post('/api/auth/email', (req, res) => {
  const email = normalizarMail(req.body?.email);
  if (!esMailValido(email)) {
    return res.status(400).json({ error: 'Escribí un mail válido.' });
  }
  const cuenta = db
    .prepare('SELECT id, nombre, email, password_hash, password_salt FROM usuarios WHERE id = ?')
    .get(req.usuario.id);
  if (cuenta.email === email) {
    return res.status(400).json({ error: 'Ese ya es el mail de tu cuenta.' });
  }
  // Antes del scrypt: cada intento con contraseña cuesta ~100 ms de servidor.
  if (registroExcedido(`mail:${cuenta.id}`)) {
    return res.status(429).json({ error: 'Pediste demasiados cambios de mail. Probá de nuevo en una hora.' });
  }
  if (cuenta.email) {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password || password.length > 1000) {
      return res.status(400).json({ error: 'Escribí tu contraseña para cambiar el mail.' });
    }
    if (!verificarPassword(password, cuenta.password_hash, cuenta.password_salt)) {
      return res.status(401).json({ error: 'La contraseña no es correcta.' });
    }
  }
  if (mailEnUso(email, cuenta.id)) {
    return res.status(409).json({ error: 'Ese mail ya lo usa otra cuenta de Nexo.' });
  }

  withTransaction(() => {
    // En una cuenta nueva el usuario es el mail (ver el alta): si no lo sigue,
    // el mail viejo seguiría entrando y nadie más podría usarlo. El usuario de
    // una cuenta de antes de §102 ("dani") no se toca.
    db.prepare(
      `UPDATE usuarios
          SET email = ?1, email_verificado = NULL,
              usuario = CASE WHEN LOWER(usuario) = LOWER(email) THEN ?1 ELSE usuario END
        WHERE id = ?2`
    ).run(email, cuenta.id);
    auditar(req, {
      accion: 'editar',
      entidad: 'usuario',
      entidad_id: cuenta.id,
      valor_anterior: cuenta.email ? JSON.stringify({ email: cuenta.email }) : null,
      valor_nuevo: JSON.stringify({ email }),
      detalle: cuenta.email ? 'Cambió su mail' : 'Sumó su mail'
    });
  });

  mandarVerificacion(req, { usuarioId: cuenta.id, nombre: cuenta.nombre, email });
  if (cuenta.email) {
    const { texto, html } = plantillaMail({
      titulo: 'Cambió el mail de tu cuenta',
      parrafos: [
        `Hola, ${cuenta.nombre}.`,
        `El mail de tu cuenta de Nexo pasó a ser ${email}. Desde ahora entrás con ese mail.`,
        'Si no fuiste vos, respondé este mail y te ayudamos a recuperar la cuenta.'
      ],
      pie: 'Es un aviso de seguridad: te lo mandamos a tu mail anterior.'
    });
    mandarSinEsperar({ para: cuenta.email, asunto: 'Cambió el mail de tu cuenta de Nexo', texto, html });
  }
  res.json({ usuario: datosUsuario({ ...req.usuario, email, email_verificado: null }) });
});

// Otro enlace de verificación, desde el aviso del Resumen o Mi cuenta. Mismo
// tope que el cambio de mail: es el mismo envío.
app.post('/api/auth/email/reenviar', (req, res) => {
  const cuenta = db.prepare('SELECT id, nombre, email, email_verificado FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (cuenta.email_verificado) {
    return res.status(400).json({ error: 'Tu mail ya está confirmado.' });
  }
  if (registroExcedido(`mail:${cuenta.id}`)) {
    return res.status(429).json({ error: 'Ya te mandamos varios enlaces. Probá de nuevo en una hora.' });
  }
  mandarVerificacion(req, { usuarioId: cuenta.id, nombre: cuenta.nombre, email: cuenta.email });
  res.status(204).end();
});

/* ---------- Usuarios (ABM, solo admin) ---------- */

app.get('/api/usuarios', soloAdmin, (req, res) => {
  // Nunca SELECT *: password_hash/password_salt no deben salir del backend.
  // Los de este negocio, con su rol, su baja, su alta y su último acceso EN
  // este negocio (hist. §77).
  const usuarios = db
    .prepare(
      `SELECT usuarios.id, usuarios.usuario, usuarios.nombre, pertenencia.rol, pertenencia.activo,
              usuarios.debe_cambiar_password, pertenencia.fecha_alta, pertenencia.ultimo_acceso,
              usuarios.email, usuarios.email_verificado
         FROM usuario_organizaciones pertenencia
         JOIN usuarios ON usuarios.id = pertenencia.usuario_id
        WHERE pertenencia.organizacion_id = ?
        ORDER BY usuarios.nombre`
    )
    .all(req.usuario.organizacion_id);
  res.json(usuarios);
});

// El usuario y lo que es en este negocio, o undefined si no trabaja en él: un
// usuario de otro negocio cae en el mismo 404 que un id que no existe.
function usuarioDelNegocio(usuarioId, organizacionId) {
  return db
    .prepare(
      `SELECT usuarios.id, usuarios.nombre, pertenencia.rol, pertenencia.activo
         FROM usuario_organizaciones pertenencia
         JOIN usuarios ON usuarios.id = pertenencia.usuario_id
        WHERE pertenencia.usuario_id = ? AND pertenencia.organizacion_id = ?`
    )
    .get(usuarioId, organizacionId);
}

// La contraseña y el nombre son de la persona, no de un negocio: la misma
// contraseña entra a todos sus negocios (hist. §77). Por eso un admin solo los
// cambia si administra todos los negocios de esa persona, también los que la
// dieron de baja (la podrían reactivar). Sin esto, el admin de A le resetea la
// contraseña a alguien que se armó su propio negocio C y entra a C.
function administraTodosSusNegocios(adminId, usuarioId) {
  const ajeno = db
    .prepare(
      `SELECT 1 FROM usuario_organizaciones suya
        WHERE suya.usuario_id = ?
          AND NOT EXISTS (SELECT 1 FROM usuario_organizaciones mia
                           WHERE mia.usuario_id = ? AND mia.organizacion_id = suya.organizacion_id
                             AND mia.rol = 'admin' AND mia.activo = 1)
        LIMIT 1`
    )
    .get(usuarioId, adminId);
  return !ajeno;
}
const MENSAJE_USA_OTRO_NEGOCIO =
  'Esta persona también usa Nexo en otro negocio, así que su nombre y su contraseña no se cambian desde acá. La contraseña la puede cambiar ella desde Mi cuenta.';

app.post('/api/usuarios', soloAdmin, (req, res) => {
  const { usuario, nombre, password, rol } = req.body ?? {};
  if (!usuario || !nombre || !password) {
    return res.status(400).json({ error: 'Usuario, nombre y contraseña son obligatorios.' });
  }
  if (/\s/.test(usuario)) {
    return res.status(400).json({ error: 'El usuario no puede tener espacios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres.' });
  }
  const rolFinal = rol === 'admin' ? 'admin' : 'empleado';
  exigirLugarEnPlan(req.usuario.organizacion_id, 'usuarios');

  // Sin filtro por organización a propósito: `usuarios.usuario` tiene UNIQUE
  // global en el esquema y el login resuelve sin saber la empresa, así que el
  // nombre de usuario es único en todo Nexo (decisión del equipo). Si acá se
  // filtrara por empresa, el INSERT de abajo reventaría contra ese UNIQUE y
  // devolvería un 500 en vez de este 409 claro.
  const existe = db.prepare('SELECT id FROM usuarios WHERE LOWER(usuario) = LOWER(?)').get(usuario);
  if (existe) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario.' });
  }

  let usuarioId;
  withTransaction(() => {
    // La empresa sale de la sesión del admin que crea el usuario: con
    // organizacionUnica() un admin de la empresa B creaba su empleado dentro
    // de la empresa A (CLAUDE.md §28).
    const orgId = req.usuario.organizacion_id;
    const { hash, salt } = hashPassword(password);
    // debe_cambiar_password: 1 porque la eligió el admin, no el dueño de
    // la cuenta — se lo obliga a elegir la suya en el primer login.
    const info = db
      .prepare(
        `INSERT INTO usuarios (organizacion_id, usuario, nombre, password_hash, password_salt, debe_cambiar_password)
         VALUES (?, ?, ?, ?, ?, 1)`
      )
      .run(orgId, usuario, nombre, hash, salt);
    usuarioId = Number(info.lastInsertRowid);
    sumarAlNegocio(usuarioId, orgId, rolFinal);
    auditar(req, {
      accion: 'crear',
      entidad: 'usuario',
      entidad_id: usuarioId,
      detalle: `Usuario "${nombre}" (${usuario}) creado con rol ${rolFinal}`
    });
  });

  res.status(201).json({ id: usuarioId });
});

app.patch('/api/usuarios/:id', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  // Filtro por organización como parte del aislamiento multi-empresa
  // (CLAUDE.md §28): sin él, un admin de la empresa A podía renombrar,
  // promover a admin o dar de baja usuarios de la empresa B (y la baja además
  // les mata la sesión en el acto). Un usuario de otra empresa cae en el
  // mismo 404 que un id inexistente, sin revelar que existe en otra parte.
  const organizacionId = req.usuario.organizacion_id;
  const anterior = usuarioDelNegocio(id, organizacionId);
  if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado.' });

  const nuevo = {
    nombre: req.body?.nombre ?? anterior.nombre,
    rol: req.body?.rol ?? anterior.rol,
    activo: req.body?.activo !== undefined ? (req.body.activo ? 1 : 0) : anterior.activo
  };
  if (nuevo.rol !== 'admin' && nuevo.rol !== 'empleado') {
    return res.status(400).json({ error: 'Rol inválido.' });
  }

  // Salvaguardas en el servidor, no solo en la UI: sin esto el sistema
  // podría quedar sin ningún admin que lo administre, y no hay registro
  // público para recuperarse solo.
  const eraUltimoAdmin =
    anterior.rol === 'admin' && anterior.activo === 1 && contarAdminsActivos(organizacionId) === 1;
  const dejaDeSerAdminActivo = nuevo.rol !== 'admin' || nuevo.activo === 0;
  if (eraUltimoAdmin && dejaDeSerAdminActivo) {
    return res.status(409).json({ error: 'No se puede dar de baja ni degradar al último administrador activo.' });
  }
  if (id === req.usuario.id && nuevo.activo === 0) {
    return res.status(409).json({ error: 'No podés darte de baja a vos mismo.' });
  }
  if (nuevo.nombre !== anterior.nombre && !administraTodosSusNegocios(req.usuario.id, id)) {
    return res.status(409).json({ error: MENSAJE_USA_OTRO_NEGOCIO });
  }
  // Reactivar a alguien vuelve a ocupar un lugar del plan (hist. §98).
  if (anterior.activo === 0 && nuevo.activo === 1) {
    exigirLugarEnPlan(organizacionId, 'usuarios');
  }

  withTransaction(() => {
    if (nuevo.nombre !== anterior.nombre) {
      db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').run(nuevo.nombre, id);
    }
    // El rol y la baja son de este negocio: en los otros del usuario no cambia
    // nada (hist. §77). organizacion_id en el WHERE, como en toda la Etapa A.
    db.prepare(
      'UPDATE usuario_organizaciones SET rol = ?, activo = ? WHERE usuario_id = ? AND organizacion_id = ?'
    ).run(nuevo.rol, nuevo.activo, id, organizacionId);
    // Dar de baja lo echa de este negocio en el acto: sin esto seguiría
    // operando con su sesión actual hasta que expirara sola (hasta 12hs). Sus
    // sesiones en otros negocios siguen.
    if (nuevo.activo === 0) {
      db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND organizacion_id = ?').run(id, organizacionId);
    }
    const diff = diffCampos(anterior, nuevo, ['nombre', 'rol', 'activo']);
    if (diff) {
      auditar(req, {
        accion: 'editar',
        entidad: 'usuario',
        entidad_id: id,
        valor_anterior: diff.anterior,
        valor_nuevo: diff.nuevo,
        detalle: `Usuario "${anterior.nombre}" actualizado`
      });
    }
  });

  res.status(204).end();
});

app.post('/api/usuarios/:id/resetear-password', soloAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body ?? {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres.' });
  }
  // NO sacar el filtro por organización de acá. Sin él, un admin de la
  // empresa A podía fijarle la contraseña a un usuario de la empresa B y
  // después loguearse como él, o sea tomar control de otra empresa entera
  // (CLAUDE.md §28) — era el agujero más grave que tuvo el sistema.
  const organizacionId = req.usuario.organizacion_id;
  const usuario = usuarioDelNegocio(id, organizacionId);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (!administraTodosSusNegocios(req.usuario.id, id)) {
    return res.status(409).json({ error: MENSAJE_USA_OTRO_NEGOCIO });
  }

  withTransaction(() => {
    const { hash, salt } = hashPassword(password);
    db.prepare(
      'UPDATE usuarios SET password_hash = ?, password_salt = ?, debe_cambiar_password = 1 WHERE id = ?'
    ).run(hash, salt, id);
    // Igual que la baja: resetear la contraseña echa al usuario en el
    // acto, para que la sesión vieja no siga viva con la contraseña
    // anterior todavía en la cabeza de quien la tenía. De todos sus
    // negocios, porque la contraseña es una sola.
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(id);
    // La contraseña nueva nunca entra en la auditoría.
    auditar(req, {
      accion: 'editar',
      entidad: 'usuario',
      entidad_id: id,
      detalle: `Contraseña de "${usuario.nombre}" reseteada por el administrador`
    });
  });

  res.status(204).end();
});

/* ---------- Planes de Nexo (hist. §98) ---------- */

// Los planes y sus topes viven en planes.js. Acá se cuenta cuánto usa cada
// negocio y se frena lo que pasa el tope. Frenar nunca borra ni oculta nada:
// un negocio cuya prueba venció sigue viendo y editando todo lo que cargó,
// solo no suma más de lo que su plan permite.

const NOMBRE_RECURSO = {
  productos: { uno: 'producto o servicio activo', varios: 'productos o servicios activos' },
  ventas_mes: { uno: 'venta por mes', varios: 'ventas por mes' },
  usuarios: { uno: 'usuario', varios: 'usuarios' },
  negocios: { uno: 'negocio', varios: 'negocios' }
};

// El primer día del mes de `hoy` (AAAA-MM-01) y el del mes siguiente.
function limitesDelMes(hoy) {
  const desde = `${hoy.slice(0, 7)}-01`;
  const [y, m] = hoy.split('-').map(Number);
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { desde, hasta };
}

// Cuánto usa hoy el negocio de cada recurso con tope. Las ventas son las del
// mes de la Argentina, sin anular, y sin las cuotas que se generan solas
// (socios y abonos): esas no las carga una persona y frenarlas dejaría a un
// gimnasio sin cuotas.
function usoDelPlan(organizacionId, hoy = fechaDeHoy()) {
  const { desde, hasta } = limitesDelMes(hoy);
  const contar = (sql, ...extra) => db.prepare(sql).get(organizacionId, ...extra).n;
  return {
    productos: contar('SELECT COUNT(*) AS n FROM productos WHERE organizacion_id = ? AND activo = 1'),
    usuarios: contar('SELECT COUNT(*) AS n FROM usuario_organizaciones WHERE organizacion_id = ? AND activo = 1'),
    ventas_mes: contar(
      `SELECT COUNT(*) AS n FROM ventas
        WHERE organizacion_id = ? AND estado = 'activa' AND fecha >= ? AND fecha < ?
          AND id NOT IN (SELECT venta_id FROM cuotas_socio)
          AND id NOT IN (SELECT venta_id FROM cuotas_abono)`,
      desde,
      hasta
    )
  };
}

// El plan del negocio como lo ve la página "Tu plan": el que rige hoy, el
// guardado (distinto si la prueba venció), hasta cuándo y cuánto usa.
function planDelNegocio(organizacionId) {
  const hoy = fechaDeHoy();
  const fila = db.prepare('SELECT plan, plan_vence FROM organizaciones WHERE id = ?').get(organizacionId);
  const clave = planEfectivo(fila, hoy);
  const plan = PLANES[clave];
  const vigente = clave === fila.plan;
  const uso = usoDelPlan(organizacionId, hoy);
  return {
    clave,
    nombre: plan.nombre,
    precio: plan.precio,
    marca: plan.marca,
    vence: vigente ? fila.plan_vence : null,
    // diffDias es inclusivo: el último día de la prueba quedan 0 días más.
    dias_restantes: vigente && fila.plan_vence ? diffDias(hoy, fila.plan_vence) : null,
    // La prueba (o el plan pago) que terminó: la página explica por qué está
    // en Gratis.
    vencido: vigente ? null : { clave: fila.plan, nombre: PLANES[fila.plan]?.nombre ?? fila.plan, vencio: fila.plan_vence },
    uso: Object.fromEntries(
      ['productos', 'ventas_mes', 'usuarios'].map((recurso) => [recurso, { usados: uso[recurso], tope: plan[recurso] }])
    )
  };
}

// Frena (ErrorPlan, 403) si sumar `nuevos` de `recurso` pasa el tope del plan
// que rige hoy. Con nuevos = 0 controla lo que ya se insertó adentro de una
// transacción (los productos que una compra crea por nombre): el throw hace
// ROLLBACK.
function exigirLugarEnPlan(organizacionId, recurso, nuevos = 1) {
  const hoy = fechaDeHoy();
  const fila = db.prepare('SELECT plan, plan_vence FROM organizaciones WHERE id = ?').get(organizacionId);
  const clave = planEfectivo(fila, hoy);
  const tope = PLANES[clave][recurso];
  if (tope === null) return;
  const usados = recurso === 'negocios' ? 1 : usoDelPlan(organizacionId, hoy)[recurso];
  if (usados + nuevos <= tope) return;
  const siguiente = planQuePermite(recurso, tope);
  const nombre = NOMBRE_RECURSO[recurso];
  const cuanto = `${tope} ${tope === 1 ? nombre.uno : nombre.varios}`;
  throw new ErrorPlan(
    recurso === 'negocios'
      ? `El plan ${PLANES[clave].nombre} es de un solo negocio. Con el plan ${PLANES[siguiente].nombre} sumás los que quieras.`
      : `El plan ${PLANES[clave].nombre} llega hasta ${cuanto}. Pasá al plan ${PLANES[siguiente].nombre} para sumar más.`
  );
}

// Los planes para la landing y el alta, con el contacto público si está
// configurado. Es el mismo catálogo para todos y no tiene datos de ninguna
// empresa.
function catalogoPlanes() {
  return {
    planes: Object.entries(PLANES).map(([clave, plan]) => ({ clave, ...plan })),
    dias_prueba: DIAS_PRUEBA,
    contacto: { whatsapp: process.env.NEXO_CONTACTO_WHATSAPP?.replace(/\D/g, '') || null }
  };
}

/* ---------- Tipo de negocio y módulos (CLAUDE.md §29) ---------- */

// Los tipos y sus presets viven en perfiles.js, que también lee db/index.js.

function catalogoTiposNegocio() {
  const lista = (tabla) => Object.entries(tabla).map(([clave, datos]) => ({ clave, ...datos }));
  return {
    tipos: lista(PERFILES_RUBRO),
    proximamente: lista(RUBROS_PROXIMAMENTE),
    modulos: MODULOS.map((clave) => ({ clave, ...MODULOS_INFO[clave] }))
  };
}

// organizaciones.modulos es la lista que eligió el admin, separada por
// espacios. Desde hist. §88 siempre está cargada (db/index.js completó las
// viejas): el NULL al preset queda solo por si acaso.
function perfilDeEmpresa(organizacionId) {
  const fila = db.prepare('SELECT rubro, modulos FROM organizaciones WHERE id = ?').get(organizacionId);
  const rubro = Object.hasOwn(PERFILES_RUBRO, fila?.rubro ?? '') ? fila.rubro : RUBRO_POR_DEFECTO;
  const perfil = PERFILES_RUBRO[rubro];
  const modulos = fila?.modulos == null ? perfil.modulos : fila.modulos.split(' ').filter((m) => MODULOS.includes(m));
  return {
    rubro,
    unidad_defecto: perfil.unidad_defecto,
    tipo_defecto: perfil.tipo_defecto,
    catalogo: perfil.catalogo ?? CATALOGO_POR_DEFECTO,
    modulos
  };
}

/* ---------- Datos del negocio (membrete de los comprobantes) ---------- */

// Quién es el negocio: lo que va impreso en el encabezado de un presupuesto o
// una factura. Vive en `organizaciones` (la tabla que ya representaba al
// negocio) y no en una tabla nueva, para no duplicar el concepto.
//
// GET es para cualquier usuario autenticado: el frontend lo necesita al
// bootear para poder armar un comprobante, y no es información sensible (es
// literalmente lo que se imprime y se entrega). PUT es soloAdmin: el CUIT y el
// nombre fiscal que salen en todos los comprobantes no los cambia un empleado.
const CAMPOS_NEGOCIO = [
  'nombre',
  'documento',
  'direccion',
  'telefono',
  'email',
  'condicion_iva',
  'pie_comprobante',
  'rubro',
  'modulos'
];

// La condición fiscal del negocio es una lista fija desde Configuración en
// páginas (hist. §73): es la base de la letra del comprobante en la Etapa C.
// El texto libre de antes lo pasa a clave db/index.js cuando lo reconoce.
const CONDICIONES_IVA = ['responsable_inscripto', 'monotributo', 'exento'];
const LARGOS_NEGOCIO = { nombre: 120, direccion: 160, telefono: 40, email: 120, pie_comprobante: 300 };
const NOMBRES_CAMPO_NEGOCIO = {
  nombre: 'El nombre del negocio',
  direccion: 'La dirección',
  telefono: 'El teléfono',
  email: 'El email',
  pie_comprobante: 'El pie de los comprobantes'
};

// Dígito verificador del CUIT (módulo 11, el cálculo de ARCA). Un resto de 1
// da 9: es el caso de los prefijos 23 y 33.
function cuitValido(digitos) {
  if (!/^\d{11}$/.test(digitos)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10]);
}

// Valida y normaliza los datos del negocio, para el alta (POST
// /api/auth/registro) y para Configuración (PUT /api/negocio). Con `parcial`
// solo mira los campos que vienen, porque cada página de Configuración guarda
// lo suyo; sin `parcial`, el nombre es obligatorio. Devuelve { error } o
// { datos } con los campos presentes. Un texto vacío pasa a NULL, para que el
// membrete distinga "no hay dato" de una línea en blanco.
function validarDatosNegocio(cuerpo, { parcial }) {
  const viene = (campo) => cuerpo?.[campo] !== undefined;
  const datos = {};

  for (const campo of ['nombre', 'direccion', 'telefono', 'email', 'pie_comprobante', 'documento', 'condicion_iva']) {
    if (!viene(campo)) continue;
    const valor = cuerpo[campo];
    if (valor !== null && typeof valor !== 'string' && typeof valor !== 'number') {
      return { error: 'Los datos del negocio no son válidos.' };
    }
    const texto = String(valor ?? '').trim();
    datos[campo] = texto === '' ? null : texto;
    const largo = LARGOS_NEGOCIO[campo];
    if (largo && texto.length > largo) {
      return { error: `${NOMBRES_CAMPO_NEGOCIO[campo]} no puede pasar de ${largo} caracteres.` };
    }
  }

  // nombre es el único obligatorio: es lo que encabeza el comprobante, y un
  // papel sin nombre de quien lo emite no sirve para nada. El resto puede
  // quedar vacío (un monotributista sin local no tiene dirección que poner).
  if ((!parcial || viene('nombre')) && !datos.nombre) {
    return { error: 'El negocio necesita un nombre.' };
  }
  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) {
    return { error: 'El email no es válido.' };
  }
  if (datos.documento) {
    const digitos = datos.documento.replace(/[\s.-]/g, '');
    if (!/^\d{11}$/.test(digitos)) {
      return { error: 'El CUIT tiene que tener 11 números.' };
    }
    if (!cuitValido(digitos)) {
      return { error: 'El CUIT no es válido: revisá el último número.' };
    }
    datos.documento = `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
  }
  if (datos.condicion_iva && !CONDICIONES_IVA.includes(datos.condicion_iva)) {
    return { error: 'Elegí una condición fiscal de la lista.' };
  }

  // Object.hasOwn y no PERFILES_RUBRO[rubro]: "constructor" o "toString"
  // pasaban como tipo de negocio, y un array se convertía a texto.
  if (viene('rubro')) {
    if (typeof cuerpo.rubro !== 'string' || !Object.hasOwn(PERFILES_RUBRO, cuerpo.rubro)) {
      return { error: 'El tipo de negocio no es válido.' };
    }
    datos.rubro = cuerpo.rubro;
  }
  if (viene('modulos')) {
    const lista = cuerpo.modulos;
    if (!Array.isArray(lista) || lista.some((m) => !MODULOS.includes(m))) {
      return { error: 'Los módulos no son válidos.' };
    }
    datos.modulos = MODULOS.filter((m) => lista.includes(m)).join(' ');
  }
  return { datos };
}

app.get('/api/negocio', (req, res) => {
  const negocio = db
    .prepare(
      `SELECT id, nombre, documento, direccion, telefono, email, condicion_iva, pie_comprobante
         FROM organizaciones
        WHERE id = ?`
    )
    .get(req.usuario.organizacion_id);
  if (!negocio) {
    // No debería pasar: la sesión solo vale con una fila de
    // usuario_organizaciones, que tiene FK a organizaciones.
    return res.status(404).json({ error: 'No hay datos de negocio cargados.' });
  }
  // Con el perfil efectivo y el catálogo de tipos y módulos, así las tarjetas
  // de Configuración no repiten la tabla.
  // El plan va para los dos roles: el comprobante de un negocio Gratis lleva
  // "Hecho con Nexo" lo imprima quien lo imprima. El uso son conteos, nada
  // sensible.
  res.json({
    ...negocio,
    ...perfilDeEmpresa(req.usuario.organizacion_id),
    perfiles: catalogoTiposNegocio(),
    plan: planDelNegocio(req.usuario.organizacion_id),
    planes: catalogoPlanes()
  });
});

// Cuánto tiene cargado el negocio, para la guía de primeros pasos del Resumen
// (hist. §81): el frontend arma los pasos según los módulos y los da por hechos
// con estos conteos. Es admin, como el Resumen. Los servicios de los planes de
// socios no cuentan como catálogo (los crea el plan), ni "Consumidor final"
// como cliente (lo crea el punto de venta).
app.get('/api/negocio/primeros-pasos', soloAdmin, (req, res) => {
  const id = req.usuario.organizacion_id;
  const contar = (sql, ...extra) => db.prepare(sql).get(id, ...extra).n;
  const negocio = db.prepare('SELECT documento, direccion, telefono FROM organizaciones WHERE id = ?').get(id);
  res.json({
    datos_negocio: Boolean(negocio.documento || negocio.direccion || negocio.telefono),
    catalogo: contar(
      'SELECT COUNT(*) AS n FROM productos WHERE organizacion_id = ? AND activo = 1 AND id NOT IN (SELECT producto_id FROM planes_socio)'
    ),
    clientes: contar('SELECT COUNT(*) AS n FROM clientes WHERE organizacion_id = ? AND nombre <> ?', CONSUMIDOR_FINAL),
    ventas: contar('SELECT COUNT(*) AS n FROM ventas WHERE organizacion_id = ?'),
    usuarios: contar('SELECT COUNT(*) AS n FROM usuario_organizaciones WHERE organizacion_id = ? AND activo = 1'),
    planes: contar('SELECT COUNT(*) AS n FROM planes_socio WHERE organizacion_id = ?'),
    socios: contar('SELECT COUNT(*) AS n FROM socios WHERE organizacion_id = ?'),
    trabajos: contar('SELECT COUNT(*) AS n FROM trabajos WHERE organizacion_id = ?'),
    abonos: contar('SELECT COUNT(*) AS n FROM abonos WHERE organizacion_id = ?'),
    consultas: contar('SELECT COUNT(*) AS n FROM crm_oportunidades WHERE organizacion_id = ?')
  });
});

app.put('/api/negocio', soloAdmin, (req, res) => {
  // La empresa sale de la sesión: con organizacionUnica() un admin de la
  // empresa B leía y sobrescribía el membrete de comprobantes de la empresa A
  // (CLAUDE.md §28).
  const id = req.usuario.organizacion_id;
  const anterior = db
    .prepare(
      `SELECT nombre, documento, direccion, telefono, email, condicion_iva, pie_comprobante, rubro, modulos
         FROM organizaciones WHERE id = ?`
    )
    .get(id);

  // Actualización parcial: lo que no viene en el pedido queda como estaba.
  // Cada página de Configuración manda solo lo suyo, y antes un campo que no
  // venía se borraba.
  const { error, datos } = validarDatosNegocio(req.body, { parcial: true });
  if (error) {
    return res.status(400).json({ error });
  }
  // Cambiar el tipo no toca los módulos (hist. §88): solo cambia con qué
  // unidad y tipo nace un producto nuevo. Antes volvía a los del preset, y un
  // gimnasio pasado a Servicios perdía de vista sus socios.
  const nuevo = { ...anterior, ...datos };

  const cambios = diffCampos(anterior, nuevo, CAMPOS_NEGOCIO);
  // diffCampos devuelve los valores YA serializados a JSON (string), así que
  // para nombrar los campos que cambiaron hay que calcularlos aparte: un
  // Object.keys() sobre el string devolvería los índices de cada carácter.
  const camposCambiados = CAMPOS_NEGOCIO.filter(
    (campo) => (anterior?.[campo] ?? null) !== nuevo[campo]
  );

  withTransaction(() => {
    db.prepare(
      `UPDATE organizaciones
          SET nombre = ?, documento = ?, direccion = ?, telefono = ?,
              email = ?, condicion_iva = ?, pie_comprobante = ?, rubro = ?, modulos = ?
        WHERE id = ?`
    ).run(
      nuevo.nombre,
      nuevo.documento,
      nuevo.direccion,
      nuevo.telefono,
      nuevo.email,
      nuevo.condicion_iva,
      nuevo.pie_comprobante,
      nuevo.rubro,
      nuevo.modulos,
      id
    );
    // Se audita solo si algo cambió de verdad (diffCampos devuelve null si
    // no): abrir Configuración y guardar sin tocar nada no es un evento.
    if (cambios) {
      auditar(req, {
        accion: 'editar',
        entidad: 'organizacion',
        entidad_id: id,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        detalle: `Datos del negocio actualizados: ${camposCambiados.join(', ')}`
      });
    }
  });

  res.json({ id });
});

/* ---------- Varios negocios por cuenta (CLAUDE.md §28, hist. §77) ---------- */

// Pasa la sesión a otro negocio del mismo usuario: solo cambia de dónde sale
// req.usuario.organizacion_id en los próximos requests. Queda en la auditoría
// de los dos negocios como salida y entrada, sin nombrar al otro: los admins
// de uno no tienen por qué saber del otro. Va adentro de la transacción de
// quien lo llama.
function entrarANegocio(req, token, organizacionId, detalleEntrada) {
  db.prepare('UPDATE sesiones SET organizacion_id = ? WHERE token = ?').run(organizacionId, token);
  marcarAcceso(req.usuario.id, organizacionId);
  auditar(req, { accion: 'logout', entidad: 'usuario', entidad_id: req.usuario.id, detalle: 'Pasó a otro de sus negocios' });
  registrarAuditoria({
    accion: 'login',
    entidad: 'usuario',
    entidad_id: req.usuario.id,
    usuario_id: req.usuario.id,
    organizacion_id: organizacionId,
    detalle: detalleEntrada
  });
}

// Los negocios en los que trabaja el usuario de la sesión, para el selector de
// arriba del menú. Solo los activos: uno donde lo dieron de baja ya no es
// suyo. Para los dos roles: un empleado de dos negocios también cambia.
app.get('/api/negocios', (req, res) => {
  const filas = db
    .prepare(
      `SELECT organizaciones.id, organizaciones.nombre, organizaciones.rubro, pertenencia.rol
         FROM usuario_organizaciones pertenencia
         JOIN organizaciones ON organizaciones.id = pertenencia.organizacion_id
        WHERE pertenencia.usuario_id = ? AND pertenencia.activo = 1
        ORDER BY organizaciones.nombre, organizaciones.id`
    )
    .all(req.usuario.id);
  res.json(
    filas.map((fila) => {
      const rubro = Object.hasOwn(PERFILES_RUBRO, fila.rubro ?? '') ? fila.rubro : RUBRO_POR_DEFECTO;
      return {
        id: fila.id,
        nombre: fila.nombre,
        rubro,
        tipo: PERFILES_RUBRO[rubro].nombre,
        rol: fila.rol,
        actual: fila.id === req.usuario.organizacion_id
      };
    })
  );
});

// "Agregar negocio": otro negocio para la misma cuenta, con quien lo crea como
// su admin, y la sesión pasa a él. Solo un admin: un empleado no arma negocios
// propios desde la cuenta que le dio su empleador (para eso se crea la suya).
// Mismo tope que el registro, contado por usuario.
app.post('/api/negocios', soloAdmin, (req, res) => {
  if (registroExcedido(`usuario:${req.usuario.id}`)) {
    return res.status(429).json({ error: 'Creaste varios negocios seguidos. Probá de nuevo más tarde.' });
  }
  const { error, datos } = validarNegocioNuevo(req.body ?? {});
  if (error) {
    return res.status(400).json({ error });
  }
  // Sumar negocios es de Pro (hist. §98), y el nuevo nace con el plan de este
  // y su mismo vencimiento: se pagan juntos.
  exigirLugarEnPlan(req.usuario.organizacion_id, 'negocios');
  const planActual = db
    .prepare('SELECT plan, plan_vence FROM organizaciones WHERE id = ?')
    .get(req.usuario.organizacion_id);

  const token = leerCookie(req, COOKIE_SESION);
  const id = withTransaction(() => {
    const orgId = insertarNegocio(datos);
    db.prepare('UPDATE organizaciones SET plan = ?, plan_vence = ? WHERE id = ?').run(
      planActual.plan,
      planActual.plan_vence,
      orgId
    );
    sumarAlNegocio(req.usuario.id, orgId, 'admin');
    registrarAuditoria({
      accion: 'crear',
      entidad: 'organizacion',
      entidad_id: orgId,
      usuario_id: req.usuario.id,
      organizacion_id: orgId,
      detalle: `Negocio "${datos.nombre}" creado (${PERFILES_RUBRO[datos.rubro].nombre})`
    });
    entrarANegocio(req, token, orgId, 'Entró al negocio que acaba de crear');
    return orgId;
  });
  res.status(201).json({ id });
});

// Cambiar de negocio. Uno donde no trabaja (o donde lo dieron de baja) es el
// mismo 404 que uno que no existe: no revela negocios ajenos.
app.post('/api/negocios/:id/entrar', (req, res) => {
  const id = Number(req.params.id);
  const trabajaAhi = db
    .prepare('SELECT 1 FROM usuario_organizaciones WHERE usuario_id = ? AND organizacion_id = ? AND activo = 1')
    .get(req.usuario.id, id);
  if (!trabajaAhi) {
    return res.status(404).json({ error: 'Negocio no encontrado.' });
  }
  if (id !== req.usuario.organizacion_id) {
    const token = leerCookie(req, COOKIE_SESION);
    withTransaction(() => entrarANegocio(req, token, id, 'Entró desde otro de sus negocios'));
  }
  res.status(204).end();
});

/* ---------- Errores ---------- */

/* ---------- Punto de venta y turno de caja (CLAUDE.md §30) ---------- */
//
// El punto de venta no es un circuito de datos nuevo: una venta de mostrador
// es crearVenta + registrarCobro, como en la pantalla administrativa, pero en
// una sola transacción (la venta nunca queda sin su cobro) y colgada de un
// turno de caja abierto. Ver turnos_caja en schema.sql.

// Una venta de mostrador sin cliente elegido va a este cliente, uno por
// empresa, que resolverCliente crea la primera vez.
const CONSUMIDOR_FINAL = 'Consumidor final';
const SQL_ULTIMO_MOVIMIENTO_TESORERIA = db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM movimientos_tesoreria');
const SQL_SALDO_CUENTA = db.prepare('SELECT saldo FROM saldo_tesoreria WHERE cuenta_tesoreria_id = ?');
const SELECT_TURNO = `
  SELECT turnos_caja.*, cuentas_tesoreria.nombre AS cuenta,
         abrio.nombre AS abierto_por_nombre, cerro.nombre AS cerrado_por_nombre
    FROM turnos_caja
    JOIN cuentas_tesoreria ON cuentas_tesoreria.id = turnos_caja.cuenta_tesoreria_id
    JOIN usuarios abrio ON abrio.id = turnos_caja.abierto_por
    LEFT JOIN usuarios cerro ON cerro.id = turnos_caja.cerrado_por`;

// Deja el saldo de la cuenta en lo contado: un movimiento manual por la
// diferencia, si la hay (medio centavo de tolerancia por redondeo).
function ajustarArqueo(cuentaId, diferencia, concepto, organizacionId) {
  if (Math.abs(diferencia) < 0.005) return;
  db.prepare(
    `INSERT INTO movimientos_tesoreria (cuenta_tesoreria_id, tipo, importe, origen, concepto, organizacion_id, fecha)
     VALUES (?, ?, ?, 'manual', ?, ?, ${HOY_SQL})`
  ).run(cuentaId, diferencia > 0 ? 'ingreso' : 'egreso', redondear2(Math.abs(diferencia)), concepto, organizacionId);
}

// El turno con lo que pasó en él. Con el turno abierto, esperado es el saldo
// de la caja ahora; cerrado, el que había al cerrar.
function resumenTurno(turno) {
  const hasta = turno.estado === 'abierto' ? SQL_ULTIMO_MOVIMIENTO_TESORERIA.get().id : turno.hasta_movimiento_id;
  const movimientos = db
    .prepare(
      `SELECT tipo, origen, SUM(importe) AS importe
         FROM movimientos_tesoreria
        WHERE cuenta_tesoreria_id = ? AND id > ? AND id <= ?
        GROUP BY tipo, origen`
    )
    .all(turno.cuenta_tesoreria_id, turno.desde_movimiento_id, hasta);
  const sumar = (filtro) => redondear2(movimientos.filter(filtro).reduce((acc, m) => acc + m.importe, 0));
  const ventas = db
    .prepare(
      `SELECT COUNT(*) AS cantidad,
              COALESCE(SUM((SELECT SUM(cantidad * precio_unitario) FROM venta_items WHERE venta_id = ventas.id)), 0) AS total
         FROM ventas WHERE turno_caja_id = ? AND estado = 'activa'`
    )
    .get(turno.id);
  const cobrosPorCuenta = db
    .prepare(
      `SELECT cuentas_tesoreria.nombre AS cuenta, SUM(cobros.importe) AS importe
         FROM cobros
         JOIN ventas ON ventas.id = cobros.venta_id
         JOIN cuentas_tesoreria ON cuentas_tesoreria.id = cobros.cuenta_tesoreria_id
        WHERE ventas.turno_caja_id = ?
        GROUP BY cobros.cuenta_tesoreria_id
        ORDER BY cuentas_tesoreria.nombre`
    )
    .all(turno.id)
    .map((c) => ({ ...c, importe: redondear2(c.importe) }));
  const esperado =
    turno.estado === 'abierto' ? redondear2(SQL_SALDO_CUENTA.get(turno.cuenta_tesoreria_id).saldo) : turno.esperado_cierre;
  return {
    ...turno,
    esperado,
    diferencia_apertura: redondear2(turno.contado_apertura - turno.esperado_apertura),
    diferencia_cierre: turno.estado === 'cerrado' ? redondear2(turno.contado_cierre - turno.esperado_cierre) : null,
    movimientos: {
      cobros: sumar((m) => m.tipo === 'ingreso' && m.origen === 'cobro'),
      otros_ingresos: sumar((m) => m.tipo === 'ingreso' && m.origen !== 'cobro'),
      egresos: sumar((m) => m.tipo === 'egreso')
    },
    ventas: { cantidad: ventas.cantidad, total: redondear2(ventas.total) },
    cobros_por_cuenta: cobrosPorCuenta
  };
}

function turnoDeLaEmpresa(id, organizacionId) {
  return db.prepare(`${SELECT_TURNO} WHERE turnos_caja.id = ? AND turnos_caja.organizacion_id = ?`).get(id, organizacionId);
}

const esImporteDeCaja = (valor) => esNumeroValido(valor) && valor >= 0;

app.get('/api/turnos-caja', (req, res) => {
  const estado = ['abierto', 'cerrado'].includes(req.query.estado) ? req.query.estado : null;
  const turnos = db
    .prepare(
      `${SELECT_TURNO}
        WHERE turnos_caja.organizacion_id = ? AND (? IS NULL OR turnos_caja.estado = ?)
        ORDER BY turnos_caja.id DESC LIMIT 50`
    )
    .all(req.usuario.organizacion_id, estado, estado);
  res.json(turnos.map(resumenTurno));
});

app.get('/api/turnos-caja/:id', (req, res) => {
  const turno = turnoDeLaEmpresa(Number(req.params.id), req.usuario.organizacion_id);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
  res.json(resumenTurno(turno));
});

app.post('/api/turnos-caja', (req, res) => {
  const { cuenta_tesoreria_id, contado, nota } = req.body;
  const organizacionId = req.usuario.organizacion_id;
  const cuenta = db
    .prepare('SELECT id, nombre, tipo FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(cuenta_tesoreria_id), organizacionId);
  if (!cuenta) return res.status(400).json({ error: 'La cuenta de tesorería no existe.' });
  if (cuenta.tipo !== 'efectivo') {
    return res.status(400).json({ error: 'El turno de caja es para una cuenta de efectivo.' });
  }
  if (!esImporteDeCaja(contado)) {
    return res.status(400).json({ error: 'Lo contado tiene que ser un número, 0 o más.' });
  }
  const abierto = db
    .prepare("SELECT id FROM turnos_caja WHERE cuenta_tesoreria_id = ? AND estado = 'abierto'")
    .get(cuenta.id);
  if (abierto) return res.status(400).json({ error: `Esa caja ya tiene un turno abierto (#${abierto.id}).` });

  const turnoId = withTransaction(() => {
    const esperado = redondear2(SQL_SALDO_CUENTA.get(cuenta.id).saldo);
    const { lastInsertRowid: id } = db
      .prepare(
        `INSERT INTO turnos_caja (cuenta_tesoreria_id, abierto_por, esperado_apertura, contado_apertura, nota, organizacion_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(cuenta.id, req.usuario.id, esperado, contado, nota?.trim() || null, organizacionId);
    ajustarArqueo(cuenta.id, contado - esperado, `Diferencia de arqueo al abrir la caja (turno #${id})`, organizacionId);
    db.prepare('UPDATE turnos_caja SET desde_movimiento_id = ? WHERE id = ?').run(
      SQL_ULTIMO_MOVIMIENTO_TESORERIA.get().id,
      id
    );
    auditar(req, {
      accion: 'cambiar_estado',
      entidad: 'cuenta_tesoreria',
      entidad_id: cuenta.id,
      operacion_tipo: 'turno_caja',
      operacion_id: id,
      detalle: `Abrió la caja "${cuenta.nombre}" (turno #${id}): esperado $${esperado}, contado $${contado}`
    });
    return id;
  });
  res.status(201).json(resumenTurno(turnoDeLaEmpresa(turnoId, organizacionId)));
});

app.post('/api/turnos-caja/:id/cerrar', (req, res) => {
  const { contado, nota } = req.body;
  const organizacionId = req.usuario.organizacion_id;
  const turno = turnoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
  if (turno.estado !== 'abierto') return res.status(400).json({ error: 'El turno ya está cerrado.' });
  if (!esImporteDeCaja(contado)) {
    return res.status(400).json({ error: 'Lo contado tiene que ser un número, 0 o más.' });
  }

  withTransaction(() => {
    const esperado = redondear2(SQL_SALDO_CUENTA.get(turno.cuenta_tesoreria_id).saldo);
    db.prepare(
      `UPDATE turnos_caja
          SET estado = 'cerrado', cerrado_en = datetime('now'), cerrado_por = ?, esperado_cierre = ?,
              contado_cierre = ?, hasta_movimiento_id = ?, nota = COALESCE(?, nota)
        WHERE id = ?`
    ).run(req.usuario.id, esperado, contado, SQL_ULTIMO_MOVIMIENTO_TESORERIA.get().id, nota?.trim() || null, turno.id);
    ajustarArqueo(
      turno.cuenta_tesoreria_id,
      contado - esperado,
      `Diferencia de arqueo al cerrar la caja (turno #${turno.id})`,
      organizacionId
    );
    auditar(req, {
      accion: 'cambiar_estado',
      entidad: 'cuenta_tesoreria',
      entidad_id: turno.cuenta_tesoreria_id,
      operacion_tipo: 'turno_caja',
      operacion_id: turno.id,
      detalle: `Cerró la caja "${turno.cuenta}" (turno #${turno.id}): esperado $${esperado}, contado $${contado}`
    });
  });
  res.json(resumenTurno(turnoDeLaEmpresa(turno.id, organizacionId)));
});

// Lo que se puede vender desde el mostrador: cada producto activo sin
// variantes, y cada variante activa como un ítem propio (con su SKU, que es
// lo que lee el lector de código de barras). Precio de la lista
// predeterminada, con la misma cadena que la pantalla de ventas (variante →
// precio propio de la variante → producto), y stock del depósito
// predeterminado, que es de donde sale una venta de mostrador. Los planes de
// socios no están: una cuota se cobra desde Socios, colgada de su período
// (hist. §74), no como una venta suelta.
app.get('/api/pos/catalogo', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const depositoId = depositoPredeterminadoId(organizacionId);
  const listaId = db
    .prepare('SELECT id FROM listas_precios WHERE es_predeterminada = 1 AND organizacion_id = ?')
    .get(organizacionId)?.id;
  const productos = db
    .prepare(
      `SELECT productos.id AS producto_id, NULL AS variante_id, productos.nombre, productos.sku,
              productos.precio_venta AS precio, COALESCE(stock_por_deposito.cantidad, 0) AS stock,
              categorias.nombre AS categoria, productos.unidad, productos.tipo
         FROM productos
         LEFT JOIN stock_por_deposito
           ON stock_por_deposito.producto_id = productos.id AND stock_por_deposito.deposito_id = ?
         LEFT JOIN categorias ON categorias.id = productos.categoria_id
        WHERE productos.organizacion_id = ? AND productos.activo = 1
          AND NOT EXISTS (SELECT 1 FROM producto_variantes
                           WHERE producto_variantes.producto_id = productos.id AND producto_variantes.activo = 1)
          AND NOT EXISTS (SELECT 1 FROM planes_socio WHERE planes_socio.producto_id = productos.id)`
    )
    .all(depositoId, organizacionId);
  const variantes = db
    .prepare(
      `SELECT productos.id AS producto_id, producto_variantes.id AS variante_id, productos.nombre,
              producto_variantes.sku,
              COALESCE(variante_precios.precio, producto_variantes.precio_venta, productos.precio_venta) AS precio,
              COALESCE(stock_variante_por_deposito.cantidad, 0) AS stock, categorias.nombre AS categoria,
              productos.unidad, productos.tipo
         FROM producto_variantes
         JOIN productos ON productos.id = producto_variantes.producto_id
         LEFT JOIN variante_precios
           ON variante_precios.variante_id = producto_variantes.id AND variante_precios.lista_precio_id = ?
         LEFT JOIN stock_variante_por_deposito
           ON stock_variante_por_deposito.variante_id = producto_variantes.id
          AND stock_variante_por_deposito.deposito_id = ?
         LEFT JOIN categorias ON categorias.id = productos.categoria_id
        WHERE productos.organizacion_id = ? AND productos.activo = 1 AND producto_variantes.activo = 1
          AND NOT EXISTS (SELECT 1 FROM planes_socio WHERE planes_socio.producto_id = productos.id)`
    )
    .all(listaId ?? null, depositoId, organizacionId)
    .map((v) => ({ ...v, nombre: `${v.nombre} — ${combinacionVariante(v.variante_id)}` }));
  // Un servicio no tiene tope: stock null.
  res.json(
    [...productos, ...variantes]
      .map((i) => (i.tipo === 'servicio' ? { ...i, stock: null } : i))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  );
});

// Venta de mostrador: la venta y sus cobros (uno o varios medios) en una sola
// transacción, colgada del turno. Los cobros no pueden pasarse del total (el
// vuelto lo calcula la pantalla); si suman menos, el resto queda en la cuenta
// corriente del cliente, así que hace falta un cliente de verdad: a
// "Consumidor final" no se le fía.
app.post('/api/pos/ventas', (req, res) => {
  const { turno_caja_id, cliente_id, items, cobros = [] } = req.body;
  const organizacionId = req.usuario.organizacion_id;
  const turno = turnoDeLaEmpresa(Number(turno_caja_id), organizacionId);
  if (!turno || turno.estado !== 'abierto') {
    return res.status(400).json({ error: 'Abrí la caja antes de vender.' });
  }
  const errorItems = validarItemsVenta(items);
  if (errorItems) return res.status(400).json({ error: errorItems });
  exigirLugarEnPlan(organizacionId, 'ventas_mes');
  const errorStock = validarStockDisponible(items, depositoPredeterminadoId(organizacionId), organizacionId);
  if (errorStock) return res.status(400).json({ error: errorStock });

  if (!Array.isArray(cobros)) return res.status(400).json({ error: 'Los cobros no son válidos.' });
  const buscarCuenta = db.prepare('SELECT 1 FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?');
  for (const cobro of cobros) {
    if (!esNumeroValido(cobro?.importe) || !(cobro.importe > 0)) {
      return res.status(400).json({ error: 'Cada cobro tiene que tener un importe mayor a 0.' });
    }
    if (!buscarCuenta.get(Number(cobro.cuenta_tesoreria_id), organizacionId)) {
      return res.status(400).json({ error: 'La cuenta de tesorería de un cobro no existe.' });
    }
  }
  const total = redondear2(items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0));
  const cobrado = redondear2(cobros.reduce((acc, c) => acc + c.importe, 0));
  if (cobrado > total) {
    return res.status(400).json({ error: 'Los cobros superan el total de la venta.' });
  }
  // Tampoco se le fía si llega el id del propio "Consumidor final".
  const esConsumidorFinal =
    cliente_id &&
    db.prepare('SELECT nombre FROM clientes WHERE id = ? AND organizacion_id = ?').get(Number(cliente_id), organizacionId)
      ?.nombre === CONSUMIDOR_FINAL;
  if (cobrado < total && (!cliente_id || esConsumidorFinal)) {
    return res.status(400).json({ error: 'Para dejar saldo en cuenta corriente, elegí un cliente.' });
  }

  let ventaId;
  try {
    ventaId = withTransaction(() => {
      const id = crearVenta({
        cliente: cliente_id ? undefined : CONSUMIDOR_FINAL,
        cliente_id,
        items,
        organizacion_id: organizacionId
      });
      const { cliente_id: clienteId } = db.prepare('SELECT cliente_id FROM ventas WHERE id = ?').get(id);
      db.prepare('UPDATE ventas SET turno_caja_id = ? WHERE id = ?').run(turno.id, id);
      auditar(req, {
        accion: 'crear',
        entidad: 'venta',
        entidad_id: id,
        operacion_tipo: 'turno_caja',
        operacion_id: turno.id,
        detalle: `Venta #${id} desde el punto de venta (turno #${turno.id})`
      });
      for (const cobro of cobros) {
        const cobroId = registrarCobro(id, clienteId, cobro.importe, Number(cobro.cuenta_tesoreria_id), 'Punto de venta', organizacionId);
        auditar(req, {
          accion: 'crear',
          entidad: 'cobro',
          entidad_id: cobroId,
          operacion_tipo: 'venta',
          operacion_id: id,
          detalle: `Cobro #${cobroId} de $${cobro.importe} sobre la venta #${id}`
        });
      }
      return id;
    });
  } catch (err) {
    return res.status(400).json({ error: mensajeDeError(err) });
  }
  res.status(201).json({ id: ventaId, total, cobrado });
});

/* ---------- Socios, planes y cuotas (CLAUDE.md §29, hist. §74 y §75) ---------- */

// El módulo `socios` (ver planes_socio y las tablas que la siguen en
// schema.sql). El socio es un cliente; cada plan es un servicio del catálogo
// con un precio por duración, y cada cuota es una venta de ese servicio: la
// cobran los cobros de siempre, y la ven las cuentas corrientes, la caja y los
// reportes sin saber que este módulo existe. Un socio puede hacer varios planes
// a la vez (inscripciones_socio), cada uno con su ciclo y sus cuotas, y los
// descuentos (descuentos_socio) bajan el precio de cada cuota al generarla.
//
// Las cuotas se generan cuando se mira a un socio (el listado, la ficha, el
// ingreso, el cobro), sin cron: ponerCuotasAlDia() es idempotente y arma solo
// los períodos que faltan hasta hoy. "Hoy" es el día local (fechaDeHoy), el de
// la recepción, y no el de UTC.

const NOMBRES_DURACION = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 4: 'Cuatrimestral', 6: 'Semestral', 12: 'Anual' };
const MAX_MESES_PLAN = 36;
const MAX_DURACIONES_PLAN = 12;
const MAX_PLANES_SOCIO = 10;
// Cuándo se aplica un descuento (descuentos_socio.aplica, sin CHECK).
const APLICA_DESCUENTO = ['combo', 'cantidad', 'manual'];
// Un alta muy vieja haría recorrer cientos de períodos en cada consulta; un
// alta a futuro sirve para anotar a alguien que empieza la semana que viene.
const FECHA_MINIMA_SOCIO = '2000-01-01';
const DIAS_ALTA_ADELANTADA = 90;
const MAX_PERIODOS_SOCIO = 400;
const LARGOS_SOCIO = { nombre: 120, documento: 20, telefono: 40, email: 120 };
const fechaLegible = (iso) => iso.split('-').reverse().join('/');
const nombreDuracion = (meses) => NOMBRES_DURACION[meses] ?? (meses % 12 === 0 ? `${meses / 12} años` : `${meses} meses`);
const planYDuracion = (plan, meses) => `${plan} (${nombreDuracion(meses).toLowerCase()})`;

// La misma fecha n meses después; si ese mes no tiene el día (31 de enero más
// un mes), el último del mes. Se cuenta siempre desde el inicio del ciclo y no
// encadenado: el 31 de enero da 28 de febrero y después 31 de marzo.
function sumarMeses(iso, n) {
  const { y, m, d } = partesISO(iso);
  const ultimoDia = partesISO(fechaISO(y, m + n + 1, 0)).d;
  return fechaISO(y, m + n, Math.min(d, ultimoDia));
}

/* Planes y sus duraciones */

// Los planes de la empresa con sus duraciones, de la más corta a la más larga.
// Las duraciones pausadas vienen igual: un socio puede seguir en una.
function planesDeLaEmpresa(organizacionId, planId = null) {
  const planes = db
    .prepare(
      `SELECT planes_socio.id, planes_socio.producto_id, productos.nombre, productos.activo,
              (SELECT COUNT(DISTINCT inscripciones_socio.socio_id) FROM inscripciones_socio
                WHERE inscripciones_socio.plan_id = planes_socio.id
                  AND inscripciones_socio.estado = 'activa') AS socios_activos
         FROM planes_socio
         JOIN productos ON productos.id = planes_socio.producto_id
        WHERE planes_socio.organizacion_id = ? AND (? IS NULL OR planes_socio.id = ?)
        ORDER BY productos.activo DESC, productos.nombre`
    )
    .all(organizacionId, planId, planId);
  const opciones = db
    .prepare(
      `SELECT planes_socio_opciones.id, planes_socio_opciones.plan_id, planes_socio_opciones.meses,
              planes_socio_opciones.precio, planes_socio_opciones.activo
         FROM planes_socio_opciones
         JOIN planes_socio ON planes_socio.id = planes_socio_opciones.plan_id
        WHERE planes_socio.organizacion_id = ? AND (? IS NULL OR planes_socio.id = ?)
        ORDER BY planes_socio_opciones.meses`
    )
    .all(organizacionId, planId, planId);
  return planes.map((p) => ({
    ...p,
    activo: Boolean(p.activo),
    opciones: opciones
      .filter((o) => o.plan_id === p.id)
      .map((o) => ({ ...o, activo: Boolean(o.activo), duracion: nombreDuracion(o.meses) }))
  }));
}

// esIdValido primero: con un id que no es número, el "? IS NULL" de arriba
// devolvería todos los planes.
const planDeLaEmpresa = (id, organizacionId) => (esIdValido(id) ? planesDeLaEmpresa(organizacionId, id)[0] ?? null : null);

function opcionDeLaEmpresa(opcionId, organizacionId) {
  if (!esIdValido(opcionId)) return null;
  return (
    db
      .prepare(
        `SELECT planes_socio_opciones.id, planes_socio_opciones.plan_id, planes_socio_opciones.meses,
                planes_socio_opciones.precio, planes_socio_opciones.activo, productos.nombre AS plan,
                productos.activo AS plan_activo
           FROM planes_socio_opciones
           JOIN planes_socio ON planes_socio.id = planes_socio_opciones.plan_id
           JOIN productos ON productos.id = planes_socio.producto_id
          WHERE planes_socio_opciones.id = ? AND planes_socio.organizacion_id = ?`
      )
      .get(opcionId, organizacionId) ?? null
  );
}

const textoOpciones = (opciones) => opciones.map((o) => `${nombreDuracion(o.meses)} $${o.precio}`).join(', ');

// Nombre y duraciones de un plan, para el alta y la edición. Con `parcial`
// solo mira lo que viene.
function validarPlan(cuerpo, { parcial }) {
  const viene = (campo) => cuerpo?.[campo] !== undefined;
  const datos = {};
  if (!parcial || viene('nombre')) {
    const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : '';
    if (!nombre) return { error: 'El plan necesita un nombre.' };
    if (nombre.length > 80) return { error: 'El nombre del plan no puede pasar de 80 caracteres.' };
    datos.nombre = nombre;
  }
  if (!parcial || viene('opciones')) {
    const lista = cuerpo?.opciones;
    if (!Array.isArray(lista) || lista.length === 0) {
      return { error: 'El plan necesita al menos una duración con su precio.' };
    }
    if (lista.length > MAX_DURACIONES_PLAN) return { error: `Un plan puede tener hasta ${MAX_DURACIONES_PLAN} duraciones.` };
    const opciones = [];
    for (const opcion of lista) {
      if (!Number.isInteger(opcion?.meses) || opcion.meses < 1 || opcion.meses > MAX_MESES_PLAN) {
        return { error: `Cada duración tiene que ser de 1 a ${MAX_MESES_PLAN} meses.` };
      }
      // Una cuota de $0 quedaría "pendiente" para siempre: no hay cobro de $0.
      // Un plan gratis se arma con un descuento del 100%.
      if (!esNumeroValido(opcion.precio) || !(opcion.precio > 0)) {
        return { error: `El precio de "${nombreDuracion(opcion.meses)}" tiene que ser un número mayor a 0.` };
      }
      if (opciones.some((o) => o.meses === opcion.meses)) {
        return { error: `La duración "${nombreDuracion(opcion.meses)}" está dos veces.` };
      }
      opciones.push({ meses: opcion.meses, precio: redondear2(opcion.precio) });
    }
    datos.opciones = opciones.sort((a, b) => a.meses - b.meses);
  }
  if (viene('activo')) {
    if (typeof cuerpo.activo !== 'boolean') return { error: 'El estado del plan no es válido.' };
    datos.activo = cuerpo.activo ? 1 : 0;
  }
  return { datos };
}

function nombreDePlanRepetido(nombre, organizacionId, excluirPlanId = 0) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM planes_socio JOIN productos ON productos.id = planes_socio.producto_id
          WHERE planes_socio.organizacion_id = ? AND LOWER(productos.nombre) = LOWER(?) AND planes_socio.id <> ?`
      )
      .get(organizacionId, nombre, excluirPlanId)
  );
}

// Las duraciones que llegan reemplazan a las de antes: la misma cantidad de
// meses actualiza su precio, una nueva se crea y la que falta se pausa, sin
// borrarse (puede tener socios y cuotas). Va DENTRO de una transacción.
function guardarOpciones(planId, opciones) {
  const existentes = db.prepare('SELECT id, meses FROM planes_socio_opciones WHERE plan_id = ?').all(planId);
  const actualizar = db.prepare('UPDATE planes_socio_opciones SET precio = ?, activo = 1 WHERE id = ?');
  const insertar = db.prepare('INSERT INTO planes_socio_opciones (plan_id, meses, precio) VALUES (?, ?, ?)');
  const pausar = db.prepare('UPDATE planes_socio_opciones SET activo = 0 WHERE id = ?');
  for (const opcion of opciones) {
    const existente = existentes.find((e) => e.meses === opcion.meses);
    if (existente) actualizar.run(opcion.precio, existente.id);
    else insertar.run(planId, opcion.meses, opcion.precio);
  }
  for (const existente of existentes) {
    if (!opciones.some((o) => o.meses === existente.meses)) pausar.run(existente.id);
  }
}

// El precio del servicio en el catálogo es el de la duración más corta (lo que
// se lee "desde $…"): es solo de referencia, lo que se cobra sale de la
// duración de cada socio. Como precio_venta y el de la lista predeterminada son
// el mismo dato (CLAUDE.md §18), van los dos. Va DENTRO de una transacción.
function sincronizarPrecioPlan(planId, productoId, organizacionId) {
  const { precio } = db
    .prepare('SELECT precio FROM planes_socio_opciones WHERE plan_id = ? AND activo = 1 ORDER BY meses LIMIT 1')
    .get(planId);
  db.prepare('UPDATE productos SET precio_venta = ? WHERE id = ?').run(precio, productoId);
  db.prepare(
    `UPDATE producto_precios SET precio = ?
      WHERE producto_id = ?
        AND lista_precio_id = (SELECT id FROM listas_precios WHERE es_predeterminada = 1 AND organizacion_id = ?)`
  ).run(precio, productoId, organizacionId);
}

/* Descuentos */

function descuentosDeLaEmpresa(organizacionId) {
  const descuentos = db
    .prepare(
      `SELECT id, nombre, porcentaje, aplica, minimo_planes, activo FROM descuentos_socio
        WHERE organizacion_id = ? ORDER BY activo DESC, nombre`
    )
    .all(organizacionId);
  const planes = db
    .prepare(
      `SELECT descuento_socio_planes.descuento_id, planes_socio.id, productos.nombre
         FROM descuento_socio_planes
         JOIN planes_socio ON planes_socio.id = descuento_socio_planes.plan_id
         JOIN productos ON productos.id = planes_socio.producto_id
        WHERE planes_socio.organizacion_id = ?
        ORDER BY productos.nombre`
    )
    .all(organizacionId);
  return descuentos.map((d) => ({
    ...d,
    activo: Boolean(d.activo),
    planes: planes.filter((p) => p.descuento_id === d.id).map(({ id, nombre }) => ({ id, nombre }))
  }));
}

// El descuento que le toca a un plan, según los planes que el socio tiene
// activos y su descuento a mano: el mayor de los que se aplican, nunca la suma.
function mejorDescuento(planId, planesActivos, descuentoManualId, descuentos) {
  let mejor = null;
  for (const d of descuentos) {
    if (!d.activo) continue;
    const seAplica =
      (d.aplica === 'manual' && d.id === descuentoManualId) ||
      (d.aplica === 'cantidad' && planesActivos.size >= d.minimo_planes) ||
      (d.aplica === 'combo' && d.planes.some((p) => p.id === planId) && d.planes.every((p) => planesActivos.has(p.id)));
    if (seAplica && (!mejor || d.porcentaje > mejor.porcentaje)) mejor = d;
  }
  return mejor;
}

const conDescuento = (precio, porcentaje) => redondear2(precio * (1 - porcentaje / 100));
const resumenDescuento = (d) => (d ? { id: d.id, nombre: d.nombre, porcentaje: d.porcentaje } : null);
function textoAplica(d) {
  if (d.aplica === 'combo') return `combo de ${d.planes.map((p) => p.nombre).join(' + ')}`;
  if (d.aplica === 'cantidad') return `desde ${d.minimo_planes} planes`;
  return 'a mano';
}

function validarDescuento(cuerpo, organizacionId) {
  const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : '';
  if (!nombre) return { error: 'El descuento necesita un nombre.' };
  if (nombre.length > 80) return { error: 'El nombre del descuento no puede pasar de 80 caracteres.' };
  if (!esNumeroValido(cuerpo.porcentaje) || !(cuerpo.porcentaje > 0) || cuerpo.porcentaje > 100) {
    return { error: 'El porcentaje tiene que ser un número de más de 0 y hasta 100.' };
  }
  if (!APLICA_DESCUENTO.includes(cuerpo.aplica)) return { error: 'Elegí cuándo se aplica el descuento.' };
  const datos = { nombre, porcentaje: redondear2(cuerpo.porcentaje), aplica: cuerpo.aplica, minimo_planes: null, planes: [] };
  if (cuerpo.aplica === 'combo') {
    const ids = cuerpo.planes;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length < 2 || ids.length > MAX_PLANES_SOCIO) {
      return { error: 'Un combo necesita al menos dos planes distintos.' };
    }
    const planes = planesDeLaEmpresa(organizacionId);
    for (const id of ids) {
      const plan = planes.find((p) => p.id === id);
      if (!plan) return { error: 'Uno de los planes del combo no existe.' };
      datos.planes.push({ id: plan.id, nombre: plan.nombre });
    }
  }
  if (cuerpo.aplica === 'cantidad') {
    const minimo = cuerpo.minimo_planes;
    if (!Number.isInteger(minimo) || minimo < 2 || minimo > MAX_PLANES_SOCIO) {
      return { error: `Indicá desde cuántos planes se aplica: de 2 a ${MAX_PLANES_SOCIO}.` };
    }
    datos.minimo_planes = minimo;
  }
  return { datos };
}

function nombreDeDescuentoRepetido(nombre, organizacionId, excluirId = 0) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM descuentos_socio WHERE organizacion_id = ? AND LOWER(nombre) = LOWER(?) AND id <> ?')
      .get(organizacionId, nombre, excluirId)
  );
}

// El descuento a mano que se le elige a un socio: ninguno (null) o uno de la
// empresa, de los que se aplican a mano y están activos.
function descuentoManualPedido(valor, organizacionId) {
  if (valor == null || valor === '') return { id: null };
  const descuento = esIdValido(valor)
    ? db
        .prepare("SELECT id, nombre FROM descuentos_socio WHERE id = ? AND organizacion_id = ? AND aplica = 'manual' AND activo = 1")
        .get(valor, organizacionId)
    : null;
  return descuento ? { id: descuento.id, nombre: descuento.nombre } : { error: 'Ese descuento no existe o no se elige a mano.' };
}

/* Inscripciones y cuotas */

const SELECT_INSCRIPCION = `
  SELECT inscripciones_socio.id, inscripciones_socio.socio_id, inscripciones_socio.plan_id,
         inscripciones_socio.opcion_id, inscripciones_socio.fecha_alta, inscripciones_socio.ciclo_desde,
         inscripciones_socio.cobrar_desde, inscripciones_socio.estado, inscripciones_socio.fecha_baja,
         planes_socio.producto_id, productos.nombre AS plan, planes_socio_opciones.meses,
         planes_socio_opciones.precio AS precio_lista
    FROM inscripciones_socio
    JOIN socios ON socios.id = inscripciones_socio.socio_id
    JOIN planes_socio ON planes_socio.id = inscripciones_socio.plan_id
    JOIN productos ON productos.id = planes_socio.producto_id
    JOIN planes_socio_opciones ON planes_socio_opciones.id = inscripciones_socio.opcion_id`;

// Los períodos que le faltan a un ciclo hasta hoy, para las cuotas de socios y
// las de los abonos (hist. §79): la misma cuenta, no dos. Se cuentan desde
// cicloDesde: cada cuota que ya existe (`existentes`, desde → meses) ocupa sus
// meses, y cada una nueva usa `meses`, así un cambio de duración rige desde la
// cuota siguiente. Lo que termina antes de cobrarDesde no se cobra.
function periodosPendientes({ cicloDesde, cobrarDesde, meses, existentes, hoy }) {
  const pendientes = [];
  let corridos = 0;
  for (let vuelta = 0; vuelta < MAX_PERIODOS_SOCIO; vuelta++) {
    const desde = sumarMeses(cicloDesde, corridos);
    if (desde > hoy) break;
    if (existentes.has(desde)) {
      corridos += existentes.get(desde);
      continue;
    }
    corridos += meses;
    const hasta = sumarDias(sumarMeses(cicloDesde, corridos), -1);
    if (hasta >= cobrarDesde) pendientes.push({ desde, hasta });
  }
  return pendientes;
}

const planesActivosDe = (socioId) =>
  new Set(
    db
      .prepare("SELECT plan_id FROM inscripciones_socio WHERE socio_id = ? AND estado = 'activa'")
      .all(socioId)
      .map((f) => f.plan_id)
  );

// Arma las cuotas que le faltan a un plan de un socio hasta hoy, con los
// períodos de periodosPendientes(): cada una nueva usa la duración de hoy. El
// descuento es el que le toca hoy con los planes que tiene activos. La venta lleva la fecha en que empieza el período y vence
// ese mismo día: la cuota se paga por adelantado. Va DENTRO de una transacción,
// después de anotar todos los planes del socio (un combo los mira a todos).
function generarCuotasDe(inscripcionId, hoy) {
  const plan = db.prepare(`${SELECT_INSCRIPCION} WHERE inscripciones_socio.id = ?`).get(inscripcionId);
  const socio = db.prepare('SELECT id, cliente_id, numero, descuento_id, organizacion_id FROM socios WHERE id = ?').get(plan.socio_id);
  const descuento = mejorDescuento(plan.plan_id, planesActivosDe(socio.id), socio.descuento_id, descuentosDeLaEmpresa(socio.organizacion_id));
  const porcentaje = descuento?.porcentaje ?? 0;
  const existentes = new Map(
    db
      .prepare('SELECT desde, meses FROM cuotas_socio WHERE inscripcion_id = ? AND desde >= ?')
      .all(plan.id, plan.ciclo_desde)
      .map((c) => [c.desde, c.meses])
  );
  const insertarCuota = db.prepare(
    `INSERT INTO cuotas_socio (inscripcion_id, opcion_id, venta_id, desde, hasta, meses, precio_lista, descuento_pct, descuento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const periodos = periodosPendientes({
    cicloDesde: plan.ciclo_desde,
    cobrarDesde: plan.cobrar_desde,
    meses: plan.meses,
    existentes,
    hoy
  });
  for (const { desde, hasta } of periodos) {
    const ventaId = crearVenta({
      cliente_id: socio.cliente_id,
      items: [{ producto_id: plan.producto_id, cantidad: 1, precio_unitario: conDescuento(plan.precio_lista, porcentaje) }],
      fecha: desde,
      organizacion_id: socio.organizacion_id
    });
    insertarCuota.run(plan.id, plan.opcion_id, ventaId, desde, hasta, plan.meses, plan.precio_lista, porcentaje, descuento?.id ?? null);
    // Actor sistema y sin usuario: nadie la cargó, la generó Nexo al empezar
    // el período (CLAUDE.md §22).
    registrarAuditoria({
      actor: 'sistema',
      accion: 'crear',
      entidad: 'venta',
      entidad_id: ventaId,
      operacion_tipo: 'socio',
      operacion_id: socio.id,
      detalle:
        `Cuota del socio N° ${socio.numero}, ${planYDuracion(plan.plan, plan.meses)}, del ${fechaLegible(desde)} al ${fechaLegible(hasta)}` +
        (porcentaje ? `, con ${porcentaje}% de descuento (${descuento.nombre})` : ''),
      organizacion_id: socio.organizacion_id
    });
  }
}

// Genera lo que falte a los planes activos de la empresa, o de un socio. Solo
// abre una transacción si a alguno le falta el período de hoy, que es lo raro:
// el listado se mira muchas veces por día.
function ponerCuotasAlDia(organizacionId, socioId = null) {
  const hoy = fechaDeHoy();
  const pendientes = db
    .prepare(
      `SELECT inscripciones_socio.id FROM inscripciones_socio
         JOIN socios ON socios.id = inscripciones_socio.socio_id
        WHERE socios.organizacion_id = ? AND (? IS NULL OR socios.id = ?)
          AND inscripciones_socio.estado = 'activa' AND inscripciones_socio.ciclo_desde <= ?
          AND NOT EXISTS (SELECT 1 FROM cuotas_socio
                           WHERE cuotas_socio.inscripcion_id = inscripciones_socio.id
                             AND cuotas_socio.desde >= inscripciones_socio.ciclo_desde
                             AND cuotas_socio.hasta >= ?)`
    )
    .all(organizacionId, socioId, socioId, hoy, hoy);
  if (pendientes.length === 0) return;
  withTransaction(() => {
    for (const { id } of pendientes) generarCuotasDe(id, hoy);
  });
}

// Lo que se debe de cada cuota: el neto de su venta (lo devuelto ya no se
// reclama) menos lo cobrado. La de una venta anulada no se debe: quedó
// bonificada. El plan es el de la duración de la cuota, por si después cambió.
const SELECT_CUOTAS = `
  SELECT cuotas_socio.id, inscripciones_socio.socio_id, cuotas_socio.inscripcion_id, cuotas_socio.venta_id,
         cuotas_socio.desde, cuotas_socio.hasta, cuotas_socio.meses, cuotas_socio.precio_lista,
         cuotas_socio.descuento_pct, descuentos_socio.nombre AS descuento, productos.nombre AS plan,
         ventas.estado AS estado_venta,
         (SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0)
            FROM venta_items WHERE venta_items.venta_id = ventas.id) - ${SUBQUERY_DEVUELTO_VENTA} AS importe,
         (SELECT COALESCE(SUM(cobros.importe), 0) FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado
    FROM cuotas_socio
    JOIN inscripciones_socio ON inscripciones_socio.id = cuotas_socio.inscripcion_id
    JOIN socios ON socios.id = inscripciones_socio.socio_id
    JOIN ventas ON ventas.id = cuotas_socio.venta_id
    JOIN planes_socio_opciones ON planes_socio_opciones.id = cuotas_socio.opcion_id
    JOIN planes_socio ON planes_socio.id = planes_socio_opciones.plan_id
    JOIN productos ON productos.id = planes_socio.producto_id
    LEFT JOIN descuentos_socio ON descuentos_socio.id = cuotas_socio.descuento_id`;

function decorarCuota({ estado_venta, ...cuota }) {
  const importe = redondear2(cuota.importe);
  const cobrado = redondear2(cuota.cobrado);
  const saldo = estado_venta === 'activa' && importe - cobrado > 0.005 ? redondear2(importe - cobrado) : 0;
  let estado = 'pagada';
  if (estado_venta !== 'activa') estado = 'bonificada';
  else if (importe === 0) estado = 'sin_cargo';
  else if (saldo > 0) estado = cobrado > 0 ? 'parcial' : 'pendiente';
  return { ...cuota, duracion: nombreDuracion(cuota.meses), importe, cobrado, saldo, estado };
}

const SELECT_SOCIO = `
  SELECT socios.id, socios.numero, socios.cliente_id, clientes.nombre, clientes.documento,
         clientes.telefono, clientes.email, socios.fecha_alta, socios.descuento_id,
         descuentos_socio.nombre AS descuento, descuentos_socio.porcentaje AS descuento_porcentaje,
         (SELECT MAX(fecha) FROM ingresos_socio WHERE ingresos_socio.socio_id = socios.id) AS ultimo_ingreso
    FROM socios
    JOIN clientes ON clientes.id = socios.cliente_id
    LEFT JOIN descuentos_socio ON descuentos_socio.id = socios.descuento_id`;

// En qué está un socio, para la lista y la recepción:
// - de baja: no tiene ningún plan activo;
// - debe: alguna cuota con saldo, que vence el día en que empieza su período;
// - por empezar: ningún plan activo cubre hoy (todos arrancan a futuro);
// - al día: hasta el primer vencimiento de los planes que cubren hoy.
// La deuda se informa también de un socio de baja: sigue en su cuenta. Cada
// plan lleva el precio que va a pagar en su próxima cuota, con su descuento.
function conSituacion(socio, inscripciones, cuotas, descuentos, hoy) {
  const planesActivos = new Set(inscripciones.filter((i) => i.estado === 'activa').map((i) => i.plan_id));
  const planes = inscripciones.map((i) => {
    const descuento = i.estado === 'activa' ? mejorDescuento(i.plan_id, planesActivos, socio.descuento_id, descuentos) : null;
    return {
      id: i.id,
      plan_id: i.plan_id,
      plan: i.plan,
      opcion_id: i.opcion_id,
      meses: i.meses,
      duracion: nombreDuracion(i.meses),
      precio_lista: i.precio_lista,
      descuento: resumenDescuento(descuento),
      precio: conDescuento(i.precio_lista, descuento?.porcentaje ?? 0),
      fecha_alta: i.fecha_alta,
      ciclo_desde: i.ciclo_desde,
      estado: i.estado,
      fecha_baja: i.fecha_baja,
      cubierto_hasta: cuotas.filter((c) => c.inscripcion_id === i.id).reduce((max, c) => (max && max > c.hasta ? max : c.hasta), null)
    };
  });
  const activos = planes.filter((p) => p.estado === 'activa');
  const vigentes = activos.filter((p) => p.cubierto_hasta >= hoy);
  const impagas = cuotas.filter((c) => c.saldo > 0);
  const deuda = redondear2(impagas.reduce((acc, c) => acc + c.saldo, 0));
  let situacion = 'al_dia';
  if (activos.length === 0) situacion = 'baja';
  else if (deuda > 0) situacion = 'debe';
  else if (vigentes.length === 0) situacion = 'por_empezar';
  const primera = (fechas) => fechas.filter(Boolean).sort()[0] ?? null;
  return {
    ...socio,
    planes,
    cuotas,
    situacion,
    deuda,
    cuotas_impagas: impagas.length,
    debe_desde: impagas[0]?.desde ?? null,
    al_dia_hasta: situacion === 'al_dia' ? primera(vigentes.map((p) => p.cubierto_hasta)) : null,
    empieza: situacion === 'por_empezar' ? primera(activos.map((p) => p.ciclo_desde)) : null,
    fecha_baja: situacion === 'baja' ? (planes.map((p) => p.fecha_baja).filter(Boolean).sort().at(-1) ?? null) : null
  };
}

function sociosConSituacion(organizacionId, socioId = null) {
  const hoy = fechaDeHoy();
  const filtro = 'WHERE socios.organizacion_id = ? AND (? IS NULL OR socios.id = ?)';
  const parametros = [organizacionId, socioId, socioId];
  const socios = db.prepare(`${SELECT_SOCIO} ${filtro} ORDER BY socios.numero`).all(...parametros);
  const agrupar = (filas) => {
    const porSocio = new Map();
    for (const fila of filas) {
      if (!porSocio.has(fila.socio_id)) porSocio.set(fila.socio_id, []);
      porSocio.get(fila.socio_id).push(fila);
    }
    return porSocio;
  };
  const inscripciones = agrupar(
    db.prepare(`${SELECT_INSCRIPCION} ${filtro} ORDER BY inscripciones_socio.estado, productos.nombre, inscripciones_socio.id`).all(...parametros)
  );
  const cuotas = agrupar(
    db.prepare(`${SELECT_CUOTAS} ${filtro} ORDER BY cuotas_socio.desde, cuotas_socio.id`).all(...parametros).map(decorarCuota)
  );
  const descuentos = descuentosDeLaEmpresa(organizacionId);
  return socios.map((s) => conSituacion(s, inscripciones.get(s.id) ?? [], cuotas.get(s.id) ?? [], descuentos, hoy));
}

// La ficha: el socio con sus planes, todas sus cuotas (la más nueva primero),
// sus últimos ingresos y el saldo de toda su cuenta corriente, que puede tener
// deudas que no son cuotas (algo que compró y no pagó).
function detalleSocio(socioId, organizacionId) {
  const [socio] = sociosConSituacion(organizacionId, socioId);
  if (!socio) return null;
  const ingresos = db
    .prepare(
      `SELECT ingresos_socio.id, ingresos_socio.fecha, ingresos_socio.al_dia, ingresos_socio.deuda,
              usuarios.nombre AS usuario
         FROM ingresos_socio JOIN usuarios ON usuarios.id = ingresos_socio.usuario_id
        WHERE ingresos_socio.socio_id = ?
        ORDER BY ingresos_socio.id DESC LIMIT 30`
    )
    .all(socioId)
    .map((i) => ({ ...i, al_dia: Boolean(i.al_dia) }));
  const saldoCuenta = db.prepare('SELECT saldo FROM saldo_cc_clientes WHERE cliente_id = ?').get(socio.cliente_id)?.saldo ?? 0;
  return { ...socio, cuotas: [...socio.cuotas].reverse(), ingresos, saldo_cuenta: redondear2(saldoCuenta) };
}

function socioDeLaEmpresa(id, organizacionId) {
  if (!esIdValido(id)) return null;
  return db
    .prepare(
      `SELECT socios.*, clientes.nombre FROM socios JOIN clientes ON clientes.id = socios.cliente_id
        WHERE socios.id = ? AND socios.organizacion_id = ?`
    )
    .get(id, organizacionId);
}

// Los planes que se piden para un socio ([{ opcion_id }]): cada duración tiene
// que ser de la empresa y estar ofreciéndose, y no puede haber dos del mismo
// plan. Devuelve { error } o { opciones }.
function opcionesPedidas(lista, organizacionId) {
  if (!Array.isArray(lista) || lista.length === 0) return { error: 'Elegí al menos un plan.' };
  if (lista.length > MAX_PLANES_SOCIO) return { error: `Un socio puede tener hasta ${MAX_PLANES_SOCIO} planes.` };
  const opciones = [];
  for (const pedido of lista) {
    const opcion = opcionDeLaEmpresa(pedido?.opcion_id, organizacionId);
    if (!opcion) return { error: 'Uno de los planes elegidos no existe.' };
    if (!opcion.plan_activo || !opcion.activo) {
      return { error: `${planYDuracion(opcion.plan, opcion.meses)} no se está ofreciendo: elegí otro.` };
    }
    if (opciones.some((o) => o.plan_id === opcion.plan_id)) return { error: `"${opcion.plan}" está dos veces.` };
    opciones.push(opcion);
  }
  return { opciones };
}

// La fecha desde la que se hace un plan. validarFecha mira solo el formato: un
// 2026-13-01 lo pasa, y de él salen los vencimientos de todas las cuotas. Una
// fecha real vuelve igual de sumarDias.
function fechaDeAlta(valor, hoy) {
  const fecha = valor == null || valor === '' ? hoy : validarFecha(valor);
  if (!fecha || sumarDias(fecha, 0) !== fecha) return { error: 'La fecha de alta no es válida.' };
  if (fecha < FECHA_MINIMA_SOCIO) return { error: 'La fecha de alta es demasiado vieja.' };
  if (fecha > sumarDias(hoy, DIAS_ALTA_ADELANTADA)) {
    return { error: `La fecha de alta puede ser hasta ${DIAS_ALTA_ADELANTADA} días para adelante.` };
  }
  return { fecha };
}

// Anota un plan de un socio; sus cuotas las arma después generarCuotasDe. Va
// DENTRO de una transacción.
function inscribir(socioId, opcion, desde, hoy) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO inscripciones_socio (socio_id, plan_id, opcion_id, fecha_alta, ciclo_desde, cobrar_desde)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(socioId, opcion.plan_id, opcion.id, desde, desde, maxISO(desde, hoy));
  return Number(lastInsertRowid);
}

// Vuelve a activar un plan dado de baja: un ciclo nuevo hoy, o al terminar el
// período que ya tenía pagado, sin cobrar los meses de baja. Devuelve desde
// cuándo cobra. Va DENTRO de una transacción.
function reactivarInscripcion(inscripcionId, hoy) {
  const { ciclo_desde: cicloDesde } = db.prepare('SELECT ciclo_desde FROM inscripciones_socio WHERE id = ?').get(inscripcionId);
  const { ultimo } = db.prepare('SELECT MAX(hasta) AS ultimo FROM cuotas_socio WHERE inscripcion_id = ?').get(inscripcionId);
  const ciclo = maxISO(hoy, ultimo ? sumarDias(ultimo, 1) : cicloDesde);
  db.prepare(
    "UPDATE inscripciones_socio SET estado = 'activa', fecha_baja = NULL, ciclo_desde = ?, cobrar_desde = ? WHERE id = ?"
  ).run(ciclo, ciclo, inscripcionId);
  return ciclo;
}

// La primera cuota de cada plan pedido, con el descuento que le tocaría, para
// mostrarla antes de confirmar. Es el mismo cálculo de generarCuotasDe:
// mejorDescuento sobre los planes que quedarían activos. `existentes` son los
// planes que el socio ya tiene, que también pueden cambiar de descuento (un
// combo que se completa): van en `cambian`.
function cotizar(opciones, existentes, descuentoManualId, organizacionId) {
  const descuentos = descuentosDeLaEmpresa(organizacionId);
  const antes = new Set(existentes.map((e) => e.plan_id));
  const despues = new Set([...antes, ...opciones.map((o) => o.plan_id)]);
  const lineas = opciones.map((o) => {
    const descuento = mejorDescuento(o.plan_id, despues, descuentoManualId, descuentos);
    return {
      opcion_id: o.id,
      plan_id: o.plan_id,
      plan: o.plan,
      meses: o.meses,
      duracion: nombreDuracion(o.meses),
      precio_lista: o.precio,
      descuento: resumenDescuento(descuento),
      precio: conDescuento(o.precio, descuento?.porcentaje ?? 0)
    };
  });
  const cambian = [];
  for (const e of existentes) {
    const previo = mejorDescuento(e.plan_id, antes, descuentoManualId, descuentos);
    const nuevo = mejorDescuento(e.plan_id, despues, descuentoManualId, descuentos);
    if (previo?.id === nuevo?.id) continue;
    cambian.push({
      plan: e.plan,
      duracion: nombreDuracion(e.meses),
      descuento: resumenDescuento(nuevo),
      precio: conDescuento(e.precio_lista, nuevo?.porcentaje ?? 0)
    });
  }
  return { lineas, total: redondear2(lineas.reduce((acc, l) => acc + l.precio, 0)), cambian };
}

/* Rutas: planes y descuentos */

app.get('/api/planes-socio', (req, res) => {
  res.json(planesDeLaEmpresa(req.usuario.organizacion_id));
});

// El plan nace con su servicio: el producto que vende cada cuota. El nombre y
// si se ofrece viven en el producto; el precio, en cada duración.
app.post('/api/planes-socio', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, datos } = validarPlan(req.body, { parcial: false });
  if (error) return res.status(400).json({ error });
  if (nombreDePlanRepetido(datos.nombre, organizacionId)) {
    return res.status(400).json({ error: 'Ya hay un plan con ese nombre.' });
  }
  // Su servicio es un producto activo más del catálogo (hist. §98).
  exigirLugarEnPlan(organizacionId, 'productos');
  const planId = withTransaction(() => {
    const { lastInsertRowid: productoId } = db
      .prepare(
        `INSERT INTO productos (nombre, precio_venta, organizacion_id, unidad, tipo)
         VALUES (?, ?, ?, 'unidad', 'servicio')`
      )
      .run(datos.nombre, datos.opciones[0].precio, organizacionId);
    const id = Number(
      db.prepare('INSERT INTO planes_socio (producto_id, organizacion_id) VALUES (?, ?)').run(productoId, organizacionId).lastInsertRowid
    );
    guardarOpciones(id, datos.opciones);
    auditar(req, {
      accion: 'crear',
      entidad: 'producto',
      entidad_id: Number(productoId),
      operacion_tipo: 'plan_socio',
      operacion_id: id,
      detalle: `Plan de socios "${datos.nombre}" creado: ${textoOpciones(datos.opciones)}`
    });
    return id;
  });
  res.status(201).json(planDeLaEmpresa(planId, organizacionId));
});

// Cambiar un precio o una duración rige desde la próxima cuota: las que ya se
// generaron son ventas con su precio congelado (CLAUDE.md §8). Pausar un plan o
// una duración no da de baja a nadie: deja de ofrecerse a los socios nuevos.
app.patch('/api/planes-socio/:id', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const plan = planDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado.' });
  const { error, datos } = validarPlan(req.body, { parcial: true });
  if (error) return res.status(400).json({ error });
  if (datos.nombre && nombreDePlanRepetido(datos.nombre, organizacionId, plan.id)) {
    return res.status(400).json({ error: 'Ya hay un plan con ese nombre.' });
  }
  const anterior = { nombre: plan.nombre, activo: plan.activo ? 1 : 0, opciones: textoOpciones(plan.opciones.filter((o) => o.activo)) };
  const nuevo = {
    nombre: datos.nombre ?? anterior.nombre,
    activo: datos.activo ?? anterior.activo,
    opciones: datos.opciones ? textoOpciones(datos.opciones) : anterior.opciones
  };
  const cambios = diffCampos(anterior, nuevo, ['nombre', 'activo', 'opciones']);
  if (cambios) {
    withTransaction(() => {
      db.prepare('UPDATE productos SET nombre = ?, activo = ? WHERE id = ?').run(nuevo.nombre, nuevo.activo, plan.producto_id);
      if (datos.opciones) guardarOpciones(plan.id, datos.opciones);
      sincronizarPrecioPlan(plan.id, plan.producto_id, organizacionId);
      auditar(req, {
        accion: 'editar',
        entidad: 'producto',
        entidad_id: plan.producto_id,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        operacion_tipo: 'plan_socio',
        operacion_id: plan.id,
        detalle: `Plan de socios "${nuevo.nombre}" editado`
      });
    });
  }
  res.json(planDeLaEmpresa(plan.id, organizacionId));
});

// Los lee también la recepción: el alta ofrece los que se eligen a mano.
app.get('/api/descuentos-socio', (req, res) => {
  res.json(descuentosDeLaEmpresa(req.usuario.organizacion_id));
});

// Los planes de un combo se reemplazan enteros. Va DENTRO de una transacción.
function guardarPlanesDelDescuento(descuentoId, planes) {
  db.prepare('DELETE FROM descuento_socio_planes WHERE descuento_id = ?').run(descuentoId);
  const insertar = db.prepare('INSERT INTO descuento_socio_planes (descuento_id, plan_id) VALUES (?, ?)');
  for (const plan of planes) insertar.run(descuentoId, plan.id);
}

// Los descuentos son configuración del negocio: se auditan como entidad
// organizacion, con operacion_tipo descuento_socio, sin reconstruir auditoria.
app.post('/api/descuentos-socio', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, datos } = validarDescuento(req.body, organizacionId);
  if (error) return res.status(400).json({ error });
  if (nombreDeDescuentoRepetido(datos.nombre, organizacionId)) {
    return res.status(400).json({ error: 'Ya hay un descuento con ese nombre.' });
  }
  const id = withTransaction(() => {
    const nuevoId = Number(
      db
        .prepare(
          `INSERT INTO descuentos_socio (nombre, porcentaje, aplica, minimo_planes, organizacion_id)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(datos.nombre, datos.porcentaje, datos.aplica, datos.minimo_planes, organizacionId).lastInsertRowid
    );
    guardarPlanesDelDescuento(nuevoId, datos.planes);
    auditar(req, {
      accion: 'crear',
      entidad: 'organizacion',
      entidad_id: organizacionId,
      operacion_tipo: 'descuento_socio',
      operacion_id: nuevoId,
      detalle: `Descuento de socios "${datos.nombre}" creado: ${datos.porcentaje}%, ${textoAplica(datos)}`
    });
    return nuevoId;
  });
  res.status(201).json(descuentosDeLaEmpresa(organizacionId).find((d) => d.id === id));
});

// Con solo { activo } lo pausa o lo vuelve a activar; si no, lo reemplaza
// entero, como lo manda el formulario. Rige desde la próxima cuota.
app.patch('/api/descuentos-socio/:id', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const descuento = descuentosDeLaEmpresa(organizacionId).find((d) => d.id === Number(req.params.id));
  if (!descuento) return res.status(404).json({ error: 'Descuento no encontrado.' });
  const soloEstado = req.body && Object.keys(req.body).length === 1 && Object.hasOwn(req.body, 'activo');
  let datos;
  if (soloEstado) {
    if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'El estado del descuento no es válido.' });
    datos = { ...descuento, activo: req.body.activo };
  } else {
    const validado = validarDescuento(req.body, organizacionId);
    if (validado.error) return res.status(400).json({ error: validado.error });
    datos = { ...validado.datos, activo: descuento.activo };
    if (nombreDeDescuentoRepetido(datos.nombre, organizacionId, descuento.id)) {
      return res.status(400).json({ error: 'Ya hay un descuento con ese nombre.' });
    }
    // Uno que se elige a mano y ya tienen socios no pasa a ser automático:
    // esos socios quedarían con un descuento elegido que no se les aplica.
    const conSocios = db.prepare('SELECT COUNT(*) AS n FROM socios WHERE descuento_id = ?').get(descuento.id).n;
    if (descuento.aplica === 'manual' && datos.aplica !== 'manual' && conSocios > 0) {
      const quienes = conSocios === 1 ? 'Un socio lo tiene' : `${conSocios} socios lo tienen`;
      return res.status(400).json({ error: `${quienes} elegido a mano: para un combo, creá otro descuento.` });
    }
  }
  const campos = (d) => ({ nombre: d.nombre, porcentaje: d.porcentaje, aplica: textoAplica(d), activo: d.activo ? 1 : 0 });
  const cambios = diffCampos(campos(descuento), campos(datos), ['nombre', 'porcentaje', 'aplica', 'activo']);
  if (cambios) {
    let detalle = `Descuento de socios "${datos.nombre}" editado`;
    if (soloEstado) detalle = `Descuento de socios "${datos.nombre}" ${datos.activo ? 'activado' : 'pausado'}`;
    withTransaction(() => {
      db.prepare('UPDATE descuentos_socio SET nombre = ?, porcentaje = ?, aplica = ?, minimo_planes = ?, activo = ? WHERE id = ?').run(
        datos.nombre,
        datos.porcentaje,
        datos.aplica,
        datos.minimo_planes,
        datos.activo ? 1 : 0,
        descuento.id
      );
      guardarPlanesDelDescuento(descuento.id, datos.planes);
      auditar(req, {
        accion: soloEstado ? 'cambiar_estado' : 'editar',
        entidad: 'organizacion',
        entidad_id: organizacionId,
        valor_anterior: cambios.anterior,
        valor_nuevo: cambios.nuevo,
        operacion_tipo: 'descuento_socio',
        operacion_id: descuento.id,
        detalle
      });
    });
  }
  res.json(descuentosDeLaEmpresa(organizacionId).find((d) => d.id === descuento.id));
});

/* Rutas: socios */

app.get('/api/socios', (req, res) => {
  ponerCuotasAlDia(req.usuario.organizacion_id);
  // La lista no lleva las cuotas de cada uno: eso es de la ficha.
  const socios = sociosConSituacion(req.usuario.organizacion_id);
  for (const socio of socios) delete socio.cuotas;
  res.json(socios);
});

// Quién entró hoy (el día local del servidor, que es el de la recepción).
// Antes que /api/socios/:id, que si no tomaría "ingresos" como un id.
app.get('/api/socios/ingresos', (req, res) => {
  const inicioDelDia = inicioDeHoyUTC();
  const ingresos = db
    .prepare(
      `SELECT ingresos_socio.id, ingresos_socio.socio_id, ingresos_socio.fecha, ingresos_socio.al_dia,
              ingresos_socio.deuda, socios.numero, clientes.nombre, usuarios.nombre AS usuario
         FROM ingresos_socio
         JOIN socios ON socios.id = ingresos_socio.socio_id
         JOIN clientes ON clientes.id = socios.cliente_id
         JOIN usuarios ON usuarios.id = ingresos_socio.usuario_id
        WHERE socios.organizacion_id = ? AND ingresos_socio.fecha >= ?
        ORDER BY ingresos_socio.id DESC LIMIT 200`
    )
    .all(req.usuario.organizacion_id, inicioDelDia);
  res.json(ingresos.map((i) => ({ ...i, al_dia: Boolean(i.al_dia) })));
});

app.get('/api/socios/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
  ponerCuotasAlDia(organizacionId, socio.id);
  res.json(detalleSocio(socio.id, organizacionId));
});

// Lo que pagaría en la primera cuota de cada plan, con sus descuentos, antes
// de confirmar el alta o un plan nuevo. No escribe nada. Con socio_id cuenta
// también los planes que ya tiene (y su descuento a mano, si no viene otro).
app.post('/api/socios/cotizacion', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { planes, descuento_id, socio_id } = req.body ?? {};
  const { error, opciones } = opcionesPedidas(planes, organizacionId);
  if (error) return res.status(400).json({ error });
  let existentes = [];
  let manualId = null;
  if (socio_id != null) {
    const socio = socioDeLaEmpresa(socio_id, organizacionId);
    if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
    existentes = db
      .prepare(`${SELECT_INSCRIPCION} WHERE inscripciones_socio.socio_id = ? AND inscripciones_socio.estado = 'activa'`)
      .all(socio.id)
      .filter((e) => !opciones.some((o) => o.plan_id === e.plan_id));
    manualId = socio.descuento_id;
  }
  if (descuento_id !== undefined) {
    const manual = descuentoManualPedido(descuento_id, organizacionId);
    if (manual.error) return res.status(400).json({ error: manual.error });
    manualId = manual.id;
  }
  res.json(cotizar(opciones, existentes, manualId, organizacionId));
});

// Alta de un socio: un cliente que ya existe (cliente_id) o uno nuevo con sus
// datos (cliente: { nombre, documento, telefono, email }), uno o varios planes
// ([{ opcion_id }], la duración de cada uno), desde cuándo y, si tiene, su
// descuento a mano. Las primeras cuotas se generan en la misma transacción.
app.post('/api/socios', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { cliente_id, cliente, planes, fecha_alta, descuento_id } = req.body ?? {};
  const hoy = fechaDeHoy();

  const { error: errorPlanes, opciones } = opcionesPedidas(planes, organizacionId);
  if (errorPlanes) return res.status(400).json({ error: errorPlanes });
  const { error: errorFecha, fecha: alta } = fechaDeAlta(fecha_alta, hoy);
  if (errorFecha) return res.status(400).json({ error: errorFecha });
  const manual = descuentoManualPedido(descuento_id, organizacionId);
  if (manual.error) return res.status(400).json({ error: manual.error });
  // Desde una consulta (hist. §89): el alta del socio la gana.
  const oportunidad = oportunidadParaVincular(req.body?.crm_oportunidad_id, organizacionId);

  let existente = null;
  let datosNuevo = null;
  if (cliente_id != null) {
    existente = esIdValido(cliente_id)
      ? db.prepare('SELECT id, nombre FROM clientes WHERE id = ? AND organizacion_id = ?').get(cliente_id, organizacionId)
      : null;
    if (!existente) return res.status(400).json({ error: 'El cliente no existe.' });
    if (existente.nombre === CONSUMIDOR_FINAL) {
      return res.status(400).json({ error: '"Consumidor final" no puede ser socio: cargá a la persona.' });
    }
    const yaEsSocio = db.prepare('SELECT numero FROM socios WHERE cliente_id = ?').get(existente.id);
    if (yaEsSocio) return res.status(400).json({ error: `${existente.nombre} ya es socio (N° ${yaEsSocio.numero}).` });
  } else {
    datosNuevo = {};
    for (const campo of ['nombre', 'documento', 'telefono', 'email']) {
      const valor = cliente?.[campo];
      if (valor != null && typeof valor !== 'string') return res.status(400).json({ error: 'Los datos del socio no son válidos.' });
      const texto = (valor ?? '').trim();
      if (texto.length > LARGOS_SOCIO[campo]) {
        return res.status(400).json({ error: `El campo ${campo} no puede pasar de ${LARGOS_SOCIO[campo]} caracteres.` });
      }
      datosNuevo[campo] = texto || null;
    }
    if (!datosNuevo.nombre) return res.status(400).json({ error: 'El socio necesita un nombre.' });
    if (datosNuevo.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datosNuevo.email)) {
      return res.status(400).json({ error: 'El email no es válido.' });
    }
    // El mismo documento es la misma persona: se la elige de la lista en vez
    // de duplicarla.
    if (datosNuevo.documento) {
      const mismo = db
        .prepare('SELECT nombre FROM clientes WHERE organizacion_id = ? AND documento = ?')
        .get(organizacionId, datosNuevo.documento);
      if (mismo) {
        return res.status(400).json({ error: `Ya hay un cliente con ese documento: ${mismo.nombre}. Buscalo en la lista.` });
      }
    }
  }

  const socioId = withTransaction(() => {
    let clienteId = existente?.id;
    const nombre = existente?.nombre ?? datosNuevo.nombre;
    if (!clienteId) {
      clienteId = Number(
        db
          .prepare('INSERT INTO clientes (nombre, documento, telefono, email, organizacion_id) VALUES (?, ?, ?, ?, ?)')
          .run(nombre, datosNuevo.documento, datosNuevo.telefono, datosNuevo.email, organizacionId).lastInsertRowid
      );
      auditar(req, { accion: 'crear', entidad: 'cliente', entidad_id: clienteId, detalle: `Cliente "${nombre}" creado` });
    }
    const { numero } = db
      .prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM socios WHERE organizacion_id = ?')
      .get(organizacionId);
    const id = Number(
      db
        .prepare('INSERT INTO socios (cliente_id, numero, fecha_alta, descuento_id, organizacion_id) VALUES (?, ?, ?, ?, ?)')
        .run(clienteId, numero, alta, manual.id, organizacionId).lastInsertRowid
    );
    // Todos los planes anotados antes de generar cuotas: un combo los mira a todos.
    const inscripciones = opciones.map((opcion) => inscribir(id, opcion, alta, hoy));
    auditar(req, {
      accion: 'crear',
      entidad: 'cliente',
      entidad_id: clienteId,
      operacion_tipo: 'socio',
      operacion_id: id,
      detalle:
        `Alta del socio N° ${numero}, ${nombre}: ${opciones.map((o) => planYDuracion(o.plan, o.meses)).join(', ')}, desde el ${fechaLegible(alta)}` +
        (manual.id ? `, con el descuento "${manual.nombre}"` : '')
    });
    for (const inscripcionId of inscripciones) generarCuotasDe(inscripcionId, hoy);
    vincularOportunidad(req, oportunidad, { cliente_id: clienteId, socio_id: id });
    return id;
  });
  res.status(201).json(detalleSocio(socioId, organizacionId));
});

// El descuento a mano ({ descuento_id }, null para sacarlo) y la baja o la
// vuelta del socio entero ({ estado }):
// - el descuento rige desde la próxima cuota: antes se genera lo que venció;
// - la baja da de baja todos sus planes, sin tocar las cuotas que ya hay: lo
//   que debe sigue en su cuenta corriente, y una cuota que no corresponde se
//   anula como cualquier venta;
// - volver reactiva los planes que tenía cuando se fue.
app.patch('/api/socios/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
  const { descuento_id, estado } = req.body ?? {};
  if (descuento_id === undefined && estado === undefined) return res.status(400).json({ error: 'No hay nada para cambiar.' });
  if (estado !== undefined && estado !== 'activo' && estado !== 'baja') return res.status(400).json({ error: 'El estado no es válido.' });
  const manual = descuento_id === undefined ? null : descuentoManualPedido(descuento_id, organizacionId);
  if (manual?.error) return res.status(400).json({ error: manual.error });

  const hoy = fechaDeHoy();
  const activos = planesActivosDe(socio.id);
  if (estado === 'baja' && activos.size === 0) return res.status(400).json({ error: `${socio.nombre} ya está de baja.` });
  // Los que se reactivan: los que dio de baja la última vez, salvo que ya
  // tenga ese plan activo por otro lado.
  let aReactivar = [];
  if (estado === 'activo') {
    const { ultima } = db
      .prepare("SELECT MAX(fecha_baja) AS ultima FROM inscripciones_socio WHERE socio_id = ? AND estado = 'baja'")
      .get(socio.id);
    aReactivar = db
      .prepare(
        `${SELECT_INSCRIPCION} WHERE inscripciones_socio.socio_id = ? AND inscripciones_socio.estado = 'baja'
            AND inscripciones_socio.fecha_baja = ?`
      )
      .all(socio.id, ultima)
      .filter((i) => !activos.has(i.plan_id));
    if (aReactivar.length === 0) return res.status(400).json({ error: 'No tiene planes para reactivar: sumale uno.' });
  }

  ponerCuotasAlDia(organizacionId, socio.id);
  withTransaction(() => {
    if (manual && manual.id !== socio.descuento_id) {
      const anterior = socio.descuento_id
        ? db.prepare('SELECT nombre FROM descuentos_socio WHERE id = ?').get(socio.descuento_id).nombre
        : null;
      db.prepare('UPDATE socios SET descuento_id = ? WHERE id = ?').run(manual.id, socio.id);
      auditar(req, {
        accion: 'editar',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        valor_anterior: JSON.stringify({ descuento: anterior }),
        valor_nuevo: JSON.stringify({ descuento: manual.nombre ?? null }),
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: manual.id
          ? `El socio N° ${socio.numero} tiene el descuento "${manual.nombre}" desde la próxima cuota`
          : `El socio N° ${socio.numero} ya no tiene descuento a mano`
      });
    }
    if (estado === 'baja') {
      db.prepare("UPDATE inscripciones_socio SET estado = 'baja', fecha_baja = ? WHERE socio_id = ? AND estado = 'activa'").run(hoy, socio.id);
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: `Baja del socio N° ${socio.numero}, ${socio.nombre}`
      });
    }
    if (estado === 'activo') {
      const desde = aReactivar.map((i) => reactivarInscripcion(i.id, hoy)).sort()[0];
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: `El socio N° ${socio.numero}, ${socio.nombre}, volvió (cuotas desde el ${fechaLegible(desde)})`
      });
      for (const i of aReactivar) generarCuotasDe(i.id, hoy);
    }
  });
  res.json(detalleSocio(socio.id, organizacionId));
});

// Suma un plan a un socio ({ opcion_id, fecha_alta }), con su propio ciclo.
// Antes se genera lo que venció de los otros: un combo que se completa recién
// rige en sus próximas cuotas.
app.post('/api/socios/:id/planes', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
  const { error, opciones } = opcionesPedidas([{ opcion_id: req.body?.opcion_id }], organizacionId);
  if (error) return res.status(400).json({ error });
  const [opcion] = opciones;
  if (planesActivosDe(socio.id).has(opcion.plan_id)) {
    return res.status(400).json({ error: `${socio.nombre} ya tiene "${opcion.plan}".` });
  }
  const hoy = fechaDeHoy();
  const { error: errorFecha, fecha } = fechaDeAlta(req.body?.fecha_alta, hoy);
  if (errorFecha) return res.status(400).json({ error: errorFecha });

  ponerCuotasAlDia(organizacionId, socio.id);
  withTransaction(() => {
    const inscripcionId = inscribir(socio.id, opcion, fecha, hoy);
    auditar(req, {
      accion: 'editar',
      entidad: 'cliente',
      entidad_id: socio.cliente_id,
      operacion_tipo: 'socio',
      operacion_id: socio.id,
      detalle: `El socio N° ${socio.numero} suma ${planYDuracion(opcion.plan, opcion.meses)}, desde el ${fechaLegible(fecha)}`
    });
    generarCuotasDe(inscripcionId, hoy);
  });
  res.status(201).json(detalleSocio(socio.id, organizacionId));
});

// Un plan del socio: cambiar su duración, o pasarlo a otro plan, desde la
// próxima cuota ({ opcion_id }); darlo de baja o reactivarlo ({ estado }).
app.patch('/api/socios/:id/planes/:inscripcionId', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
  const inscripcion = db
    .prepare(`${SELECT_INSCRIPCION} WHERE inscripciones_socio.id = ? AND inscripciones_socio.socio_id = ?`)
    .get(Number(req.params.inscripcionId), socio.id);
  if (!inscripcion) return res.status(404).json({ error: 'Ese plan no es de este socio.' });
  const { opcion_id, estado } = req.body ?? {};
  if (opcion_id === undefined && estado === undefined) return res.status(400).json({ error: 'No hay nada para cambiar.' });
  if (estado !== undefined && estado !== 'activa' && estado !== 'baja') return res.status(400).json({ error: 'El estado no es válido.' });

  const activos = planesActivosDe(socio.id);
  let opcion = null;
  if (opcion_id !== undefined && opcion_id !== inscripcion.opcion_id) {
    opcion = opcionDeLaEmpresa(opcion_id, organizacionId);
    if (!opcion) return res.status(400).json({ error: 'Esa duración no existe.' });
    if (!opcion.activo || !opcion.plan_activo) {
      return res.status(400).json({ error: `${planYDuracion(opcion.plan, opcion.meses)} no se está ofreciendo: elegí otro.` });
    }
    if (opcion.plan_id !== inscripcion.plan_id && activos.has(opcion.plan_id)) {
      return res.status(400).json({ error: `${socio.nombre} ya tiene "${opcion.plan}".` });
    }
  }
  const reactiva = estado === 'activa' && inscripcion.estado === 'baja';
  if (reactiva && activos.has(opcion?.plan_id ?? inscripcion.plan_id)) {
    return res.status(400).json({ error: `${socio.nombre} ya tiene ese plan activo.` });
  }

  ponerCuotasAlDia(organizacionId, socio.id);
  const hoy = fechaDeHoy();
  withTransaction(() => {
    if (opcion) {
      db.prepare('UPDATE inscripciones_socio SET opcion_id = ?, plan_id = ? WHERE id = ?').run(opcion.id, opcion.plan_id, inscripcion.id);
      auditar(req, {
        accion: 'editar',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        valor_anterior: JSON.stringify({ plan: planYDuracion(inscripcion.plan, inscripcion.meses) }),
        valor_nuevo: JSON.stringify({ plan: planYDuracion(opcion.plan, opcion.meses) }),
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: `El socio N° ${socio.numero} pasa a ${planYDuracion(opcion.plan, opcion.meses)} desde la próxima cuota`
      });
    }
    if (estado === 'baja' && inscripcion.estado === 'activa') {
      db.prepare("UPDATE inscripciones_socio SET estado = 'baja', fecha_baja = ? WHERE id = ?").run(hoy, inscripcion.id);
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: `El socio N° ${socio.numero} deja "${inscripcion.plan}"`
      });
    }
    if (reactiva) {
      const desde = reactivarInscripcion(inscripcion.id, hoy);
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'cliente',
        entidad_id: socio.cliente_id,
        operacion_tipo: 'socio',
        operacion_id: socio.id,
        detalle: `El socio N° ${socio.numero} vuelve a "${opcion?.plan ?? inscripcion.plan}" (cuotas desde el ${fechaLegible(desde)})`
      });
      generarCuotasDe(inscripcion.id, hoy);
    }
  });
  res.json(detalleSocio(socio.id, organizacionId));
});

// Cobra todo lo que debe de cuotas, de la más vieja a la más nueva, en una
// cuenta de tesorería: un cobro común por cada cuota (CLAUDE.md §9), en una
// sola transacción.
app.post('/api/socios/:id/cobros', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });
  const cuenta = db
    .prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(req.body?.cuenta_tesoreria_id), organizacionId);
  if (!cuenta) return res.status(400).json({ error: 'Elegí en qué cuenta entra la plata.' });

  ponerCuotasAlDia(organizacionId, socio.id);
  const [{ cuotas }] = sociosConSituacion(organizacionId, socio.id);
  const impagas = cuotas.filter((c) => c.saldo > 0);
  if (impagas.length === 0) return res.status(400).json({ error: `${socio.nombre} no debe ninguna cuota.` });

  const total = withTransaction(() => {
    for (const cuota of impagas) {
      const cobroId = registrarCobro(cuota.venta_id, socio.cliente_id, cuota.saldo, cuenta.id, `Cuota de socio N° ${socio.numero}`, organizacionId);
      auditar(req, {
        accion: 'crear',
        entidad: 'cobro',
        entidad_id: cobroId,
        operacion_tipo: 'venta',
        operacion_id: cuota.venta_id,
        detalle: `Cobro #${cobroId} de $${cuota.saldo} de la cuota del socio N° ${socio.numero} (${cuenta.nombre})`
      });
    }
    return redondear2(impagas.reduce((acc, c) => acc + c.saldo, 0));
  });
  res.status(201).json({ cobrado: total, cuotas: impagas.length, socio: detalleSocio(socio.id, organizacionId) });
});

// Registra que el socio entró, con lo que debía en ese momento. Avisar y
// decidir si pasa es de la recepción: si debe, la pantalla primero lo muestra
// y recién manda esto cuando cobra o lo dejan pasar igual.
app.post('/api/socios/:id/ingresos', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const socio = socioDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado.' });

  ponerCuotasAlDia(organizacionId, socio.id);
  const [situacion] = sociosConSituacion(organizacionId, socio.id);
  delete situacion.cuotas;
  if (situacion.situacion === 'baja') return res.status(400).json({ error: `${socio.nombre} está dado de baja.` });
  const { lastInsertRowid } = db
    .prepare('INSERT INTO ingresos_socio (socio_id, usuario_id, al_dia, deuda) VALUES (?, ?, ?, ?)')
    .run(socio.id, req.usuario.id, situacion.deuda > 0 ? 0 : 1, situacion.deuda);
  const ingreso = db.prepare('SELECT id, fecha FROM ingresos_socio WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ ...ingreso, al_dia: situacion.deuda === 0, socio: situacion });
});

/* ---------- Abonos (CLAUDE.md §29, hist. §79) ---------- */

// El módulo `abonos` (ver la tabla en schema.sql): un servicio que un cliente
// paga cada tantos meses. Es el mecanismo de las cuotas de socios, no uno
// nuevo: cada período es una venta del servicio, los períodos salen de
// periodosPendientes() y cada cuota se decora con decorarCuota(). Se generan al
// mirar los abonos o las cuentas corrientes, sin cron. Darlos de alta y cambiar
// el precio es admin, como los planes de socios; verlos, de los dos roles. La
// auditoría va como entidad cliente con operacion_tipo abono.

const MAX_MESES_ABONO = 12;

const SELECT_ABONO = `
  SELECT abonos.id, abonos.cliente_id, clientes.nombre AS cliente, clientes.telefono AS cliente_telefono,
         abonos.producto_id, productos.nombre AS servicio, abonos.precio, abonos.meses, abonos.fecha_alta,
         abonos.ciclo_desde, abonos.cobrar_desde, abonos.estado, abonos.fecha_baja, abonos.notas
    FROM abonos
    JOIN clientes ON clientes.id = abonos.cliente_id
    JOIN productos ON productos.id = abonos.producto_id`;

// Lo que se debe de cada cuota, con el mismo cálculo que SELECT_CUOTAS de
// socios: el neto de su venta menos lo cobrado.
const SELECT_CUOTAS_ABONO = `
  SELECT cuotas_abono.id, cuotas_abono.abono_id, cuotas_abono.venta_id, cuotas_abono.desde,
         cuotas_abono.hasta, cuotas_abono.meses, cuotas_abono.precio, ventas.estado AS estado_venta,
         (SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0)
            FROM venta_items WHERE venta_items.venta_id = ventas.id) - ${SUBQUERY_DEVUELTO_VENTA} AS importe,
         (SELECT COALESCE(SUM(cobros.importe), 0) FROM cobros WHERE cobros.venta_id = ventas.id) AS cobrado
    FROM cuotas_abono
    JOIN abonos ON abonos.id = cuotas_abono.abono_id
    JOIN ventas ON ventas.id = cuotas_abono.venta_id`;

// Arma las cuotas que le faltan a un abono hasta hoy. Como las de socios, la
// venta lleva la fecha en que empieza el período y vence ese día. Va DENTRO de
// una transacción.
function generarCuotasAbono(abonoId, hoy) {
  const abono = db.prepare(`${SELECT_ABONO} WHERE abonos.id = ?`).get(abonoId);
  const { organizacion_id: organizacionId } = db.prepare('SELECT organizacion_id FROM abonos WHERE id = ?').get(abonoId);
  const existentes = new Map(
    db
      .prepare('SELECT desde, meses FROM cuotas_abono WHERE abono_id = ? AND desde >= ?')
      .all(abono.id, abono.ciclo_desde)
      .map((c) => [c.desde, c.meses])
  );
  const insertar = db.prepare('INSERT INTO cuotas_abono (abono_id, venta_id, desde, hasta, meses, precio) VALUES (?, ?, ?, ?, ?, ?)');
  const periodos = periodosPendientes({
    cicloDesde: abono.ciclo_desde,
    cobrarDesde: abono.cobrar_desde,
    meses: abono.meses,
    existentes,
    hoy
  });
  for (const { desde, hasta } of periodos) {
    const ventaId = crearVenta({
      cliente_id: abono.cliente_id,
      items: [{ producto_id: abono.producto_id, cantidad: 1, precio_unitario: abono.precio }],
      fecha: desde,
      organizacion_id: organizacionId
    });
    insertar.run(abono.id, ventaId, desde, hasta, abono.meses, abono.precio);
    // Actor sistema y sin usuario: la generó Nexo al empezar el período.
    registrarAuditoria({
      actor: 'sistema',
      accion: 'crear',
      entidad: 'venta',
      entidad_id: ventaId,
      operacion_tipo: 'abono',
      operacion_id: abono.id,
      detalle: `Cuota del abono #${abono.id} (${abono.servicio}, ${nombreDuracion(abono.meses).toLowerCase()}), del ${fechaLegible(desde)} al ${fechaLegible(hasta)}`,
      organizacion_id: organizacionId
    });
  }
}

// Genera lo que falte a los abonos activos de la empresa, o a uno. Solo abre
// una transacción si a alguno le falta el período de hoy, como
// ponerCuotasAlDia().
function ponerAbonosAlDia(organizacionId, abonoId = null) {
  const hoy = fechaDeHoy();
  const pendientes = db
    .prepare(
      `SELECT abonos.id FROM abonos
        WHERE abonos.organizacion_id = ? AND (? IS NULL OR abonos.id = ?)
          AND abonos.estado = 'activo' AND abonos.ciclo_desde <= ?
          AND NOT EXISTS (SELECT 1 FROM cuotas_abono
                           WHERE cuotas_abono.abono_id = abonos.id
                             AND cuotas_abono.desde >= abonos.ciclo_desde
                             AND cuotas_abono.hasta >= ?)`
    )
    .all(organizacionId, abonoId, abonoId, hoy, hoy);
  if (pendientes.length === 0) return;
  withTransaction(() => {
    for (const { id } of pendientes) generarCuotasAbono(id, hoy);
  });
}

// La deuda y la próxima cuota de un abono. La próxima es el día siguiente a la
// última cuota del ciclo (o su inicio, si arranca a futuro), y un abono de baja
// no tiene. La deuda se informa también de uno de baja: sigue en la cuenta del
// cliente.
function conCuotas(abono, cuotas) {
  const decoradas = cuotas.map(decorarCuota);
  const ultima = decoradas.filter((c) => c.desde >= abono.ciclo_desde).reduce((max, c) => (c.hasta > max ? c.hasta : max), '');
  return {
    ...abono,
    duracion: nombreDuracion(abono.meses),
    deuda: redondear2(decoradas.reduce((acc, c) => acc + c.saldo, 0)),
    cuotas_impagas: decoradas.filter((c) => c.saldo > 0).length,
    proxima: abono.estado === 'activo' ? (ultima ? sumarDias(ultima, 1) : abono.ciclo_desde) : null,
    cuotas: decoradas.sort((a, b) => (a.desde < b.desde ? 1 : -1))
  };
}

function abonoDeLaEmpresa(id, organizacionId) {
  return db.prepare(`${SELECT_ABONO} WHERE abonos.id = ? AND abonos.organizacion_id = ?`).get(id, organizacionId);
}

// Valida el precio, cada cuántos meses y las notas, para el alta y la edición.
// Con `parcial` solo mira lo que viene. Devuelve { error } o { datos }.
function validarAbono(cuerpo, { parcial }) {
  const datos = {};
  if (!parcial || cuerpo?.precio !== undefined) {
    const precio = cuerpo?.precio;
    if (!esNumeroValido(precio) || Number(precio) < 0) return { error: 'El precio tiene que ser un número, y no puede ser negativo.' };
    datos.precio = redondear2(Number(precio));
  }
  if (!parcial || cuerpo?.meses !== undefined) {
    const meses = Number(cuerpo?.meses);
    if (!Number.isInteger(meses) || meses < 1 || meses > MAX_MESES_ABONO) {
      return { error: `Cada cuántos meses se cobra: un número entero de 1 a ${MAX_MESES_ABONO}.` };
    }
    datos.meses = meses;
  }
  if (cuerpo?.notas !== undefined) {
    if (cuerpo.notas !== null && typeof cuerpo.notas !== 'string') return { error: 'Las notas no son válidas.' };
    const notas = (cuerpo.notas ?? '').trim();
    if (notas.length > 500) return { error: 'Las notas no pueden pasar de 500 caracteres.' };
    datos.notas = notas || null;
  }
  return { datos };
}

app.get('/api/abonos', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  ponerAbonosAlDia(organizacionId);
  const cuotas = db.prepare(`${SELECT_CUOTAS_ABONO} WHERE abonos.organizacion_id = ?`).all(organizacionId);
  const porAbono = Map.groupBy(cuotas, (c) => c.abono_id);
  const abonos = db
    .prepare(`${SELECT_ABONO} WHERE abonos.organizacion_id = ? ORDER BY abonos.estado, clientes.nombre, abonos.id`)
    .all(organizacionId);
  res.json(abonos.map((a) => conCuotas(a, porAbono.get(a.id) ?? [])));
});

app.get('/api/abonos/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const abono = abonoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!abono) return res.status(404).json({ error: 'Abono no encontrado.' });
  ponerAbonosAlDia(organizacionId, abono.id);
  res.json(conCuotas(abono, db.prepare(`${SELECT_CUOTAS_ABONO} WHERE cuotas_abono.abono_id = ?`).all(abono.id)));
});

// Alta: cliente (id o nombre, como en una venta), un servicio del catálogo,
// precio, cada cuántos meses y desde cuándo. Un alta hacia atrás cobra el
// período que corre, no los anteriores, como la de un socio.
app.post('/api/abonos', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, datos } = validarAbono(req.body, { parcial: false });
  if (error) return res.status(400).json({ error });
  const servicio = db
    .prepare('SELECT id, nombre, tipo, activo FROM productos WHERE id = ? AND organizacion_id = ?')
    .get(Number(req.body?.producto_id), organizacionId);
  if (!servicio) return res.status(400).json({ error: 'Elegí el servicio que se cobra.' });
  // Con stock, cada cuota sacaría mercadería sin que nadie la entregue.
  if (servicio.tipo !== 'servicio') return res.status(400).json({ error: `"${servicio.nombre}" no es un servicio.` });
  if (!servicio.activo) return res.status(400).json({ error: `"${servicio.nombre}" está inactivo.` });
  const hoy = fechaDeHoy();
  const alta = fechaDeAlta(req.body?.fecha_alta, hoy);
  if (alta.error) return res.status(400).json({ error: alta.error });

  const id = withTransaction(() => {
    const clienteId = resolverCliente(req.body.cliente, req.body.cliente_id, organizacionId).id;
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO abonos (cliente_id, producto_id, precio, meses, fecha_alta, ciclo_desde, cobrar_desde, notas, organizacion_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(clienteId, servicio.id, datos.precio, datos.meses, alta.fecha, alta.fecha, maxISO(alta.fecha, hoy), datos.notas ?? null, organizacionId);
    const nuevoId = Number(lastInsertRowid);
    auditar(req, {
      accion: 'crear',
      entidad: 'cliente',
      entidad_id: clienteId,
      operacion_tipo: 'abono',
      operacion_id: nuevoId,
      detalle: `Abono #${nuevoId}: ${servicio.nombre}, ${nombreDuracion(datos.meses).toLowerCase()}, desde el ${fechaLegible(alta.fecha)}`
    });
    generarCuotasAbono(nuevoId, hoy);
    return nuevoId;
  });
  res.status(201).json({ id });
});

// Cobra de una vez todas las cuotas impagas de un abono, en una cuenta (hist.
// §84), como el cobro de un socio: un cobro por cuota, con el circuito de
// siempre. Es de los dos roles, como cobrar una venta. Cobrar una parte se
// hace desde la cuota.
app.post('/api/abonos/:id/cobros', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const abono = abonoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!abono) return res.status(404).json({ error: 'Abono no encontrado.' });
  const cuenta = db
    .prepare('SELECT id, nombre FROM cuentas_tesoreria WHERE id = ? AND organizacion_id = ?')
    .get(Number(req.body?.cuenta_tesoreria_id), organizacionId);
  if (!cuenta) return res.status(400).json({ error: 'Elegí en qué cuenta entra la plata.' });

  ponerAbonosAlDia(organizacionId, abono.id);
  const { cuotas } = conCuotas(abono, db.prepare(`${SELECT_CUOTAS_ABONO} WHERE cuotas_abono.abono_id = ?`).all(abono.id));
  const impagas = cuotas.filter((c) => c.saldo > 0);
  if (impagas.length === 0) return res.status(400).json({ error: 'Este abono no tiene cuotas por cobrar.' });

  const total = withTransaction(() => {
    for (const cuota of impagas) {
      const cobroId = registrarCobro(cuota.venta_id, abono.cliente_id, cuota.saldo, cuenta.id, `Cuota del abono #${abono.id}`, organizacionId);
      auditar(req, {
        accion: 'crear',
        entidad: 'cobro',
        entidad_id: cobroId,
        operacion_tipo: 'venta',
        operacion_id: cuota.venta_id,
        detalle: `Cobro #${cobroId} de $${cuota.saldo} de la cuota del abono #${abono.id} (${cuenta.nombre})`
      });
    }
    return redondear2(impagas.reduce((acc, c) => acc + c.saldo, 0));
  });
  res.status(201).json({ cobrado: total, cuotas: impagas.length });
});

// Editar precio, cada cuántos meses y notas (rigen desde la cuota siguiente), o
// dar de baja y reactivar. La baja no toca las cuotas que ya hay; reactivar
// empieza un ciclo nuevo sin cobrar los meses de baja, como un plan de socio.
app.patch('/api/abonos/:id', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const abono = abonoDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!abono) return res.status(404).json({ error: 'Abono no encontrado.' });
  const { error, datos } = validarAbono(req.body, { parcial: true });
  if (error) return res.status(400).json({ error });
  const estado = req.body?.estado;
  if (estado !== undefined && estado !== 'activo' && estado !== 'baja') return res.status(400).json({ error: 'El estado no es válido.' });
  const hoy = fechaDeHoy();

  withTransaction(() => {
    // Lo que falta hasta hoy se arma con el precio de antes: un cambio rige
    // desde la cuota siguiente.
    if (abono.estado === 'activo') generarCuotasAbono(abono.id, hoy);
    const nuevo = { ...abono, ...datos };
    db.prepare('UPDATE abonos SET precio = ?, meses = ?, notas = ? WHERE id = ?').run(nuevo.precio, nuevo.meses, nuevo.notas, abono.id);
    const diff = diffCampos(abono, nuevo, ['precio', 'meses', 'notas']);
    if (diff) {
      auditar(req, {
        accion: 'editar',
        entidad: 'cliente',
        entidad_id: abono.cliente_id,
        valor_anterior: diff.anterior,
        valor_nuevo: diff.nuevo,
        operacion_tipo: 'abono',
        operacion_id: abono.id,
        detalle: `Abono #${abono.id} (${abono.servicio}) editado`
      });
    }
    if (estado && estado !== abono.estado) {
      if (estado === 'baja') {
        db.prepare("UPDATE abonos SET estado = 'baja', fecha_baja = ? WHERE id = ?").run(hoy, abono.id);
      } else {
        const { ultimo } = db.prepare('SELECT MAX(hasta) AS ultimo FROM cuotas_abono WHERE abono_id = ?').get(abono.id);
        const ciclo = maxISO(hoy, ultimo ? sumarDias(ultimo, 1) : abono.ciclo_desde);
        db.prepare("UPDATE abonos SET estado = 'activo', fecha_baja = NULL, ciclo_desde = ?, cobrar_desde = ? WHERE id = ?").run(
          ciclo,
          ciclo,
          abono.id
        );
        generarCuotasAbono(abono.id, hoy);
      }
      auditar(req, {
        accion: 'cambiar_estado',
        entidad: 'cliente',
        entidad_id: abono.cliente_id,
        valor_anterior: JSON.stringify({ estado: abono.estado }),
        valor_nuevo: JSON.stringify({ estado }),
        operacion_tipo: 'abono',
        operacion_id: abono.id,
        detalle: `Abono #${abono.id} (${abono.servicio}) ${estado === 'baja' ? 'dado de baja' : 'reactivado'}`
      });
    }
  });
  res.json({ id: abono.id });
});

/* ---------- Consultas (CRM) ---------- */
// Consultas y clientes potenciales (CLAUDE.md §29, hist. §89; el diseño está
// en docs/investigacion-crm-servicios.md §2). Es un módulo que puede prender
// cualquier negocio: el tipo solo decide con qué etapas nace el embudo (datos
// de perfiles.js). No es un circuito propio:
// - una consulta pasa a cliente, presupuesto, venta o socio con las altas de
//   siempre, que reciben `crm_oportunidad_id` y la dejan vinculada;
// - se gana sola cuando sale su venta o su socio, o cuando su presupuesto se
//   convierte en venta (también al terminar el trabajo que lo convierte).
// Es de los dos roles, salvo las etapas, que se editan en Configuración. La
// auditoría va como entidad cliente (u organizacion, si todavía es un
// contacto suelto) con operacion_tipo oportunidad, sin reconstruir auditoria.

// De dónde llegó la consulta. La clave es lo que se guarda.
const ORIGENES_CRM = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  local: 'Pasó por el local',
  conocido: 'Un conocido',
  web: 'La web',
  otro: 'Otro'
};
const TIPOS_ACTIVIDAD = ['llamada', 'mensaje', 'visita', 'nota', 'tarea'];
const LARGOS_OPORTUNIDAD = { nombre: 120, telefono: 40, email: 120, interes: 300 };
const LARGO_MOTIVO_PERDIDA = 300;
const LARGO_ACTIVIDAD = 1000;
const LARGO_ETAPA = 40;
// "Para hoy" avisa los presupuestos enviados hace al menos estos días que
// siguen sin respuesta.
const DIAS_PRESUPUESTO_SIN_RESPUESTA = 7;
// "Dejaron de comprar": los que no compran hace más de estos días.
const DIAS_INACTIVO_POR_DEFECTO = 90;

// La próxima acción no se guarda (hist. §89): es la actividad pendiente más
// próxima. Una pendiente siempre tiene fecha. Nombre, teléfono y email salen
// del cliente cuando ya lo es, así un cambio en su ficha se ve acá.
const SELECT_OPORTUNIDAD = `
  SELECT o.id, o.cliente_id, COALESCE(clientes.nombre, o.contacto_nombre) AS nombre,
         COALESCE(clientes.telefono, o.contacto_telefono) AS telefono,
         COALESCE(clientes.email, o.contacto_email) AS email,
         o.origen, o.interes, o.valor_estimado, o.responsable_id, usuarios.nombre AS responsable,
         o.etapa_id, crm_etapas.nombre AS etapa, o.estado, o.motivo_perdida, o.fecha_cierre,
         o.presupuesto_id, o.venta_id, o.socio_id, o.fecha, o.fecha_creacion,
         proxima.id AS proxima_id, proxima.tipo AS proxima_tipo,
         proxima.descripcion AS proxima_descripcion, proxima.fecha AS proxima_fecha
    FROM crm_oportunidades o
    JOIN crm_etapas ON crm_etapas.id = o.etapa_id
    LEFT JOIN clientes ON clientes.id = o.cliente_id
    LEFT JOIN usuarios ON usuarios.id = o.responsable_id
    LEFT JOIN crm_actividades proxima ON proxima.id = (
      SELECT a.id FROM crm_actividades a
       WHERE a.oportunidad_id = o.id AND a.hecha = 0
       ORDER BY a.fecha, a.id LIMIT 1)`;

const SELECT_ACTIVIDAD = `
  SELECT a.id, a.oportunidad_id, a.cliente_id, a.tipo, a.descripcion, a.fecha, a.hecha, a.fecha_hecha,
         a.usuario_id, usuarios.nombre AS usuario, a.fecha_creacion,
         COALESCE(clientes.nombre, o.contacto_nombre) AS nombre
    FROM crm_actividades a
    LEFT JOIN crm_oportunidades o ON o.id = a.oportunidad_id
    LEFT JOIN clientes ON clientes.id = COALESCE(a.cliente_id, o.cliente_id)
    LEFT JOIN usuarios ON usuarios.id = a.usuario_id`;

function oportunidadDeLaEmpresa(id, organizacionId) {
  return db.prepare(`${SELECT_OPORTUNIDAD} WHERE o.id = ? AND o.organizacion_id = ?`).get(id, organizacionId);
}

function actividadDeLaEmpresa(id, organizacionId) {
  return db.prepare(`${SELECT_ACTIVIDAD} WHERE a.id = ? AND a.organizacion_id = ?`).get(id, organizacionId);
}

function etapaDeLaEmpresa(id, organizacionId) {
  return db.prepare('SELECT id, nombre, orden, activa FROM crm_etapas WHERE id = ? AND organizacion_id = ?').get(id, organizacionId);
}

// Cómo está la consulta para el que la mira: sin próxima acción, con la acción
// vencida, para hoy o al día. Solo de una abierta.
function conAviso(oportunidad, hoy) {
  let aviso = null;
  if (oportunidad.estado === 'abierta') {
    if (!oportunidad.proxima_id) aviso = 'sin_accion';
    else if (oportunidad.proxima_fecha < hoy) aviso = 'vencida';
    else if (oportunidad.proxima_fecha === hoy) aviso = 'hoy';
  }
  return { ...oportunidad, origen_nombre: ORIGENES_CRM[oportunidad.origen] ?? null, aviso };
}

// Audita sobre el cliente si ya lo es, y sobre el negocio si todavía es un
// contacto suelto: las dos entidades ya están en el CHECK de auditoria.
function auditarOportunidad(req, oportunidad, datos) {
  auditar(req, {
    entidad: oportunidad.cliente_id ? 'cliente' : 'organizacion',
    entidad_id: oportunidad.cliente_id ?? req.usuario.organizacion_id,
    operacion_tipo: 'oportunidad',
    operacion_id: oportunidad.id,
    ...datos
  });
}

function usuarioActivoDelNegocio(usuarioId, organizacionId) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM usuario_organizaciones WHERE usuario_id = ? AND organizacion_id = ? AND activo = 1')
      .get(usuarioId, organizacionId)
  );
}

// Valida los datos de una consulta, para el alta y la edición. Devuelve
// { error } o { datos }. Con un cliente (cliente_id) el nombre es el suyo; si
// no, hace falta el del contacto. El alta rápida manda solo nombre, teléfono y
// qué busca.
function validarOportunidad(cuerpo, organizacionId) {
  const datos = {};
  for (const campo of Object.keys(LARGOS_OPORTUNIDAD)) {
    const valor = cuerpo?.[campo];
    if (valor != null && typeof valor !== 'string') return { error: 'Los datos de la consulta no son válidos.' };
    const texto = (valor ?? '').trim();
    if (texto.length > LARGOS_OPORTUNIDAD[campo]) {
      return { error: `El campo ${campo === 'interes' ? '"qué busca"' : campo} no puede pasar de ${LARGOS_OPORTUNIDAD[campo]} caracteres.` };
    }
    datos[campo] = texto || null;
  }
  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) return { error: 'El email no es válido.' };

  datos.cliente_id = null;
  if (cuerpo?.cliente_id != null && cuerpo.cliente_id !== '') {
    const cliente = db
      .prepare('SELECT id, nombre FROM clientes WHERE id = ? AND organizacion_id = ?')
      .get(Number(cuerpo.cliente_id), organizacionId);
    if (!cliente) return { error: 'El cliente no existe.' };
    if (cliente.nombre === CONSUMIDOR_FINAL) return { error: '"Consumidor final" no puede tener consultas: cargá a la persona.' };
    datos.cliente_id = cliente.id;
    datos.nombre = cliente.nombre;
  }
  if (!datos.nombre) return { error: 'Anotá el nombre de quien consulta.' };

  const origen = cuerpo?.origen ?? null;
  if (origen !== null && origen !== '' && !Object.hasOwn(ORIGENES_CRM, origen)) return { error: 'El origen no es válido.' };
  datos.origen = origen || null;

  const valor = cuerpo?.valor_estimado;
  datos.valor_estimado = null;
  if (valor != null && valor !== '') {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0) return { error: 'El valor estimado tiene que ser un número positivo.' };
    datos.valor_estimado = redondear2(numero);
  }

  const responsable = cuerpo?.responsable_id ?? null;
  datos.responsable_id = null;
  if (responsable !== null && responsable !== '') {
    if (!usuarioActivoDelNegocio(Number(responsable), organizacionId)) {
      return { error: 'El responsable no es un usuario de este negocio.' };
    }
    datos.responsable_id = Number(responsable);
  }

  datos.etapa_id = null;
  if (cuerpo?.etapa_id != null && cuerpo.etapa_id !== '') {
    const etapa = etapaDeLaEmpresa(Number(cuerpo.etapa_id), organizacionId);
    if (!etapa || !etapa.activa) return { error: 'La etapa no existe.' };
    datos.etapa_id = etapa.id;
  }
  return { datos };
}

// La consulta que llega con un alta de presupuesto, venta o socio
// (`crm_oportunidad_id`). Se valida antes de la transacción del alta; null si
// no vino ninguna.
function oportunidadParaVincular(valor, organizacionId) {
  if (valor == null || valor === '') return null;
  const oportunidad = db
    .prepare('SELECT id, cliente_id, estado FROM crm_oportunidades WHERE id = ? AND organizacion_id = ?')
    .get(Number(valor), organizacionId);
  if (!oportunidad) throw new ErrorValidacion('La consulta no existe.');
  return oportunidad;
}

function ganarOportunidad(req, oportunidad, motivo) {
  db.prepare("UPDATE crm_oportunidades SET estado = 'ganada', motivo_perdida = NULL, fecha_cierre = ? WHERE id = ?").run(
    fechaDeHoy(),
    oportunidad.id
  );
  auditarOportunidad(req, oportunidad, {
    accion: 'cambiar_estado',
    valor_anterior: JSON.stringify({ estado: oportunidad.estado }),
    valor_nuevo: JSON.stringify({ estado: 'ganada' }),
    detalle: `Consulta #${oportunidad.id} ganada: ${motivo}`
  });
}

// Deja la consulta vinculada a lo que generó, adentro de la transacción del
// alta. El cliente se toma si todavía no tenía. Una venta o un socio la ganan
// (si sigue abierta); un presupuesto no, porque todavía puede no aceptarse.
function vincularOportunidad(req, oportunidad, { cliente_id = null, presupuesto_id = null, venta_id = null, socio_id = null }) {
  if (!oportunidad) return;
  // Una venta de mostrador va a "Consumidor final": ese no pasa a ser el cliente de la consulta.
  if (cliente_id && db.prepare('SELECT nombre FROM clientes WHERE id = ?').get(cliente_id)?.nombre === CONSUMIDOR_FINAL) cliente_id = null;
  db.prepare(
    `UPDATE crm_oportunidades
        SET cliente_id = COALESCE(cliente_id, ?), presupuesto_id = COALESCE(?, presupuesto_id),
            venta_id = COALESCE(?, venta_id), socio_id = COALESCE(?, socio_id)
      WHERE id = ?`
  ).run(cliente_id, presupuesto_id, venta_id, socio_id, oportunidad.id);
  const vinculada = { ...oportunidad, cliente_id: oportunidad.cliente_id ?? cliente_id };
  const que = presupuesto_id ? `el presupuesto #${presupuesto_id}` : venta_id ? `la venta #${venta_id}` : `el socio #${socio_id}`;
  auditarOportunidad(req, vinculada, { accion: 'editar', detalle: `Consulta #${oportunidad.id} pasó a ${que}` });
  if ((venta_id || socio_id) && oportunidad.estado === 'abierta') ganarOportunidad(req, vinculada, `pasó a ${que}`);
}

// Un presupuesto que se convierte en venta gana las consultas abiertas que lo
// generaron, y les deja la venta. Adentro de la transacción de la conversión.
function ganarOportunidadesDelPresupuesto(req, presupuestoId, ventaId) {
  const abiertas = db
    .prepare("SELECT id, cliente_id, estado FROM crm_oportunidades WHERE presupuesto_id = ? AND estado = 'abierta'")
    .all(presupuestoId);
  for (const oportunidad of abiertas) {
    db.prepare('UPDATE crm_oportunidades SET venta_id = COALESCE(venta_id, ?) WHERE id = ?').run(ventaId, oportunidad.id);
    ganarOportunidad(req, oportunidad, `su presupuesto #${presupuestoId} pasó a la venta #${ventaId}`);
  }
}

// --- Etapas ---

app.get('/api/crm/etapas', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT crm_etapas.id, crm_etapas.nombre, crm_etapas.orden, crm_etapas.activa,
                (SELECT COUNT(*) FROM crm_oportunidades o
                  WHERE o.etapa_id = crm_etapas.id AND o.estado = 'abierta') AS abiertas
           FROM crm_etapas WHERE crm_etapas.organizacion_id = ?
          ORDER BY crm_etapas.orden, crm_etapas.id`
      )
      .all(req.usuario.organizacion_id)
  );
});

function nombreDeEtapa(valor) {
  if (typeof valor !== 'string' || !valor.trim()) return { error: 'La etapa necesita un nombre.' };
  const nombre = valor.trim();
  if (nombre.length > LARGO_ETAPA) return { error: `El nombre de la etapa no puede pasar de ${LARGO_ETAPA} caracteres.` };
  // Ganada y Perdida son los cierres de toda consulta: una etapa con ese
  // nombre confundiría el embudo.
  if (['ganada', 'perdida'].includes(nombre.toLowerCase())) {
    return { error: 'Ganada y Perdida ya son los cierres de toda consulta: elegí otro nombre.' };
  }
  return { nombre };
}

function etapaRepetida(nombre, organizacionId, salvoId = 0) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM crm_etapas WHERE organizacion_id = ? AND nombre = ? COLLATE NOCASE AND id <> ?')
      .get(organizacionId, nombre, salvoId)
  );
}

app.post('/api/crm/etapas', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, nombre } = nombreDeEtapa(req.body?.nombre);
  if (error) return res.status(400).json({ error });
  if (etapaRepetida(nombre, organizacionId)) return res.status(400).json({ error: `Ya hay una etapa "${nombre}".` });
  const id = withTransaction(() => {
    const { orden } = db
      .prepare('SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM crm_etapas WHERE organizacion_id = ?')
      .get(organizacionId);
    const nuevoId = Number(
      db.prepare('INSERT INTO crm_etapas (nombre, orden, organizacion_id) VALUES (?, ?, ?)').run(nombre, orden, organizacionId)
        .lastInsertRowid
    );
    auditar(req, {
      accion: 'crear',
      entidad: 'organizacion',
      entidad_id: organizacionId,
      operacion_tipo: 'crm_etapa',
      operacion_id: nuevoId,
      detalle: `Etapa de consultas "${nombre}" creada`
    });
    return nuevoId;
  });
  res.status(201).json({ id });
});

// Renombrarla o pausarla ({ nombre?, activa? }). Una pausada no se ofrece para
// mover, pero lo que está en ella sigue ahí. Siempre queda al menos una
// activa: es donde entra una consulta nueva.
app.put('/api/crm/etapas/:id', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const etapa = etapaDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!etapa) return res.status(404).json({ error: 'Etapa no encontrada.' });
  let nombre = etapa.nombre;
  if (req.body?.nombre !== undefined) {
    const resultado = nombreDeEtapa(req.body.nombre);
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    nombre = resultado.nombre;
    if (etapaRepetida(nombre, organizacionId, etapa.id)) return res.status(400).json({ error: `Ya hay una etapa "${nombre}".` });
  }
  let activa = etapa.activa;
  if (req.body?.activa !== undefined) {
    if (typeof req.body.activa !== 'boolean') return res.status(400).json({ error: 'Los datos de la etapa no son válidos.' });
    activa = req.body.activa ? 1 : 0;
  }
  if (!activa && etapa.activa) {
    const { count } = db
      .prepare('SELECT COUNT(*) AS count FROM crm_etapas WHERE organizacion_id = ? AND activa = 1 AND id <> ?')
      .get(organizacionId, etapa.id);
    if (count === 0) return res.status(400).json({ error: 'Tiene que quedar al menos una etapa activa: ahí entran las consultas nuevas.' });
  }
  withTransaction(() => {
    db.prepare('UPDATE crm_etapas SET nombre = ?, activa = ? WHERE id = ?').run(nombre, activa, etapa.id);
    auditar(req, {
      accion: 'editar',
      entidad: 'organizacion',
      entidad_id: organizacionId,
      valor_anterior: JSON.stringify({ nombre: etapa.nombre, activa: etapa.activa }),
      valor_nuevo: JSON.stringify({ nombre, activa }),
      operacion_tipo: 'crm_etapa',
      operacion_id: etapa.id,
      detalle: `Etapa de consultas "${nombre}" editada`
    });
  });
  res.json({ id: etapa.id });
});

// El orden del embudo: { ids } con todas las etapas del negocio, en el orden
// nuevo.
app.patch('/api/crm/etapas/orden', soloAdmin, (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const ids = req.body?.ids;
  const actuales = db.prepare('SELECT id FROM crm_etapas WHERE organizacion_id = ? ORDER BY orden, id').all(organizacionId).map((e) => e.id);
  const pedidos = Array.isArray(ids) ? ids.map(Number) : [];
  if (pedidos.length !== actuales.length || new Set(pedidos).size !== pedidos.length || !pedidos.every((id) => actuales.includes(id))) {
    return res.status(400).json({ error: 'Mandá todas las etapas del negocio, cada una una vez.' });
  }
  withTransaction(() => {
    const actualizar = db.prepare('UPDATE crm_etapas SET orden = ? WHERE id = ?');
    pedidos.forEach((id, i) => actualizar.run(i + 1, id));
    auditar(req, {
      accion: 'editar',
      entidad: 'organizacion',
      entidad_id: organizacionId,
      valor_anterior: JSON.stringify({ orden: actuales }),
      valor_nuevo: JSON.stringify({ orden: pedidos }),
      operacion_tipo: 'crm_etapa',
      detalle: 'Orden de las etapas de consultas cambiado'
    });
  });
  res.json({ ids: pedidos });
});

// --- Oportunidades ---

// Los orígenes que se pueden elegir, en el orden en que se muestran.
app.get('/api/crm/origenes', (req, res) => {
  res.json(Object.entries(ORIGENES_CRM).map(([clave, nombre]) => ({ clave, nombre })));
});

// Todas las del negocio, o las de un estado (?estado=abierta|ganada|perdida)
// o de un cliente (?cliente_id=). Las abiertas primero, de la más nueva a la
// más vieja.
app.get('/api/crm/oportunidades', (req, res) => {
  const filtros = ['o.organizacion_id = ?'];
  const valores = [req.usuario.organizacion_id];
  const { estado, cliente_id } = req.query;
  if (estado !== undefined) {
    if (!['abierta', 'ganada', 'perdida'].includes(estado)) return res.status(400).json({ error: 'El estado no es válido.' });
    filtros.push('o.estado = ?');
    valores.push(estado);
  }
  if (cliente_id !== undefined) {
    filtros.push('o.cliente_id = ?');
    valores.push(Number(cliente_id));
  }
  const hoy = fechaDeHoy();
  res.json(
    db
      .prepare(`${SELECT_OPORTUNIDAD} WHERE ${filtros.join(' AND ')} ORDER BY o.estado <> 'abierta', o.id DESC`)
      .all(...valores)
      .map((o) => conAviso(o, hoy))
  );
});

app.get('/api/crm/oportunidades/:id', (req, res) => {
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), req.usuario.organizacion_id);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  const actividades = db
    .prepare(`${SELECT_ACTIVIDAD} WHERE a.oportunidad_id = ? ORDER BY a.hecha, a.fecha DESC, a.id DESC`)
    .all(oportunidad.id);
  const presupuesto = oportunidad.presupuesto_id
    ? db.prepare('SELECT id, estado, fecha FROM presupuestos WHERE id = ?').get(oportunidad.presupuesto_id)
    : null;
  const socio = oportunidad.socio_id ? db.prepare('SELECT id, numero FROM socios WHERE id = ?').get(oportunidad.socio_id) : null;
  res.json({ ...conAviso(oportunidad, fechaDeHoy()), actividades, presupuesto, socio });
});

app.post('/api/crm/oportunidades', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, datos } = validarOportunidad(req.body, organizacionId);
  if (error) return res.status(400).json({ error });
  const etapaId =
    datos.etapa_id ??
    db.prepare('SELECT id FROM crm_etapas WHERE organizacion_id = ? AND activa = 1 ORDER BY orden, id LIMIT 1').get(organizacionId)?.id;
  if (!etapaId) return res.status(400).json({ error: 'El embudo no tiene ninguna etapa activa. Sumá una en Configuración.' });
  const id = withTransaction(() => {
    const nuevoId = Number(
      db
        .prepare(
          `INSERT INTO crm_oportunidades
             (cliente_id, contacto_nombre, contacto_telefono, contacto_email, origen, interes, valor_estimado,
              responsable_id, etapa_id, fecha, organizacion_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          datos.cliente_id,
          datos.nombre,
          datos.telefono,
          datos.email,
          datos.origen,
          datos.interes,
          datos.valor_estimado,
          datos.responsable_id,
          etapaId,
          fechaDeHoy(),
          organizacionId
        ).lastInsertRowid
    );
    auditarOportunidad(req, { id: nuevoId, cliente_id: datos.cliente_id }, {
      accion: 'crear',
      detalle: `Consulta #${nuevoId} de ${datos.nombre}` + (datos.interes ? `: ${datos.interes}` : '')
    });
    return nuevoId;
  });
  res.status(201).json({ id });
});

// Editar los datos (los mismos del alta). La etapa se mueve con PATCH .../etapa.
app.put('/api/crm/oportunidades/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  // Una que ya es cliente sigue siéndolo: el nombre es el de su ficha.
  const cuerpo = { ...req.body, cliente_id: oportunidad.cliente_id ?? req.body?.cliente_id, etapa_id: undefined };
  const { error, datos } = validarOportunidad(cuerpo, organizacionId);
  if (error) return res.status(400).json({ error });
  withTransaction(() => {
    db.prepare(
      `UPDATE crm_oportunidades
          SET cliente_id = ?, contacto_nombre = ?, contacto_telefono = ?, contacto_email = ?, origen = ?, interes = ?,
              valor_estimado = ?, responsable_id = ?
        WHERE id = ?`
    ).run(
      datos.cliente_id,
      datos.nombre,
      datos.telefono,
      datos.email,
      datos.origen,
      datos.interes,
      datos.valor_estimado,
      datos.responsable_id,
      oportunidad.id
    );
    auditarOportunidad(req, { ...oportunidad, cliente_id: datos.cliente_id }, {
      accion: 'editar',
      valor_anterior: JSON.stringify({ interes: oportunidad.interes, valor_estimado: oportunidad.valor_estimado, origen: oportunidad.origen }),
      valor_nuevo: JSON.stringify({ interes: datos.interes, valor_estimado: datos.valor_estimado, origen: datos.origen }),
      detalle: `Consulta #${oportunidad.id} de ${datos.nombre} editada`
    });
  });
  res.json({ id: oportunidad.id });
});

// Mover de etapa (arrastrar en el embudo). Solo una abierta, y a una etapa
// activa del negocio.
app.patch('/api/crm/oportunidades/:id/etapa', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  if (oportunidad.estado !== 'abierta') return res.status(400).json({ error: 'Esta consulta está cerrada: reabrila para moverla.' });
  const etapa = etapaDeLaEmpresa(Number(req.body?.etapa_id), organizacionId);
  if (!etapa || !etapa.activa) return res.status(400).json({ error: 'La etapa no existe.' });
  if (etapa.id === oportunidad.etapa_id) return res.json({ id: oportunidad.id });
  withTransaction(() => {
    db.prepare('UPDATE crm_oportunidades SET etapa_id = ? WHERE id = ?').run(etapa.id, oportunidad.id);
    auditarOportunidad(req, oportunidad, {
      accion: 'cambiar_estado',
      valor_anterior: JSON.stringify({ etapa: oportunidad.etapa }),
      valor_nuevo: JSON.stringify({ etapa: etapa.nombre }),
      detalle: `Consulta #${oportunidad.id} de ${oportunidad.nombre} pasó a "${etapa.nombre}"`
    });
  });
  res.json({ id: oportunidad.id });
});

// Cerrarla a mano: { resultado: 'ganada' | 'perdida', motivo }. Perdida pide el
// motivo, que es lo que después se cuenta en los números.
app.post('/api/crm/oportunidades/:id/cerrar', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  if (oportunidad.estado !== 'abierta') return res.status(400).json({ error: 'Esta consulta ya está cerrada.' });
  const { resultado, motivo } = req.body ?? {};
  if (!['ganada', 'perdida'].includes(resultado)) return res.status(400).json({ error: 'Elegí si se ganó o se perdió.' });
  if (motivo != null && typeof motivo !== 'string') return res.status(400).json({ error: 'El motivo no es válido.' });
  const texto = (motivo ?? '').trim();
  if (resultado === 'perdida' && !texto) {
    return res.status(400).json({ error: 'Contá por qué se perdió: es lo que después te muestra qué mejorar.' });
  }
  if (texto.length > LARGO_MOTIVO_PERDIDA) {
    return res.status(400).json({ error: `El motivo no puede pasar de ${LARGO_MOTIVO_PERDIDA} caracteres.` });
  }
  withTransaction(() => {
    if (resultado === 'ganada') {
      ganarOportunidad(req, oportunidad, texto || 'cerrada a mano');
      return;
    }
    db.prepare("UPDATE crm_oportunidades SET estado = 'perdida', motivo_perdida = ?, fecha_cierre = ? WHERE id = ?").run(
      texto,
      fechaDeHoy(),
      oportunidad.id
    );
    auditarOportunidad(req, oportunidad, {
      accion: 'cambiar_estado',
      valor_anterior: JSON.stringify({ estado: oportunidad.estado }),
      valor_nuevo: JSON.stringify({ estado: 'perdida', motivo: texto }),
      detalle: `Consulta #${oportunidad.id} de ${oportunidad.nombre} perdida: ${texto}`
    });
  });
  res.json({ id: oportunidad.id });
});

// Volver a abrir una cerrada, en la etapa en que estaba. Lo que generó queda
// vinculado.
app.post('/api/crm/oportunidades/:id/reabrir', (req, res) => {
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), req.usuario.organizacion_id);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  if (oportunidad.estado === 'abierta') return res.status(400).json({ error: 'Esta consulta ya está abierta.' });
  withTransaction(() => {
    db.prepare("UPDATE crm_oportunidades SET estado = 'abierta', motivo_perdida = NULL, fecha_cierre = NULL WHERE id = ?").run(
      oportunidad.id
    );
    auditarOportunidad(req, oportunidad, {
      accion: 'cambiar_estado',
      valor_anterior: JSON.stringify({ estado: oportunidad.estado }),
      valor_nuevo: JSON.stringify({ estado: 'abierta' }),
      detalle: `Consulta #${oportunidad.id} de ${oportunidad.nombre} reabierta`
    });
  });
  res.json({ id: oportunidad.id });
});

// Pasarla a cliente: con { cliente_id } se vincula uno que ya existe; sin él,
// se da de alta con el nombre, el teléfono y el email del contacto. Si ya hay
// un cliente con ese nombre no se duplica: se avisa, y la respuesta trae su id
// para vincularlo.
app.post('/api/crm/oportunidades/:id/cliente', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const oportunidad = oportunidadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!oportunidad) return res.status(404).json({ error: 'Consulta no encontrada.' });
  if (oportunidad.cliente_id) return res.status(400).json({ error: `${oportunidad.nombre} ya es cliente.` });

  let existente = null;
  if (req.body?.cliente_id != null) {
    existente = db
      .prepare('SELECT id, nombre FROM clientes WHERE id = ? AND organizacion_id = ?')
      .get(Number(req.body.cliente_id), organizacionId);
    if (!existente) return res.status(400).json({ error: 'El cliente no existe.' });
    if (existente.nombre === CONSUMIDOR_FINAL) return res.status(400).json({ error: '"Consumidor final" no puede tener consultas.' });
  } else {
    const mismo = db
      .prepare('SELECT id FROM clientes WHERE organizacion_id = ? AND nombre = ? COLLATE NOCASE')
      .get(organizacionId, oportunidad.nombre);
    if (mismo) {
      return res.status(400).json({
        error: `Ya hay un cliente que se llama ${oportunidad.nombre}. Si es la misma persona, vinculalo.`,
        cliente_id: mismo.id
      });
    }
  }

  const clienteId = withTransaction(() => {
    let id = existente?.id;
    if (!id) {
      id = Number(
        db
          .prepare('INSERT INTO clientes (nombre, telefono, email, organizacion_id) VALUES (?, ?, ?, ?)')
          .run(oportunidad.nombre, oportunidad.telefono, oportunidad.email, organizacionId).lastInsertRowid
      );
      auditar(req, {
        accion: 'crear',
        entidad: 'cliente',
        entidad_id: id,
        detalle: `Cliente "${oportunidad.nombre}" creado desde la consulta #${oportunidad.id}`
      });
    }
    db.prepare('UPDATE crm_oportunidades SET cliente_id = ? WHERE id = ?').run(id, oportunidad.id);
    // Las actividades que ya tenía pasan también a la ficha del cliente.
    db.prepare('UPDATE crm_actividades SET cliente_id = ? WHERE oportunidad_id = ? AND cliente_id IS NULL').run(id, oportunidad.id);
    auditarOportunidad(req, { ...oportunidad, cliente_id: id }, {
      accion: 'editar',
      detalle: `Consulta #${oportunidad.id} vinculada al cliente "${existente?.nombre ?? oportunidad.nombre}"`
    });
    return id;
  });
  res.json({ id: oportunidad.id, cliente_id: clienteId });
});

// --- Actividades ---

// Valida una actividad. Una nota es un registro y nace hecha; lo demás puede
// ser algo que ya pasó (hecha) o algo que falta, que pide para cuándo. Con
// `actual` (edición) lo que no viene queda como estaba.
function validarActividad(cuerpo, actual = null) {
  const datos = {};
  const tipo = cuerpo?.tipo ?? actual?.tipo;
  if (!TIPOS_ACTIVIDAD.includes(tipo)) return { error: 'Elegí qué es: llamada, mensaje, visita, nota o tarea.' };
  datos.tipo = tipo;
  if (!actual || cuerpo?.descripcion !== undefined) {
    if (typeof cuerpo?.descripcion !== 'string' || !cuerpo.descripcion.trim()) return { error: 'Contá de qué se trata.' };
    if (cuerpo.descripcion.trim().length > LARGO_ACTIVIDAD) {
      return { error: `La descripción no puede pasar de ${LARGO_ACTIVIDAD} caracteres.` };
    }
    datos.descripcion = cuerpo.descripcion.trim();
  } else {
    datos.descripcion = actual.descripcion;
  }
  if (cuerpo?.hecha !== undefined && typeof cuerpo.hecha !== 'boolean') return { error: 'Los datos de la actividad no son válidos.' };
  datos.hecha = tipo === 'nota' ? true : (cuerpo?.hecha ?? Boolean(actual?.hecha));
  const fecha = cuerpo?.fecha !== undefined ? cuerpo.fecha || null : (actual?.fecha ?? null);
  if (fecha !== null && !validarFecha(fecha)) return { error: 'La fecha no es válida.' };
  if (!datos.hecha && !fecha) return { error: 'Elegí para cuándo es.' };
  datos.fecha = fecha ?? fechaDeHoy();
  return { datos };
}

// Las actividades de un cliente (las suyas y las de sus consultas), para su
// ficha: ?cliente_id=.
app.get('/api/crm/actividades', (req, res) => {
  const clienteId = Number(req.query.cliente_id);
  if (!esIdValido(clienteId)) return res.status(400).json({ error: 'Indicá el cliente.' });
  res.json(
    db
      .prepare(
        `${SELECT_ACTIVIDAD} WHERE a.organizacion_id = ? AND COALESCE(a.cliente_id, o.cliente_id) = ?
          ORDER BY a.hecha, a.fecha DESC, a.id DESC LIMIT 100`
      )
      .all(req.usuario.organizacion_id, clienteId)
  );
});

// Alta: { oportunidad_id?, cliente_id?, tipo, descripcion, fecha?, hecha? }.
// Cuelga de una consulta o de un cliente; la de una consulta que ya es cliente
// sale también en su ficha.
app.post('/api/crm/actividades', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const { error, datos } = validarActividad(req.body);
  if (error) return res.status(400).json({ error });
  let oportunidad = null;
  let clienteId = null;
  if (req.body?.oportunidad_id != null) {
    oportunidad = oportunidadDeLaEmpresa(Number(req.body.oportunidad_id), organizacionId);
    if (!oportunidad) return res.status(400).json({ error: 'La consulta no existe.' });
    clienteId = oportunidad.cliente_id;
  } else if (req.body?.cliente_id != null) {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ? AND organizacion_id = ?').get(Number(req.body.cliente_id), organizacionId);
    if (!cliente) return res.status(400).json({ error: 'El cliente no existe.' });
    clienteId = cliente.id;
  } else {
    return res.status(400).json({ error: 'La actividad tiene que ser de una consulta o de un cliente.' });
  }
  const id = withTransaction(() => {
    const nuevoId = Number(
      db
        .prepare(
          `INSERT INTO crm_actividades (oportunidad_id, cliente_id, tipo, descripcion, fecha, hecha, fecha_hecha, usuario_id, organizacion_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          oportunidad?.id ?? null,
          clienteId,
          datos.tipo,
          datos.descripcion,
          datos.fecha,
          datos.hecha ? 1 : 0,
          datos.hecha ? fechaDeHoy() : null,
          req.usuario.id,
          organizacionId
        ).lastInsertRowid
    );
    auditar(req, {
      accion: 'crear',
      entidad: clienteId ? 'cliente' : 'organizacion',
      entidad_id: clienteId ?? organizacionId,
      operacion_tipo: 'actividad',
      operacion_id: nuevoId,
      detalle: `${datos.hecha ? 'Anotó' : 'Agendó'} ${datos.tipo}: ${datos.descripcion}` + (oportunidad ? ` (consulta #${oportunidad.id})` : '')
    });
    return nuevoId;
  });
  res.status(201).json({ id });
});

// Marcarla hecha o pendiente, o corregirla.
app.patch('/api/crm/actividades/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const actividad = actividadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada.' });
  const { error, datos } = validarActividad(req.body, actividad);
  if (error) return res.status(400).json({ error });
  const fechaHecha = datos.hecha ? (actividad.hecha ? actividad.fecha_hecha : fechaDeHoy()) : null;
  withTransaction(() => {
    db.prepare('UPDATE crm_actividades SET tipo = ?, descripcion = ?, fecha = ?, hecha = ?, fecha_hecha = ? WHERE id = ?').run(
      datos.tipo,
      datos.descripcion,
      datos.fecha,
      datos.hecha ? 1 : 0,
      fechaHecha,
      actividad.id
    );
    const cambioDeEstado = datos.hecha !== Boolean(actividad.hecha);
    auditar(req, {
      accion: cambioDeEstado ? 'cambiar_estado' : 'editar',
      entidad: actividad.cliente_id ? 'cliente' : 'organizacion',
      entidad_id: actividad.cliente_id ?? organizacionId,
      valor_anterior: JSON.stringify({ hecha: Boolean(actividad.hecha), fecha: actividad.fecha, descripcion: actividad.descripcion }),
      valor_nuevo: JSON.stringify({ hecha: datos.hecha, fecha: datos.fecha, descripcion: datos.descripcion }),
      operacion_tipo: 'actividad',
      operacion_id: actividad.id,
      detalle: `${datos.tipo}: ${datos.descripcion} (${cambioDeEstado ? (datos.hecha ? 'hecha' : 'otra vez pendiente') : 'editada'})`
    });
  });
  res.json({ id: actividad.id });
});

app.delete('/api/crm/actividades/:id', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const actividad = actividadDeLaEmpresa(Number(req.params.id), organizacionId);
  if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada.' });
  withTransaction(() => {
    db.prepare('DELETE FROM crm_actividades WHERE id = ?').run(actividad.id);
    auditar(req, {
      accion: 'anular',
      entidad: actividad.cliente_id ? 'cliente' : 'organizacion',
      entidad_id: actividad.cliente_id ?? organizacionId,
      valor_anterior: JSON.stringify({
        tipo: actividad.tipo,
        descripcion: actividad.descripcion,
        fecha: actividad.fecha,
        hecha: Boolean(actividad.hecha)
      }),
      operacion_tipo: 'actividad',
      operacion_id: actividad.id,
      detalle: `Borró ${actividad.tipo}: ${actividad.descripcion}`
    });
  });
  res.status(204).end();
});

// --- Para hoy ---

// Lo que hay que hacer hoy: las actividades vencidas o de hoy, las consultas
// abiertas sin próxima acción, los presupuestos enviados que siguen sin
// respuesta (por su fecha: el presupuesto no guarda cuándo se envió) y los
// abonos que deben. Pone los abonos al día, como GET /api/abonos: un GET que
// escribe a propósito (hist. §74).
app.get('/api/crm/para-hoy', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const hoy = fechaDeHoy();
  const actividades = db
    .prepare(`${SELECT_ACTIVIDAD} WHERE a.organizacion_id = ? AND a.hecha = 0 AND a.fecha <= ? ORDER BY a.fecha, a.id`)
    .all(organizacionId, hoy)
    .map((a) => ({ ...a, vencida: a.fecha < hoy }));
  const sinAccion = db
    .prepare(`${SELECT_OPORTUNIDAD} WHERE o.organizacion_id = ? AND o.estado = 'abierta' AND proxima.id IS NULL ORDER BY o.id DESC`)
    .all(organizacionId)
    .map((o) => conAviso(o, hoy));
  const presupuestos = db
    .prepare(
      `SELECT presupuestos.id, presupuestos.fecha, presupuestos.cliente_id, clientes.nombre AS cliente,
              clientes.telefono AS cliente_telefono,
              (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM presupuesto_items
                WHERE presupuesto_items.presupuesto_id = presupuestos.id) AS total
         FROM presupuestos JOIN clientes ON clientes.id = presupuestos.cliente_id
        WHERE presupuestos.organizacion_id = ? AND presupuestos.estado = 'enviado' AND presupuestos.fecha <= ?
          AND (presupuestos.vencimiento IS NULL OR presupuestos.vencimiento >= ?)
        ORDER BY presupuestos.fecha, presupuestos.id`
    )
    .all(organizacionId, sumarDias(hoy, -DIAS_PRESUPUESTO_SIN_RESPUESTA), hoy)
    .map((p) => ({ ...p, dias: diffDias(p.fecha, hoy) }));

  ponerAbonosAlDia(organizacionId);
  const cuotas = db.prepare(`${SELECT_CUOTAS_ABONO} WHERE abonos.organizacion_id = ?`).all(organizacionId);
  const porAbono = Map.groupBy(cuotas, (c) => c.abono_id);
  const abonos = db
    .prepare(`${SELECT_ABONO} WHERE abonos.organizacion_id = ? ORDER BY clientes.nombre, abonos.id`)
    .all(organizacionId)
    .map((a) => conCuotas(a, porAbono.get(a.id) ?? []))
    .filter((a) => a.deuda > 0)
    .map(({ id, cliente_id, cliente, cliente_telefono, servicio, deuda, cuotas_impagas }) => ({
      id,
      cliente_id,
      cliente,
      cliente_telefono,
      servicio,
      deuda,
      cuotas_impagas
    }));

  res.json({
    hoy,
    actividades,
    sin_accion: sinAccion,
    presupuestos,
    abonos,
    total: actividades.length + sinAccion.length + presupuestos.length + abonos.length
  });
});

// --- Dejaron de comprar ---

// Los clientes que compraban (dos ventas o más) y no compran hace más de
// ?dias= (90 si no viene). Sale de las ventas, no se carga a mano. Dice si ya
// tienen un seguimiento agendado, para no llamarlos dos veces.
app.get('/api/crm/inactivos', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const dias = req.query.dias === undefined ? DIAS_INACTIVO_POR_DEFECTO : Number(req.query.dias);
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) return res.status(400).json({ error: 'La cantidad de días no es válida.' });
  const hoy = fechaDeHoy();
  res.json(
    db
      .prepare(
        `SELECT clientes.id, clientes.nombre, clientes.telefono, clientes.email,
                COUNT(ventas.id) AS compras, MAX(ventas.fecha) AS ultima_compra,
                SUM((SELECT COALESCE(SUM(venta_items.cantidad * venta_items.precio_unitario), 0)
                       FROM venta_items WHERE venta_items.venta_id = ventas.id) - ${SUBQUERY_DEVUELTO_VENTA}) AS total_comprado,
                EXISTS (SELECT 1 FROM crm_actividades a
                          LEFT JOIN crm_oportunidades o ON o.id = a.oportunidad_id
                         WHERE a.organizacion_id = clientes.organizacion_id AND a.hecha = 0
                           AND COALESCE(a.cliente_id, o.cliente_id) = clientes.id) AS con_seguimiento
           FROM clientes JOIN ventas ON ventas.cliente_id = clientes.id AND ventas.estado = 'activa'
          WHERE clientes.organizacion_id = ? AND clientes.nombre <> ?
          GROUP BY clientes.id
         HAVING COUNT(ventas.id) >= 2 AND MAX(ventas.fecha) < ?
          ORDER BY MAX(ventas.fecha) DESC
          LIMIT 200`
      )
      .all(organizacionId, CONSUMIDOR_FINAL, sumarDias(hoy, -dias))
      .map((c) => ({
        ...c,
        total_comprado: redondear2(c.total_comprado),
        con_seguimiento: Boolean(c.con_seguimiento),
        dias: diffDias(c.ultima_compra, hoy)
      }))
  );
});

// --- Números ---

// Consultas por origen (cuántas y cuántas se ganaron), cómo está el embudo
// (abiertas y valor en juego por etapa) y por qué se pierden. Con ?desde=,
// solo las consultas que entraron desde ese día.
app.get('/api/crm/reporte', (req, res) => {
  const organizacionId = req.usuario.organizacion_id;
  const desde = req.query.desde === undefined ? '0000-01-01' : validarFecha(req.query.desde);
  if (!desde) return res.status(400).json({ error: 'La fecha no es válida.' });
  const porOrigen = db
    .prepare(
      `SELECT origen, COUNT(*) AS total, SUM(estado = 'ganada') AS ganadas, SUM(estado = 'perdida') AS perdidas
         FROM crm_oportunidades WHERE organizacion_id = ? AND fecha >= ?
        GROUP BY origen ORDER BY total DESC`
    )
    .all(organizacionId, desde)
    .map((o) => ({ ...o, origen_nombre: ORIGENES_CRM[o.origen] ?? 'Sin anotar' }));
  const porEtapa = db
    .prepare(
      `SELECT crm_etapas.id, crm_etapas.nombre, crm_etapas.activa,
              COUNT(o.id) AS abiertas, COALESCE(SUM(o.valor_estimado), 0) AS valor
         FROM crm_etapas
         LEFT JOIN crm_oportunidades o ON o.etapa_id = crm_etapas.id AND o.estado = 'abierta'
        WHERE crm_etapas.organizacion_id = ?
        GROUP BY crm_etapas.id ORDER BY crm_etapas.orden, crm_etapas.id`
    )
    .all(organizacionId);
  const motivos = db
    .prepare(
      `SELECT MIN(motivo_perdida) AS motivo, COUNT(*) AS total FROM crm_oportunidades
        WHERE organizacion_id = ? AND estado = 'perdida' AND fecha >= ?
        GROUP BY motivo_perdida COLLATE NOCASE ORDER BY total DESC LIMIT 10`
    )
    .all(organizacionId, desde);
  const ganadas = porOrigen.reduce((acc, o) => acc + o.ganadas, 0);
  const perdidas = porOrigen.reduce((acc, o) => acc + o.perdidas, 0);
  res.json({
    total: porOrigen.reduce((acc, o) => acc + o.total, 0),
    ganadas,
    perdidas,
    // Sobre las cerradas: de las abiertas todavía no se sabe.
    conversion: ganadas + perdidas > 0 ? redondear2((ganadas / (ganadas + perdidas)) * 100) : null,
    por_origen: porOrigen,
    por_etapa: porEtapa,
    motivos
  });
});

// Una ruta de API que no existe responde JSON, no el HTML por defecto de
// Express. Va después de todas las rutas y de `autenticar`.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejador final: todo error que llega acá (un throw síncrono, un JSON
// malformado, un handler `async` envuelto en asincrono()) responde JSON
// genérico. Sin esto Express devuelve HTML con el stack trace completo salvo
// que NODE_ENV=production, y `npm start` no lo setea (CLAUDE.md §35). El
// detalle va al log del servidor, nunca al cliente.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande.' });
  }
  if (err instanceof ErrorValidacion) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ErrorPlan) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  }
  // Errores del cliente que Express/body-parser ya clasificó (una URL mal
  // codificada con `%`, un Content-Encoding que no soporta): conservan su 4xx
  // en vez de pasar por 500, que además llenaría el log de stacks.
  const estado = err?.status ?? err?.statusCode;
  if (estado >= 400 && estado < 500) {
    return res.status(estado).json({ error: 'Petición inválida.' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Red de seguridad: un rechazo que nadie capturó no debería tirar el proceso
// de todas las empresas. Se registra para que no pase desapercibido.
process.on('unhandledRejection', (motivo) => {
  console.error('[unhandledRejection]', motivo);
});

// NEXO_HOST=127.0.0.1 en el servidor publicado (deploy/, hist. §103): Node solo
// atiende a Caddy, que está en la misma máquina. Sin ella escucha en todas las
// interfaces, como siempre en desarrollo.
app.listen(PORT, process.env.NEXO_HOST || undefined, () => {
  console.log(`Nexo backend escuchando en http://${process.env.NEXO_HOST || 'localhost'}:${PORT}`);
});
