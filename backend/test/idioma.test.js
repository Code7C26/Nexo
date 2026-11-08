// Nexo en inglés (Configuración → Apariencia → Idioma): todo texto de la
// interfaz tiene su traducción en frontend/js/idioma/en.js. Un texto nuevo sin
// traducir no rompe nada (se ve en castellano), pero este test lo frena antes
// de llegar a main: `npm run i18n` dice cuáles faltan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diccionarioIngles, extraerTextos, pareceTexto } from '../../scripts/i18n.mjs';

const huecos = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();

test('todo texto de la interfaz tiene su traducción al inglés', async () => {
  const en = await diccionarioIngles();
  const faltan = [...extraerTextos()].filter(([texto]) => !Object.hasOwn(en, texto)).map(([texto, archivos]) => `${texto}  (${[...archivos].join(', ')})`);
  assert.deepEqual(faltan, [], `Faltan traducciones en frontend/js/idioma/en.js (npm run i18n):\n${faltan.join('\n')}`);
});

test('cada traducción usa los mismos huecos que el original', async () => {
  const en = await diccionarioIngles();
  const mal = Object.entries(en).filter(([es, ingles]) => ingles !== null && huecos(es) !== huecos(ingles));
  assert.deepEqual(mal, [], 'Una traducción con otros {n} mostraría un dato en el lugar de otro');
});

test('el extractor separa el texto de los nombres técnicos', () => {
  for (const texto of ['Guardar', 'Venta #{0} anulada', 'también', 'Todavía no hay {0} cargados.', 'IVA (es del fisco)']) {
    assert.equal(pareceTexto(texto), true, texto);
  }
  for (const texto of ['btn btn-primary', 'productosBody', 'sku TEXT', "default-src 'self'", 'nexo.idioma', '/api/ventas', 'id, nombre, activa', 'MAIL FROM']) {
    assert.equal(pareceTexto(texto), false, texto);
  }
});
