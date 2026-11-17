// El alta rápida de un cliente con CUIT en el cobro del punto de venta (hist.
// §188). La pantalla (dominios/pos.js) busca el CUIT entre los clientes de
// GET /api/clientes y, según lo que encuentra, lo usa, le completa la
// condición (PATCH con la ficha entera) o lo crea (POST). Acá se recorre ese
// mismo camino por la API, como el empleado del mostrador, hasta la factura A
// contra ARCA simulado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let cajero;
let producto;
let efectivo;
let turno;

before(async () => {
  servidor = await levantarServidor({ env: { NEXO_ARCA: 'stub' } });
  admin = await registrarEmpresa(servidor, { empresa: 'Corralón del Centro', usuario: 'corralon' });
  assert.equal((await admin.put('/api/negocio', { condicion_iva: 'responsable_inscripto', documento: '30-71000000-6' })).status, 200);
  assert.equal((await admin.put('/api/factura-electronica', { punto_venta: 3 })).status, 200);
  const verificado = await admin.post('/api/factura-electronica/verificar');
  assert.equal(verificado.status, 200, verificado.texto);
  producto = (await admin.post('/api/productos', { nombre: 'Flete', precio_venta: 1210, tipo: 'servicio' })).json.id;

  cajero = await crearEmpleado(servidor, admin, { usuario: 'cajero' });
  efectivo = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
  const abierto = await cajero.post('/api/turnos-caja', { cuenta_tesoreria_id: efectivo.id, contado: 0 });
  assert.equal(abierto.status, 201, abierto.texto);
  turno = abierto.json.id;
});

after(async () => {
  await servidor?.cerrar();
});

// Como clientePorCuit() de pos.js: los mismos 11 números, con o sin guiones.
const digitos = (texto) => String(texto ?? '').replace(/\D/g, '');
async function conCuit(cuit) {
  return (await cajero.get('/api/clientes')).json.filter((c) => digitos(c.documento) === digitos(cuit));
}

// Una venta de mostrador cobrada en efectivo y facturada al confirmar, como la
// hace la pantalla: el comprobante que salió.
async function venderConFactura(cliente_id) {
  const venta = await cajero.post('/api/pos/ventas', {
    turno_caja_id: turno,
    cliente_id,
    items: [{ producto_id: producto, cantidad: 1, precio_unitario: 1210 }],
    cobros: [{ cuenta_tesoreria_id: efectivo.id, importe: 1210 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  const factura = await cajero.post(`/api/ventas/${venta.json.id}/facturar`, { condicion: 'efectivo', condicion_venta: 'contado' });
  assert.equal(factura.status, 201, factura.texto);
  assert.equal(factura.json.arca_estado, 'autorizado');
  return factura.json.comprobante;
}

test('un CUIT que no está: el cajero crea el cliente y la venta sale con factura A', async () => {
  assert.deepEqual(await conCuit('30-71234567-1'), []);
  const creado = await cajero.post('/api/clientes', {
    nombre: 'Ferretería SA',
    documento: '30-71234567-1',
    condicion_iva: 'responsable_inscripto'
  });
  assert.equal(creado.status, 201, creado.texto);
  const [cliente] = await conCuit('30-71234567-1');
  assert.equal(cliente.id, creado.json.id);
  assert.match(await venderConFactura(cliente.id), /^A /);
});

test('un CUIT que ya está se reusa aunque se escriba sin guiones: no se duplica', async () => {
  const encontrados = await conCuit('30712345671');
  assert.equal(encontrados.length, 1);
  assert.equal(encontrados[0].nombre, 'Ferretería SA');
  assert.match(await venderConFactura(encontrados[0].id), /^A /);
  assert.equal((await conCuit('30-71234567-1')).length, 1);
});

test('al que le falta la condición se le completa, sin perder el resto de su ficha', async () => {
  const id = (
    await admin.post('/api/clientes', {
      nombre: 'Mono Herrería',
      documento: '20-11111111-2',
      email: 'mono@nexo.test',
      telefono: '351 555-0000',
      notas: 'Paga siempre en efectivo'
    })
  ).json.id;
  // Sin condición es consumidor final: sale una B.
  assert.match(await venderConFactura(id), /^B /);

  const [ficha] = await conCuit('20111111112');
  const completado = await cajero.pedir('PATCH', `/api/clientes/${id}`, {
    nombre: ficha.nombre,
    email: ficha.email,
    telefono: ficha.telefono,
    direccion: ficha.direccion,
    documento: ficha.documento,
    notas: ficha.notas,
    lista_precio_id: ficha.lista_precio_id,
    condicion_pago: ficha.condicion_pago,
    condicion_iva: 'monotributo'
  });
  assert.equal(completado.status, 200, completado.texto);

  const despues = (await cajero.get(`/api/clientes/${id}`)).json;
  assert.equal(despues.condicion_iva, 'monotributo');
  assert.equal(despues.email, 'mono@nexo.test');
  assert.equal(despues.telefono, '351 555-0000');
  assert.equal(despues.notas, 'Paga siempre en efectivo');
  assert.match(await venderConFactura(id), /^A /);
});
