// Planes de Nexo (hist. §98): los topes de Gratis, la prueba de 14 días, el
// script que cambia el plan y que un negocio no pueda cambiárselo solo. Con su
// propio servidor: llena un negocio hasta el tope y no tiene que cruzarse con
// lo que prueba api.test.js.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let servidor;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

// scripts/plan.mjs contra la base del servidor de prueba.
function scriptPlan(...args) {
  const r = spawnSync(process.execPath, ['scripts/plan.mjs', ...args], {
    cwd: raiz,
    env: { ...process.env, NEXO_DB_PATH: path.join(servidor.dir, 'nexo.db') },
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const esTope = (r) => r.status === 403 && r.json?.codigo === 'limite_plan';

test('los planes se leen sin sesión', async () => {
  const r = await crearCliente(servidor.url).get('/api/auth/planes');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.json.planes.map((p) => [p.clave, p.precio]),
    [['gratis', 0], ['emprendedor', 19900], ['pro', 34900]]
  );
  assert.equal(r.json.dias_prueba, 14);
  const gratis = r.json.planes[0];
  assert.deepEqual([gratis.usuarios, gratis.productos, gratis.ventas_mes, gratis.marca], [1, 100, 300, true]);
});

test('Gratis: un usuario, un negocio, 100 productos y 300 ventas por mes, sin frenar las cuotas', async () => {
  const admin = await registrarEmpresa(servidor.url, { empresa: 'Medialunas Tomi', usuario: 'tomi', plan: 'gratis' });
  const negocio = (await admin.get('/api/negocio')).json;
  assert.equal(negocio.plan.clave, 'gratis');
  assert.equal(negocio.plan.vence, null);
  assert.equal(negocio.plan.marca, true);
  assert.deepEqual(negocio.plan.uso.usuarios, { usados: 1, tope: 1 });

  // Usuarios y negocios.
  const empleado = await admin.post('/api/usuarios', { usuario: 'ayudante', nombre: 'Ayudante', password: 'clave-temporal-1' });
  assert.ok(esTope(empleado), empleado.texto);
  assert.match(empleado.json.error, /Emprendedor/);
  const otroNegocio = await admin.post('/api/negocios', { nombre: 'Otro local', rubro: 'comercio' });
  assert.ok(esTope(otroNegocio), otroNegocio.texto);
  assert.match(otroNegocio.json.error, /Pro/);

  // Un plan de socios ocupa un lugar (su servicio), y sus cuotas nunca se
  // frenan: se arma antes de llenar el catálogo.
  const planSocio = await admin.post('/api/planes-socio', { nombre: 'Pase', opciones: [{ meses: 1, precio: 1000 }] });
  assert.equal(planSocio.status, 201, planSocio.texto);
  const servicio = await admin.post('/api/productos', { nombre: 'Medialuna', precio_venta: 100, tipo: 'servicio' });
  assert.equal(servicio.status, 201, servicio.texto);
  for (let i = 3; i <= 100; i++) {
    const r = await admin.post('/api/productos', { nombre: `Producto ${i}`, precio_venta: 10 });
    assert.equal(r.status, 201, `producto ${i}: ${r.texto}`);
  }
  const elCiento1 = await admin.post('/api/productos', { nombre: 'Uno de más', precio_venta: 10 });
  assert.ok(esTope(elCiento1), elCiento1.texto);
  // Uno inactivo no cuenta; reactivarlo sí.
  const inactivo = await admin.post('/api/productos', { nombre: 'Guardado', precio_venta: 10, activo: false });
  assert.equal(inactivo.status, 201, inactivo.texto);
  assert.ok(esTope(await admin.patch(`/api/productos/${inactivo.json.id}`, { activo: true })));
  // Una compra que crea un producto por nombre se deshace entera.
  const comprasAntes = (await admin.get('/api/compras')).json.length;
  const compra = await admin.post('/api/compras', { proveedor: 'Molino', items: [{ producto: 'Harina', cantidad: 1, precio_unitario: 10 }] });
  assert.equal(compra.status, 403, compra.texto);
  assert.equal((await admin.get('/api/compras')).json.length, comprasAntes);
  assert.ok(!(await admin.get('/api/productos')).json.some((p) => p.nombre === 'Harina'));

  // Ventas del mes.
  const venta = { cliente: 'Juan', items: [{ producto_id: servicio.json.id, cantidad: 1, precio_unitario: 100 }] };
  let primera;
  for (let i = 1; i <= 300; i++) {
    const r = await admin.post('/api/ventas', venta);
    assert.equal(r.status, 201, `venta ${i}: ${r.texto}`);
    primera ??= r.json.id;
  }
  assert.ok(esTope(await admin.post('/api/ventas', venta)));
  // Una anulada deja lugar, y restaurarla lo vuelve a ocupar.
  const anulada = await admin.post(`/api/ventas/${primera}/anular`);
  assert.ok(anulada.status < 300, anulada.texto);
  const otra = await admin.post('/api/ventas', venta);
  assert.equal(otra.status, 201, otra.texto);
  assert.ok(esTope(await admin.post(`/api/ventas/${primera}/restaurar`)));

  // La cuota de un socio se genera igual y no cuenta.
  const socio = await admin.post('/api/socios', { cliente: { nombre: 'Lucía' }, planes: [{ opcion_id: planSocio.json.opciones[0].id }] });
  assert.equal(socio.status, 201, socio.texto);
  assert.equal(socio.json.cuotas.length, 1);
  assert.deepEqual((await admin.get('/api/negocio')).json.plan.uso.ventas_mes, { usados: 300, tope: 300 });

  // El plan no se cambia por la API: PUT /api/negocio lo ignora.
  assert.equal((await admin.put('/api/negocio', { plan: 'pro', plan_vence: null })).status, 200);
  assert.equal((await admin.get('/api/negocio')).json.plan.clave, 'gratis');
});

test('la prueba de Pro dura 14 días, deja sumar negocios y al vencer cae a Gratis', async () => {
  const admin = await registrarEmpresa(servidor.url, { empresa: 'Pyme Pro', usuario: 'pyme', plan: 'pro' });
  const negocio = (await admin.get('/api/negocio')).json;
  assert.equal(negocio.plan.clave, 'pro');
  assert.equal(negocio.plan.dias_restantes, 14);
  assert.ok(negocio.plan.vence > fechaDeHoy());
  assert.deepEqual(negocio.plan.uso.usuarios, { usados: 1, tope: null });

  // El negocio que se suma nace con el mismo plan y vencimiento.
  const sucursal = await admin.post('/api/negocios', { nombre: 'Pyme Pro Sucursal', rubro: 'comercio' });
  assert.equal(sucursal.status, 201, sucursal.texto);
  const deLaSucursal = (await admin.get('/api/negocio')).json.plan;
  assert.deepEqual([deLaSucursal.clave, deLaSucursal.vence], ['pro', negocio.plan.vence]);

  // Vencida (con el script, como la activa el dueño de Nexo), rige Gratis.
  assert.match(scriptPlan('--negocio', String(negocio.id), '--plan', 'pro', '--hasta', '2020-01-31'), /venció/);
  assert.equal((await admin.post(`/api/negocios/${negocio.id}/entrar`)).status, 204);
  const vencido = (await admin.get('/api/negocio')).json.plan;
  assert.equal(vencido.clave, 'gratis');
  assert.deepEqual(vencido.vencido, { clave: 'pro', nombre: 'Pro', vencio: '2020-01-31' });
  assert.ok(esTope(await admin.post('/api/negocios', { nombre: 'Otra más', rubro: 'comercio' })));

  // Activada de nuevo sin vencimiento.
  scriptPlan('--negocio', String(negocio.id), '--plan', 'pro');
  assert.equal((await admin.get('/api/negocio')).json.plan.clave, 'pro');
  assert.match(scriptPlan('--ver', String(negocio.id)), /Pro, sin vencimiento/);
  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : auditoria.filas ?? auditoria.items ?? [];
  assert.ok(filas.some((f) => /Plan cambiado a Pro/.test(f.detalle ?? '')), 'el cambio de plan queda en la auditoría');
});

test('un plan desconocido en el alta responde 400', async () => {
  const r = await crearCliente(servidor.url).post('/api/auth/registro', {
    empresa: 'X',
    usuario: 'plan-raro',
    nombre: 'X',
    password: 'clave-segura-1',
    plan: 'constructor'
  });
  assert.equal(r.status, 400);
});
