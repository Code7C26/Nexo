// El manual de uso y su búsqueda (hist. §118): core/manual.js y
// core/buscar-ayuda.js son módulos del navegador sin DOM, así que se prueban
// acá directo. Lo que importa: que el manual esté bien armado, que una
// pregunta común llegue a su sección, y que una operación siga yendo a la IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { GRUPOS, SECCIONES } = await import('../../frontend/js/core/manual.js');
const { buscarEnManual, clasificarFrase, PUNTAJE_SEGURO } = await import('../../frontend/js/core/buscar-ayuda.js');

const html = readFileSync(new URL('../../frontend/index.html', import.meta.url), 'utf8');
const vistas = new Set([...html.matchAll(/<section class="view" data-view="([^"]+)"/g)].map((m) => m[1]));
const paginasConfig = new Set([...html.matchAll(/class="config-pagina[^"]*" data-seccion="([^"]+)"/g)].map((m) => m[1]));

test('el manual está bien armado', () => {
  const ids = SECCIONES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
  for (const s of SECCIONES) {
    assert.match(s.id, /^[a-z0-9-]+$/, `id con caracteres raros: ${s.id}`);
    assert.ok(GRUPOS.includes(s.grupo), `${s.id}: grupo desconocido "${s.grupo}"`);
    assert.ok(s.titulo && s.preguntas.length && s.palabras.length && s.bloques.length, `${s.id}: le falta algo`);
    for (const otro of s.ver ?? []) assert.ok(ids.includes(otro), `${s.id}: "ver" apunta a "${otro}", que no existe`);
    if (s.pantalla) {
      const [vista, pagina] = s.pantalla[0].replace(/^#\//, '').split('/');
      assert.ok(vistas.has(vista), `${s.id}: la pantalla #/${vista} no existe`);
      if (vista === 'configuracion') assert.ok(paginasConfig.has(pagina), `${s.id}: Configuración no tiene "${pagina}"`);
    }
  }
  for (const grupo of GRUPOS) assert.ok(SECCIONES.some((s) => s.grupo === grupo), `grupo vacío: ${grupo}`);
});

// Cómo lo preguntaría alguien que no leyó el manual (sin copiar sus
// "preguntas" tal cual), y qué sección tiene que contestar.
const PREGUNTAS = [
  ['¿Cómo anulo una venta?', 'anular-venta'],
  ['como cargo un producto nuevo', 'cargar-producto'],
  ['dónde veo cuánto me deben los clientes', 'cuentas-corrientes'],
  ['¿cómo hago una factura?', 'facturar'],
  ['cómo abro la caja a la mañana', 'punto-de-venta'],
  ['como invito a un empleado', 'equipo'],
  ['me olvidé la contraseña', 'mi-cuenta'],
  ['cómo paso un presupuesto a venta', 'presupuestos'],
  ['¿cómo cargo el envío de una compra?', 'registrar-compra'],
  ['un cliente me devolvió una remera, qué hago?', 'devolucion-venta'],
  ['cómo ajusto el stock', 'stock'],
  ['qué es el CAE', 'factura-electronica'],
  ['cómo instalo la app en el celular', 'celular'],
  ['cuánto gané este mes', 'resumen'],
  ['se puede tener precio mayorista?', 'listas-precios'],
  ['cómo pongo talles', 'variantes'],
  ['¿dónde cargo la luz?', 'registrar-gasto'],
  ['como dicto con la voz', 'asistente'],
  ['¿qué es el crm?', 'crm'],
  ['cómo recupero una venta que borré', 'papelera'],
  ['¿puedo tener dos negocios?', 'varios-negocios'],
  ['tengo dos locales, cómo paso mercadería', 'depositos'],
  ['cómo hago un arqueo', 'punto-de-venta'],
  ['cómo le pago al proveedor', 'pagar-proveedor'],
  ['qué productos tengo que reponer', 'que-reponer'],
  ['cómo cargo un socio del gimnasio', 'socios'],
  ['cómo cobro una venta que me deben', 'cobrar'],
  ['algo no anda, cómo aviso?', 'avisar-problema']
];

for (const [pregunta, esperada] of PREGUNTAS) {
  test(`"${pregunta}" se contesta con "${esperada}", sin la IA`, () => {
    const frase = clasificarFrase(pregunta);
    assert.equal(frase.tipo, 'ayuda');
    const [mejor] = frase.resultados;
    assert.equal(mejor?.seccion.id, esperada, `contestó ${mejor?.seccion.id} (${mejor?.puntaje.toFixed(2)})`);
    assert.ok(mejor.puntaje >= PUNTAJE_SEGURO, `con poca seguridad: ${mejor.puntaje.toFixed(2)}`);
  });
}

test('las operaciones siguen yendo a la IA', () => {
  for (const frase of [
    'Vendí 3 remeras a Juan por 45 mil y me pagó por Mercado Pago',
    'le vendí a la Sole dos buzos a 28 lucas cada uno',
    'compré 10 pantalones a Textil Norte a 9 mil cada uno',
    'pagué 25 mil de luz en efectivo',
    'Martín se llevó un pantalón jean de 52 mil',
    'entraron 20 buzos de Textil Norte',
    // Lo que probó el profe (hist. §119): una devolución, no una pregunta.
    'Juan, le quedó chica la remera y quiere devolverla',
    'Juan devolvió la gorra'
  ]) {
    assert.equal(clasificarFrase(frase).tipo, 'operacion', frase);
  }
});

test('la charla se contesta sin la IA, y "hola, vendí…" sigue siendo una venta (hist. §120)', () => {
  const casos = [
    ['hola', 'saludo'],
    ['Buenas, ¿cómo andás?', 'saludo'],
    ['gracias!', 'gracias'],
    ['dale, gracias', 'gracias'],
    ['chau', 'despedida'],
    ['¿qué podés hacer?', 'capacidades'],
    ['ayuda', 'capacidades']
  ];
  for (const [frase, charla] of casos) assert.deepEqual(clasificarFrase(frase), { tipo: 'charla', charla }, frase);
  assert.equal(clasificarFrase('hola, vendí 3 remeras a Juan').tipo, 'operacion');
});

test('"llevame a…" lleva a la pantalla; "abrí la caja" es del mostrador y lo contesta el manual', () => {
  const casos = [
    ['llevame a ventas', '#/ventas'],
    ['abrí el stock', '#/stock'],
    ['quiero ver la caja', '#/caja'],
    ['ir a cuentas corrientes', '#/cuentas-corrientes'],
    ['mostrame los clientes', '#/clientes'],
    ['abrime el manual', '#/ayuda']
  ];
  for (const [frase, hash] of casos) {
    const r = clasificarFrase(frase);
    assert.equal(r.tipo, 'navegar', frase);
    assert.equal(r.pantalla.hash, hash, frase);
    assert.ok(vistas.has(hash.slice(2)), `${hash} no es una vista`);
  }
  const caja = clasificarFrase('abrí la caja');
  assert.equal(caja.tipo, 'ayuda');
  assert.equal(caja.resultados[0].seccion.id, 'punto-de-venta');
});

test('una pregunta que el manual no tiene no se contesta como si supiera', () => {
  for (const frase of ['¿cómo funciona la bicicleta?', '¿cuál es la capital de Francia?', '¿me recomendás una película?']) {
    const { tipo, resultados } = clasificarFrase(frase);
    assert.equal(tipo, 'ayuda', frase);
    assert.ok(!(resultados[0]?.puntaje >= PUNTAJE_SEGURO), `${frase} → ${resultados[0]?.seccion.id}`);
  }
});

test('el buscador del manual encuentra por palabras sueltas', () => {
  assert.equal(buscarEnManual('factura electrónica')[0].seccion.id, 'factura-electronica');
  assert.equal(buscarEnManual('arqueo')[0].seccion.id, 'punto-de-venta');
  assert.equal(buscarEnManual('talles')[0].seccion.id, 'variantes');
  assert.deepEqual(buscarEnManual(''), []);
});
