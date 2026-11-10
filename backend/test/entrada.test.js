// La pantalla de entrada del gimnasio (hist. §144): el socio tipea su DNI o
// su número. Al día entra solo; si debe, la entrada le pide que pase por
// recepción (sin decir cuánto). El aviso a la recepción va entre las dos
// ventanas del navegador (BroadcastChannel): acá, el socio_id. Va aparte
// porque cada archivo levanta su servidor, y el alta de empresas tiene un tope
// de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;
let puerta;
let otroNegocio;
let socio;
let efectivo;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Gimnasio Puerta', usuario: 'gimpuerta' });
  otroNegocio = await registrarEmpresa(servidor, { empresa: 'Otro Gimnasio', usuario: 'otrogim' });
  // La tablet de la puerta, con la sesión de un empleado.
  puerta = await crearEmpleado(servidor, admin, { usuario: 'puerta' });
  const plan = (await admin.post('/api/planes-socio', { nombre: 'Pase libre', opciones: [{ meses: 1, precio: 30000 }] })).json;
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Ana María López', documento: '30.444.555' },
    planes: [{ opcion_id: plan.opciones[0].id }]
  });
  assert.equal(alta.status, 201, alta.texto);
  socio = alta.json;
  efectivo = (await admin.get('/api/cuentas-tesoreria')).json.find((c) => c.tipo === 'efectivo');
});

after(async () => {
  await servidor?.cerrar();
});

test('si debe, la entrada lo manda a recepción sin decir cuánto, y no lo anota', async () => {
  const r = await puerta.post('/api/socios/entrada', { codigo: '30444555' });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.json, { entra: false, socio_id: socio.id, nombre: 'Ana', motivo: 'Tenés una cuota pendiente.' });
  assert.ok(!r.texto.includes('30000'), 'sin el importe');
  // Con el número de socio, lo mismo.
  assert.equal((await puerta.post('/api/socios/entrada', { codigo: String(socio.numero) })).json.socio_id, socio.id);
  assert.equal((await admin.get('/api/socios/ingresos')).json.length, 0);
});

test('la recepción le cobra y lo deja pasar, y pasar el DNI de nuevo no suma otro ingreso', async () => {
  const cobro = await admin.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: efectivo.id });
  assert.equal(cobro.status, 201, cobro.texto);
  const pasa = await admin.post(`/api/socios/${socio.id}/ingresos`, {});
  assert.equal(pasa.status, 201, pasa.texto);

  const otraVez = await puerta.post('/api/socios/entrada', { codigo: '30444555' });
  assert.equal(otraVez.status, 200, otraVez.texto);
  assert.equal(otraVez.json.entra, true);
  assert.equal(otraVez.json.ya_estaba, true);
  const ingresos = (await admin.get('/api/socios/ingresos')).json;
  assert.equal(ingresos.length, 1);
  assert.equal(ingresos[0].por_pantalla, false);
});

test('un DNI que no está, o de otro negocio, no entra', async () => {
  for (const codigo of ['99999999', '', 'abc', '1234567890123']) {
    const r = await puerta.post('/api/socios/entrada', { codigo });
    assert.equal(r.status, 404, `${codigo}: ${r.texto}`);
  }
  assert.equal((await otroNegocio.post('/api/socios/entrada', { codigo: '30444555' })).status, 404);
});

test('al día, entra solo por la pantalla', async () => {
  const plan = (await admin.get('/api/planes-socio')).json[0];
  const alta = await admin.post('/api/socios', {
    cliente: { nombre: 'Bruno Díaz', documento: '28111222' },
    planes: [{ opcion_id: plan.opciones[0].id }]
  });
  const bruno = alta.json;
  assert.equal((await puerta.post('/api/socios/entrada', { codigo: '28111222' })).json.entra, false);

  await admin.post(`/api/socios/${bruno.id}/cobros`, { cuenta_tesoreria_id: efectivo.id });
  const entra = await puerta.post('/api/socios/entrada', { codigo: '28111222' });
  assert.equal(entra.status, 201, entra.texto);
  assert.equal(entra.json.nombre, 'Bruno');
  assert.equal(entra.json.socio_id, bruno.id);
  assert.ok(entra.json.al_dia_hasta);
  const delDia = (await admin.get('/api/socios/ingresos')).json.find((i) => i.socio_id === bruno.id);
  assert.equal(delDia.por_pantalla, true);
  assert.equal(delDia.al_dia, true);
});
