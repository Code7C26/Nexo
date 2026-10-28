// Arnés de las pruebas de API: levanta server.js como proceso hijo contra una
// base temporal y da un cliente HTTP con cookie de sesión. Nunca toca
// backend/db/nexo.db: NEXO_DB_PATH apunta a una carpeta temporal y el respaldo
// automático se apaga (db/respaldo.js). Los scripts de verificación de
// scripts/ (seed, regresion-head) lo reusan con otro backend o una base dada.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendPropio = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Cliente con "cookie jar" mínimo: guarda lo que el servidor setea y lo manda
// de vuelta. Devuelve { status, json } sin lanzar nunca por un 4xx/5xx, así los
// tests pueden afirmar sobre el código de error.
export function crearCliente(url) {
  const cookies = new Map();
  async function pedir(metodo, ruta, cuerpo, cabeceras = {}) {
    const headers = { 'content-type': 'application/json', ...cabeceras };
    if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url + ruta, {
      method: metodo,
      headers,
      // Un string se manda tal cual: sirve para probar JSON malformado.
      body: cuerpo === undefined ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
    });
    for (const linea of res.headers.getSetCookie()) {
      const [par] = linea.split(';');
      const i = par.indexOf('=');
      const valor = par.slice(i + 1);
      if (valor) cookies.set(par.slice(0, i), valor);
      else cookies.delete(par.slice(0, i));
    }
    const texto = await res.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* respuesta no-JSON: se devuelve en `texto` */
    }
    return { status: res.status, json, texto, headers: res.headers };
  }
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
    put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
    patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
    del: (ruta) => pedir('DELETE', ruta),
    // Con cabeceras propias, como la del negocio que muestra la pestaña.
    pedir
  };
}

// Sin argumentos: este backend contra una base nueva en una carpeta temporal.
// `backendDir` levanta otro árbol (un worktree de HEAD, en regresion-head);
// `dbPath` usa una base que ya existe. Esa base no se borra al cerrar: solo
// la carpeta temporal propia del arnés. `env` suma variables (por ejemplo,
// NEXO_ZONA_HORARIA). Los mails no salen: NEXO_MAIL=stub los guarda en
// `<dir>/mails`, y leerMails() los devuelve (hist. §102).
export async function levantarServidor({ backendDir = backendPropio, dbPath, env = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-api-'));
  const carpetaMails = path.join(dir, 'mails');
  const puerto = await puertoLibre();
  const url = `http://127.0.0.1:${puerto}`;
  const hijo = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(puerto),
      NEXO_DB_PATH: dbPath ?? path.join(dir, 'nexo.db'),
      NEXO_BACKUP: 'off',
      NEXO_INTERPRETE: 'stub',
      NODE_ENV: 'test',
      NEXO_MAIL: 'stub',
      NEXO_MAIL_DIR: carpetaMails,
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let salida = '';
  hijo.stdout.on('data', (d) => (salida += d));
  hijo.stderr.on('data', (d) => (salida += d));

  // Si el runner muere (o un test cuelga y se lo mata), el servidor hijo no
  // tiene que quedar huérfano escuchando en un puerto.
  const matarAlSalir = () => {
    if (hijo.exitCode === null) hijo.kill();
  };
  process.once('exit', matarAlSalir);

  try {
    await new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error(`El servidor no arrancó en 20 s:\n${salida}`)), 20000);
      hijo.once('exit', (codigo) => {
        clearTimeout(limite);
        reject(new Error(`El servidor salió con código ${codigo}:\n${salida}`));
      });
      hijo.stdout.on('data', () => {
        if (salida.includes('escuchando')) {
          clearTimeout(limite);
          resolve();
        }
      });
    });
  } catch (err) {
    // Sin esto, un arranque que expira dejaba el hijo vivo (sus pipes
    // mantienen el event loop abierto y `node --test` no termina) y la carpeta
    // temporal sin borrar: `after` no corre porque `servidor` nunca se asignó.
    matarAlSalir();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    throw err;
  }

  async function cerrar() {
    if (hijo.exitCode === null) {
      hijo.removeAllListeners('exit');
      const termino = new Promise((resolve) => hijo.once('exit', resolve));
      hijo.kill();
      await termino;
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  return { url, dir, cerrar, salida: () => salida, leerMails: lectorDeMails(carpetaMails) };
}

// Los mails que guardó un servidor con NEXO_MAIL=stub en `carpeta`, del más
// viejo al más nuevo; con `para`, solo los de ese destinatario. Exportado para
// el seed con --url, contra un servidor que no levantó este arnés.
export function lectorDeMails(carpeta) {
  return (para) => {
    let archivos;
    try {
      archivos = readdirSync(carpeta).sort();
    } catch {
      return [];
    }
    const mails = archivos.map((a) => JSON.parse(readFileSync(path.join(carpeta, a), 'utf8')));
    return para ? mails.filter((m) => m.para === para) : mails;
  };
}

// El token del último enlace que se mandó a un mail (`ruta` sin la barra:
// 'verificar-mail').
export function ultimoEnlace(servidor, para, ruta = 'verificar-mail') {
  const mails = servidor.leerMails(para);
  const texto = mails.at(-1)?.texto ?? '';
  const encontrado = texto.match(new RegExp(`/${ruta}[?]token=([A-Za-z0-9_-]+)`));
  return encontrado?.[1] ?? null;
}

// Los términos aceptados y la edad declarada (etapa 8b, Fase 3), que el alta
// de una cuenta exige. Los tests de terminos.test.js prueban sin ellos.
export const ACEPTA = { acepta_terminos: true, edad: 'mayor' };

// Crea una empresa con su admin por el registro público y devuelve el cliente
// ya logueado como ese admin. Nace en Pro (la prueba de 14 días, hist. §98)
// para que los topes de Gratis no se crucen con lo que prueba cada test; los
// de planes piden `plan: 'gratis'`. La cuenta se crea con el mail (hist.
// §102): sin `email`, `<usuario>@nexo.test`, así los tests siguen nombrando a
// cada cuenta por su usuario de siempre.
export async function registrarEmpresa(
  url,
  { empresa, usuario, email = `${usuario}@nexo.test`, nombre = 'Admin', password = 'clave-segura-1', plan = 'pro' }
) {
  const cliente = crearCliente(url);
  const r = await cliente.post('/api/auth/registro', { empresa, email_cuenta: email, nombre, password, plan, ...ACEPTA });
  if (r.status !== 201) throw new Error(`Registro falló (${r.status}): ${r.texto}`);
  return cliente;
}

// El token del último enlace de invitación que se mandó a un mail
// (/app#/unirme/<token>, hist. §104).
export function tokenDeInvitacion(servidor, para) {
  const texto = servidor.leerMails(para).at(-1)?.texto ?? '';
  return texto.match(/#\/unirme\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

// Un empleado como entra desde hist. §104: el admin lo invita a
// `<usuario>@nexo.test` (si no viene `email`) y la persona crea su cuenta
// desde el enlace del mail, que la deja adentro del negocio y con el mail
// confirmado. `servidor` es { url, leerMails }: lo que devuelve
// levantarServidor. Devuelve el cliente ya logueado como empleado (o como otro
// admin, con `rol`).
export async function crearEmpleado(
  servidor,
  admin,
  { usuario, email = `${usuario}@nexo.test`, nombre = 'Empleado', password = 'clave-segura-2', rol = 'empleado' }
) {
  const invitacion = await admin.post('/api/invitaciones', { email, rol });
  if (invitacion.status >= 300) throw new Error(`Invitar al empleado falló (${invitacion.status}): ${invitacion.texto}`);
  if (!servidor.leerMails) {
    throw new Error('Sin los mails del servidor (NEXO_MAIL=stub) no hay enlace con qué aceptar la invitación.');
  }
  const token = tokenDeInvitacion(servidor, email);
  if (!token) throw new Error(`No le llegó la invitación a ${email}.`);
  const cliente = crearCliente(servidor.url);
  const cuenta = await cliente.post('/api/auth/invitacion/cuenta', { token, nombre, password, ...ACEPTA });
  if (cuenta.status !== 201) throw new Error(`Crear la cuenta desde la invitación falló (${cuenta.status}): ${cuenta.texto}`);
  return cliente;
}
