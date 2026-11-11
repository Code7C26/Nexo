// Intérprete de operaciones por texto y voz (CLAUDE.md §21, §36).
//
// Este es el ÚNICO archivo del backend que sabe que existe un proveedor de
// IA. Aislado a propósito: si mañana cambia el proveedor, o si hace falta
// stubearlo para tests, el resto de Nexo (server.js) no se entera — solo
// conoce la forma de entrada/salida de `interpretar()` y `transcribir()`.
// Prueba de que el aislamiento funciona: este archivo pasó de Anthropic a
// Gemini, y después sumó Groq, sin tocar el circuito de server.js.
//
// Proveedores (handoff, "IA", decidido el 1 de noviembre de 2026):
// - Groq es el principal: rápido, con Zero Data Retention en su consola, y
//   habla la API de OpenAI, así que va con `fetch` sin dependencia nueva.
//   Interpreta con `openai/gpt-oss-20b` y transcribe con Whisper.
// - Gemini queda de respaldo. Ojo: en su plan gratis Google puede leer y
//   usar lo que se le manda, y la frase suele traer el nombre del cliente;
//   con datos reales va con facturación o no va.
// Con las dos claves, si Groq falla por cupo o caída se usa Gemini.
//
// IMPORTANTE (regla de arquitectura de §21): este módulo SOLO interpreta.
// Nunca abre una conexión a la base, nunca importa `db`, nunca ejecuta
// nada. Devuelve una propuesta con nombres (no IDs) que server.js todavía
// tiene que resolver y validar antes de poder ejecutarse.
import { GoogleGenAI, FunctionCallingConfigMode, ThinkingLevel } from '@google/genai';
import { fechaDeHoy } from './fecha.js';

export class InterpreteError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'InterpreteError';
    this.status = status;
  }
}

// Un fallo del proveedor que justifica probar con el otro (cupo, caída, red),
// distinto de un error nuestro o de configuración.
class FalloProveedor extends Error {
  constructor(message, { cupo = false } = {}) {
    super(message);
    this.name = 'FalloProveedor';
    this.cupo = cupo;
  }
}

const GROQ_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODELO = process.env.NEXO_GROQ_MODELO || 'openai/gpt-oss-20b';
const GROQ_MODELO_VOZ = 'whisper-large-v3-turbo';

// gemini-2.5-flash quedó deprecado para cuentas nuevas (la propia API lo
// avisó con un 404 al probarlo, indicando gemini-3.6-flash como
// reemplazo directo) — Google va corriendo esta familia seguido, así que
// si este modelo deja de andar, el mensaje de error de la API suele decir
// directamente cuál usar en su lugar. NEXO_GEMINI_MODELO lo cambia sin
// tocar el código.
const GEMINI_MODELO = process.env.NEXO_GEMINI_MODELO || 'gemini-3.6-flash';

// Lo que tarda un proveedor antes de darlo por caído.
const ESPERA_MS = 20_000;

// Herramientas: el modelo no "escribe JSON libre", llena estos esquemas
// exactos vía function calling. `parametersJsonSchema` (JSON Schema real,
// no el subset OpenAPI de `parameters`) es lo que permite describir
// campos opcionales con `type: [tipo, "null"]` iguales a los que ya
// validaba Nexo del lado de Anthropic — Gemini no obliga tan estrictamente
// como el `strict: true` de Anthropic a que la forma sea exacta, pero eso
// no es un problema: la validación de verdad la vuelve a hacer
// `resolverPropuesta`/`POST /api/asistente/ejecutar` en server.js, nunca
// se confía ciegamente en lo que devuelve el modelo.
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    producto: {
      type: 'string',
      description: 'Nombre del producto tal como aparece en el catálogo (aunque sea parcial).'
    },
    cantidad: { type: 'number' },
    precio_unitario: {
      type: 'number',
      description:
        'Precio POR UNIDAD. Si el texto da un precio total para varias unidades, dividir por la cantidad.'
    }
  },
  required: ['producto', 'cantidad', 'precio_unitario'],
  additionalProperties: false
};

const HERRAMIENTAS = [
  {
    name: 'registrar_venta',
    description:
      'Registra una venta de uno o más productos EXISTENTES del catálogo a un cliente, con un cobro opcional. Usar solo cuando el texto describe una venta que ya sucedió, no una consulta ni algo a futuro.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        cliente: {
          type: 'string',
          description: 'Nombre del cliente. Si no existe todavía en Nexo, se crea uno nuevo.'
        },
        items: { type: 'array', items: ITEM_SCHEMA },
        cobro: {
          type: ['object', 'null'],
          description:
            'Si el texto dice que ya se cobró (total o parcial), describirlo acá. Si no menciona ningún cobro, usar null (venta a crédito).',
          properties: {
            cuenta: {
              type: 'string',
              description: 'Nombre de la cuenta de tesorería donde entró el dinero (tiene que matchear una existente).'
            },
            importe: {
              type: ['number', 'null'],
              description: 'Monto cobrado. Si es null, se asume que se cobró el total de la venta.'
            }
          },
          // Sin `importe` obligatorio: Groq valida el esquema y el modelo lo
          // omitía cuando se cobró todo (es lo mismo que null).
          required: ['cuenta'],
          additionalProperties: false
        },
        fecha: {
          type: ['string', 'null'],
          description: 'YYYY-MM-DD solo si el texto la menciona explícitamente (ej. "ayer"). Si no, null.'
        }
      },
      required: ['cliente', 'items', 'cobro', 'fecha'],
      additionalProperties: false
    }
  },
  {
    name: 'registrar_compra',
    description:
      'Registra una compra a un proveedor, con la mercadería ya recibida (entra a stock y actualiza el costo promedio del producto). Si el proveedor o el producto no existen todavía en Nexo, se crean.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        proveedor: { type: 'string', description: 'Nombre del proveedor.' },
        items: { type: 'array', items: ITEM_SCHEMA },
        costo_envio: {
          type: ['number', 'null'],
          description: 'Costo de envío de la compra, si el texto lo menciona. Si no, null (se toma como 0).'
        },
        fecha: {
          type: ['string', 'null'],
          description: 'YYYY-MM-DD solo si el texto la menciona explícitamente. Si no, null.'
        }
      },
      required: ['proveedor', 'items', 'costo_envio', 'fecha'],
      additionalProperties: false
    }
  },
  {
    name: 'registrar_gasto',
    description:
      'Registra un gasto del negocio (alquiler, servicios, combustible, etc. — no mercadería para revender, eso es una compra). Se paga en el momento: descuenta de la cuenta de tesorería indicada.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          // Antes decía "tiene que matchear una de las listadas" y el modelo, sin
          // una parecida, no proponía el gasto: la tarjeta de confirmación ya
          // deja elegir la categoría, y server.js no crea ninguna por nombre.
          description:
            'La categoría de gasto de las listadas que más se parezca. Si ninguna se parece, una palabra corta que describa el gasto (por ejemplo "Luz"): la persona elige la categoría antes de confirmar.'
        },
        cuenta: {
          type: 'string',
          description:
            'La cuenta de tesorería de las listadas de la que salió la plata (efectivo, banco, Mercado Pago). Si el texto no lo dice, la de efectivo.'
        },
        proveedor: {
          type: ['string', 'null'],
          description: 'Proveedor asociado al gasto, si el texto lo menciona. Si no, null.'
        },
        importe: { type: 'number' },
        tipo: {
          type: 'string',
          enum: ['operativo', 'inversion', 'retiro', 'heredar_de_categoria'],
          description:
            'Tipo del gasto si el texto lo deja claro. Si no hay forma de saberlo, usar "heredar_de_categoria" para que tome el tipo por defecto de la categoría.'
        },
        descripcion: { type: ['string', 'null'], description: 'Detalle breve del gasto, si lo hay. Si no, null.' },
        fecha: {
          type: ['string', 'null'],
          description: 'YYYY-MM-DD solo si el texto la menciona explícitamente. Si no, null.'
        }
      },
      required: ['categoria', 'cuenta', 'proveedor', 'importe', 'tipo', 'descripcion', 'fecha'],
      additionalProperties: false
    }
  },
  {
    // hist. §119: "Juan, le quedó chica la remera y quiere devolverla". La
    // venta la busca server.js entre las del cliente; acá solo van nombres.
    // Lo opcional no es `required`: Groq valida el esquema y el modelo omite
    // los campos que serían null.
    name: 'registrar_devolucion',
    description:
      'Registra que un cliente devolvió, o quiere devolver, productos que se le vendieron (le quedó chico, vino fallado, lo cambia). Nexo busca la venta. No sirve para devolverle algo a un proveedor.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre del cliente que devuelve.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              producto: {
                type: 'string',
                description: 'Nombre del producto tal como aparece en el catálogo (aunque sea parcial).'
              },
              cantidad: { type: 'number', description: 'Cuántas unidades devuelve. Si no lo dice, 1.' }
            },
            required: ['producto'],
            additionalProperties: false
          }
        },
        reintegro: {
          type: ['object', 'null'],
          description:
            'Solo si el texto dice que se le devolvió la plata: de qué cuenta salió. Si no lo dice (le queda a favor, o lo cambia por otra cosa), null.',
          properties: { cuenta: { type: 'string', description: 'Nombre de una de las cuentas listadas.' } },
          required: ['cuenta'],
          additionalProperties: false
        },
        motivo: { type: ['string', 'null'], description: 'Por qué lo devuelve, si lo dice (le quedó chico, vino fallado).' }
      },
      required: ['cliente', 'items'],
      additionalProperties: false
    }
  }
];

const TIPO_POR_HERRAMIENTA = {
  registrar_venta: 'venta',
  registrar_compra: 'compra',
  registrar_gasto: 'gasto',
  registrar_devolucion: 'devolucion'
};

// El contexto del negocio (cuentas, categorías, catálogo) es lo único
// "variable pero poco volátil" del prompt: cambia cuando el usuario da de
// alta algo nuevo, no en cada request. La fecha de hoy, en cambio, cambia
// todos los días — va en el mensaje del usuario, separada de las
// instrucciones de sistema.
function construirSystemPrompt(contexto) {
  const listar = (items, formatear) => (items.length ? items.map(formatear).join('\n') : '(ninguna cargada todavía)');
  // El tipo va aparte del nombre: con "- Mercado Pago (billetera)" el modelo
  // a veces devolvía "billetera" como cuenta.
  const cuentas = listar(contexto.cuentas, (c) => `- ${c.nombre}  [tipo: ${c.tipo}]`);
  const categorias = listar(contexto.categoriasGasto, (c) => `- ${c.nombre} (${c.tipo})`);
  // El catálogo puede crecer mucho; se acota para no inflar el prompt de
  // forma innecesaria — alcanza para que el modelo matchee nombres.
  // server.js ya manda solo los que se parecen a la frase (hist. §120).
  const productos = contexto.productos.length
    ? contexto.productos.slice(0, 300).map((p) => `- ${p.nombre}`).join('\n')
    : '(ninguno se parece a lo que dijo)';

  return `Sos el intérprete de operaciones por texto de Nexo, un sistema de gestión para pymes.

Tu única función es traducir una frase en lenguaje natural a UNA llamada a una de las herramientas disponibles (registrar_venta, registrar_compra, registrar_gasto, registrar_devolucion). VOS NO EJECUTÁS NADA — solo proponés una operación, que un humano va a revisar y confirmar antes de que se aplique. Si el texto no describe con claridad una venta, una compra, un gasto o la devolución de un cliente (una pregunta, un saludo, un pedido ambiguo), NO llames a ninguna herramienta: respondé en texto plano, en una frase breve, explicando que no identificaste una operación.

Reglas:
- Usá siempre NOMBRES, nunca inventes IDs — eso lo resuelve Nexo después.
- Si el texto da un precio total para varias unidades, calculá el precio unitario dividiendo por la cantidad.
- Si no se menciona explícitamente que se cobró o se pagó, dejá el cobro en null (queda a crédito).
- El cobro lleva solo dos campos: "cuenta" (dónde entró la plata: efectivo, cash, MP, transferencia a un banco...) e "importe" (null si se cobró todo).
- "a X", "X cada uno" o "X el kilo" es el precio por unidad; "por X" o "X en total" es el total de todas las unidades. Ejemplo: "vendí 4 gorras a 9 mil" es cantidad 4 y precio_unitario 9000; "vendí 4 gorras por 36 mil" también.
- En "cuenta" va el nombre exacto de una de las cuentas listadas (nunca su tipo).
- Si el texto dice "ayer", "anteayer" o un día de la semana, calculá la fecha YYYY-MM-DD a partir de la de hoy.
- Todo pago del negocio que no sea mercadería para revender es un gasto (servicios como luz, internet o teléfono, impuestos como ingresos brutos, arreglos, sueldos...): elegí la categoría de gasto existente que más se parezca. Si ninguna se parece, llamá igual a registrar_gasto con una palabra corta como categoría: la persona la elige antes de confirmar. Nunca dejes de proponer un gasto porque no encontrás la categoría o la cuenta.
- No calcules IVA ni retenciones: los precios que dice el texto son finales, y Nexo discrimina el IVA solo.
- Los montos se dicen de muchas formas: "45 mil", "45 lucas" y "45k" son 45000; "1 palo" o "un millón" es 1000000; "luca" sola es 1000.
- Todo se cuenta desde el negocio: si un cliente "compró" o "se llevó" algo, para el negocio es una venta (registrar_venta); registrar_compra es solo mercadería que el negocio le compró a un proveedor.
- Si un cliente devolvió algo o lo quiere devolver o cambiar ("le quedó chica la remera", "vino fallado"), es una devolución: registrar_devolucion, aunque esté dicho en presente.
- No inventes un cliente o proveedor que no tenga nada que ver con lo que dice el texto solo para completar el esquema.

Cuentas de tesorería disponibles:
${cuentas}

Categorías de gasto disponibles:
${categorias}

Productos del catálogo que se parecen a la frase (una venta NO puede crear un producto nuevo; si el que dice no está acá, usá el nombre tal cual lo dijo):
${productos}`;
}

// Una herramienta que no es de las nuestras se toma como "sin operación": la
// validación de server.js no sabría qué hacer con ella.
function propuestaDeLlamada(nombre, args, textoLibre) {
  const tipo = TIPO_POR_HERRAMIENTA[nombre];
  if (!tipo) {
    return { tipo: null, mensaje: textoLibre?.trim() || 'No identifiqué ninguna operación en ese texto.' };
  }
  return { tipo, datos: args };
}

// El día del negocio (fecha.js): en UTC, después de las 21 h "hoy" era mañana.
const mensajeUsuario = (texto) => `Hoy es ${fechaDeHoy()}. Interpretá esta operación: "${texto}"`;

// --- Groq ------------------------------------------------------------

// El plan gratis de Groq da 8000 tokens por minuto para toda la instalación
// (unas 5 frases). Cuando se pasa, dice cuántos segundos esperar: si es poco,
// se espera acá y se reintenta una vez, así no le llega un error a nadie.
const ESPERA_CUPO_MAX_MS = 8_000;

async function llamarGroq(ruta, init, { reintentoPorCupo = true, esperaMs = ESPERA_MS } = {}) {
  let res;
  try {
    res = await fetch(`${GROQ_URL}${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, ...init.headers },
      signal: AbortSignal.timeout(esperaMs)
    });
  } catch (err) {
    throw new FalloProveedor(`Groq no respondió: ${err.message}`);
  }
  if (res.ok) return res.json();
  // El cuerpo del error puede traer el id de la organización de Groq: al log,
  // nunca al cliente.
  const cuerpo = await res.text().catch(() => '');
  const espera = Number(res.headers.get('retry-after')) * 1000;
  if (res.status === 429 && reintentoPorCupo && espera > 0 && espera <= ESPERA_CUPO_MAX_MS) {
    await new Promise((r) => setTimeout(r, espera));
    return llamarGroq(ruta, init, { reintentoPorCupo: false, esperaMs });
  }
  if (res.status === 429 || res.status >= 500) {
    throw new FalloProveedor(`Groq ${res.status}: ${cuerpo.slice(0, 300)}`, { cupo: res.status === 429 });
  }
  const error = new Error(`Groq ${res.status}: ${cuerpo.slice(0, 300)}`);
  error.cuerpo = cuerpo;
  throw error;
}

async function interpretarConGroq(texto, contexto) {
  const pedido = {
    model: GROQ_MODELO,
    // El prompt de sistema va primero y no cambia entre frases de un mismo
    // negocio: Groq lo cachea, y lo cacheado no cuenta para su límite.
    messages: [
      { role: 'system', content: construirSystemPrompt(contexto) },
      { role: 'user', content: mensajeUsuario(texto) }
    ],
    tools: HERRAMIENTAS.map(({ name, description, parametersJsonSchema }) => ({
      type: 'function',
      function: { name, description, parameters: parametersJsonSchema }
    })),
    tool_choice: 'auto',
    temperature: 0,
    // El límite por minuto de Groq cuenta el máximo de salida pedido, no lo
    // que se usa: una llamada entra de sobra en esto.
    max_completion_tokens: 700
  };
  // Pensar poco alcanza para llenar un esquema y es lo que lo hace rápido.
  if (GROQ_MODELO.startsWith('openai/gpt-oss')) pedido.reasoning_effort = 'low';

  const enviar = () =>
    llamarGroq('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido)
    });

  // Groq rechaza con 400 `tool_use_failed` cuando el modelo arma mal la
  // llamada (no respeta el esquema); suele salir bien al reintentar.
  let respuesta;
  for (let intento = 1; !respuesta; intento++) {
    try {
      respuesta = await enviar();
    } catch (err) {
      if (!err.cuerpo?.includes('tool_use_failed') || intento === 3) throw err;
    }
  }

  const mensaje = respuesta.choices?.[0]?.message ?? {};
  const llamada = mensaje.tool_calls?.[0]?.function;
  if (!llamada) return propuestaDeLlamada(null, null, mensaje.content);
  let args;
  try {
    args = JSON.parse(llamada.arguments || '{}');
  } catch {
    throw new FalloProveedor('Groq devolvió argumentos que no son JSON.');
  }
  return propuestaDeLlamada(llamada.name, args);
}

// --- Gemini ----------------------------------------------------------

async function interpretarConGemini(texto, contexto) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODELO,
      contents: mensajeUsuario(texto),
      config: {
        systemInstruction: construirSystemPrompt(contexto),
        tools: [{ functionDeclarations: HERRAMIENTAS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        // Por defecto razona en "medium" y tardaba varios segundos por frase.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        httpOptions: { timeout: ESPERA_MS }
      }
    });
  } catch (err) {
    throw new FalloProveedor(`Gemini: ${err.message}`, { cupo: err.status === 429 });
  }

  // `response.text` solo sin llamada: con una, el SDK avisa por consola.
  const llamada = response.functionCalls?.[0];
  return llamada ? propuestaDeLlamada(llamada.name, llamada.args) : propuestaDeLlamada(null, null, response.text);
}

// --- Elección del proveedor ----------------------------------------------

const PROVEEDORES = {
  groq: { clave: 'GROQ_API_KEY', interpretar: interpretarConGroq },
  gemini: { clave: 'GEMINI_API_KEY', interpretar: interpretarConGemini }
};

// Los proveedores con clave, en orden. NEXO_INTERPRETE=groq|gemini fija uno
// (lo usa la prueba de frases para compararlos).
function proveedoresDisponibles() {
  const forzado = process.env.NEXO_INTERPRETE;
  const nombres = PROVEEDORES[forzado] ? [forzado] : Object.keys(PROVEEDORES);
  return nombres.filter((nombre) => process.env[PROVEEDORES[nombre].clave]);
}

async function interpretarConProveedor(texto, contexto) {
  const disponibles = proveedoresDisponibles();
  if (!disponibles.length) {
    throw new InterpreteError(
      'Falta configurar la clave de la IA (GROQ_API_KEY): el asistente todavía no puede interpretar frases.'
    );
  }
  let ultimo;
  for (const nombre of disponibles) {
    try {
      return await PROVEEDORES[nombre].interpretar(texto, contexto);
    } catch (err) {
      // El mensaje del proveedor puede traer detalles internos (cuota,
      // proyecto, claves parciales): al log del servidor, no al cliente.
      console.error(`[interprete] Falló ${nombre}:`, err.message);
      ultimo = err;
      if (!(err instanceof FalloProveedor)) break;
    }
  }
  if (ultimo instanceof FalloProveedor && ultimo.cupo) {
    throw new InterpreteError('El asistente está con mucho uso en este momento. Probá de nuevo en un minuto.', 503);
  }
  throw new InterpreteError('El intérprete no pudo responder. Probá de nuevo en unos minutos.', 502);
}

// --- Voz -------------------------------------------------------------

// La extensión del archivo es lo que mira Whisper para saber el formato.
const EXTENSION_AUDIO = { webm: 'webm', ogg: 'ogg', mp4: 'mp4', mpeg: 'mp3', mp3: 'mp3', wav: 'wav', 'x-m4a': 'm4a', aac: 'm4a' };

export const vozDisponible = () => process.env.NEXO_INTERPRETE === 'stub' || Boolean(process.env.GROQ_API_KEY);

// audio: Buffer con lo grabado; tipo: su Content-Type ("audio/webm;codecs=opus").
// palabras: nombres del negocio (productos, cuentas) que ayudan a Whisper a
// escribirlos bien. Devuelve el texto.
export async function transcribir(audio, tipo, palabras = []) {
  // El stub "transcribe" leyendo los bytes como texto: los tests mandan la
  // frase como si fuera el audio.
  if (process.env.NEXO_INTERPRETE === 'stub') return audio.toString('utf8').trim();
  if (!process.env.GROQ_API_KEY) {
    throw new InterpreteError('Falta configurar la clave de la IA (GROQ_API_KEY): el dictado por voz todavía no anda.');
  }

  const subtipo = String(tipo).split(';')[0].split('/')[1]?.trim();
  const formulario = new FormData();
  formulario.append('file', new Blob([audio], { type: tipo }), `audio.${EXTENSION_AUDIO[subtipo] ?? 'webm'}`);
  formulario.append('model', GROQ_MODELO_VOZ);
  formulario.append('language', 'es');
  formulario.append('temperature', '0');
  formulario.append('response_format', 'json');
  // Whisper toma hasta 224 tokens de contexto: unos pocos nombres alcanzan.
  const contexto = palabras.join(', ').slice(0, 600);
  if (contexto) formulario.append('prompt', contexto);

  try {
    const { text } = await llamarGroq('/audio/transcriptions', { method: 'POST', body: formulario });
    return String(text ?? '').trim();
  } catch (err) {
    console.error('[interprete] Falló la transcripción:', err.message);
    if (err instanceof FalloProveedor && err.cupo) {
      throw new InterpreteError('El dictado está con mucho uso en este momento. Probá de nuevo en un minuto.', 503);
    }
    throw new InterpreteError('No se pudo pasar el audio a texto. Probá de nuevo o escribilo.', 502);
  }
}

// --- La factura del proveedor (hist. §151) -----------------------------
//
// Lee la foto de una factura o un remito y devuelve lo que dice, renglón por
// renglón. SOLO lee: no recibe el catálogo ni sabe de productos de Nexo; cuál
// es cuál lo decide factura-proveedor.js y lo confirma una persona. Va con el
// modelo de visión de Groq (su cupo es aparte del de las frases) y Gemini de
// respaldo, que también lee imágenes.

// Groq dio de baja Llama 4 Scout en noviembre de 2026 (404 model_not_found);
// Qwen es el que hoy lee imágenes. GET /openai/v1/models dice cuáles aceptan
// `image` en `input_modalities`, sin gastar cupo.
const GROQ_MODELO_VISION = process.env.NEXO_GROQ_MODELO_VISION || 'qwen/qwen3.8-27b';
// Una factura larga tarda más que una frase en salir entera.
const ESPERA_LECTURA_MS = 60_000;

const INSTRUCCIONES_FACTURA = `Sos el lector de comprobantes de compra de Nexo, un sistema de gestión para comercios argentinos. La imagen es una factura, un remito o una nota de pedido que un PROVEEDOR le dio al comercio. Pasá a JSON lo que dice, sin inventar nada.

Respondé SOLO con un objeto JSON con esta forma:
{
  "es_comprobante": true,
  "proveedor": { "nombre": "razón social de quien VENDE (el emisor, arriba del comprobante), no la del cliente", "cuit": "CUIT del emisor o null" },
  "letra": "A" | "B" | "C" | null,
  "numero": "punto de venta y número, ej. 0003-00012345, o null",
  "fecha": "YYYY-MM-DD o null",
  "precios_sin_iva": true si los precios de los renglones NO incluyen IVA (lo normal en una factura A, que discrimina el IVA abajo), false si ya lo incluyen,
  "renglones": [
    {
      "codigo": "código del artículo tal cual figura (puede ser el código de barras), o null",
      "descripcion": "descripción tal cual figura",
      "cantidad": número de la columna cantidad,
      "unidades_por_bulto": cuántas unidades trae CADA UNO de lo que cuenta la cantidad, o null,
      "precio_unitario": precio de cada uno de lo que cuenta la cantidad, antes de la bonificación,
      "bonificacion": porcentaje de descuento del renglón o null,
      "importe": importe del renglón tal cual figura, o null,
      "alicuota_iva": 21 | 10.5 | 27 | 0 | null,
      "es_envio": true solo si el renglón es flete, envío o transporte
    }
  ],
  "percepciones": suma de percepciones y otros impuestos que no son IVA (IIBB, percepción de IVA, impuestos internos), o null,
  "total": total final del comprobante, o null
}

Reglas:
- Los números van como números JSON: "1.234,56" es 1234.56.
- unidades_por_bulto: si la cantidad cuenta packs, cajas, bultos, fardos o displays, y la descripción dice cuántas unidades trae cada uno ("X12", "PACK 6", "CJ X 24", "FARDO X 6", "6 U"), poné ese número. Si la cantidad ya cuenta unidades sueltas, o la descripción no lo dice, null. "X 500 GR" o "X 2.25 L" es el tamaño de cada unidad, no un bulto.
- Un renglón por cada artículo. No incluyas como renglón los subtotales, el IVA, las percepciones, los totales ni las leyendas.
- Si la imagen no es un comprobante de compra, devolvé {"es_comprobante": false, "renglones": []}.`;

async function leerConGroq(imagenes) {
  const contenido = [
    { type: 'text', text: INSTRUCCIONES_FACTURA },
    ...imagenes.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.tipo};base64,${img.datos}` } }))
  ];
  // Por llamarGroq, para esperar lo que pide Groq cuando se pasa del cupo por
  // minuto: el de Qwen es de 7000 tokens de entrada y una foto usa unos 3000.
  let respuesta;
  try {
    respuesta = await llamarGroq(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODELO_VISION,
          messages: [{ role: 'user', content: contenido }],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_completion_tokens: 6000
        })
      },
      { esperaMs: ESPERA_LECTURA_MS }
    );
  } catch (err) {
    // Cualquier error de Groq deja probar con Gemini: también si el modelo de
    // visión dejó de existir, como pasó con Llama 4 Scout.
    throw err instanceof FalloProveedor ? err : new FalloProveedor(err.message);
  }
  return parsearJsonDelModelo(respuesta.choices?.[0]?.message?.content);
}

async function leerConGemini(imagenes) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  try {
    response = await client.models.generateContent({
      model: GEMINI_MODELO,
      contents: [
        {
          role: 'user',
          parts: [
            ...imagenes.map((img) => ({ inlineData: { mimeType: img.tipo, data: img.datos } })),
            { text: INSTRUCCIONES_FACTURA }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        httpOptions: { timeout: ESPERA_LECTURA_MS }
      }
    });
  } catch (err) {
    throw new FalloProveedor(`Gemini: ${err.message}`, { cupo: err.status === 429 });
  }
  return parsearJsonDelModelo(response.text);
}

function parsearJsonDelModelo(texto) {
  const limpio = String(texto ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(limpio);
  } catch {
    throw new FalloProveedor('La lectura no devolvió JSON.');
  }
}

const LECTORES = { groq: leerConGroq, gemini: leerConGemini };

// imagenes: [{ tipo: 'image/jpeg', datos: base64 }], las páginas de un mismo
// comprobante. Devuelve el objeto crudo; factura-proveedor.js lo limpia.
export async function leerComprobante(imagenes) {
  // El stub "lee" la primera imagen como el JSON de la lectura: los tests
  // mandan la factura ya escrita, como hace la voz con la frase.
  if (process.env.NEXO_INTERPRETE === 'stub') {
    try {
      return JSON.parse(Buffer.from(imagenes[0].datos, 'base64').toString('utf8'));
    } catch {
      return { es_comprobante: false, renglones: [] };
    }
  }
  const disponibles = proveedoresDisponibles();
  if (!disponibles.length) {
    throw new InterpreteError('Falta configurar la clave de la IA (GROQ_API_KEY): todavía no se pueden leer facturas.');
  }
  let ultimo;
  for (const nombre of disponibles) {
    try {
      return await LECTORES[nombre](imagenes);
    } catch (err) {
      console.error(`[interprete] Falló la lectura con ${nombre}:`, err.message);
      ultimo = err;
      if (!(err instanceof FalloProveedor)) break;
    }
  }
  if (ultimo instanceof FalloProveedor && ultimo.cupo) {
    throw new InterpreteError('La lectura de facturas está con mucho uso en este momento. Probá de nuevo en un minuto.', 503);
  }
  throw new InterpreteError('No se pudo leer la factura. Probá de nuevo, o con una foto más nítida.', 502);
}

// --- Intérprete stub -------------------------------------------------
//
// Determinista y sin red: existe únicamente para poder probar el circuito
// completo (interpretar → resolver → ejecutar) sin gastar cuota de la API
// ni depender de tener una API key configurada. NO es un intento de NLU
// real — usa una mini-sintaxis de prueba tipo "venta: campo=valor;
// campo=valor". Se activa con NEXO_INTERPRETE=stub. Cualquier texto que no
// empiece con "venta:", "compra:", "gasto:" o "devolucion:" se interpreta como "sin
// operación", igual que haría el modelo real con un saludo.
function parsearItems(partes) {
  const crudos = partes.item ? [partes.item] : partes.items ? partes.items.split('|') : [];
  return crudos.map((raw) => {
    const [producto, cantidad, precio_unitario] = raw.split(',').map((s) => s.trim());
    return { producto, cantidad: Number(cantidad), precio_unitario: Number(precio_unitario) };
  });
}

function interpretarStub(texto) {
  const match = texto.trim().match(/^(venta|compra|gasto|devolucion):\s*(.*)$/is);
  if (!match) {
    return { tipo: null, mensaje: 'No reconocí ninguna operación en ese texto.' };
  }
  const tipo = match[1].toLowerCase();
  const partes = Object.fromEntries(
    match[2]
      .split(';')
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => {
        const idx = par.indexOf('=');
        return [par.slice(0, idx).trim(), par.slice(idx + 1).trim()];
      })
  );

  if (tipo === 'venta') {
    const cobro = partes.cobro_cuenta
      ? { cuenta: partes.cobro_cuenta, importe: partes.cobro_importe ? Number(partes.cobro_importe) : null }
      : null;
    return {
      tipo: 'venta',
      datos: { cliente: partes.cliente ?? null, items: parsearItems(partes), cobro, fecha: partes.fecha ?? null }
    };
  }
  if (tipo === 'devolucion') {
    return {
      tipo: 'devolucion',
      datos: {
        cliente: partes.cliente ?? null,
        items: parsearItems(partes).map(({ producto, cantidad }) => ({ producto, cantidad })),
        reintegro: partes.reintegro ? { cuenta: partes.reintegro } : null,
        motivo: partes.motivo ?? null
      }
    };
  }
  if (tipo === 'compra') {
    return {
      tipo: 'compra',
      datos: {
        proveedor: partes.proveedor ?? null,
        items: parsearItems(partes),
        costo_envio: partes.envio ? Number(partes.envio) : null,
        fecha: partes.fecha ?? null
      }
    };
  }
  return {
    tipo: 'gasto',
    datos: {
      categoria: partes.categoria ?? null,
      cuenta: partes.cuenta ?? null,
      proveedor: partes.proveedor ?? null,
      importe: partes.importe ? Number(partes.importe) : null,
      tipo: partes.tipo ?? 'heredar_de_categoria',
      descripcion: partes.descripcion ?? null,
      fecha: partes.fecha ?? null
    }
  };
}

// contexto: { cuentas: [{nombre,tipo}], categoriasGasto: [{nombre,tipo}], productos: [{nombre}] }
// Devuelve { tipo: 'venta'|'compra'|'gasto', datos: {...} } o { tipo: null, mensaje }.
export async function interpretar(texto, contexto) {
  if (!texto || !String(texto).trim()) {
    return { tipo: null, mensaje: 'El texto está vacío.' };
  }
  if (process.env.NEXO_INTERPRETE === 'stub') {
    return interpretarStub(texto);
  }
  return interpretarConProveedor(texto, contexto);
}
