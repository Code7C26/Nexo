// IVA, primer paso de la etapa C (hist. §112): la alícuota del producto (21 %
// si no se elige) y la condición del cliente frente al IVA (vacía = consumidor
// final). Todavía no se calcula nada con ellas.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
let admin;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Kiosco IVA', usuario: 'iva' });
});

after(async () => {
  await servidor?.cerrar();
});

const productoEnLista = async (id) => (await admin.get('/api/productos')).json.find((p) => p.id === id);

test('un producto nace en 21 % y se puede cambiar de alícuota', async () => {
  const creado = await admin.post('/api/productos', { nombre: 'Yerba', precio_venta: 3000 });
  assert.equal(creado.status, 201, creado.texto);
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '21');

  const libro = await admin.post('/api/productos', { nombre: 'Libro', precio_venta: 9000, alicuota_iva: 'exento' });
  assert.equal(libro.status, 201, libro.texto);
  assert.equal((await productoEnLista(libro.json.id)).alicuota_iva, 'exento');

  const editado = await admin.patch(`/api/productos/${creado.json.id}`, { alicuota_iva: '10.5' });
  assert.equal(editado.status, 200, editado.texto);
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '10.5');

  // Editar otro campo no la toca.
  await admin.patch(`/api/productos/${creado.json.id}`, { precio_venta: 3200 });
  assert.equal((await productoEnLista(creado.json.id)).alicuota_iva, '10.5');

  for (const alicuota_iva of ['22', 'mucho', 21.5]) {
    const r = await admin.patch(`/api/productos/${creado.json.id}`, { alicuota_iva });
    assert.equal(r.status, 400, `alícuota ${alicuota_iva}: ${r.texto}`);
  }
});

test('el cliente guarda su condición frente al IVA', async () => {
  const creado = await admin.post('/api/clientes', { nombre: 'Ferretería Sur', condicion_iva: 'responsable_inscripto' });
  assert.equal(creado.status, 201, creado.texto);
  const id = creado.json.id;
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, 'responsable_inscripto');

  // Una edición que no la manda la deja como estaba; vacía, vuelve a
  // consumidor final.
  assert.equal((await admin.patch(`/api/clientes/${id}`, { nombre: 'Ferretería del Sur' })).status, 200);
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, 'responsable_inscripto');
  assert.equal((await admin.patch(`/api/clientes/${id}`, { nombre: 'Ferretería del Sur', condicion_iva: '' })).status, 200);
  assert.equal((await admin.get(`/api/clientes/${id}`)).json.condicion_iva, null);

  const malo = await admin.post('/api/clientes', { nombre: 'Otro', condicion_iva: 'inventada' });
  assert.equal(malo.status, 400, malo.texto);
});
