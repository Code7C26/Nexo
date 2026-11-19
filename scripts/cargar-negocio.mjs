// Carga los datos de un negocio real desde un archivo, para dejárselo armado
// al dueño: `npm run cargar -- --email <mail> --datos <archivo.json>`.
//
// Para entregarle a alguien su negocio ya cargado (el primero, el gimnasio de
// artes marciales del primer piloto, hist. §201). La cuenta y el negocio se
// crean antes con el alta de siempre; esto carga lo de adentro. Como la demo
// (scripts/demo.mjs), todo entra por la API HTTP, con sus validaciones y su
// auditoría. Se puede correr de nuevo: lo que ya está (por nombre, y cada
// horario por actividad, día y hora) se saltea, y no se duplica nada.
//
// Uso:
//   --url <url>        el servidor (por defecto, el de Nexo).
//   --email <mail>     la cuenta. La contraseña se pide al correr, sin mostrarla
//                      (o NEXO_DEMO_CLAVE).
//   --negocio <nombre> en qué negocio de la cuenta (si tiene uno solo, ese).
//   --datos <archivo>  el JSON con los datos, así (todo es opcional):
//
//   {
//     "profes": ["Juan Pérez"],
//     "actividades": [{ "nombre": "BJJ", "horario": "fijo", "color": "violeta" }],
//     "clases": [{ "actividad": "BJJ", "dias": ["lun", "mie"], "desde": "19:00", "hasta": "20:30",
//                  "profes": ["Juan Pérez"], "detalle": "Adultos", "cupo": 20 },
//                { "actividades": ["Boxeo", "MMA"], "dias": ["vie"], "desde": "19:00", "hasta": "20:00",
//                  "detalle": "Sparring" }],
//     "planes": [{ "nombre": "BJJ 2 veces por semana", "opciones": [{ "meses": 1, "precio": 30000 }] }],
//     "descuentos": [{ "nombre": "Hermanos", "porcentaje": 50, "aplica": "manual" }],
//     "productos": [{ "nombre": "Kimono A2", "precio_venta": 90000, "categoria": "Indumentaria",
//                     "stock": 3, "costo": 60000 }]
//   }
//
// "horario" es fijo (clases a una hora) o libre (abierta en una franja). Los
// colores: azul, naranja, verde, violeta, rojo, amarillo, rosa o gris. Los
// días: lun, mar, mie, jue, vie, sab, dom.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { clienteDeApi } from '../backend/negocios-de-ejemplo.js';

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const sinTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mismo = (a, b) => sinTildes(a) === sinTildes(b);

function diaDe(texto) {
  const dia = DIAS.indexOf(sinTildes(String(texto)).slice(0, 3));
  if (dia === -1) throw new Error(`"${texto}" no es un día (lun, mar, mie, jue, vie, sab o dom).`);
  return dia;
}

// La contraseña sin que se vea en la pantalla ni quede en el historial.
function pedirClave(pregunta) {
  if (process.env.NEXO_DEMO_CLAVE) return Promise.resolve(process.env.NEXO_DEMO_CLAVE);
  process.stdout.write(pregunta);
  const entrada = process.stdin;
  entrada.setRawMode(true);
  entrada.resume();
  entrada.setEncoding('utf8');
  return new Promise((resolver) => {
    let clave = '';
    entrada.on('data', function leer(texto) {
      for (const letra of texto) {
        if (letra === '\r' || letra === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', leer);
          process.stdout.write('\n');
          return resolver(clave);
        }
        if (letra === '\u0003') process.exit(1);
        if (letra === '\u007f' || letra === '\b') clave = clave.slice(0, -1);
        else clave += letra;
      }
    });
  });
}

async function cargarProfes(api, nombres) {
  const empleados = await api.get('/api/empleados');
  const profes = new Map(empleados.filter((e) => e.activo).map((e) => [sinTildes(e.nombre), e.id]));
  let nuevos = 0;
  for (const nombre of nombres) {
    if (profes.has(sinTildes(nombre))) continue;
    profes.set(sinTildes(nombre), (await api.post('/api/empleados', { nombre })).id);
    nuevos += 1;
  }
  console.log(`- Profes: ${nuevos} nuevos, ${nombres.length - nuevos} ya estaban.`);
  return profes;
}

async function cargarGrilla(api, { actividades = [], clases = [] }, profes) {
  const grilla = await api.get('/api/grilla');
  const porNombre = new Map(grilla.actividades.filter((a) => a.activo).map((a) => [sinTildes(a.nombre), a.id]));
  let nuevas = 0;
  for (const a of actividades) {
    if (porNombre.has(sinTildes(a.nombre))) continue;
    porNombre.set(sinTildes(a.nombre), (await api.post('/api/actividades', a)).id);
    nuevas += 1;
  }
  console.log(`- Actividades: ${nuevas} nuevas, ${actividades.length - nuevas} ya estaban.`);

  // Un horario ya cargado: misma actividad principal, día, hora y detalle (a
  // la misma hora puede haber dos de BJJ Kids, de edades distintas).
  const existe = (actividadId, dia, desde, detalle) =>
    grilla.clases.some(
      (c) => c.actividad_id === actividadId && c.dia_semana === dia && c.desde === desde && (c.detalle ?? '') === (detalle ?? '')
    );
  let horarios = 0;
  for (const c of clases) {
    // Una clase compartida (hist. §202) trae "actividades": la primera es la principal.
    const ids = (c.actividades ?? [c.actividad]).map((nombre) => {
      const id = porNombre.get(sinTildes(nombre));
      if (!id) throw new Error(`El horario de "${nombre}" no tiene su actividad en "actividades".`);
      return id;
    });
    const actividadId = ids[0];
    const dias = c.dias.map(diaDe).filter((dia) => !existe(actividadId, dia, c.desde, c.detalle));
    if (!dias.length) continue;
    const profesDeClase = (c.profes ?? []).map((nombre) => {
      const id = profes.get(sinTildes(nombre));
      if (!id) throw new Error(`"${nombre}" no está en "profes".`);
      return id;
    });
    const creadas = await api.post('/api/clases', {
      actividades: ids,
      dias,
      desde: c.desde,
      hasta: c.hasta,
      profes: profesDeClase,
      detalle: c.detalle ?? '',
      cupo: c.cupo ?? ''
    });
    grilla.clases.push(...creadas);
    horarios += creadas.length;
  }
  console.log(`- Horarios: ${horarios} nuevos.`);
}

async function cargarPlanes(api, planes) {
  const existentes = await api.get('/api/planes-socio');
  let nuevos = 0;
  for (const plan of planes) {
    if (existentes.some((p) => mismo(p.nombre, plan.nombre))) continue;
    await api.post('/api/planes-socio', plan);
    nuevos += 1;
  }
  console.log(`- Planes: ${nuevos} nuevos, ${planes.length - nuevos} ya estaban.`);
}

// Los descuentos de socios: "manual" (se elige a cada socio, como el de
// hermanos), "combo" (con "planes", por nombre) o "cantidad" (con
// "minimo_planes").
async function cargarDescuentos(api, descuentos) {
  const existentes = await api.get('/api/descuentos-socio');
  const planes = await api.get('/api/planes-socio');
  let nuevos = 0;
  for (const { planes: nombres = [], ...descuento } of descuentos) {
    if (existentes.some((d) => mismo(d.nombre, descuento.nombre))) continue;
    const ids = nombres.map((nombre) => {
      const plan = planes.find((p) => mismo(p.nombre, nombre));
      if (!plan) throw new Error(`El descuento "${descuento.nombre}" nombra el plan "${nombre}", que no está.`);
      return plan.id;
    });
    await api.post('/api/descuentos-socio', { ...descuento, planes: ids });
    nuevos += 1;
  }
  console.log(`- Descuentos: ${nuevos} nuevos, ${descuentos.length - nuevos} ya estaban.`);
}

async function cargarProductos(api, productos) {
  const existentes = await api.get('/api/productos');
  const categorias = new Map((await api.get('/api/categorias')).map((c) => [sinTildes(c.nombre), c.id]));
  const categoria = async (nombre) => {
    if (!categorias.has(sinTildes(nombre))) categorias.set(sinTildes(nombre), (await api.post('/api/categorias', { nombre })).id);
    return categorias.get(sinTildes(nombre));
  };
  const conStock = [];
  let nuevos = 0;
  for (const { categoria: nombreCategoria, stock, costo, ...datos } of productos) {
    if (existentes.some((p) => mismo(p.nombre, datos.nombre))) continue;
    const creado = await api.post('/api/productos', {
      stock_minimo: 0,
      ...datos,
      ...(nombreCategoria ? { categoria_id: await categoria(nombreCategoria) } : {})
    });
    nuevos += 1;
    if (stock) conStock.push({ producto_id: creado.id, cantidad: stock, costo: costo ?? 0 });
  }
  // El stock de arranque, como la carga inicial (con su costo y su movimiento).
  if (conStock.length) await api.post('/api/carga-inicial/stock', { filas: conStock });
  console.log(`- Productos: ${nuevos} nuevos (${conStock.length} con stock), ${productos.length - nuevos} ya estaban.`);
}

async function principal() {
  const { values: op } = parseArgs({
    options: {
      url: { type: 'string', default: 'https://nexosystem.duckdns.org' },
      email: { type: 'string' },
      negocio: { type: 'string' },
      datos: { type: 'string' }
    }
  });
  if (!op.email || !op.datos) throw new Error('Indicá la cuenta con --email <mail> y los datos con --datos <archivo.json>.');
  const datos = JSON.parse(readFileSync(op.datos, 'utf8'));

  const api = clienteDeApi(op.url);
  await api.post('/api/auth/login', { email: op.email, password: await pedirClave(`Contraseña de ${op.email}: `) });
  const negocios = await api.get('/api/negocios');
  const negocio = op.negocio ? negocios.find((n) => mismo(n.nombre, op.negocio)) : negocios.length === 1 ? negocios[0] : null;
  if (!negocio) {
    throw new Error(`Elegí el negocio con --negocio: ${negocios.map((n) => `"${n.nombre}"`).join(', ') || 'la cuenta no tiene ninguno'}.`);
  }
  await api.post(`/api/negocios/${negocio.id}/entrar`);
  console.log(`Cargando en ${negocio.nombre}:`);

  const profes = await cargarProfes(api, datos.profes ?? []);
  await cargarGrilla(api, datos, profes);
  await cargarPlanes(api, datos.planes ?? []);
  await cargarDescuentos(api, datos.descuentos ?? []);
  await cargarProductos(api, datos.productos ?? []);
  console.log('Listo.');
}

principal().catch((err) => {
  console.error(`\ncargar: ${err.message}`);
  process.exitCode = 1;
});
