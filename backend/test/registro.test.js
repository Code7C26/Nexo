// Alta guiada (hist. §73): el catálogo público de tipos de negocio y el
// registro con módulos y datos de los comprobantes. Va en un archivo propio
// porque el registro tiene un tope de 5 intentos por hora y por IP, y cada
// archivo levanta su propio servidor: acá se usan los 5 justos.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearCliente, levantarServidor } from './servidor-de-prueba.js';

let servidor;

before(async () => {
  servidor = await levantarServidor();
});

after(async () => {
  await servidor?.cerrar();
});

test('los tipos de negocio se leen sin sesión', async () => {
  const r = await crearCliente(servidor.url).get('/api/auth/tipos-negocio');
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(
    r.json.tipos.map((t) => t.clave),
    ['comercio', 'carniceria', 'verduleria', 'kiosco', 'servicios', 'gimnasio']
  );
  assert.ok(r.json.tipos.every((t) => t.nombre && t.descripcion && t.icono && Array.isArray(t.modulos)));
  assert.ok(r.json.proximamente.some((t) => t.clave === 'restaurante' && t.icono));
  assert.deepEqual(
    r.json.modulos.map((m) => m.clave),
    ['pos', 'presupuestos', 'compras', 'stock']
  );
});

test('el alta guarda el tipo, los módulos y los datos de los comprobantes', async () => {
  // La primera alta adopta la organización sembrada (UPDATE)...
  const marta = crearCliente(servidor.url);
  const alta = await marta.post('/api/auth/registro', {
    empresa: 'La Vaquita',
    nombre: 'Marta',
    usuario: 'marta',
    password: 'clave-segura-1',
    rubro: 'carniceria',
    modulos: ['pos'],
    documento: '20123456786',
    condicion_iva: 'monotributo',
    direccion: 'Belgrano 100',
    telefono: '',
    email: 'marta@lavaquita.com.ar'
  });
  assert.equal(alta.status, 201, alta.texto);
  const vaquita = (await marta.get('/api/negocio')).json;
  assert.equal(vaquita.nombre, 'La Vaquita');
  assert.equal(vaquita.rubro, 'carniceria');
  assert.deepEqual(vaquita.modulos, ['pos']);
  assert.equal(vaquita.documento, '20-12345678-6');
  assert.equal(vaquita.condicion_iva, 'monotributo');
  assert.equal(vaquita.direccion, 'Belgrano 100');
  assert.equal(vaquita.telefono, null);
  assert.equal(vaquita.email, 'marta@lavaquita.com.ar');

  // ...y la segunda crea una nueva (INSERT). Sin módulos, los del tipo.
  const pepe = crearCliente(servidor.url);
  const otra = await pepe.post('/api/auth/registro', {
    empresa: 'Kiosco Pepe',
    nombre: 'Pepe',
    usuario: 'pepe',
    password: 'clave-segura-1',
    rubro: 'kiosco',
    condicion_iva: 'responsable_inscripto'
  });
  assert.equal(otra.status, 201, otra.texto);
  const kiosco = (await pepe.get('/api/negocio')).json;
  assert.equal(kiosco.nombre, 'Kiosco Pepe');
  assert.deepEqual(kiosco.modulos, ['pos', 'compras', 'stock']);
  assert.equal(kiosco.condicion_iva, 'responsable_inscripto');
  assert.equal(kiosco.documento, null);
});

test('el alta rechaza un tipo que no se puede elegir y un CUIT inválido', async () => {
  const base = { empresa: 'Rechazada', nombre: 'Nadie', password: 'clave-segura-1' };
  for (const [cuerpo, motivo] of [
    [{ ...base, usuario: 'r1', rubro: 'peluqueria' }, 'tipo "Próximamente"'],
    [{ ...base, usuario: 'r2', rubro: 'constructor' }, 'clave del prototipo'],
    [{ ...base, usuario: 'r3', documento: '20-12345678-5' }, 'CUIT con el dígito verificador malo']
  ]) {
    const r = await crearCliente(servidor.url).post('/api/auth/registro', cuerpo);
    assert.equal(r.status, 400, `${motivo}: ${r.texto}`);
  }
  // Ninguno quedó creado a medias.
  const login = await crearCliente(servidor.url).post('/api/auth/login', { usuario: 'r3', password: 'clave-segura-1' });
  assert.equal(login.status, 401);
});
