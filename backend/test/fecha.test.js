// "Hoy" es el día en la zona del negocio (backend/fecha.js, hist. §81). Antes
// el servidor usaba date('now') de SQLite, que es UTC: desde las 21 h de la
// Argentina una venta quedaba con la fecha del día siguiente. Acá el servidor
// corre en una zona que ahora mismo está en otro día que UTC (Pago Pago, UTC-11,
// antes de las 11 UTC; Kiritimati, UTC+14, desde las 11), y cada operación sin
// fecha tiene que tomar el día de esa zona.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

const ZONA = new Date().getUTCHours() >= 11 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago';
let servidor;
let admin;

before(async () => {
  servidor = await levantarServidor({ env: { NEXO_ZONA_HORARIA: ZONA } });
  admin = await registrarEmpresa(servidor, { empresa: 'Kiosco de la isla', usuario: 'admin-isla' });
});

after(async () => {
  await servidor?.cerrar();
});

test('una venta, su cobro y su movimiento de caja llevan el día de la zona del negocio', async () => {
  const hoyEnLaZona = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
  // Si diera el mismo día que UTC, la prueba no probaría nada.
  assert.notEqual(hoyEnLaZona, new Date().toISOString().slice(0, 10));
  const producto = await admin.post('/api/productos', { nombre: 'Agua de coco', precio_venta: 900, tipo: 'servicio' });
  const venta = await admin.post('/api/ventas', {
    cliente: 'Teraaki',
    items: [{ producto_id: producto.json.id, cantidad: 1, precio_unitario: 900 }]
  });
  assert.equal(venta.status, 201, venta.texto);
  const cuenta = (await admin.get('/api/cuentas-tesoreria')).json[0];
  const cobro = await admin.post(`/api/ventas/${venta.json.id}/cobros`, { importe: 900, cuenta_tesoreria_id: cuenta.id });
  assert.ok(cobro.status < 300, cobro.texto);

  assert.equal((await admin.get(`/api/ventas/${venta.json.id}`)).json.fecha, hoyEnLaZona);
  assert.equal((await admin.get(`/api/ventas/${venta.json.id}/cobros`)).json[0].fecha, hoyEnLaZona);
  const movimientos = await admin.get('/api/tesoreria/movimientos');
  const lista = Array.isArray(movimientos.json) ? movimientos.json : movimientos.json?.movimientos ?? [];
  assert.ok(lista.length > 0, movimientos.texto);
  assert.ok(lista.every((m) => m.fecha === hoyEnLaZona), JSON.stringify(lista));
});

test('una zona horaria que no existe corta el arranque', async () => {
  // Si arrancara igual, se cierra: un servidor hijo vivo deja colgado al runner.
  const intento = levantarServidor({ env: { NEXO_ZONA_HORARIA: 'Marte/Olympus' } }).then(async (otro) => {
    await otro.cerrar();
    return otro;
  });
  await assert.rejects(intento);
  // El servidor bueno sigue respondiendo.
  assert.equal((await crearCliente(servidor.url).get('/api/auth/estado')).status, 200);
});
