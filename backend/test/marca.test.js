// El logo y el color del negocio, y la foto de perfil (hist. §212): se guardan
// solo imágenes de verdad, el logo lo ve solo quien trabaja en el negocio, el
// color vuelve al azul con null, y la descarga de datos lleva el logo. Va
// aparte porque cada archivo levanta su servidor.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

// Un PNG de 1 x 1, y uno de mentira: un SVG con la etiqueta de PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');

let servidor;
let admin;
let empleado;
let otro;

before(async () => {
  servidor = await levantarServidor();
  admin = await registrarEmpresa(servidor, { empresa: 'Dojo Morro', usuario: 'morro' });
  empleado = await crearEmpleado(servidor, admin, { usuario: 'profemorro' });
  otro = await registrarEmpresa(servidor, { empresa: 'Otro Dojo', usuario: 'otrodojo' });
});

after(async () => {
  await servidor?.cerrar();
});

test('el logo: solo una imagen de verdad, y lo ve solo quien trabaja en el negocio', async () => {
  for (const logo of [{ tipo: 'image/png', datos: SVG }, { tipo: 'image/svg+xml', datos: SVG }, { tipo: 'image/png' }, 'logo.png']) {
    const r = await admin.put('/api/negocio/marca', { logo });
    assert.equal(r.status, 400, JSON.stringify(logo));
  }
  assert.equal((await empleado.put('/api/negocio/marca', { logo: { tipo: 'image/png', datos: PNG } })).status, 403);

  const subido = await admin.put('/api/negocio/marca', { logo: { tipo: 'image/png', datos: PNG } });
  assert.equal(subido.status, 200, subido.texto);
  assert.match(subido.json.logo, /^\/api\/negocios\/\d+\/logo\?v=\w+$/);

  const negocio = (await admin.get('/api/negocio')).json;
  assert.equal(negocio.logo, subido.json.logo);
  assert.equal((await admin.get('/api/negocios')).json.find((n) => n.actual).logo, subido.json.logo);

  // El negocio y su empleado lo ven, con caché larga; otro negocio, no.
  const imagen = await empleado.get(subido.json.logo);
  assert.equal(imagen.status, 200);
  assert.equal(imagen.headers.get('content-type'), 'image/png');
  assert.match(imagen.headers.get('cache-control'), /immutable/);
  assert.equal((await otro.get(subido.json.logo)).status, 404);

  // La descarga de los datos lo lleva como imagen, no byte por byte.
  const exportado = (await admin.get('/api/negocio/exportar')).json;
  assert.equal(exportado.negocio.logo, `data:image/png;base64,${PNG}`);

  // Otro logo cambia la dirección; sacarlo la borra.
  const otroLogo = (await admin.put('/api/negocio/marca', { logo: { tipo: 'image/png', datos: PNG } })).json.logo;
  assert.notEqual(otroLogo, subido.json.logo);
  const sacado = await admin.put('/api/negocio/marca', { logo: null });
  assert.equal(sacado.json.logo, null);
  assert.equal((await admin.get(otroLogo.split('?')[0])).status, 404);

  const detalles = (await admin.get('/api/auditoria')).json.map((f) => f.detalle);
  for (const detalle of ['Subió el logo', 'Cambió el logo', 'Sacó el logo']) assert.ok(detalles.includes(detalle), detalle);
});

test('el color: un #rrggbb guardado en minúsculas, y null vuelve al azul de Nexo', async () => {
  for (const color of ['rojo', '#12345', '#GGGGGG', 123]) {
    assert.equal((await admin.put('/api/negocio/marca', { color })).status, 400, String(color));
  }
  const elegido = await admin.put('/api/negocio/marca', { color: '#16A34A' });
  assert.equal(elegido.status, 200, elegido.texto);
  assert.equal(elegido.json.color_marca, '#16a34a');
  // Lo leen los dos roles: el color es de toda la app.
  assert.equal((await empleado.get('/api/negocio')).json.color_marca, '#16a34a');
  // Solo el color: el logo queda como estaba.
  await admin.put('/api/negocio/marca', { logo: { tipo: 'image/png', datos: PNG } });
  const soloColor = await admin.put('/api/negocio/marca', { color: '#7c3aed' });
  assert.ok(soloColor.json.logo);

  assert.equal((await admin.put('/api/negocio/marca', { color: null })).json.color_marca, null);
  const detalles = (await admin.get('/api/auditoria')).json.map((f) => f.detalle);
  assert.ok(detalles.includes('Color de la marca: #16a34a'));
  assert.ok(detalles.includes('El color de la marca volvió al de Nexo'));
});

test('la foto de perfil: es de la cuenta, y se saca con null', async () => {
  assert.equal((await empleado.put('/api/auth/foto', { foto: { tipo: 'image/jpeg', datos: PNG } })).status, 400);
  const subida = await empleado.put('/api/auth/foto', { foto: { tipo: 'image/png', datos: PNG } });
  assert.equal(subida.status, 200, subida.texto);
  assert.match(subida.json.foto, /^\/api\/auth\/foto\?v=\w+$/);
  assert.equal((await empleado.get('/api/auth/estado')).json.usuario.foto, subida.json.foto);
  assert.equal((await empleado.get('/api/auth/foto')).headers.get('content-type'), 'image/png');
  // Cada uno ve la suya: el admin no tiene.
  assert.equal((await admin.get('/api/auth/foto')).status, 404);

  assert.equal((await empleado.put('/api/auth/foto', { foto: null })).json.foto, null);
  assert.equal((await empleado.get('/api/auth/estado')).json.usuario.foto, null);
  assert.equal((await empleado.get('/api/auth/foto')).status, 404);
});
