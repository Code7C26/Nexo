// Ofertas con vigencia (hist. §133): las reglas de frontend/js/core/ofertas.js
// (puro), las rutas de /api/ofertas y la oferta que la venta anota en cada
// renglón. Va aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { fechaDeHoy } from '../fecha.js';

const ofertas = await import('../../frontend/js/core/ofertas.js');

let servidor;
let admin;
let empleado;
let otro;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Carnicería Las Ofertas', usuario: 'lasofertas' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeroofertas' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Almacén', usuario: 'otroalmacen' });
});

after(async () => {
  await servidor?.cerrar();
});

// Una oferta como la da la API, con lo que no importa en cada caso ya puesto.
const oferta = (datos) => ({
  id: 1,
  tipo: 'porcentaje',
  valor: 10,
  cantidad_minima: null,
  lista_precio_id: null,
  alcance: 'todo',
  productos: [],
  categorias: [],
  desde: '2026-11-01',
  hasta: null,
  dias_semana: [],
  dias_mes: [],
  activa: true,
  ...datos
});
const renglon = { producto_id: 5, categoria_id: 2, lista_id: 1, cantidad: 1, precio_lista: 10000 };

test('las reglas: cuándo vale, a qué toca, cuánto baja y cuál gana', () => {
  // El 4 de noviembre de 2026 es miércoles (3).
  assert.equal(ofertas.diaDeLaSemana('2026-11-04'), 3);
  assert.equal(ofertas.diaDeLaSemana('2026-11-08'), 7);

  // Fechas, días de la semana y del mes, y pausada.
  assert.equal(ofertas.ofertaVigente(oferta({ hasta: '2026-11-30' }), '2026-11-30'), true);
  assert.equal(ofertas.ofertaVigente(oferta({ hasta: '2026-11-30' }), '2026-12-01'), false);
  assert.equal(ofertas.ofertaVigente(oferta({}), '2026-10-31'), false);
  assert.equal(ofertas.ofertaVigente(oferta({ dias_semana: [2, 4] }), '2026-11-04'), false);
  assert.equal(ofertas.ofertaVigente(oferta({ dias_semana: [3] }), '2026-11-04'), true);
  assert.equal(ofertas.ofertaVigente(oferta({ dias_mes: [1, 15] }), '2026-11-15'), true);
  assert.equal(ofertas.ofertaVigente(oferta({ dias_mes: [1, 15] }), '2026-11-14'), false);
  assert.equal(ofertas.ofertaVigente(oferta({ activa: false }), '2026-11-04'), false);

  // A qué toca: productos, categorías, todo, y la lista.
  assert.equal(ofertas.ofertaAlcanza(oferta({ alcance: 'productos', productos: [5] }), renglon), true);
  assert.equal(ofertas.ofertaAlcanza(oferta({ alcance: 'productos', productos: [6] }), renglon), false);
  assert.equal(ofertas.ofertaAlcanza(oferta({ alcance: 'categorias', categorias: [2] }), renglon), true);
  assert.equal(ofertas.ofertaAlcanza(oferta({ alcance: 'categorias', categorias: [2] }), { ...renglon, categoria_id: null }), false);
  assert.equal(ofertas.ofertaAlcanza(oferta({ lista_precio_id: 2 }), renglon), false);

  // Cuánto baja; la que encarece o no baja no se aplica.
  assert.equal(ofertas.precioConOferta(oferta({ valor: 15 }), 10000), 8500);
  assert.equal(ofertas.precioConOferta(oferta({ tipo: 'monto', valor: 500 }), 10000), 9500);
  assert.equal(ofertas.precioConOferta(oferta({ tipo: 'monto', valor: 12000 }), 10000), null);
  assert.equal(ofertas.precioConOferta(oferta({ tipo: 'precio', valor: 9000 }), 10000), 9000);
  assert.equal(ofertas.precioConOferta(oferta({ tipo: 'precio', valor: 11000 }), 10000), null);
  assert.equal(ofertas.precioConOferta(oferta({ valor: 10 }), 0), null);

  // Dos ofertas no se suman: gana la más barata, y si empatan, la más vieja.
  const todas = [
    oferta({ id: 1, valor: 10 }),
    oferta({ id: 2, tipo: 'precio', valor: 9000 }),
    oferta({ id: 3, tipo: 'precio', valor: 8500, cantidad_minima: 2 }),
    oferta({ id: 4, tipo: 'precio', valor: 8000, cantidad_minima: 5 })
  ];
  assert.deepEqual(ofertas.mejorOferta(todas, renglon, '2026-11-04'), { oferta: todas[0], precio: 9000 });
  assert.equal(ofertas.mejorOferta(todas, { ...renglon, cantidad: 2 }, '2026-11-04').oferta.id, 3);
  assert.equal(ofertas.mejorOferta(todas, { ...renglon, cantidad: 7.5 }, '2026-11-04').oferta.id, 4);
  assert.equal(ofertas.mejorOferta(todas, renglon, '2026-10-01'), null);

  // La promoción que se gana llevando más: el escalón más cercano.
  assert.equal(ofertas.proximaPromocion(todas, renglon, '2026-11-04').oferta.id, 3);
  assert.equal(ofertas.proximaPromocion(todas, { ...renglon, cantidad: 3 }, '2026-11-04').oferta.id, 4);
  assert.equal(ofertas.proximaPromocion(todas, { ...renglon, cantidad: 5 }, '2026-11-04'), null);

  // En palabras.
  assert.equal(ofertas.describirOferta(oferta({ valor: 15 })), '15 % menos');
  assert.match(ofertas.describirOferta(oferta({ tipo: 'precio', valor: 9000, cantidad_minima: 2 }), 'kg'), /^A \$\s?9\.000 desde 2 kg$/);
  assert.equal(
    ofertas.describirVigencia(oferta({ hasta: '2026-11-30', dias_semana: [2, 6] })),
    'Del 01/11/2026 al 30/11/2026, los martes y sábados'
  );
  assert.equal(ofertas.describirVigencia(oferta({ dias_mes: [1, 15] })), 'Desde el 01/11/2026, los días 1 y 15 de cada mes');
  assert.equal(ofertas.estadoOferta(oferta({ hasta: '2026-11-03' }), '2026-11-04'), 'terminada');
  assert.equal(ofertas.estadoOferta(oferta({ desde: '2026-11-05' }), '2026-11-04'), 'proxima');
  assert.equal(ofertas.estadoOferta(oferta({ dias_semana: [1] }), '2026-11-04'), 'hoy-no');
  assert.equal(ofertas.estadoOferta(oferta({}), '2026-11-04'), 'vigente');
});

test('las rutas: crear, validar, editar, pausar, y cada negocio ve las suyas', async () => {
  const hoy = fechaDeHoy();
  const categoria = (await admin.post('/api/categorias', { nombre: 'Vacuno' })).json.id;
  const nalga = (await admin.post('/api/productos', { nombre: 'Nalga', precio_venta: 10000, unidad: 'kg', categoria_id: categoria })).json.id;

  const creada = await admin.post('/api/ofertas', {
    nombre: 'Vacuno 2 kg',
    tipo: 'precio',
    valor: 9000,
    cantidad_minima: 2,
    alcance: 'categorias',
    categorias: [categoria],
    desde: hoy,
    dias_semana: [1, 2, 3, 4, 5, 6, 7]
  });
  assert.equal(creada.status, 201, creada.texto);
  const [leida] = (await empleado.get('/api/ofertas')).json;
  assert.equal(leida.nombre, 'Vacuno 2 kg');
  assert.deepEqual(leida.categorias, [categoria]);
  // Todos los días de la semana es lo mismo que ninguno.
  assert.deepEqual(leida.dias_semana, []);
  assert.equal(leida.activa, true);

  // Lo que no se puede guardar.
  const base = { nombre: 'X', tipo: 'porcentaje', valor: 10, alcance: 'todo', desde: hoy };
  for (const [cambio, mensaje] of [
    [{ nombre: ' ' }, /nombre/],
    [{ tipo: 'regalo' }, /cómo baja/],
    [{ valor: 100 }, /menor a 100/],
    [{ valor: 0 }, /porcentaje/],
    [{ cantidad_minima: -1 }, /mínima/],
    [{ alcance: 'productos', productos: [] }, /al menos un producto/],
    [{ alcance: 'productos', productos: [999999] }, /no existe/],
    [{ desde: 'mañana' }, /desde qué día/],
    [{ hasta: '2000-01-01' }, /terminar antes/],
    [{ dias_semana: [8] }, /semana/],
    [{ dias_mes: [0] }, /mes/],
    [{ lista_precio_id: 999999 }, /lista/]
  ]) {
    const respuesta = await admin.post('/api/ofertas', { ...base, ...cambio });
    assert.equal(respuesta.status, 400, JSON.stringify(cambio));
    assert.match(respuesta.json.error, mensaje);
  }
  // Un producto de otro negocio no se puede elegir.
  const ajeno = (await otro.post('/api/productos', { nombre: 'Ajeno', precio_venta: 100 })).json.id;
  assert.equal((await admin.post('/api/ofertas', { ...base, alcance: 'productos', productos: [ajeno] })).status, 400);

  // El empleado no las toca.
  assert.equal((await empleado.post('/api/ofertas', base)).status, 403);
  assert.equal((await empleado.patch(`/api/ofertas/${creada.json.id}`, { activa: false })).status, 403);

  // Editar: cambia todo y queda auditado.
  const editada = await admin.put(`/api/ofertas/${creada.json.id}`, {
    nombre: 'Nalga 2 kg',
    tipo: 'precio',
    valor: 8800,
    cantidad_minima: 2,
    alcance: 'productos',
    productos: [nalga],
    desde: hoy,
    dias_mes: [15, 1, 15]
  });
  assert.equal(editada.status, 200, editada.texto);
  const despues = (await admin.get('/api/ofertas')).json.find((o) => o.id === creada.json.id);
  assert.deepEqual(
    [despues.nombre, despues.valor, despues.alcance, despues.productos, despues.categorias, despues.dias_mes],
    ['Nalga 2 kg', 8800, 'productos', [nalga], [], [1, 15]]
  );

  // Pausar y volver a prender.
  assert.equal((await admin.patch(`/api/ofertas/${creada.json.id}`, { activa: false })).status, 200);
  assert.equal((await admin.get('/api/ofertas')).json.find((o) => o.id === creada.json.id).activa, false);
  assert.equal((await admin.patch(`/api/ofertas/${creada.json.id}`, {})).status, 400);
  assert.equal((await admin.patch(`/api/ofertas/${creada.json.id}`, { activa: true })).status, 200);

  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = (auditoria.filas ?? auditoria).filter((a) => a.operacion_tipo === 'oferta' && a.operacion_id === creada.json.id);
  assert.deepEqual(filas.map((a) => a.accion).sort(), ['cambiar_estado', 'cambiar_estado', 'crear', 'editar']);

  // Otro negocio no la ve ni la puede tocar.
  assert.equal((await otro.get('/api/ofertas')).json.length, 0);
  assert.equal((await otro.put(`/api/ofertas/${creada.json.id}`, base)).status, 404);
  assert.equal((await otro.patch(`/api/ofertas/${creada.json.id}`, { activa: false })).status, 404);
});

test('la venta anota la oferta del renglón solo si cobró su precio, en su lista', async () => {
  const hoy = fechaDeHoy();
  const pan = (await admin.post('/api/productos', { nombre: 'Pan de campo', precio_venta: 2000, tipo: 'servicio' })).json.id;
  const mayorista = (await admin.post('/api/listas-precios', { nombre: 'Mayorista' })).json.id;
  const precios = await admin.patch(`/api/productos/${pan}`, { precios: { [mayorista]: 1800 } });
  assert.equal(precios.status, 200, precios.texto);

  const crear = async (datos) => {
    const creada = await admin.post('/api/ofertas', { alcance: 'productos', productos: [pan], desde: hoy, ...datos });
    assert.equal(creada.status, 201, creada.texto);
    return creada.json.id;
  };
  const veinte = await crear({ nombre: 'Pan 20 %', tipo: 'porcentaje', valor: 20 });
  const porCantidad = await crear({ nombre: 'Pan x6', tipo: 'precio', valor: 1200, cantidad_minima: 6, lista_precio_id: mayorista });

  const vender = async (items, extra = {}) => {
    const venta = await empleado.post('/api/ventas', { cliente: 'Consumidor final', items, ...extra });
    assert.equal(venta.status, 201, venta.texto);
    return (await admin.get(`/api/ventas/${venta.json.id}`)).json.items;
  };

  // Al precio de la oferta: queda anotada, con el de lista.
  let [item] = await vender([{ producto_id: pan, cantidad: 1, precio_unitario: 1600 }]);
  assert.deepEqual([item.oferta_id, item.oferta, item.precio_lista], [veinte, 'Pan 20 %', 2000]);
  // A otro precio (puesto a mano): sin oferta.
  [item] = await vender([{ producto_id: pan, cantidad: 1, precio_unitario: 1700 }]);
  assert.deepEqual([item.oferta_id, item.precio_lista], [null, null]);
  // En la mayorista, con 6: gana la promoción por cantidad de esa lista.
  [item] = await vender([{ producto_id: pan, cantidad: 6, precio_unitario: 1200 }], { lista_precio_id: mayorista });
  assert.deepEqual([item.oferta_id, item.precio_lista], [porCantidad, 1800]);
  // La misma cantidad sin la lista mayorista: esa promoción no vale.
  [item] = await vender([{ producto_id: pan, cantidad: 6, precio_unitario: 1200 }]);
  assert.equal(item.oferta_id, null);

  // Pausada, ya no se anota.
  await admin.patch(`/api/ofertas/${veinte}`, { activa: false });
  [item] = await vender([{ producto_id: pan, cantidad: 1, precio_unitario: 1600 }]);
  assert.equal(item.oferta_id, null);
});
