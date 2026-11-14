// Medios de cobro (hist. §171): cómo paga el cliente, aparte de en qué cuenta
// cae la plata. Cubre lo que nace con el negocio, la validación, que el punto de
// venta cobre por medio (con cuenta, cuotas y la comisión como gasto de la
// venta), que el empleado no vea los costos y que el aislamiento entre negocios
// se respete. Va aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa, crearEmpleado } from './servidor-de-prueba.js';

let servidor;
let admin;
let otro;
let empleado;
let producto;
let turnoId;
let efectivo;
let banco;
let medios;
const porNombre = (nombre) => medios.find((m) => m.nombre === nombre);

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Kiosco Medios', usuario: 'kioscomedios', extra: { rubro: 'kiosco' } });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Medios', usuario: 'otromedios', extra: { rubro: 'kiosco' } });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajeromedios' });
  producto = (await admin.post('/api/productos', { nombre: 'Gaseosa', precio_venta: 1000 })).json.id;
  const stock = await admin.post('/api/carga-inicial/stock', { filas: [{ producto_id: producto, cantidad: 100, costo: 400 }] });
  assert.equal(stock.status, 200, stock.texto);
  const cuentas = (await admin.get('/api/cuentas-tesoreria')).json;
  efectivo = cuentas.find((c) => c.tipo === 'efectivo');
  banco = cuentas.find((c) => c.tipo === 'banco');
  turnoId = (await admin.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 })).json.id;
  medios = (await admin.get('/api/medios-cobro')).json;
});

after(async () => {
  await servidor?.cerrar();
});

const vender = (cobros, cantidad = 1) =>
  admin.post('/api/pos/ventas', {
    turno_caja_id: turnoId,
    items: [{ producto_id: producto, cantidad, precio_unitario: 1000 }],
    cobros,
    consumos: []
  });

test('un negocio nuevo nace con efectivo, débito, crédito, transferencia y Mercado Pago', () => {
  assert.deepEqual(
    medios.map((m) => [m.nombre, m.tipo]),
    [
      ['Efectivo', 'efectivo'],
      ['Débito', 'debito'],
      ['Crédito', 'credito'],
      ['Transferencia', 'transferencia'],
      ['Mercado Pago', 'billetera']
    ]
  );
  // El efectivo va a la caja del turno (sin cuenta); lo demás, a una que no es caja.
  assert.equal(porNombre('Efectivo').cuenta_tesoreria_id, null);
  assert.equal(porNombre('Débito').cuenta_tesoreria_id, banco.id);
  assert.deepEqual(porNombre('Crédito').planes.map((p) => p.cuotas), [1, 3, 6]);
  assert.ok(medios.every((m) => m.activo && m.comision_pct === 0));
});

test('el alta valida: cuenta, efectivo único, nombre repetido y porcentajes', async () => {
  const nuevo = { nombre: 'Naranja', tipo: 'credito', cuenta_tesoreria_id: banco.id, comision_pct: 2, planes: [{ cuotas: 3, costo_pct: 8 }] };
  const malos = [
    [{ ...nuevo, nombre: '' }, /nombre/],
    [{ ...nuevo, tipo: 'cripto' }, /tipo/],
    [{ ...nuevo, cuenta_tesoreria_id: null }, /cuenta/],
    [{ ...nuevo, cuenta_tesoreria_id: efectivo.id }, /Efectivo/],
    [{ ...nuevo, nombre: 'Débito' }, /nombre/],
    [{ ...nuevo, tipo: 'efectivo', nombre: 'Otro efectivo' }, /efectivo/],
    [{ ...nuevo, comision_pct: 120 }, /comisión/],
    [{ ...nuevo, planes: [{ cuotas: 3 }, { cuotas: 3 }] }, /repetido/],
    [{ ...nuevo, planes: [{ cuotas: 0 }] }, /cuotas/]
  ];
  for (const [cuerpo, error] of malos) {
    const res = await admin.post('/api/medios-cobro', cuerpo);
    assert.equal(res.status, 400, JSON.stringify(cuerpo));
    assert.match(res.json.error, error);
  }
  // La cuenta de otro negocio no sirve.
  const ajena = (await otro.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'banco');
  assert.equal((await admin.post('/api/medios-cobro', { ...nuevo, cuenta_tesoreria_id: ajena.id })).status, 400);

  const ok = await admin.post('/api/medios-cobro', nuevo);
  assert.equal(ok.status, 201, ok.texto);
  const creado = (await admin.get('/api/medios-cobro')).json.find((m) => m.id === ok.json.id);
  assert.equal(creado.cuenta, banco.nombre);
  assert.deepEqual(creado.planes.map((p) => [p.cuotas, p.costo_pct]), [[3, 8]]);
  medios = (await admin.get('/api/medios-cobro')).json;
});

test('el punto de venta cobra por medio: la cuenta sale del medio y el vuelto del efectivo', async () => {
  const venta = await vender([
    { medio_cobro_id: porNombre('Efectivo').id, importe: 300 },
    { medio_cobro_id: porNombre('Débito').id, importe: 700 }
  ]);
  assert.equal(venta.status, 201, venta.texto);
  const lista = (await admin.get('/api/ventas')).json.find((v) => v.id === venta.json.id);
  assert.deepEqual(lista.cuentas_cobro.sort(), [efectivo.id, banco.id].sort());
  assert.deepEqual(lista.medios_cobro.sort(), [porNombre('Efectivo').id, porNombre('Débito').id].sort());
  assert.equal(lista.estado_cobro, 'cobrado');
});

test('un crédito pide el plan, guarda las cuotas y la comisión y el costo salen como gastos de la venta', async () => {
  const credito = porNombre('Crédito');
  const puesto = await admin.put(`/api/medios-cobro/${credito.id}`, {
    nombre: 'Crédito',
    tipo: 'credito',
    cuenta_tesoreria_id: banco.id,
    comision_pct: 2,
    dias_acreditacion: 18,
    planes: [{ cuotas: 1, costo_pct: 0 }, { cuotas: 3, costo_pct: 10 }]
  });
  assert.equal(puesto.status, 200, puesto.texto);

  const sinPlan = await vender([{ medio_cobro_id: credito.id, importe: 1000 }]);
  assert.equal(sinPlan.status, 400);
  assert.match(sinPlan.json.error, /cuotas/);
  const planAjeno = await vender([{ medio_cobro_id: credito.id, cuotas: 12, importe: 1000 }]);
  assert.equal(planAjeno.status, 400);

  const venta = await vender([{ medio_cobro_id: credito.id, cuotas: 3, importe: 1000 }]);
  assert.equal(venta.status, 201, venta.texto);
  const ficha = (await admin.get(`/api/ventas/${venta.json.id}`)).json;
  const costos = ficha.costos_de_vender.map((c) => [c.categoria, c.importe]);
  assert.deepEqual(costos, [['Comisiones de venta', 20], ['Cuotas sin interés', 100]]);
  assert.match(ficha.costos_de_vender[0].descripcion, /Comisión de Crédito \(2\s%/);
  // El cobro recuerda el medio y las cuotas.
  assert.deepEqual((await admin.get('/api/ventas')).json.find((v) => v.id === venta.json.id).medios_cobro, [credito.id]);
});

test('el empleado ve los medios sin comisiones ni costos y no los edita', async () => {
  const lista = await empleado.get('/api/medios-cobro?activos=1');
  assert.equal(lista.status, 200);
  assert.ok(lista.json.length >= 5);
  assert.ok(lista.json.every((m) => !('comision_pct' in m) && m.planes.every((p) => !('costo_pct' in p))));
  assert.equal((await empleado.post('/api/medios-cobro', { nombre: 'X', tipo: 'otro', cuenta_tesoreria_id: banco.id })).status, 403);
  assert.equal((await empleado.del(`/api/medios-cobro/${porNombre('Débito').id}`)).status, 403);
});

test('uno pausado no se ofrece; uno con cobros no se borra y uno sin cobros sí', async () => {
  const debito = porNombre('Débito');
  assert.equal((await admin.put(`/api/medios-cobro/${debito.id}`, { activo: false })).status, 200);
  assert.ok(!(await admin.get('/api/medios-cobro?activos=1')).json.some((m) => m.id === debito.id));
  const pausado = await vender([{ medio_cobro_id: debito.id, importe: 1000 }]);
  assert.equal(pausado.status, 400);
  await admin.put(`/api/medios-cobro/${debito.id}`, { activo: true });

  const conCobros = await admin.del(`/api/medios-cobro/${debito.id}`);
  assert.equal(conCobros.status, 409);
  const naranja = porNombre('Naranja');
  const sinCobros = await admin.del(`/api/medios-cobro/${naranja.id}`);
  assert.equal(sinCobros.status, 200, sinCobros.texto);
});

test('una cuenta nueva se ofrece sola, y un negocio no ve ni usa los medios de otro', async () => {
  const cuenta = await admin.post('/api/cuentas-tesoreria', { nombre: 'Cuenta DNI', tipo: 'otro', saldo_inicial: 0 });
  assert.equal(cuenta.status, 201, cuenta.texto);
  const lista = (await admin.get('/api/medios-cobro')).json;
  assert.ok(lista.some((m) => m.nombre === 'Cuenta DNI' && m.cuenta_tesoreria_id === cuenta.json.id));

  const deOtro = (await otro.get('/api/medios-cobro')).json;
  assert.ok(!deOtro.some((m) => m.nombre === 'Cuenta DNI'));
  const ajeno = await vender([{ medio_cobro_id: deOtro[0].id, importe: 1000 }]);
  assert.equal(ajeno.status, 400);
  assert.equal((await otro.put(`/api/medios-cobro/${porNombre('Débito').id}`, { activo: false })).status, 404);
  assert.equal((await otro.del(`/api/medios-cobro/${porNombre('Débito').id}`)).status, 404);
});

test('una caja no puede pasar a efectivo si un medio le entra la plata', async () => {
  const res = await admin.patch(`/api/cuentas-tesoreria/${banco.id}`, { nombre: banco.nombre, tipo: 'efectivo', saldo_inicial: 0 });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /medio de cobro/);
});
