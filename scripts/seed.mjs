// Empresa de prueba con datos en todos los dominios: `npm run seed -- --db <ruta>`.
//
// Reemplaza el seed que se reescribía en el scratchpad de cada sesión (hist.
// §53). Todo entra por la API HTTP, no con INSERT directos: así pasa por la
// misma validación, auditoría y aislamiento que un operador, y no duplica
// hashPassword ni la lógica de stock y costos de server.js.
//
// Uso:
//   --db <ruta>       levanta un servidor temporal sobre esa base (nueva o
//                     existente), siembra y lo cierra. La base queda lista para
//                     NEXO_DB_PATH. Nunca acepta backend/db/nexo.db.
//   --url <url>       siembra un servidor que ya está corriendo (por ejemplo,
//                     una copia de la base real en otro puerto, para tener una
//                     segunda empresa con la que probar aislamiento). El puerto
//                     3000 es el del servidor real: se rechaza salvo --forzar.
//   --empresa <nom>   nombre de la empresa (por defecto "Baseline SA").
//   --prefijo <p>     prefijo de usuarios y SKUs, para sembrar más de una
//                     empresa en la misma base (el usuario y el SKU son únicos
//                     en todo Nexo, hist. §45).
//
// regresion-head.mjs importa `sembrar` para armar su base.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { crearEmpleado, levantarServidor, registrarEmpresa } from '../backend/test/servidor-de-prueba.js';
import { asegurarQueNoEsLaReal } from './lib/base-real.mjs';

export const PASSWORD_ADMIN = 'clave-segura-1';
export const PASSWORD_EMPLEADO = 'clave-segura-2';

// Corta con la respuesta del servidor a la vista: las trampas de validación
// (condicion_pago solo contado/15/30/60, facturas.condicion solo
// efectivo/transferencia/mercadopago) se ven acá y no en un 500 mudo.
async function paso(descripcion, pedido) {
  const r = await pedido;
  if (r.status >= 300) throw new Error(`Seed: falló "${descripcion}" (${r.status}): ${r.texto}`);
  return r.json;
}

const enDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export async function sembrar(url, { empresa = 'Baseline SA', prefijo = '' } = {}) {
  const p = prefijo ? `${prefijo}-` : '';
  const usuarios = { admin: `${p}admin1`, empleado: `${p}emp1` };

  const admin = await registrarEmpresa(url, { empresa, usuario: usuarios.admin, password: PASSWORD_ADMIN });
  const empleado = await crearEmpleado(url, admin, { usuario: usuarios.empleado, password: PASSWORD_EMPLEADO });

  // Catálogos base: los siembra el servidor para cada empresa nueva (hist. §49).
  const [efectivo] = await paso('listar cuentas', admin.get('/api/cuentas-tesoreria'));
  const depositos = await paso('listar depósitos', admin.get('/api/depositos'));
  const principal = depositos.find((d) => d.es_predeterminado) ?? depositos[0];
  const segundo = await paso('alta de depósito', admin.post('/api/depositos', { nombre: 'Depósito 2', direccion: 'Calle Falsa 123' }));
  await paso('aporte inicial a caja', admin.post('/api/tesoreria/movimientos', {
    cuenta_tesoreria_id: efectivo.id,
    tipo: 'ingreso',
    importe: 100000,
    concepto: 'Aporte inicial'
  }));

  // Productos: dos simples y uno con variantes (Talle S y M).
  const categoria = await paso('alta de categoría', admin.post('/api/categorias', { nombre: 'Indumentaria' }));
  const producto = (nombre, sku, precio_venta) =>
    paso(`alta de ${nombre}`, admin.post('/api/productos', {
      nombre,
      sku: `${p}${sku}`,
      precio_venta,
      stock_minimo: 2,
      categoria_id: categoria.id,
      margen_objetivo: 40
    }));
  const remera = await producto('Remera', 'REM-01', 9000);
  const pantalon = await producto('Pantalón', 'PAN-01', 20000);
  const gorra = await producto('Gorra', 'GOR-01', 3500);
  const talle = await paso('atributo Talle', admin.post(`/api/productos/${gorra.id}/atributos`, { nombre: 'Talle' }));
  const variantes = {};
  for (const valor of ['S', 'M']) {
    const v = await paso(`valor ${valor}`, admin.post(`/api/productos/${gorra.id}/atributos/${talle.id}/valores`, { valor }));
    variantes[valor] = await paso(`variante ${valor}`, admin.post(`/api/productos/${gorra.id}/variantes`, {
      valores: [{ atributo_id: talle.id, valor_id: v.id }],
      sku: `${p}GOR-01-${valor}`,
      precio_venta: 3500
    }));
  }

  const juan = await paso('cliente contado', empleado.post('/api/clientes', { nombre: 'Juan Pérez', documento: '20111222' }));
  const ana = await paso('cliente a 30 días', empleado.post('/api/clientes', {
    nombre: 'Ana Gómez',
    email: 'ana@example.com',
    condicion_pago: 30
  }));
  await paso('proveedor', admin.post('/api/proveedores', { nombre: 'Textil Norte', condicion_pago: 30 }));

  // Compra a 30 días con envío (prorrateo, §7), recibida y pagada en parte.
  const compra = await paso('alta de compra', admin.post('/api/compras', {
    proveedor: 'Textil Norte',
    items: [
      { producto: 'Remera', cantidad: 10, precio_unitario: 4000 },
      { producto: 'Pantalón', cantidad: 5, precio_unitario: 9000 },
      { producto: 'Gorra', variante_id: variantes.S.id, cantidad: 4, precio_unitario: 1500 },
      { producto: 'Gorra', variante_id: variantes.M.id, cantidad: 4, precio_unitario: 1500 }
    ],
    costo_envio: 3000,
    condicion_pago: 30
  }));
  await paso('confirmar compra', admin.post(`/api/compras/${compra.id}/confirmar`, {}));
  await paso('recibir compra', admin.patch(`/api/compras/${compra.id}/estado-envio`, { estado_envio: 'recibido' }));
  await paso('pago parcial de compra', admin.post(`/api/compras/${compra.id}/pagos`, {
    importe: 20000,
    cuenta_tesoreria_id: efectivo.id
  }));

  // Venta de contado cobrada y facturada, y otra a cuenta corriente.
  const ventaContado = await paso('venta de contado', empleado.post('/api/ventas', {
    cliente_id: juan.id,
    items: [
      { producto_id: remera.id, cantidad: 2, precio_unitario: 9000 },
      { producto_id: gorra.id, variante_id: variantes.M.id, cantidad: 1, precio_unitario: 3500 }
    ]
  }));
  await paso('cobro de la venta', empleado.post(`/api/ventas/${ventaContado.id}/cobros`, {
    importe: 21500,
    cuenta_tesoreria_id: efectivo.id
  }));
  await paso('facturar la venta', empleado.post(`/api/ventas/${ventaContado.id}/facturar`, { condicion: 'efectivo' }));
  await paso('venta a cuenta corriente', empleado.post('/api/ventas', {
    cliente_id: ana.id,
    items: [{ producto_id: pantalon.id, cantidad: 1, precio_unitario: 20000 }],
    condicion_pago: 30
  }));

  await paso('presupuesto', empleado.post('/api/presupuestos', {
    cliente_id: ana.id,
    items: [{ producto_id: remera.id, cantidad: 3, precio_unitario: 8500 }],
    vencimiento: enDias(15)
  }));
  await paso('factura manual', empleado.post('/api/facturas', {
    cliente: 'Consumidor final',
    concepto: 'Arreglo de prenda',
    neto: 5000,
    condicion: 'transferencia'
  }));

  // Devoluciones: una remera del cliente y una del proveedor.
  const detalleVenta = await paso('detalle de venta', empleado.get(`/api/ventas/${ventaContado.id}`));
  const itemRemera = detalleVenta.items.find((i) => i.producto_id === remera.id);
  await paso('devolución de venta', empleado.post('/api/devoluciones', {
    venta_id: ventaContado.id,
    items: [{ venta_item_id: itemRemera.id, cantidad: 1 }],
    motivo: 'Talle equivocado',
    cuenta_tesoreria_id: efectivo.id
  }));
  const detalleCompra = await paso('detalle de compra', admin.get(`/api/compras/${compra.id}`));
  const itemPantalon = detalleCompra.items.find((i) => i.producto_id === pantalon.id);
  await paso('devolución a proveedor', admin.post('/api/devoluciones-proveedor', {
    compra_id: compra.id,
    items: [{ compra_item_id: itemPantalon.id, cantidad: 1 }],
    motivo: 'Falla de fábrica'
  }));

  await paso('transferencia entre depósitos', empleado.post('/api/transferencias', {
    deposito_origen_id: principal.id,
    deposito_destino_id: segundo.id,
    producto_id: remera.id,
    cantidad: 2
  }));

  const alquiler = await paso('categoría de gasto', empleado.post('/api/categorias-gasto', { nombre: 'Alquiler', tipo: 'operativo' }));
  await paso('gasto', empleado.post('/api/gastos', {
    categoria_id: alquiler.id,
    cuenta_tesoreria_id: efectivo.id,
    importe: 50000,
    descripcion: 'Alquiler del local'
  }));

  return { empresa, usuarios, admin, empleado };
}

function rechazar(mensaje) {
  console.error(`seed: ${mensaje}`);
  process.exit(1);
}

async function principal() {
  const { values: op } = parseArgs({
    options: {
      db: { type: 'string' },
      url: { type: 'string' },
      empresa: { type: 'string' },
      prefijo: { type: 'string' },
      forzar: { type: 'boolean', default: false }
    }
  });
  if (!op.db === !op.url) rechazar('indicá exactamente uno de --db <ruta> o --url <url>.');

  let servidor;
  let url = op.url;
  if (op.db) {
    try {
      asegurarQueNoEsLaReal(op.db);
    } catch (err) {
      rechazar(err.message);
    }
    servidor = await levantarServidor({ dbPath: path.resolve(op.db) });
    url = servidor.url;
  } else if (new URL(url).port === '3000' && !op.forzar) {
    rechazar('el puerto 3000 es el del servidor real. Si de verdad es uno de prueba, agregá --forzar.');
  }

  try {
    const r = await sembrar(url, { empresa: op.empresa, prefijo: op.prefijo });
    console.log(`Empresa "${r.empresa}" sembrada en ${op.db ? path.resolve(op.db) : url}.`);
    console.log(`  admin:    ${r.usuarios.admin} / ${PASSWORD_ADMIN}`);
    console.log(`  empleado: ${r.usuarios.empleado} / ${PASSWORD_EMPLEADO}`);
  } finally {
    await servidor?.cerrar();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
