// Los proveedores de IA del intérprete (interprete.js, hist. §117) sin salir a
// internet: `fetch` se reemplaza por uno falso que contesta como Groq o como
// Gemini, y se controla qué se les manda y cómo se lee lo que devuelven.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { interpretar, transcribir, InterpreteError } from '../interprete.js';

const fetchReal = globalThis.fetch;
const CLAVES = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'NEXO_INTERPRETE'];
const envAntes = Object.fromEntries(CLAVES.map((k) => [k, process.env[k]]));

afterEach(() => {
  globalThis.fetch = fetchReal;
  for (const k of CLAVES) {
    if (envAntes[k] === undefined) delete process.env[k];
    else process.env[k] = envAntes[k];
  }
});

function configurar({ groq = true, gemini = false } = {}) {
  delete process.env.NEXO_INTERPRETE;
  if (groq) process.env.GROQ_API_KEY = 'gsk_prueba';
  else delete process.env.GROQ_API_KEY;
  if (gemini) process.env.GEMINI_API_KEY = 'gemini_prueba';
  else delete process.env.GEMINI_API_KEY;
}

// Contesta en orden con las respuestas dadas y guarda cada pedido.
function fetchFalso(respuestas) {
  const pedidos = [];
  globalThis.fetch = async (url, init = {}) => {
    pedidos.push({ url: String(url), init });
    const siguiente = respuestas.shift();
    if (!siguiente) throw new Error(`Pedido de más: ${url}`);
    const { status = 200, cuerpo } = siguiente;
    return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  };
  return pedidos;
}

const CONTEXTO = {
  cuentas: [{ nombre: 'Efectivo', tipo: 'efectivo' }, { nombre: 'Mercado Pago', tipo: 'billetera' }],
  categoriasGasto: [{ nombre: 'Servicios', tipo: 'operativo' }],
  productos: [{ nombre: 'Remera negra' }]
};

const VENTA = {
  cliente: 'Juan',
  items: [{ producto: 'Remera negra', cantidad: 3, precio_unitario: 15000 }],
  cobro: { cuenta: 'Mercado Pago', importe: null },
  fecha: null
};

const respuestaGroq = (llamada, contenido = null) => ({
  cuerpo: {
    choices: [
      {
        message: {
          role: 'assistant',
          content: contenido,
          tool_calls: llamada
            ? [{ id: 'call_1', type: 'function', function: { name: llamada.nombre, arguments: JSON.stringify(llamada.args) } }]
            : undefined
        }
      }
    ]
  }
});

test('Groq: manda las herramientas con su esquema y lee la llamada como propuesta', async () => {
  configurar();
  const pedidos = fetchFalso([respuestaGroq({ nombre: 'registrar_venta', args: VENTA })]);

  const resultado = await interpretar('Vendí 3 remeras negras a Juan por 45 lucas, me pagó por MP', CONTEXTO);
  assert.deepEqual(resultado, { tipo: 'venta', datos: VENTA });

  assert.equal(pedidos.length, 1);
  const [{ url, init }] = pedidos;
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer gsk_prueba');
  const cuerpo = JSON.parse(init.body);
  assert.equal(cuerpo.model, 'openai/gpt-oss-20b');
  assert.equal(cuerpo.reasoning_effort, 'low');
  assert.equal(cuerpo.tool_choice, 'auto');
  assert.deepEqual(cuerpo.tools.map((t) => t.function.name), ['registrar_venta', 'registrar_compra', 'registrar_gasto']);
  assert.equal(cuerpo.tools[0].type, 'function');
  assert.ok(cuerpo.tools[0].function.parameters.required.includes('cliente'));
  // El catálogo va en el prompt de sistema, primero (lo que Groq cachea), y
  // la frase en el mensaje del usuario.
  assert.equal(cuerpo.messages[0].role, 'system');
  assert.match(cuerpo.messages[0].content, /- Remera negra/);
  assert.match(cuerpo.messages[1].content, /45 lucas/);
});

test('Groq: sin llamada a una herramienta, devuelve el texto como mensaje', async () => {
  configurar();
  fetchFalso([respuestaGroq(null, 'No identifiqué una operación: parece un saludo.')]);
  assert.deepEqual(await interpretar('hola, ¿cómo andás?', CONTEXTO), {
    tipo: null,
    mensaje: 'No identifiqué una operación: parece un saludo.'
  });
});

test('Groq: una herramienta que no es de Nexo se toma como sin operación', async () => {
  configurar();
  fetchFalso([respuestaGroq({ nombre: 'borrar_todo', args: {} })]);
  const resultado = await interpretar('borrá todo', CONTEXTO);
  assert.equal(resultado.tipo, null);
});

test('Groq: si arma mal la llamada (tool_use_failed), se reintenta una vez', async () => {
  configurar();
  const pedidos = fetchFalso([
    { status: 400, cuerpo: { error: { code: 'tool_use_failed', message: 'Failed to call a function.' } } },
    respuestaGroq({ nombre: 'registrar_venta', args: VENTA })
  ]);
  assert.equal((await interpretar('Vendí 3 remeras a Juan', CONTEXTO)).tipo, 'venta');
  assert.equal(pedidos.length, 2);
});

test('Groq sin cupo y sin respaldo: avisa que hay mucho uso, sin detalles internos', async () => {
  configurar();
  fetchFalso([{ status: 429, cuerpo: { error: { message: 'Rate limit reached for org_secreta' } } }]);
  await assert.rejects(
    interpretar('Vendí 3 remeras a Juan', CONTEXTO),
    (err) => err instanceof InterpreteError && err.status === 503 && /mucho uso/.test(err.message) && !/org_/.test(err.message)
  );
});

test('Groq caído con la clave de Gemini: responde Gemini', async () => {
  configurar({ gemini: true });
  const pedidos = fetchFalso([
    { status: 503, cuerpo: 'Service Unavailable' },
    {
      cuerpo: {
        candidates: [
          { content: { role: 'model', parts: [{ functionCall: { name: 'registrar_venta', args: VENTA } }] }, finishReason: 'STOP' }
        ]
      }
    }
  ]);
  assert.deepEqual(await interpretar('Vendí 3 remeras a Juan', CONTEXTO), { tipo: 'venta', datos: VENTA });
  assert.match(pedidos[1].url, /generativelanguage\.googleapis\.com/);
  // Gemini razona poco: por defecto tardaba varios segundos.
  assert.equal(JSON.parse(pedidos[1].init.body).generationConfig.thinkingConfig.thinkingLevel, 'LOW');
});

test('un error de configuración de Groq (401) no pasa a Gemini', async () => {
  configurar({ gemini: true });
  const pedidos = fetchFalso([{ status: 401, cuerpo: { error: { message: 'Invalid API Key' } } }]);
  await assert.rejects(interpretar('Vendí 3 remeras a Juan', CONTEXTO), (err) => err.status === 502);
  assert.equal(pedidos.length, 1);
});

test('sin ninguna clave, el intérprete responde 503 y pide la de Groq', async () => {
  configurar({ groq: false });
  await assert.rejects(interpretar('Vendí algo', CONTEXTO), (err) => err.status === 503 && /GROQ_API_KEY/.test(err.message));
});

test('NEXO_INTERPRETE=gemini fija Gemini aunque haya clave de Groq', async () => {
  configurar({ gemini: true });
  process.env.NEXO_INTERPRETE = 'gemini';
  const pedidos = fetchFalso([
    { cuerpo: { candidates: [{ content: { role: 'model', parts: [{ text: 'Eso no es una operación.' }] } }] } }
  ]);
  assert.deepEqual(await interpretar('hola', CONTEXTO), { tipo: null, mensaje: 'Eso no es una operación.' });
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0].url, /generativelanguage/);
});

test('transcribir: manda el audio a Whisper en castellano, con los nombres del negocio', async () => {
  configurar();
  const pedidos = fetchFalso([{ cuerpo: { text: ' Vendí tres remeras a Juan. ' } }]);
  const texto = await transcribir(Buffer.from('audio falso'), 'audio/webm;codecs=opus', ['Efectivo', 'Remera negra']);
  assert.equal(texto, 'Vendí tres remeras a Juan.');

  const [{ url, init }] = pedidos;
  assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  const formulario = init.body;
  assert.ok(formulario instanceof FormData);
  assert.equal(formulario.get('model'), 'whisper-large-v3-turbo');
  assert.equal(formulario.get('language'), 'es');
  assert.equal(formulario.get('prompt'), 'Efectivo, Remera negra');
  assert.equal(formulario.get('file').name, 'audio.webm');
});

test('transcribir: Safari graba en mp4 y el archivo sale con esa extensión', async () => {
  configurar();
  const pedidos = fetchFalso([{ cuerpo: { text: 'hola' } }]);
  await transcribir(Buffer.from('x'), 'audio/mp4');
  assert.equal(pedidos[0].init.body.get('file').name, 'audio.mp4');
});

test('transcribir sin la clave de Groq responde 503', async () => {
  configurar({ groq: false, gemini: true });
  await assert.rejects(transcribir(Buffer.from('x'), 'audio/webm'), (err) => err.status === 503);
});
