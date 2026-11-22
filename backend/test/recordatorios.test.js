// Recordar una deuda por WhatsApp (hist. §219): los mensajes armados que el
// negocio cambia (solo se guarda lo que cambió), y cada recordatorio anotado
// con la deuda de hoy, quién y cuándo, para que Cuentas corrientes diga hace
// cuánto se le recordó. El mensaje lo manda una persona: Nexo no manda nada.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';
import { MENSAJES, enlaceWhatsApp, llenarMensaje, textoDe } from '../../frontend/js/core/mensajes.js';
import { fechaDeHoy } from '../fecha.js';

let servidor;
let admin;
let empleado;
let otro;
let producto;

const haceDias = (n) => {
  const [y, m, d] = fechaDeHoy().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n, 12)).toISOString().slice(0, 10);
};

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Almacén Rosa', usuario: 'almacenrosa' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'cajerarosa' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Almacén', usuario: 'otroalmacen' });
  producto = (await admin.post('/api/productos', { nombre: 'Yerba', precio_venta: 4500, tipo: 'servicio' })).json.id;
});

after(async () => {
  await servidor?.cerrar();
});

// Una venta sin cobrar: queda en la cuenta corriente del cliente.
async function fiado(nombre, importe, telefono) {
  const cliente_id = (await admin.post('/api/clientes', { nombre, telefono })).json.id;
  const venta = await admin.post('/api/ventas', { cliente_id, items: [{ producto_id: producto, cantidad: 1, precio_unitario: importe }] });
  assert.equal(venta.status, 201, venta.texto);
  return { clienteId: cliente_id, ventaId: venta.json.id };
}

test('los mensajes: se guarda solo lo que cambió, y son del admin', async () => {
  assert.deepEqual((await admin.get('/api/negocio')).json.mensajes_whatsapp, {});

  const propio = 'Hola {nombre}, soy Rosa del almacén: me quedaste debiendo {deuda}. ¡Gracias!';
  const r = await admin.put('/api/negocio/mensajes', {
    mensajes: { vencida: `  ${propio}  `, por_vencer: MENSAJES.por_vencer.de_partida, cuota: '' }
  });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json.mensajes_whatsapp, { vencida: propio });
  assert.deepEqual((await empleado.get('/api/negocio')).json.mensajes_whatsapp, { vencida: propio }, 'el empleado los usa al recordar');

  assert.equal((await admin.put('/api/negocio/mensajes', { mensajes: { otro: 'x' } })).status, 400);
  assert.equal((await admin.put('/api/negocio/mensajes', { mensajes: { vencida: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await admin.put('/api/negocio/mensajes', { mensajes: 'hola' })).status, 400);
  assert.equal((await empleado.put('/api/negocio/mensajes', { mensajes: { vencida: 'x' } })).status, 403);
  assert.deepEqual((await otro.get('/api/negocio')).json.mensajes_whatsapp, {}, 'cada negocio tiene los suyos');

  // Volver al de partida lo borra.
  assert.deepEqual((await admin.put('/api/negocio/mensajes', { mensajes: { vencida: '' } })).json.mensajes_whatsapp, {});
});

test('el mensaje se arma con los datos del cliente y va al chat de su celular', () => {
  const texto = llenarMensaje(textoDe('vencida', {}), { nombre: 'Juana', negocio: 'Almacén Rosa', deuda: '$ 9.000', vencimiento: '10/11/2026', dias: 12 });
  assert.match(texto, /^Hola, Juana\. Te escribimos de Almacén Rosa: tenés un saldo de \$ 9\.000 que venció el 10\/11\/2026\./);
  // Un marcador sin dato queda a la vista, para corregirlo antes de mandarlo.
  assert.equal(llenarMensaje('Tu plan {plan}', {}), 'Tu plan {plan}');

  assert.equal(enlaceWhatsApp('351 555-0101', 'hola'), 'https://wa.me/5493515550101?text=hola');
  assert.equal(enlaceWhatsApp('0351 5550101'), 'https://wa.me/5493515550101');
  assert.equal(enlaceWhatsApp('+54 9 351 555 0101'), 'https://wa.me/5493515550101');
  // Sin un número seguro, WhatsApp pide a quién; y sin texto ni número, no hay enlace.
  assert.equal(enlaceWhatsApp('5550101', 'hola'), 'https://wa.me/?text=hola');
  assert.equal(enlaceWhatsApp(null), null);
});

test('recordar anota la deuda de hoy, quién y cuándo, y Cuentas corrientes dice hace cuánto', async () => {
  const { clienteId } = await fiado('Juana', 9000, '351 555-0101');
  let enLaLista = (await admin.get('/api/cuentas-corrientes')).json.por_cobrar.find((c) => c.id === clienteId);
  assert.equal(enLaLista.recordatorio, null);
  assert.equal(enLaLista.telefono, '351 555-0101');

  // La deuda la pone el servidor, no la pantalla.
  const r = await empleado.post(`/api/clientes/${clienteId}/recordatorios`, { tipo: 'por_vencer', deuda: 1 });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.deuda, 9000);
  assert.equal(r.json.dias, 0);

  enLaLista = (await admin.get('/api/cuentas-corrientes')).json.por_cobrar.find((c) => c.id === clienteId);
  assert.equal(enLaLista.recordatorio.dias, 0);
  assert.ok(enLaLista.recordatorio.fecha);

  const auditoria = (await admin.get('/api/auditoria')).json;
  const filas = Array.isArray(auditoria) ? auditoria : auditoria.filas ?? auditoria.registros ?? [];
  assert.ok(
    filas.some((a) => /Le recordó por WhatsApp a Juana que debe \$ 9\.000/.test(a.detalle ?? '')),
    'queda en la auditoría'
  );
});

test('lo vencido de la carga inicial también se recuerda', async () => {
  const deben = await admin.post('/api/carga-inicial/saldos', { tipo: 'cliente', nombre: 'Pocho', importe: 20000, fecha: haceDias(40), vencimiento: haceDias(35) });
  assert.equal(deben.status, 201, deben.texto);
  const pocho = (await admin.get('/api/cuentas-corrientes')).json.por_cobrar.find((c) => c.nombre === 'Pocho');
  assert.ok(pocho.dias_max > 30, 'entra en "Hace más de un mes"');
  const r = await admin.post(`/api/clientes/${pocho.id}/recordatorios`, { tipo: 'vencida' });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.deuda, 20000);
});

test('sin deuda, de otro negocio o sin tipo, no se anota nada', async () => {
  const sinDeuda = (await admin.post('/api/clientes', { nombre: 'Al día' })).json.id;
  const r = await admin.post(`/api/clientes/${sinDeuda}/recordatorios`, { tipo: 'vencida' });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /Al día no debe nada/);

  const { clienteId, ventaId } = await fiado('Ajena', 5000);
  assert.equal((await otro.post(`/api/clientes/${clienteId}/recordatorios`, { tipo: 'vencida' })).status, 404);
  assert.equal((await admin.post(`/api/clientes/${clienteId}/recordatorios`, { tipo: 'cualquiera' })).status, 400);

  // La cuota es de una venta de ese cliente.
  const { ventaId: deOtroCliente } = await fiado('Otro cliente', 3000);
  assert.equal((await admin.post(`/api/clientes/${clienteId}/recordatorios`, { tipo: 'cuota', venta_id: deOtroCliente })).status, 404);
  const cuota = await admin.post(`/api/clientes/${clienteId}/recordatorios`, { tipo: 'cuota', venta_id: ventaId });
  assert.equal(cuota.status, 201, cuota.texto);
  assert.equal(cuota.json.deuda, 5000);
});

test('al unir clientes repetidos, sus recordatorios pasan al que queda', async () => {
  const { clienteId: queda } = await fiado('Beto', 2000);
  const { clienteId: repetido } = await fiado('Beto R.', 1000);
  assert.equal((await admin.post(`/api/clientes/${repetido}/recordatorios`, { tipo: 'vencida' })).status, 201);
  const unir = await admin.post(`/api/clientes/${queda}/unir`, { ids: [repetido] });
  assert.equal(unir.status, 200, unir.texto);
  const beto = (await admin.get('/api/cuentas-corrientes')).json.por_cobrar.find((c) => c.id === queda);
  assert.equal(beto.recordatorio?.dias, 0);
});

test('la cuota de un socio se recuerda desde Cuotas, y la lista dice hace cuánto', async () => {
  const plan = (await admin.post('/api/planes-socio', { nombre: 'Musculación', opciones: [{ meses: 1, precio: 28000 }] })).json;
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Lucas', documento: '40111222', telefono: '351 444-0202' },
    planes: [{ opcion_id: plan.opciones[0].id }]
  });
  assert.equal(alta.status, 201, alta.texto);
  const mes = fechaDeHoy().slice(0, 7);
  let cuota = (await admin.get(`/api/socios/cuotas?mes=${mes}`)).json.cuotas.find((c) => c.socio === 'Lucas');
  assert.equal(cuota.telefono, '351 444-0202');
  assert.equal(cuota.recordatorio, null);

  const r = await empleado.post(`/api/clientes/${cuota.cliente_id}/recordatorios`, { tipo: 'cuota', venta_id: cuota.venta_id });
  assert.equal(r.status, 201, r.texto);
  assert.equal(r.json.deuda, 28000);
  cuota = (await admin.get(`/api/socios/cuotas?mes=${mes}`)).json.cuotas.find((c) => c.socio === 'Lucas');
  assert.equal(cuota.recordatorio.dias, 0);
});
