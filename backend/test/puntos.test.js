// Puntos y premios (hist. §223, docs/investigaciones/investigacion-puntos.md):
// un punto cada $ X de lo cobrado, con la regla congelada en cada venta; los
// premios se canjean en el mostrador (descuento o producto de regalo); anular
// la venta saca lo ganado y devuelve lo canjeado; una devolución saca los
// puntos de lo devuelto; los ajustes a mano llevan motivo y son del admin.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { aplicarPremios, describirPremio, puntosDeLaVenta, saldoDePuntos, venceDe } from '../../frontend/js/core/puntos.js';

let servidor;
let admin;
let empleado;
let otro;
let caja;
let turno;
let servicio;
let cafe;
let marta;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Café Puntos', usuario: 'cafepuntos' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajerapuntos', nombre: 'Cajera' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Café', usuario: 'otrocafe' });
  caja = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  servicio = (await admin.post('/api/productos', { nombre: 'Desayuno', precio_venta: 2000, tipo: 'servicio' })).json.id;
  cafe = (await admin.post('/api/productos', { nombre: 'Café chico', precio_venta: 1500, tipo: 'servicio' })).json.id;
  marta = (await admin.post('/api/clientes', { nombre: 'Marta', telefono: '351 555-0101' })).json.id;
  turno = (await empleado.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 })).json;
});

after(async () => {
  await servidor?.cerrar();
});

const vender = (cuerpo) =>
  empleado.post('/api/pos/ventas', {
    turno_caja_id: turno.id,
    ...cuerpo,
    cobros: cuerpo.cobrado ? [{ cuenta_tesoreria_id: caja.id, importe: cuerpo.cobrado }] : []
  });
const renglon = (precio, producto_id = servicio) => ({ producto_id, cantidad: 1, precio_unitario: precio });
const saldo = async (clienteId = marta) => (await empleado.get(`/api/clientes/${clienteId}/puntos`)).json.saldo;

async function prenderPuntos() {
  const negocio = (await admin.get('/api/negocio')).json;
  const r = await admin.put('/api/negocio', { nombre: negocio.nombre, modulos: [...negocio.modulos, 'puntos'] });
  assert.equal(r.status, 200, r.texto);
}

test('las reglas puras: lo cobrado dividido la regla, el vencimiento y lo que se gasta primero', () => {
  assert.equal(puntosDeLaVenta(2999.99, 1000), 2);
  assert.equal(puntosDeLaVenta(0.1 + 0.2 + 2999.7, 1000), 3, 'el centavo de la suma no saca un punto');
  assert.equal(puntosDeLaVenta(5000, null), 0);
  assert.equal(venceDe('2026-01-31', 1), '2026-02-28');
  assert.equal(venceDe('2026-11-22', null), null);

  // 100 que vencen en julio y 50 que no vencen: un canje de 120 gasta primero
  // los de julio.
  const eventos = [
    { fecha: '2026-01-01', puntos: 100, vence: '2026-07-01' },
    { fecha: '2026-03-01', puntos: 50, vence: null },
    { fecha: '2026-04-01', puntos: -120 }
  ];
  assert.deepEqual(saldoDePuntos(eventos, '2026-08-01'), { saldo: 30, vencidos: 0, proximo: null });
  const sinCanje = saldoDePuntos(eventos.slice(0, 2), '2026-08-01');
  assert.equal(sinCanje.saldo, 50);
  assert.equal(sinCanje.vencidos, 100);
  // Lo usado de más lo pagan los puntos que vienen.
  assert.equal(saldoDePuntos([{ fecha: '2026-01-01', puntos: -30 }, { fecha: '2026-02-01', puntos: 50 }], '2026-03-01').saldo, 20);
  assert.deepEqual(saldoDePuntos([{ fecha: '2026-01-01', puntos: 10, vence: '2027-01-01' }], '2026-06-01').proximo, {
    fecha: '2027-01-01',
    puntos: 10
  });

  const con = aplicarPremios(
    [
      { cantidad: 2, precio: 1000 },
      { cantidad: 1, precio: 500 }
    ],
    [
      { tipo: 'porcentaje', valor: 10, nombre: 'Diez' },
      { tipo: 'monto', valor: 250, nombre: 'Vale' }
    ]
  );
  assert.deepEqual(con.montos, [250, 250]);
  assert.deepEqual(con.renglones, [
    { precio: 800, descuento: 200 },
    { precio: 400, descuento: 100 }
  ]);
  assert.match(aplicarPremios([{ cantidad: 1, precio: 500 }], [{ tipo: 'monto', valor: 1000, nombre: 'Vale' }]).error, /es de \$\s1\.000/);
  assert.equal(describirPremio({ tipo: 'producto' }, 'Café chico'), 'Café chico de regalo');
});

test('sin el módulo no suma nadie ni se canjea nada', async () => {
  const premios = (await empleado.get('/api/premios')).json;
  assert.equal(premios.prendido, false);
  assert.deepEqual(premios.premios, []);
  const r = await vender({ cliente_id: marta, items: [renglon(5000)], cobrado: 5000 });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.puntos, null);
  assert.equal((await vender({ cliente_id: marta, items: [renglon(5000)], cobrado: 5000, canjes: [1] })).status, 400);
});

test('con el programa armado, suma lo cobrado; lo fiado, al pagarlo; y la regla nueva vale para lo que viene', async () => {
  await prenderPuntos();
  assert.equal((await empleado.put('/api/puntos/programa', { puntos_cada: 1000 })).status, 403, 'la regla es del admin');
  assert.equal((await admin.put('/api/puntos/programa', { puntos_cada: -5 })).status, 400);
  assert.equal((await admin.put('/api/puntos/programa', { puntos_cada: 1000, vencen_meses: 99 })).status, 400);
  const programa = await admin.put('/api/puntos/programa', { puntos_cada: 1000 });
  assert.equal(programa.status, 200, programa.texto);
  assert.equal(programa.json.activo, true);

  assert.equal(await saldo(), 0, 'las ventas de antes del programa no suman');
  const pagada = await vender({ cliente_id: marta, items: [renglon(5500)], cobrado: 5500 });
  assert.deepEqual(pagada.json.puntos, { ganados: 5, canjeados: 0, saldo: 5 });

  const fiada = await vender({ cliente_id: marta, items: [renglon(3000)] });
  assert.equal(fiada.status, 201, fiada.texto);
  assert.equal(fiada.json.puntos.ganados, 0, 'lo fiado todavía no suma');
  const cobro = await empleado.post(`/api/ventas/${fiada.json.id}/cobros`, { importe: 3000, cuenta_tesoreria_id: caja.id });
  assert.equal(cobro.status, 201, cobro.texto);
  assert.equal(await saldo(), 8);

  // A "Consumidor final" no se le suma.
  const final = await vender({ items: [renglon(9000)], cobrado: 9000 });
  assert.equal(final.json.puntos, null);

  await admin.put('/api/puntos/programa', { puntos_cada: 500 });
  assert.equal(await saldo(), 8, 'cambiar la regla no le cambia los puntos a nadie');
  await vender({ cliente_id: marta, items: [renglon(1000)], cobrado: 1000 });
  assert.equal(await saldo(), 10);
});

let diez;
let regalo;
let grande;

test('los premios son del admin, con nombre único y valores que tienen sentido', async () => {
  assert.equal((await empleado.post('/api/premios', { nombre: 'X', puntos: 5, tipo: 'monto', valor: 100 })).status, 403);
  assert.equal((await admin.post('/api/premios', { nombre: 'Mucho', puntos: 5, tipo: 'porcentaje', valor: 150 })).status, 400);
  assert.equal((await admin.post('/api/premios', { nombre: 'Medio', puntos: 2.5, tipo: 'monto', valor: 100 })).status, 400);
  assert.equal((await admin.post('/api/premios', { nombre: 'Sin producto', puntos: 5, tipo: 'producto' })).status, 400);
  const crear = async (cuerpo) => {
    const r = await admin.post('/api/premios', cuerpo);
    assert.equal(r.status, 201, r.texto);
    return r.json.id;
  };
  diez = await crear({ nombre: '10 % menos', puntos: 5, tipo: 'porcentaje', valor: 10 });
  regalo = await crear({ nombre: 'Café gratis', puntos: 3, tipo: 'producto', producto_id: cafe });
  grande = await crear({ nombre: 'Vale grande', puntos: 50, tipo: 'monto', valor: 10000 });
  assert.equal((await admin.post('/api/premios', { nombre: '10 % menos', puntos: 9, tipo: 'monto', valor: 10 })).status, 400, 'nombre repetido');

  const lista = (await empleado.get('/api/premios')).json.premios;
  assert.deepEqual(
    lista.map((p) => [p.nombre, p.descripcion.replace(/\s/g, ' ')]),
    [
      ['Café gratis', 'Café chico de regalo'],
      ['10 % menos', '10 % de descuento'],
      ['Vale grande', '$ 10.000 de descuento']
    ],
  );
  assert.deepEqual((await otro.get('/api/premios')).json.premios, [], 'cada negocio tiene los suyos');
});

let ventaConCanje;

test('en el mostrador se canjea: el descuento baja los precios y el regalo va a $ 0', async () => {
  assert.equal(await saldo(), 10);
  const sinCliente = await vender({ items: [renglon(2000)], cobrado: 2000, canjes: [diez] });
  assert.equal(sinCliente.status, 400);
  assert.match(sinCliente.json.error, /elegí el cliente/);
  const noAlcanza = await vender({ cliente_id: marta, items: [renglon(20000)], cobrado: 10000, canjes: [grande] });
  assert.equal(noAlcanza.status, 400);
  assert.match(noAlcanza.json.error, /Marta tiene 10 puntos y los premios suman 50 puntos/);

  // 2.000 con 10 % menos son 1.800, el café va de regalo, y con el descuento a
  // mano de $ 100 encima quedan 1.700. Gasta 8 y suma 3 (1.700 / 500).
  const r = await vender({ cliente_id: marta, items: [renglon(2000)], cobrado: 1700, canjes: [diez, regalo], descuento: { tipo: 'monto', valor: 100 } });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.total, 1700);
  assert.deepEqual(r.json.puntos, { ganados: 3, canjeados: 8, saldo: 5 });
  ventaConCanje = r.json.id;

  const venta = (await admin.get(`/api/ventas/${ventaConCanje}`)).json;
  assert.deepEqual(
    venta.items.map((i) => [i.producto_id, i.precio_unitario, i.descuento]),
    [
      [servicio, 1700, 300],
      [cafe, 0, 0]
    ]
  );
  const historial = (await empleado.get(`/api/clientes/${marta}/puntos`)).json.historial;
  assert.deepEqual(
    historial.filter((h) => h.venta_id === ventaConCanje).map((h) => [h.tipo, h.puntos]).sort(),
    [
      ['canje', -3],
      ['canje', -5],
      ['venta', 3]
    ]
  );

  const editar = await admin.put(`/api/ventas/${ventaConCanje}`, { cliente_id: marta, items: [renglon(2000)] });
  assert.equal(editar.status, 400);
  assert.match(editar.json.error, /se canjeó un premio/);

  // Solo el regalo, sin nada más: también es una venta.
  await admin.post(`/api/clientes/${marta}/puntos`, { puntos: 3, motivo: 'Para probar el regalo solo' });
  const solo = await vender({ cliente_id: marta, items: [], canjes: [regalo] });
  assert.equal(solo.status, 201, solo.texto);
  assert.equal(solo.json.total, 0);
  assert.equal(await saldo(), 5);
});

test('anular la venta saca lo que dio y devuelve lo que se canjeó en ella', async () => {
  const r = await admin.post(`/api/pos/ventas/${ventaConCanje}/anular`, { motivo: 'Se equivocó' });
  assert.equal(r.status, 200, r.texto);
  assert.equal(await saldo(), 10, '5 + 8 canjeados − 3 ganados');
});

test('una devolución saca los puntos de lo devuelto', async () => {
  const antes = await saldo();
  const r = await vender({ cliente_id: marta, items: [renglon(2000), renglon(2000)], cobrado: 4000 });
  assert.equal(await saldo(), antes + 8);
  const venta = (await admin.get(`/api/ventas/${r.json.id}`)).json;
  const devolucion = await admin.post('/api/devoluciones', {
    venta_id: r.json.id,
    items: [{ venta_item_id: venta.items[0].id, cantidad: 1, vuelve_stock: false }],
    cuenta_tesoreria_id: caja.id,
    motivo: 'No le gustó'
  });
  assert.equal(devolucion.status, 201, devolucion.texto);
  assert.equal(await saldo(), antes + 4);
});

test('a mano: el admin suma o quita con motivo, sin dejar a nadie en negativo', async () => {
  const antes = await saldo();
  assert.equal((await empleado.post(`/api/clientes/${marta}/puntos`, { puntos: 100, motivo: 'x' })).status, 403);
  assert.equal((await admin.post(`/api/clientes/${marta}/puntos`, { puntos: 100 })).status, 400, 'sin motivo no');
  assert.equal((await admin.post(`/api/clientes/${marta}/puntos`, { puntos: 1.5, motivo: 'x' })).status, 400);
  const menos = await admin.post(`/api/clientes/${marta}/puntos`, { puntos: -(antes + 1), motivo: 'Error' });
  assert.equal(menos.status, 400);
  assert.match(menos.json.error, /no se le pueden quitar más/);
  const r = await admin.post(`/api/clientes/${marta}/puntos`, { puntos: 100, motivo: 'Tarjetita de papel' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.saldo, antes + 100);
  assert.equal((await otro.get(`/api/clientes/${marta}/puntos`)).status, 404, 'un cliente de otro negocio no se ve');
  assert.equal((await otro.post(`/api/clientes/${marta}/puntos`, { puntos: 5, motivo: 'x' })).status, 404);
});

test('la página de puntos: quién tiene, los últimos movimientos y lo canjeado en el mes', async () => {
  assert.equal((await empleado.get('/api/puntos')).status, 403);
  const pagina = (await admin.get('/api/puntos')).json;
  assert.equal(pagina.programa.puntos_cada, 500);
  assert.equal(pagina.clientes[0].nombre, 'Marta');
  assert.equal(pagina.clientes[0].saldo, await saldo());
  assert.equal(pagina.totales.clientes, 1);
  // El canje de la venta anulada ya no cuenta; el del regalo solo, sí.
  assert.equal(pagina.totales.canjes_mes.canjes, 1);
  assert.equal(pagina.totales.canjes_mes.monto, 1500);
  assert.ok(pagina.movimientos.some((m) => m.descripcion === 'Tarjetita de papel'));
});

test('el premio canjeado no se borra, se pausa; y al pausarlo no se ofrece más', async () => {
  assert.equal((await admin.del(`/api/premios/${regalo}`)).status, 409);
  assert.equal((await admin.patch(`/api/premios/${regalo}`, { activo: false })).status, 200);
  assert.ok(!(await empleado.get('/api/premios')).json.premios.some((p) => p.id === regalo));
  const pausado = await vender({ cliente_id: marta, items: [renglon(2000)], cobrado: 2000, canjes: [regalo] });
  assert.equal(pausado.status, 400);
  assert.equal((await admin.del(`/api/premios/${grande}`)).status, 200, 'el que nunca se canjeó, sí');
  assert.equal((await otro.patch(`/api/premios/${diez}`, { activo: false })).status, 404);
});

test('al unir clientes, los puntos pasan al que queda', async () => {
  const repetida = (await admin.post('/api/clientes', { nombre: 'Marta G.' })).json.id;
  await admin.post(`/api/clientes/${repetida}/puntos`, { puntos: 7, motivo: 'Tarjetita' });
  const antes = await saldo();
  const r = await admin.post(`/api/clientes/${marta}/unir`, { ids: [repetida] });
  assert.equal(r.status, 200, r.texto);
  assert.equal(await saldo(), antes + 7);
});
