// Las preguntas sobre los números (hist. §185): "¿cuánto vendí este mes de
// remeras?", "¿quién me debe?". La IA solo dice qué se pregunta y el servidor
// contesta con los números de los reportes, sin dejar nada para confirmar. Con
// NEXO_INTERPRETE=stub la pregunta va como "consulta: tema=…; periodo=…".
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { coincide, rangoDePeriodo } from '../consultas.js';

let servidor;
let admin;
let empleado;
let otro;

const preguntar = async (cliente, pregunta) => {
  const r = await cliente.post('/api/asistente/interpretar', { texto: `consulta: ${pregunta}` });
  assert.equal(r.status, 200, r.texto);
  return r.json;
};
const fila = (consulta, nombre) => consulta.filas.find((f) => f.nombre === nombre)?.valor;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Ropa Consultas', usuario: 'consultas' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'vendedorconsultas' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Consultas', usuario: 'otroconsultas' });

  const producto = async (nombre, precio, stock) => {
    const { id } = (await admin.post('/api/productos', { nombre, precio_venta: precio, stock_minimo: 5 })).json;
    if (stock) await admin.post('/api/stock/ajuste', { producto_id: id, cantidad: stock });
    return id;
  };
  const negra = await producto('Remera negra', 15000, 20);
  const blanca = await producto('Remera blanca', 14000, 3);
  await producto('Gorra', 9000, 0);

  // Dos ventas sin cobrar: quedan en la cuenta corriente de cada cliente.
  const vender = async (cliente, items) => {
    const r = await admin.post('/api/ventas', { cliente, items });
    assert.equal(r.status, 201, r.texto);
  };
  await vender('Juan Pérez', [{ producto_id: negra, cantidad: 2, precio_unitario: 15000 }]);
  await vender('Ana Gómez', [{ producto_id: blanca, cantidad: 1, precio_unitario: 14000 }]);

  const categoria = (await admin.post('/api/categorias-gasto', { nombre: 'Luz y gas', tipo: 'operativo' })).json.id;
  const caja = (await admin.get('/api/cuentas-tesoreria')).json[0];
  const gasto = await admin.post('/api/gastos', { categoria_id: categoria, cuenta_tesoreria_id: caja.id, importe: 10000 });
  assert.equal(gasto.status, 201, gasto.texto);
});

after(async () => {
  await servidor?.cerrar();
});

test('cuánto vendí: el total del mes, igual al del reporte, y sin nada para confirmar', async () => {
  const r = await preguntar(admin, 'tema=ventas');
  assert.equal(r.tipo, 'consulta');
  assert.equal(r.mensaje_id, null);
  assert.equal(r.propuesta, null);
  assert.match(r.consulta.texto, /^Este mes vendiste \$\s44\.000 en 2 ventas\.$/);
  assert.match(fila(r.consulta, 'Ticket promedio'), /\$\s22\.000/);
  assert.deepEqual(r.consulta.enlace, { hash: '#/dashboard', nombre: 'Resumen' });

  const reporte = (await admin.get('/api/reportes/ventas')).json;
  assert.equal(reporte.totales.ventas_netas, 44000);
  assert.equal(reporte.totales.cantidad_ventas, 2);
});

test('de un producto, a un cliente y en otro período', async () => {
  const remeras = (await preguntar(admin, 'tema=ventas; producto=remeras')).consulta;
  assert.match(remeras.texto, /vendiste \$\s44\.000 de "remeras" \(3 unidades\)/);
  assert.match(fila(remeras, 'Remera negra'), /^2 unidades · \$\s30\.000$/);

  const una = (await preguntar(admin, 'tema=ventas; producto=remera blanca; periodo=hoy')).consulta;
  assert.match(una.texto, /^Hoy vendiste \$\s14\.000 de Remera blanca \(1 unidad\)\.$/);

  const juan = (await preguntar(admin, 'tema=ventas; cliente=juan')).consulta;
  assert.match(juan.texto, /le vendiste \$\s30\.000 a Juan Pérez, en 1 venta\./);

  assert.equal((await preguntar(admin, 'tema=ventas; periodo=ayer')).consulta.texto, 'Ayer no hubo ventas.');
  assert.match((await preguntar(admin, 'tema=ventas; producto=campera')).consulta.texto, /No encontré ventas de "campera" este mes/);
});

test('la ganancia con cada costo aparte, los gastos y lo más vendido', async () => {
  const ganancia = (await preguntar(admin, 'tema=ganancia')).consulta;
  assert.match(ganancia.texto, /te quedaron \$\s34\.000 de ganancia/);
  assert.match(fila(ganancia, 'Gastos'), /\$\s10\.000 · 23 %/);

  const gastos = (await preguntar(admin, 'tema=gastos')).consulta;
  assert.match(gastos.texto, /^Este mes gastaste \$\s10\.000 en 1 gasto\.$/);
  assert.match(fila(gastos, 'Luz y gas'), /100 %/);
  assert.match((await preguntar(admin, 'tema=gastos; categoria=luz')).consulta.texto, /gastaste \$\s10\.000 en Luz y gas\./);

  const masVendidos = (await preguntar(admin, 'tema=mas_vendidos')).consulta;
  assert.deepEqual(masVendidos.filas.map((f) => f.nombre), ['Remera negra', 'Remera blanca']);
  const clientes = (await preguntar(admin, 'tema=mejores_clientes')).consulta;
  assert.equal(clientes.filas[0].nombre, 'Juan Pérez');
});

test('quién me debe, cuánto queda y qué hay que reponer', async () => {
  const deben = (await preguntar(admin, 'tema=me_deben')).consulta;
  assert.match(deben.texto, /^Te deben \$\s44\.000 entre 2 clientes\.$/);
  assert.deepEqual(deben.filas.map((f) => f.nombre), ['Juan Pérez', 'Ana Gómez']);
  assert.match((await preguntar(admin, 'tema=me_deben; cliente=ana')).consulta.texto, /^Ana Gómez te debe \$\s14\.000\.$/);
  assert.equal((await preguntar(admin, 'tema=debo')).consulta.texto, 'No le debés nada a ningún proveedor.');

  assert.equal((await preguntar(admin, 'tema=stock; producto=gorras')).consulta.texto, 'No te queda Gorra: está sin stock.');
  assert.equal((await preguntar(admin, 'tema=stock; producto=remera negra')).consulta.texto, 'Te quedan 18 de Remera negra.');
  const reponer = (await preguntar(admin, 'tema=reponer')).consulta;
  assert.equal(reponer.texto, 'Hay 2 productos para reponer: 1 sin stock y 1 con poco.');
  assert.deepEqual(reponer.filas.map((f) => f.nombre), ['Gorra', 'Remera blanca']);

  const plata = (await preguntar(admin, 'tema=plata')).consulta;
  assert.match(plata.texto, /^Tenés .+ entre todas tus cuentas\.$/);
  assert.equal(plata.filas.length, (await admin.get('/api/cuentas-tesoreria')).json.length);
});

test('el empleado no ve los números del negocio, y otro negocio no ve los de este', async () => {
  const ventas = await preguntar(empleado, 'tema=ventas');
  assert.equal(ventas.tipo, 'consulta');
  assert.equal(ventas.consulta.texto, 'Eso lo ve quien administra el negocio.');
  assert.deepEqual(ventas.consulta.filas, []);
  assert.equal((await preguntar(empleado, 'tema=ganancia')).consulta.texto, 'Eso lo ve quien administra el negocio.');
  // El stock sí: es lo que ve en su pantalla.
  assert.equal((await preguntar(empleado, 'tema=stock; producto=gorra')).consulta.texto, 'No te queda Gorra: está sin stock.');

  assert.equal((await preguntar(otro, 'tema=ventas')).consulta.texto, 'Este mes no hubo ventas.');
  assert.equal((await preguntar(otro, 'tema=me_deben')).consulta.texto, 'Nadie te debe nada.');
});

test('un tema que no existe no se contesta como si se supiera', async () => {
  const r = await preguntar(admin, 'tema=clima');
  assert.equal(r.tipo, null);
  assert.equal(r.consulta, undefined);
});

test('los períodos se resuelven desde el día de hoy', () => {
  const hoy = '2026-03-11'; // miércoles
  const rango = (periodo, desde, hasta) => {
    const { nombre, ...fechas } = rangoDePeriodo(periodo, desde, hasta, hoy);
    return [fechas.desde, fechas.hasta, nombre];
  };
  assert.deepEqual(rango(undefined), ['2026-03-01', '2026-03-11', 'este mes']);
  assert.deepEqual(rango('esta_semana'), ['2026-03-09', '2026-03-11', 'esta semana']);
  assert.deepEqual(rango('semana_pasada'), ['2026-03-02', '2026-03-08', 'la semana pasada']);
  assert.deepEqual(rango('mes_pasado'), ['2026-02-01', '2026-02-28', 'el mes pasado']);
  assert.deepEqual(rango('anio_pasado'), ['2025-01-01', '2025-12-31', 'el año pasado']);
  assert.deepEqual(rango('todo'), [null, null, 'desde que empezaste']);
  assert.deepEqual(rango('fechas', '2026-02-10', '2026-02-03'), ['2026-02-03', '2026-02-10', 'del 3/2 al 10/2']);
  // Un rango mal armado no rompe: vuelve al mes en curso.
  assert.deepEqual(rango('fechas', 'octubre', null), ['2026-03-01', '2026-03-11', 'este mes']);
  // Enero mira a diciembre del año anterior.
  assert.deepEqual(rangoDePeriodo('mes_pasado', null, null, '2026-01-15').desde, '2025-12-01');
});

test('buscar por nombre: el plural y los acentos no importan, y no alcanza con parecerse', () => {
  assert.ok(coincide('Remera negra', 'remeras'));
  assert.ok(coincide('Remera negra', 'las remeras negras'));
  assert.ok(coincide('Pantalón jean', 'pantalones'));
  assert.ok(!coincide('Remera negra', 'remera blanca'));
  assert.ok(!coincide('Pantalón jean', 'pan'));
  assert.ok(!coincide('Remera negra', 'de la'));
});
