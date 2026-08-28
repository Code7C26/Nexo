// Intérprete de operaciones por texto (CLAUDE.md §21).
//
// Este es el ÚNICO archivo del backend que sabe que existe un proveedor de
// IA. Aislado a propósito: si mañana cambia el proveedor, o si hace falta
// stubearlo para tests, el resto de Nexo (server.js) no se entera — solo
// conoce la forma de entrada/salida de `interpretar()`. Prueba de que el
// aislamiento funciona: este archivo pasó de usar la API de Anthropic a la
// de Google Gemini (elegida por tener un tier gratuito real, a diferencia
// de Anthropic que es pago por uso) sin tocar una sola línea de
// server.js ni del frontend.
//
// IMPORTANTE (regla de arquitectura de §21): este módulo SOLO interpreta.
// Nunca abre una conexión a la base, nunca importa `db`, nunca ejecuta
// nada. Devuelve una propuesta con nombres (no IDs) que server.js todavía
// tiene que resolver y validar antes de poder ejecutarse.
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';

export class InterpreteError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'InterpreteError';
    this.status = status;
  }
}

// gemini-2.5-flash quedó deprecado para cuentas nuevas (la propia API lo
// avisó con un 404 al probarlo, indicando gemini-3.6-flash como
// reemplazo directo) — Google va corriendo esta familia seguido, así que
// si este modelo deja de andar, el mensaje de error de la API suele decir
// directamente cuál usar en su lugar.
const MODELO = 'gemini-3.6-flash';

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
          required: ['cuenta', 'importe'],
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
          description: 'Nombre de una categoría de gasto EXISTENTE (tiene que matchear una de las listadas, no se crean categorías nuevas).'
        },
        cuenta: {
          type: 'string',
          description: 'Nombre de la cuenta de tesorería de la que sale la plata (tiene que matchear una existente).'
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
  }
];

const TIPO_POR_HERRAMIENTA = {
  registrar_venta: 'venta',
  registrar_compra: 'compra',
  registrar_gasto: 'gasto'
};

// El contexto del negocio (cuentas, categorías, catálogo) es lo único
// "variable pero poco volátil" del prompt: cambia cuando el usuario da de
// alta algo nuevo, no en cada request. La fecha de hoy, en cambio, cambia
// todos los días — va en el mensaje del usuario, separada de las
// instrucciones de sistema.
function construirSystemPrompt(contexto) {
  const listar = (items, formatear) => (items.length ? items.map(formatear).join('\n') : '(ninguna cargada todavía)');
  const cuentas = listar(contexto.cuentas, (c) => `- ${c.nombre} (${c.tipo})`);
  const categorias = listar(contexto.categoriasGasto, (c) => `- ${c.nombre} (${c.tipo})`);
  // El catálogo puede crecer mucho; se acota para no inflar el prompt de
  // forma innecesaria — alcanza para que el modelo matchee nombres.
  const productos = listar(contexto.productos.slice(0, 300), (p) => `- ${p.nombre}`);

  return `Sos el intérprete de operaciones por texto de Nexo, un sistema de gestión para pymes.

Tu única función es traducir una frase en lenguaje natural a UNA llamada a una de las herramientas disponibles (registrar_venta, registrar_compra, registrar_gasto). VOS NO EJECUTÁS NADA — solo proponés una operación, que un humano va a revisar y confirmar antes de que se aplique. Si el texto no describe con claridad una venta, compra o gasto ya sucedidos (una pregunta, un saludo, un pedido ambiguo), NO llames a ninguna herramienta: respondé en texto plano, en una frase breve, explicando que no identificaste una operación.

Reglas:
- Usá siempre NOMBRES, nunca inventes IDs — eso lo resuelve Nexo después.
- Si el texto da un precio total para varias unidades, calculá el precio unitario dividiendo por la cantidad.
- Si no se menciona explícitamente que se cobró o se pagó, dejá el cobro en null (queda a crédito).
- No calcules IVA ni retenciones de ningún tipo: Nexo no los maneja en esta versión (decisión ya tomada, no es un olvido).
- No inventes un cliente, proveedor, cuenta o categoría que no tenga nada que ver con lo que dice el texto solo para completar el esquema.

Cuentas de tesorería disponibles:
${cuentas}

Categorías de gasto disponibles:
${categorias}

Catálogo de productos (para ventas — una venta NO puede crear un producto nuevo):
${productos}`;
}

function extraerPropuesta(response) {
  const llamada = response.functionCalls?.[0];
  if (!llamada) {
    const texto = response.text?.trim();
    return { tipo: null, mensaje: texto || 'No identifiqué ninguna operación en ese texto.' };
  }
  return { tipo: TIPO_POR_HERRAMIENTA[llamada.name], datos: llamada.args };
}

async function interpretarConGemini(texto, contexto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new InterpreteError(
      'Falta configurar GEMINI_API_KEY: el asistente por texto todavía no puede interpretar frases.'
    );
  }
  const client = new GoogleGenAI({ apiKey });
  const hoy = new Date().toISOString().slice(0, 10);

  let response;
  try {
    response = await client.models.generateContent({
      model: MODELO,
      contents: `Hoy es ${hoy}. Interpretá esta operación: "${texto}"`,
      config: {
        systemInstruction: construirSystemPrompt(contexto),
        tools: [{ functionDeclarations: HERRAMIENTAS }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }
      }
    });
  } catch (err) {
    // No dejamos que un error de red/API tumbe el server: se traduce a un
    // error tipado que el endpoint convierte en una respuesta HTTP clara.
    throw new InterpreteError(`El intérprete no pudo responder: ${err.message}`, 502);
  }

  return extraerPropuesta(response);
}

// --- Intérprete stub -------------------------------------------------
//
// Determinista y sin red: existe únicamente para poder probar el circuito
// completo (interpretar → resolver → ejecutar) sin gastar cuota de la API
// ni depender de tener una API key configurada. NO es un intento de NLU
// real — usa una mini-sintaxis de prueba tipo "venta: campo=valor;
// campo=valor". Se activa con NEXO_INTERPRETE=stub. Cualquier texto que no
// empiece con "venta:", "compra:" o "gasto:" se interpreta como "sin
// operación", igual que haría el modelo real con un saludo.
function parsearItems(partes) {
  const crudos = partes.item ? [partes.item] : partes.items ? partes.items.split('|') : [];
  return crudos.map((raw) => {
    const [producto, cantidad, precio_unitario] = raw.split(',').map((s) => s.trim());
    return { producto, cantidad: Number(cantidad), precio_unitario: Number(precio_unitario) };
  });
}

function interpretarStub(texto) {
  const match = texto.trim().match(/^(venta|compra|gasto):\s*(.*)$/is);
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
  return interpretarConGemini(texto, contexto);
}
