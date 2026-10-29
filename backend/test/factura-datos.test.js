// Los datos de una factura (hist. §116): los fijos del negocio salen de
// Configuración; los de cada factura (para quién es, condición de venta,
// período) se cargan al hacerla, y la factura guarda una foto de los dos.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let producto;

before(async () => {
  servidor = await levantarServidor({ env: { NEXO_ARCA: 'stub' } });
  admin = await registrarEmpresa(servidor, { empresa: 'Ferretería Foto', usuario: 'foto' });
  producto = (await admin.post('/api/productos', { nombre: 'Instalación', precio_venta: 1210, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
});

async function vender(cliente_id) {
  const r = await admin.post('/api/ventas', { cliente_id, items: [{ producto_id: producto, cantidad: 1, precio_unitario: 1210 }] });
  assert.equal(r.status, 201, r.texto);
  return r.json.id;
}

test('los datos fijos del negocio se guardan en Configuración', async () => {
  const r = await admin.put('/api/negocio', {
    documento: '30-71000000-6',
    condicion_iva: 'responsable_inscripto',
    razon_social: 'Ferretería Foto SRL',
    ingresos_brutos: '282885611',
    inicio_actividades: '2010-08-01',
    direccion: 'Av. Belgrano 123, Alta Gracia'
  });
  assert.equal(r.status, 200, r.texto);
  const negocio = (await admin.get('/api/negocio')).json;
  assert.equal(negocio.razon_social, 'Ferretería Foto SRL');
  assert.equal(negocio.ingresos_brutos, '282885611');
  assert.equal(negocio.inicio_actividades, '2010-08-01');

  const futura = await admin.put('/api/negocio', { inicio_actividades: '2999-01-01' });
  assert.equal(futura.status, 400);
});

test('la factura guarda para quién es y quién la emite, aunque después cambien', async () => {
  const cliente = (await admin.post('/api/clientes', { nombre: 'Sierra' })).json.id;
  const venta = await vender(cliente);

  // Un CUIT mal escrito no pasa.
  const mal = await admin.post(`/api/ventas/${venta}/facturar`, {
    condicion: 'efectivo',
    receptor: { documento: '30-71234567-2' }
  });
  assert.equal(mal.status, 400);
  assert.match(mal.json.error, /CUIT del cliente no es válido/);

  const r = await admin.post(`/api/ventas/${venta}/facturar`, {
    condicion: 'transferencia',
    receptor: {
      nombre: 'Construcciones Sierra SRL',
      documento: '30712345671',
      condicion_iva: 'responsable_inscripto',
      domicilio: 'Estados Unidos 2929, Córdoba'
    },
    guardar_en_cliente: true,
    condicion_venta: 'transferencia',
    periodo_desde: '2026-10-01',
    periodo_hasta: '2026-10-31',
    vencimiento_pago: '2026-11-10'
  });
  assert.equal(r.status, 201, r.texto);
  const factura = (await admin.get(`/api/facturas/${r.json.id}`)).json;
  // La condición cargada decide la letra: inscripto a inscripto es A.
  assert.equal(factura.letra, 'A');
  assert.equal(factura.receptor_nombre, 'Construcciones Sierra SRL');
  assert.equal(factura.cliente_documento, '30-71234567-1');
  assert.equal(factura.cliente_direccion, 'Estados Unidos 2929, Córdoba');
  assert.equal(factura.condicion_venta, 'transferencia');
  assert.equal(factura.periodo_desde, '2026-10-01');
  assert.equal(factura.vencimiento_pago, '2026-11-10');
  assert.equal(factura.emisor.razon_social, 'Ferretería Foto SRL');
  assert.equal(factura.emisor.ingresos_brutos, '282885611');
  assert.equal(factura.codigo_comprobante, 1);
  assert.equal(factura.items[0].unidad, 'unidad');

  // Quedó en la ficha del cliente, para la próxima.
  const ficha = (await admin.get(`/api/clientes/${cliente}`)).json;
  assert.equal(ficha.documento, '30-71234567-1');
  assert.equal(ficha.condicion_iva, 'responsable_inscripto');

  // Cambian el cliente y el negocio: la factura ya emitida no.
  await admin.patch(`/api/clientes/${cliente}`, { direccion: 'Otra calle 1' });
  await admin.put('/api/negocio', { razon_social: 'Otra SRL' });
  const despues = (await admin.get(`/api/facturas/${r.json.id}`)).json;
  assert.equal(despues.cliente_direccion, 'Estados Unidos 2929, Córdoba');
  assert.equal(despues.emisor.razon_social, 'Ferretería Foto SRL');
});

test('sin datos en el pedido salen de la ficha, y sin pedirlo la ficha no cambia', async () => {
  const cliente = (await admin.post('/api/clientes', { nombre: 'Juan', documento: '30123456' })).json.id;
  const r = await admin.post(`/api/ventas/${await vender(cliente)}/facturar`, {
    condicion: 'efectivo',
    receptor: { domicilio: 'San Martín 50' }
  });
  assert.equal(r.status, 201, r.texto);
  const factura = (await admin.get(`/api/facturas/${r.json.id}`)).json;
  assert.equal(factura.letra, 'B');
  assert.equal(factura.receptor_nombre, 'Juan');
  assert.equal(factura.cliente_documento, '30123456');
  assert.equal(factura.cliente_condicion_iva, 'consumidor_final');
  assert.equal(factura.cliente_direccion, 'San Martín 50');
  assert.equal(factura.condicion_venta, 'contado');
  assert.equal((await admin.get(`/api/clientes/${cliente}`)).json.direccion ?? null, null);
});
