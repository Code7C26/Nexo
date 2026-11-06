// El Resumen nuevo (hist. §136): las piezas que arma cada persona (con el
// preset de su tipo de negocio de partida), lo que muestran las piezas nuevas
// (cuándo se vende, dónde entró la plata, quién vendió y lo que hay que mirar)
// y la comparación contra el mismo período del año pasado. Va aparte porque
// cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { PIEZAS_TABLERO, tableroDelPreset } from '../perfiles.js';
import { ZONA_HORARIA, fechaDeHoy } from '../fecha.js';

let servidor;
let kiosco;
let empleado;
let tienda;
let alfajor;

before(async () => {
  servidor = await levantarServidor();
  kiosco = await registrarEmpresa(servidor, { empresa: 'Kiosco Tablero', usuario: 'kioscotablero', extra: { rubro: 'kiosco' } });
  empleado = await crearEmpleado(servidor, kiosco, { usuario: 'cajerotablero' });
  tienda = await registrarEmpresa(servidor, { empresa: 'Tienda Tablero', usuario: 'tiendatablero', extra: { rubro: 'ecommerce' } });
  alfajor = (await kiosco.post('/api/productos', { nombre: 'Alfajor', precio_venta: 1000 })).json.id;
  const stock = await kiosco.post('/api/carga-inicial/stock', { filas: [{ producto_id: alfajor, cantidad: 100, costo: 400 }] });
  assert.equal(stock.status, 200, stock.texto);
});

after(async () => {
  await servidor?.cerrar();
});

const vender = (cliente, cantidad, fecha) =>
  kiosco.post('/api/ventas', { cliente, items: [{ producto_id: alfajor, cantidad, precio_unitario: 1000 }], ...(fecha ? { fecha } : {}) });

test('cada tipo trae su Resumen, y cada persona arma el suyo', async () => {
  // Un kiosco mira cuándo se vende; una tienda online, por qué canal.
  const deKiosco = (await kiosco.get('/api/tablero')).json;
  assert.equal(deKiosco.personalizado, false);
  assert.deepEqual(deKiosco, { ...tableroDelPreset('kiosco'), personalizado: false });
  assert.ok(!deKiosco.ocultas.includes('cuando'));
  assert.deepEqual([...deKiosco.orden].sort(), [...PIEZAS_TABLERO].sort());
  const deTienda = (await tienda.get('/api/tablero')).json;
  assert.equal(deTienda.orden[4], 'canales');
  assert.ok(deTienda.ocultas.includes('cuando'));

  // Lo guarda, y una pieza que no nombró entra en su lugar del preset, visible.
  const orden = PIEZAS_TABLERO.filter((p) => p !== 'tendencia').reverse();
  const guardado = await kiosco.put('/api/tablero', { orden, ocultas: ['movimientos'], comparar: 'anio', periodo: 'mes' });
  assert.equal(guardado.status, 200, guardado.texto);
  const conTendencia = [...orden];
  conTendencia.splice(1, 0, 'tendencia');
  assert.deepEqual(guardado.json, { orden: conTendencia, ocultas: ['movimientos'], comparar: 'anio', periodo: 'mes', personalizado: true });
  assert.deepEqual((await kiosco.get('/api/tablero')).json, guardado.json);
  // No toca el de otro negocio.
  assert.equal((await tienda.get('/api/tablero')).json.personalizado, false);

  for (const malo of [
    { orden: ['resultado', 'inventada'], ocultas: [] },
    { orden: ['resultado', 'resultado'], ocultas: [] },
    { orden: ['resultado'], ocultas: 'resultado' },
    { orden: ['resultado'], ocultas: [], comparar: 'siempre' },
    { orden: ['resultado'], ocultas: [], periodo: '90' }
  ]) {
    assert.equal((await kiosco.put('/api/tablero', malo)).status, 400, JSON.stringify(malo));
  }

  // Vuelve al del tipo.
  assert.equal((await kiosco.del('/api/tablero')).json.personalizado, false);
  // Es del Resumen: el empleado no lo ve.
  assert.equal((await empleado.get('/api/tablero')).status, 403);
  assert.equal((await empleado.get('/api/reportes/tablero')).status, 403);
});

test('las piezas nuevas: cuándo se vende, dónde entró la plata, quién vendió y lo que falta cobrar', async () => {
  const hoy = fechaDeHoy();
  const cobrada = await vender('Juan', 2);
  assert.equal(cobrada.status, 201, cobrada.texto);
  const caja = (await kiosco.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  assert.equal((await kiosco.post(`/api/ventas/${cobrada.json.id}/cobros`, { importe: 2000, cuenta_tesoreria_id: caja.id })).status, 201);
  // Una que se debe, de hace un mes (ya vencida, es de contado).
  const haceUnMes = new Date(Date.now() - 30 * 86400000).toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
  assert.equal((await vender('Pedro', 3, haceUnMes)).status, 201);

  const datos = (await kiosco.get(`/api/reportes/tablero?desde=${haceUnMes}&hasta=${hoy}`)).json;
  // Por día de la semana (0 = lunes), con la fecha de la venta.
  const dia = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  assert.equal(datos.dias.reduce((acc, d) => acc + d.cantidad, 0), 2);
  // Hace 30 días cayó dos días de la semana antes que hoy.
  assert.deepEqual([datos.dias[dia(hoy)].ventas, datos.dias[dia(haceUnMes)].ventas], [2000, 3000]);
  // Por hora, con la del alta: las dos se cargaron ahora.
  const ahora = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, hour: 'numeric', hourCycle: 'h23' }).format(new Date())) % 24;
  const conHora = datos.horas.filter((h) => h.cantidad > 0);
  assert.equal(conHora.length, 1);
  assert.ok([ahora, (ahora + 23) % 24].includes(conHora[0].hora), `hora ${conHora[0].hora}, ahora ${ahora}`);
  assert.equal(datos.sin_hora, 0);
  // Quién vendió, y dónde entró la plata.
  assert.deepEqual(
    datos.vendedores.map((v) => [v.nombre, v.cantidad_ventas, v.ventas, v.ticket_promedio]),
    [['Admin', 2, 5000, 2500]]
  );
  assert.deepEqual(
    datos.cobros.map((c) => [c.nombre, c.cantidad, c.importe]),
    [[caja.nombre, 1, 2000]]
  );
  // Lo que te deben, todo vencido; el stock está bien.
  assert.deepEqual(datos.pendiente.por_cobrar, { total: 3000, vencido: 3000, cantidad: 1 });
  assert.deepEqual(datos.pendiente.por_pagar, { total: 0, vencido: 0, cantidad: 0 });
  assert.equal(datos.pendiente.sin_stock, 0);
});

test('comparar contra el mismo período del año pasado', async () => {
  assert.equal((await vender('Juan', 1, '2025-11-03')).status, 201);
  const contraAnio = (await kiosco.get('/api/resumen/evolucion?desde=2026-11-01&hasta=2026-11-07&comparar=anio')).json;
  assert.equal(contraAnio.comparar, 'anio');
  assert.deepEqual(contraAnio.anterior.rango, { desde: '2025-11-01', hasta: '2025-11-07' });
  assert.equal(contraAnio.anterior.ventas, 1000);
  const contraAnterior = (await kiosco.get('/api/resumen/evolucion?desde=2026-11-01&hasta=2026-11-07')).json;
  assert.equal(contraAnterior.comparar, 'anterior');
  assert.deepEqual(contraAnterior.anterior.rango, { desde: '2026-10-25', hasta: '2026-10-31' });
  // La cantidad de ventas y el ticket, con su comparación.
  // La venta de hoy (la prueba de arriba) contra la del año pasado.
  assert.equal(contraAnio.total.cantidad_ventas, 1);
  assert.equal(contraAnio.anterior.cantidad_ventas, 1);
  assert.equal(contraAnio.anterior.ticket_promedio, 1000);
  assert.deepEqual([contraAnio.delta.cantidad_ventas.abs, contraAnio.delta.ticket_promedio.abs], [0, 1000]);
  // Dos meses van por semana, de lunes a domingo, recortadas contra el rango.
  const semanal = (await kiosco.get('/api/resumen/evolucion?desde=2026-09-01&hasta=2026-10-31')).json;
  assert.equal(semanal.granularidad, 'semana');
  assert.deepEqual(semanal.serie[0], { ...semanal.serie[0], desde: '2026-09-01', hasta: '2026-09-06', etiqueta: '01/09', parcial: true });
  assert.deepEqual([semanal.serie[1].desde, semanal.serie[1].hasta, semanal.serie[1].parcial], ['2026-09-07', '2026-09-13', false]);
  assert.equal(semanal.serie.at(-1).hasta, '2026-10-31');
  // El 29 de febrero cae en el 28.
  const bisiesto = (await kiosco.get('/api/resumen/evolucion?desde=2028-02-01&hasta=2028-02-29&comparar=anio')).json;
  assert.deepEqual(bisiesto.anterior.rango, { desde: '2027-02-01', hasta: '2027-02-28' });
});

test('venta online: cada canal con su ganancia, la serie y lo que rinde la publicidad', async () => {
  const hoy = fechaDeHoy();
  const remera = (await tienda.post('/api/productos', { nombre: 'Remera online', precio_venta: 10000 })).json.id;
  const cargado = await tienda.post('/api/carga-inicial/stock', { filas: [{ producto_id: remera, cantidad: 50, costo: 4000 }] });
  assert.equal(cargado.status, 200, cargado.texto);
  const vender = (canal, cantidad) =>
    tienda.post('/api/ventas', { cliente: 'Ana', canal, items: [{ producto_id: remera, cantidad, precio_unitario: 10000 }] });
  for (const [canal, cantidad] of [['tiendanube', 3], ['tiendanube', 1], ['instagram', 2], ['local', 5]]) {
    const r = await vender(canal, cantidad);
    assert.equal(r.status, 201, r.texto);
  }
  // Lo que se puso en anuncios, en la categoría Publicidad.
  const categoria = (await tienda.post('/api/categorias-gasto', { nombre: 'Publicidad', tipo: 'operativo' })).json.id;
  const caja = (await tienda.get('/api/cuentas-tesoreria')).json[0];
  assert.equal((await tienda.post('/api/gastos', { categoria_id: categoria, cuenta_tesoreria_id: caja.id, importe: 12000, fecha: hoy, descripcion: 'Anuncios' })).status, 201);

  const datos = (await tienda.get(`/api/reportes/canales?desde=${hoy}&hasta=${hoy}`)).json;
  const porCanal = Object.fromEntries(datos.canales.map((c) => [c.canal, c]));
  assert.deepEqual(
    [porCanal.tiendanube.cantidad_ventas, porCanal.tiendanube.ventas, porCanal.tiendanube.mercaderia, porCanal.tiendanube.ganancia, porCanal.tiendanube.online],
    [2, 40000, 16000, 24000, true]
  );
  assert.equal(porCanal.local.online, false);
  // Online: Tienda Nube e Instagram, sin el local.
  assert.deepEqual(datos.online, { ventas: 60000, cantidad_ventas: 3, ticket_promedio: 20000, ganancia: 36000, participacion_pct: 54.55 });
  assert.deepEqual(datos.publicidad, { categoria: 'Publicidad', gastos: 1, gasto: 12000, roas: 5, costo_por_venta: 4000, ganancia_despues: 24000 });
  assert.deepEqual(datos.serie.map((p) => p.canales), [{ tiendanube: 40000, instagram: 20000, local: 50000 }]);
  assert.deepEqual(datos.productos.instagram, [{ nombre: 'Remera online', unidades: 2, ventas: 20000 }]);
  // El color de cada canal: los online que más vendieron en toda la historia,
  // con el de su marca si está libre.
  assert.deepEqual(datos.colores, { tiendanube: 'serie-1', instagram: 'serie-2' });
  assert.deepEqual(datos.conexiones, []);
  // Una venta de antes de empezar con Nexo también puede decir por dónde entró.
  const anterior = await tienda.post('/api/carga-inicial/ventas', { fecha: hoy, cliente: 'Ana', cobrada: false, canal: 'whatsapp', items: [{ producto_id: remera, cantidad: 1, precio_unitario: 10000 }] });
  assert.equal(anterior.status, 201, anterior.texto);
  const conAnterior = (await tienda.get(`/api/reportes/canales?desde=${hoy}&hasta=${hoy}`)).json;
  assert.equal(conAnterior.canales.find((c) => c.canal === 'whatsapp').ventas, 10000);
  assert.equal((await tienda.post('/api/carga-inicial/ventas', { fecha: hoy, cliente: 'Ana', cobrada: false, canal: 'tele', items: [{ producto_id: remera, cantidad: 1, precio_unitario: 1 }] })).status, 400);
  // Es del Resumen: el empleado no lo ve.
  assert.equal((await empleado.get('/api/reportes/canales')).status, 403);
});

test('Qué se compra se compara con el período anterior', async () => {
  const comprar = (cantidad, fecha) =>
    kiosco.post('/api/compras', { proveedor: 'Distribuidora', fecha, items: [{ producto: 'Alfajor', cantidad, precio_unitario: 400 }] });
  for (const [cantidad, fecha] of [[10, '2026-10-27'], [15, '2026-11-03']]) {
    const compra = await comprar(cantidad, fecha);
    assert.equal(compra.status, 201, compra.texto);
    // Nace en borrador: el reporte cuenta las confirmadas.
    assert.equal((await kiosco.post(`/api/compras/${compra.json.id}/confirmar`)).status, 200);
  }
  const datos = (await kiosco.get('/api/reportes/compras?desde=2026-11-01&hasta=2026-11-07')).json;
  assert.equal(datos.totales.compras_netas, 6000);
  assert.deepEqual([datos.delta.compras_netas.abs, datos.delta.compras_netas.pct], [2000, 50]);
  assert.equal(datos.delta.cantidad_compras.abs, 0);
  assert.equal(datos.delta.unidades.abs, 5);
  // Sin el inicio fijado no hay contra qué comparar.
  assert.equal((await kiosco.get('/api/reportes/compras')).json.delta, null);
});
