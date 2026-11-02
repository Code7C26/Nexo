// Prueba de frases del asistente (handoff, "IA", decidido el 1 de noviembre de
// 2026): antes de pasar el intérprete a Groq, unas 30 frases en castellano
// rioplatense contra el proveedor real, para ver si entiende bien y cuánto
// tarda. Usa backend/interprete.js tal cual, con un negocio de ejemplo (no
// toca ninguna base).
//
//   npm run probar-ia            → el proveedor que elegiría Nexo (Groq si hay clave)
//   npm run probar-ia -- gemini  → fija uno (groq | gemini), para comparar
//
// Pide GROQ_API_KEY o GEMINI_API_KEY en el .env de la raíz. Gasta cupo del
// plan gratis: 30 pedidos por corrida.
import { fechaDeHoy } from '../backend/fecha.js';

const proveedor = process.argv[2];
if (proveedor) process.env.NEXO_INTERPRETE = proveedor;
const { interpretar, InterpreteError } = await import('../backend/interprete.js');

const CONTEXTO = {
  cuentas: [
    { nombre: 'Efectivo', tipo: 'efectivo' },
    { nombre: 'Mercado Pago', tipo: 'billetera' },
    { nombre: 'Banco Galicia', tipo: 'banco' }
  ],
  categoriasGasto: [
    { nombre: 'Alquiler', tipo: 'operativo' },
    { nombre: 'Servicios', tipo: 'operativo' },
    { nombre: 'Combustible', tipo: 'operativo' },
    { nombre: 'Publicidad', tipo: 'operativo' },
    { nombre: 'Mantenimiento', tipo: 'operativo' },
    { nombre: 'Impuestos', tipo: 'operativo' }
  ],
  productos: [
    'Remera negra', 'Remera blanca', 'Pantalón jean', 'Zapatillas urbanas', 'Gorra', 'Buzo con capucha',
    'Medias pack x3', 'Coca-Cola 1.5 L', 'Alfajor triple', 'Yerba 1 kg', 'Asado', 'Vacío', 'Milanesa de nalga'
  ].map((nombre) => ({ nombre }))
};

// Al mediodía UTC, restar un día no cruza de fecha por la zona horaria.
const ayer = new Date(Date.parse(`${fechaDeHoy()}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// items: [producto (parte del nombre), cantidad, precio unitario].
// cobro: la cuenta, null si no se cobró, o [cuenta, importe] si fue parcial.
const FRASES = [
  { frase: 'Vendí 3 remeras negras a Juan por 45 mil y me pagó por Mercado Pago', tipo: 'venta', cliente: 'Juan', items: [['remera negra', 3, 15000]], cobro: 'Mercado Pago' },
  { frase: 'le vendí a la Sole dos buzos a 28 lucas cada uno, me los pagó en efectivo', tipo: 'venta', cliente: 'Sole', items: [['buzo', 2, 28000]], cobro: 'Efectivo' },
  { frase: 'Martín se llevó un pantalón jean de 52 mil, me lo paga la semana que viene', tipo: 'venta', cliente: 'Martín', items: [['pantalón', 1, 52000]], cobro: null },
  { frase: 'vendí 1,5 kg de vacío a Carlos a 12 mil el kilo, pagó con transferencia al Galicia', tipo: 'venta', cliente: 'Carlos', items: [['vacío', 1.5, 12000]], cobro: 'Banco Galicia' },
  { frase: 'Rosa compró 2 cocas y 3 alfajores, las cocas a 3500 y los alfajores a 1800, pagó cash', tipo: 'venta', cliente: 'Rosa', items: [['coca', 2, 3500], ['alfajor', 3, 1800]], cobro: 'Efectivo' },
  { frase: 'vendí unas zapatillas urbanas a Lucas por 120k, me transfirió 60 lucas por MP y el resto me lo debe', tipo: 'venta', cliente: 'Lucas', items: [['zapatillas', 1, 120000]], cobro: ['Mercado Pago', 60000] },
  { frase: 'Ayer le vendí 4 gorras a Pedro a 9 mil', tipo: 'venta', cliente: 'Pedro', items: [['gorra', 4, 9000]], cobro: null, fecha: ayer },
  { frase: 'le vendí a Ana un pack de medias a 6500 y una remera blanca a 16 mil, todo por mercado pago', tipo: 'venta', cliente: 'Ana', items: [['medias', 1, 6500], ['remera blanca', 1, 16000]], cobro: 'Mercado Pago' },
  { frase: 'a Diego le vendí 2 kilos de asado, 14 lucas el kilo, efectivo', tipo: 'venta', cliente: 'Diego', items: [['asado', 2, 14000]], cobro: 'Efectivo' },
  { frase: 'Vendí 10 yerbas a Almacén Don José a 4200 cada una', tipo: 'venta', cliente: 'Don José', items: [['yerba', 10, 4200]], cobro: null },
  { frase: 'Juli se llevó tres remeras negras por 42 mil en total, pagó con MP', tipo: 'venta', cliente: 'Juli', items: [['remera negra', 3, 14000]], cobro: 'Mercado Pago' },
  { frase: 'vendí 1 kilo de milanesas de nalga a Marta por 15 lucas y media', tipo: 'venta', cliente: 'Marta', items: [['milanesa', 1, 15500]], cobro: null },
  { frase: 'Compré 10 pantalones a Textil Norte a 9 mil cada uno', tipo: 'compra', proveedor: 'Textil Norte', items: [['pantal', 10, 9000]] },
  { frase: 'le compré 50 remeras negras a Distribuidora Sur a 6 lucas cada una, el envío salió 8 mil', tipo: 'compra', proveedor: 'Distribuidora Sur', items: [['remera negra', 50, 6000]], envio: 8000 },
  { frase: 'entraron 20 buzos de Textil Norte, 15 mil cada uno', tipo: 'compra', proveedor: 'Textil Norte', items: [['buzo', 20, 15000]] },
  { frase: 'compré 24 cocas a la distribuidora Coca a 2100 cada una', tipo: 'compra', proveedor: 'Coca', items: [['coca', 24, 2100]] },
  { frase: 'Le compré 30 kilos de asado al frigorífico La Pampa a 8500 el kilo', tipo: 'compra', proveedor: 'La Pampa', items: [['asado', 30, 8500]] },
  { frase: 'Compré 100 alfajores a Golosinas Mayorista por 120 mil', tipo: 'compra', proveedor: 'Golosinas Mayorista', items: [['alfajor', 100, 1200]] },
  { frase: 'Compré 5 fundas de celular a Importadora Lin a 3 mil cada una', tipo: 'compra', proveedor: 'Importadora Lin', items: [['funda', 5, 3000]] },
  { frase: 'Pagué 25 mil de luz en efectivo', tipo: 'gasto', categoria: 'Servicios', cuenta: 'Efectivo', importe: 25000 },
  { frase: 'pagué el alquiler del local, 380 lucas por transferencia del Galicia', tipo: 'gasto', categoria: 'Alquiler', cuenta: 'Banco Galicia', importe: 380000 },
  { frase: 'cargué nafta a la camioneta, 40 mil con mercado pago', tipo: 'gasto', categoria: 'Combustible', cuenta: 'Mercado Pago', importe: 40000 },
  { frase: 'Pagué 18 mil de internet en efectivo', tipo: 'gasto', categoria: 'Servicios', cuenta: 'Efectivo', importe: 18000 },
  { frase: 'le pagué 60 mil a un pibe para que arregle la heladera, en efectivo', tipo: 'gasto', categoria: 'Mantenimiento', cuenta: 'Efectivo', importe: 60000 },
  { frase: 'pagué publicidad en Instagram, 15 mil con MP', tipo: 'gasto', categoria: 'Publicidad', cuenta: 'Mercado Pago', importe: 15000 },
  { frase: 'pagué ingresos brutos, 1 palo y medio desde el Galicia', tipo: 'gasto', categoria: 'Impuestos', cuenta: 'Banco Galicia', importe: 1500000 },
  { frase: 'hola, ¿cómo andás?', tipo: null },
  { frase: '¿cuánto vendí este mes?', tipo: null },
  { frase: 'mañana le voy a vender 3 remeras a Juan', tipo: null },
  { frase: 'pasame la lista de precios', tipo: null }
];

const normal = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const contiene = (valor, parte) => normal(valor).includes(normal(parte));
const mismoMonto = (a, b) => Math.abs(Number(a) - b) <= Math.max(1, b * 0.005);

// Lo que no coincide, en palabras; vacío si está todo bien.
function diferencias(esperado, { tipo, datos }) {
  if (tipo !== esperado.tipo) return [`tipo: ${tipo ?? 'ninguno'} (esperaba ${esperado.tipo ?? 'ninguno'})`];
  if (!tipo) return [];
  const mal = [];
  const comparar = (nombre, ok, obtenido) => {
    if (!ok) mal.push(`${nombre}: ${JSON.stringify(obtenido)}`);
  };

  if (esperado.cliente) comparar('cliente', contiene(datos.cliente, esperado.cliente), datos.cliente);
  if (esperado.proveedor) comparar('proveedor', contiene(datos.proveedor, esperado.proveedor), datos.proveedor);
  if (esperado.items) {
    const items = datos.items ?? [];
    if (items.length !== esperado.items.length) mal.push(`items: ${JSON.stringify(items)}`);
    else {
      esperado.items.forEach(([producto, cantidad, precio]) => {
        const item = items.find((i) => contiene(i.producto, producto));
        if (!item) mal.push(`sin "${producto}": ${JSON.stringify(items)}`);
        else if (Number(item.cantidad) !== cantidad || !mismoMonto(item.precio_unitario, precio)) {
          mal.push(`${producto}: ${item.cantidad} × ${item.precio_unitario} (esperaba ${cantidad} × ${precio})`);
        }
      });
    }
  }
  if ('cobro' in esperado) {
    const [cuenta, importe] = Array.isArray(esperado.cobro) ? esperado.cobro : [esperado.cobro, null];
    if (cuenta === null) comparar('cobro', !datos.cobro, datos.cobro);
    else {
      const ok = datos.cobro && contiene(datos.cobro.cuenta, cuenta) && (importe === null || mismoMonto(datos.cobro.importe, importe));
      comparar('cobro', ok, datos.cobro);
    }
  }
  if (esperado.fecha) comparar('fecha', datos.fecha === esperado.fecha, datos.fecha);
  if (esperado.envio) comparar('envío', mismoMonto(datos.costo_envio, esperado.envio), datos.costo_envio);
  if (esperado.categoria) comparar('categoría', contiene(datos.categoria, esperado.categoria), datos.categoria);
  if (esperado.cuenta) comparar('cuenta', contiene(datos.cuenta, esperado.cuenta), datos.cuenta);
  if (esperado.importe) comparar('importe', mismoMonto(datos.importe, esperado.importe), datos.importe);
  return mal;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Un 503 por cupo se espera y se reintenta: mide si entiende, no el límite
// por minuto del plan gratis (que se anota aparte).
async function interpretarConEspera(frase) {
  for (let intento = 1; ; intento++) {
    const inicio = performance.now();
    try {
      const resultado = await interpretar(frase, CONTEXTO);
      return { resultado, ms: performance.now() - inicio, esperas: intento - 1 };
    } catch (err) {
      if (!(err instanceof InterpreteError) || err.status !== 503 || /clave/.test(err.message) || intento === 4) throw err;
      await esperar(20_000);
    }
  }
}

console.log(`Proveedor: ${proveedor ?? 'el de Nexo (Groq si hay clave, si no Gemini)'}\n`);
let bien = 0;
let esperas = 0;
const tiempos = [];
for (const [i, esperado] of FRASES.entries()) {
  const numero = String(i + 1).padStart(2);
  try {
    const { resultado, ms, esperas: e } = await interpretarConEspera(esperado.frase);
    esperas += e;
    tiempos.push(ms);
    const mal = diferencias(esperado, resultado);
    if (!mal.length) bien++;
    console.log(`${numero}. ${mal.length ? 'MAL ' : 'bien'} ${(ms / 1000).toFixed(1)} s  ${esperado.frase}`);
    for (const m of mal) console.log(`      ${m}`);
  } catch (err) {
    console.log(`${numero}. ERROR ${esperado.frase}\n      ${err.message}`);
    if (/clave/.test(err.message)) process.exit(1);
  }
}

tiempos.sort((a, b) => a - b);
const promedio = tiempos.reduce((s, t) => s + t, 0) / (tiempos.length || 1);
const p90 = tiempos[Math.floor(tiempos.length * 0.9)] ?? 0;
console.log(`\nBien: ${bien} de ${FRASES.length}. Tiempo: ${(promedio / 1000).toFixed(1)} s promedio, ${(p90 / 1000).toFixed(1)} s el 90 %.`);
if (esperas) console.log(`Hubo ${esperas} esperas por el límite por minuto del plan gratis.`);
