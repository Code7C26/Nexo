// Arnés de las pruebas de API: levanta server.js como proceso hijo contra una
// base temporal y da un cliente HTTP con cookie de sesión. Nunca toca
// backend/db/nexo.db: NEXO_DB_PATH apunta a una carpeta temporal y el respaldo
// automático se apaga (db/respaldo.js).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  async function pedir(metodo, ruta, cuerpo) {
    const headers = { 'content-type': 'application/json' };
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
    patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo)
  };
}

export async function levantarServidor() {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-api-'));
  const puerto = await puertoLibre();
  const url = `http://127.0.0.1:${puerto}`;
  const hijo = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(puerto),
      NEXO_DB_PATH: path.join(dir, 'nexo.db'),
      NEXO_BACKUP: 'off',
      NEXO_INTERPRETE: 'stub',
      NODE_ENV: 'test'
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

  return { url, dir, cerrar, salida: () => salida };
}

// Crea una empresa con su admin por el registro público y devuelve el cliente
// ya logueado como ese admin.
export async function registrarEmpresa(url, { empresa, usuario, nombre = 'Admin', password = 'clave-segura-1' }) {
  const cliente = crearCliente(url);
  const r = await cliente.post('/api/auth/registro', { empresa, usuario, nombre, password });
  if (r.status !== 201) throw new Error(`Registro falló (${r.status}): ${r.texto}`);
  return cliente;
}

// Alta de un empleado por el admin y primer login con cambio de contraseña
// obligatorio. Devuelve el cliente ya logueado como empleado.
export async function crearEmpleado(url, admin, { usuario, nombre = 'Empleado', password = 'clave-segura-2' }) {
  const alta = await admin.post('/api/usuarios', { usuario, nombre, password: 'clave-temporal-1', rol: 'empleado' });
  if (alta.status !== 201) throw new Error(`Alta de empleado falló (${alta.status}): ${alta.texto}`);
  const cliente = crearCliente(url);
  const login = await cliente.post('/api/auth/login', { usuario, password: 'clave-temporal-1' });
  if (login.status !== 200) throw new Error(`Login del empleado falló (${login.status}): ${login.texto}`);
  const cambio = await cliente.post('/api/auth/cambiar-password', { actual: 'clave-temporal-1', nueva: password });
  if (cambio.status >= 300) throw new Error(`Cambio de contraseña falló (${cambio.status}): ${cambio.texto}`);
  return cliente;
}
