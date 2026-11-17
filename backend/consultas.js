// Las preguntas sobre los números del negocio (CLAUDE.md §36, hist. §185):
// "¿cuánto vendí este mes de remeras?", "¿quién me debe más?".
//
// La IA solo dice QUÉ se pregunta (el tema, el período y de quién o de qué),
// con el esquema fijo de `consultar` en interprete.js. La respuesta se arma
// acá, con los mismos números que muestran el Resumen y los reportes: la IA
// nunca escribe una cifra. Solo lee, así que no pide confirmación (§36).
//
// Como interprete.js, este módulo no importa la base: server.js le pasa las
// `fuentes`, ya atadas al negocio de la sesión (CLAUDE.md §28).

export const TEMAS = [
  'ventas',
  'ganancia',
  'gastos',
  'compras',
  'mas_vendidos',
  'mejores_clientes',
  'me_deben',
  'debo',
  'stock',
  'reponer',
  'plata'
];

export const PERIODOS = [
  'hoy',
  'ayer',
  'esta_semana',
  'semana_pasada',
  'este_mes',
  'mes_pasado',
  'este_anio',
  'anio_pasado',
  'todo',
  'fechas'
];

// Lo que también ve un empleado en sus pantallas (stock, cuentas corrientes y
// caja). El resto sale de los reportes, que son de quien administra.
const TEMAS_DE_TODOS = new Set(['me_deben', 'debo', 'stock', 'reponer', 'plata']);

const MAXIMO_FILAS = 6;

/* ---------- Formato ---------- */

const pesos = (n) =>
  Number(n ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const numero = (n) => Number(n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const contar = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const porcentaje = (parte, total) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : null);
const conPorcentaje = (parte, total) => [pesos(parte), porcentaje(parte, total)].filter(Boolean).join(' · ');
const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const sumar = (filas, campo) => filas.reduce((acc, f) => acc + (f[campo] ?? 0), 0);
// "12 unidades", o "3,5" si se vende por peso (el reporte no trae la unidad).
const unidades = (n) => (Number.isInteger(n) ? contar(n, 'unidad', 'unidades') : numero(n));

// Las primeras filas, y cuántas quedaron afuera.
function recortar(filas, maximo = MAXIMO_FILAS) {
  if (filas.length <= maximo) return filas;
  return [...filas.slice(0, maximo), { nombre: `Y ${numero(filas.length - maximo)} más`, valor: '' }];
}

/* ---------- Períodos ---------- */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aISO = (fecha) => fecha.toISOString().slice(0, 10);
const deISO = (iso) => new Date(`${iso}T00:00:00Z`);
const diaYMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

function sumarDias(iso, n) {
  const fecha = deISO(iso);
  fecha.setUTCDate(fecha.getUTCDate() + n);
  return aISO(fecha);
}

// El período de la pregunta como fechas, con el nombre que va en la respuesta
// ("este mes", "del 3/11 al 10/11"). Sin período, el mes en curso: la
// respuesta lo dice, así nadie lee un total creyendo que es de otra cosa.
// `desde` y `hasta` en null es todo el historial.
export function rangoDePeriodo(periodo, desde, hasta, hoy) {
  const [anio, mes] = hoy.split('-').map(Number);
  const lunes = sumarDias(hoy, -((deISO(hoy).getUTCDay() + 6) % 7));
  const primerDia = (a, m) => aISO(new Date(Date.UTC(a, m - 1, 1)));
  const ultimoDia = (a, m) => aISO(new Date(Date.UTC(a, m, 0)));

  const conFechas = FECHA.test(desde ?? '') || FECHA.test(hasta ?? '');
  if (conFechas && (periodo === 'fechas' || !periodo)) {
    let d = FECHA.test(desde ?? '') ? desde : hasta;
    let h = FECHA.test(hasta ?? '') ? hasta : desde;
    if (d > h) [d, h] = [h, d];
    return { desde: d, hasta: h, nombre: d === h ? `el ${diaYMes(d)}` : `del ${diaYMes(d)} al ${diaYMes(h)}` };
  }
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy, nombre: 'hoy' };
    case 'ayer':
      return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1), nombre: 'ayer' };
    case 'esta_semana':
      return { desde: lunes, hasta: hoy, nombre: 'esta semana' };
    case 'semana_pasada':
      return { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1), nombre: 'la semana pasada' };
    case 'mes_pasado':
      return { desde: primerDia(anio, mes - 1), hasta: ultimoDia(anio, mes - 1), nombre: 'el mes pasado' };
    case 'este_anio':
      return { desde: `${anio}-01-01`, hasta: hoy, nombre: 'este año' };
    case 'anio_pasado':
      return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31`, nombre: 'el año pasado' };
    case 'todo':
      return { desde: null, hasta: null, nombre: 'desde que empezaste' };
    default:
      return { desde: primerDia(anio, mes), hasta: hoy, nombre: 'este mes' };
  }
}

/* ---------- Buscar por nombre ---------- */

const SIN_PESO = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'un', 'una', 'unos', 'unas', 'mi', 'mis']);
const palabras = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
// Se comparan las primeras letras: "remeras" encuentra "Remera negra".
const raiz = (palabra) => (palabra.length > 4 ? palabra.slice(0, 4) : palabra);

// Si `nombre` tiene todas las palabras de lo que se buscó.
export function coincide(nombre, buscado) {
  const delNombre = new Set(palabras(nombre).map(raiz));
  const pedidas = palabras(buscado).filter((p) => !SIN_PESO.has(p)).map(raiz);
  return pedidas.length > 0 && pedidas.every((p) => delNombre.has(p));
}

const dicho = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
// Uno solo se nombra como está cargado; varios, como se preguntó.
const comoSeLlama = (filas, buscado) => (filas.length === 1 ? filas[0].nombre : `"${buscado}"`);

/* ---------- Cada tema ---------- */

const RESUMEN = { hash: '#/dashboard', nombre: 'Resumen' };

function ventas({ producto, categoria, cliente }, periodo, fuentes) {
  const reporte = fuentes.ventas(periodo.desde, periodo.hasta);
  const cuando = periodo.nombre;
  const loGanado = (filas, total) => ({ nombre: 'Ganancia', valor: conPorcentaje(sumar(filas, 'ganancia'), total) });

  if (cliente) {
    const filas = reporte.clientes.filter((c) => coincide(c.nombre, cliente));
    if (!filas.length) return { texto: `No encontré ventas a "${cliente}" ${cuando}.`, filas: [], enlace: RESUMEN };
    const total = sumar(filas, 'ventas');
    return {
      texto: `${mayuscula(cuando)} le vendiste ${pesos(total)} a ${comoSeLlama(filas, cliente)}, en ${contar(sumar(filas, 'cantidad_ventas'), 'venta', 'ventas')}.`,
      filas: [...(filas.length > 1 ? recortar(filas.map((c) => ({ nombre: c.nombre, valor: pesos(c.ventas) }))) : []), loGanado(filas, total)],
      enlace: RESUMEN
    };
  }

  const buscado = producto ?? categoria;
  if (buscado) {
    // "Remeras" puede ser un producto o una categoría entera.
    let filas = reporte.productos.filter((p) => coincide(p.nombre, buscado));
    if (!filas.length || !producto) {
      const deCategoria = reporte.categorias.filter((c) => coincide(c.nombre, buscado));
      if (deCategoria.length) filas = deCategoria;
    }
    if (!filas.length) return { texto: `No encontré ventas de "${buscado}" ${cuando}.`, filas: [], enlace: RESUMEN };
    const total = sumar(filas, 'ventas');
    return {
      texto: `${mayuscula(cuando)} vendiste ${pesos(total)} de ${comoSeLlama(filas, buscado)} (${unidades(sumar(filas, 'unidades'))}).`,
      filas: [
        ...(filas.length > 1 ? recortar(filas.map((p) => ({ nombre: p.nombre, valor: `${unidades(p.unidades)} · ${pesos(p.ventas)}` }))) : []),
        loGanado(filas, total)
      ],
      enlace: RESUMEN
    };
  }

  const { totales } = reporte;
  if (!totales.cantidad_ventas) return { texto: `${mayuscula(cuando)} no hubo ventas.`, filas: [], enlace: RESUMEN };
  return {
    texto: `${mayuscula(cuando)} vendiste ${pesos(totales.ventas_netas)} en ${contar(totales.cantidad_ventas, 'venta', 'ventas')}.`,
    filas: [
      { nombre: 'Ticket promedio', valor: pesos(totales.ticket_promedio) },
      { nombre: 'Ganancia', valor: conPorcentaje(totales.ganancia_bruta, totales.ventas_netas) }
    ],
    enlace: RESUMEN
  };
}

// Cada costo aparte y con su parte de lo vendido, como en el Resumen.
function ganancia(datos, periodo, fuentes) {
  if (datos.producto || datos.categoria || datos.cliente) return ventas(datos, periodo, fuentes);
  const r = fuentes.resultado(periodo.desde, periodo.hasta);
  const cuando = mayuscula(periodo.nombre);
  if (!r.ventas && !r.gastos_operativos) return { texto: `${cuando} no hubo ventas ni gastos.`, filas: [], enlace: RESUMEN };
  return {
    texto:
      r.resultado >= 0
        ? `${cuando} te quedaron ${pesos(r.resultado)} de ganancia, ya descontados los gastos.`
        : `${cuando} perdiste ${pesos(-r.resultado)}: los costos y los gastos fueron más que las ventas.`,
    filas: [
      { nombre: 'Ventas', valor: pesos(r.ventas) },
      { nombre: 'Costo de lo vendido', valor: conPorcentaje(r.costo_mercaderia, r.ventas) },
      { nombre: 'Ganancia bruta', valor: conPorcentaje(r.ganancia_bruta, r.ventas) },
      { nombre: 'Gastos', valor: conPorcentaje(r.gastos_operativos, r.ventas) }
    ],
    enlace: RESUMEN
  };
}

function gastos({ categoria }, periodo, fuentes) {
  const enlace = { hash: '#/gastos', nombre: 'Gastos' };
  const cuando = periodo.nombre;
  const todos = fuentes.gastos(periodo.desde, periodo.hasta);

  if (categoria) {
    const filas = todos.filter((g) => coincide(g.categoria, categoria));
    if (!filas.length) return { texto: `No encontré gastos de "${categoria}" ${cuando}.`, filas: [], enlace };
    const nombres = [...new Set(filas.map((g) => g.categoria))];
    return {
      texto: `${mayuscula(cuando)} gastaste ${pesos(sumar(filas, 'importe'))} en ${nombres.length === 1 ? nombres[0] : `"${categoria}"`}.`,
      filas: [],
      enlace
    };
  }

  // Las inversiones y los retiros salieron de la caja, pero no son gasto del
  // período: van aparte, como en el Resumen.
  const operativos = todos.filter((g) => g.tipo === 'operativo').sort((a, b) => b.importe - a.importe);
  const total = sumar(operativos, 'importe');
  const aparte = [
    ['inversion', 'Inversiones (aparte)'],
    ['retiro', 'Retiros (aparte)']
  ]
    .map(([tipo, nombre]) => ({ nombre, importe: sumar(todos.filter((g) => g.tipo === tipo), 'importe') }))
    .filter((f) => f.importe > 0)
    .map((f) => ({ nombre: f.nombre, valor: pesos(f.importe) }));
  if (!operativos.length) return { texto: `${mayuscula(cuando)} no hubo gastos.`, filas: aparte, enlace };
  return {
    texto: `${mayuscula(cuando)} gastaste ${pesos(total)} en ${contar(sumar(operativos, 'cantidad'), 'gasto', 'gastos')}.`,
    filas: [...recortar(operativos.map((g) => ({ nombre: g.categoria, valor: conPorcentaje(g.importe, total) }))), ...aparte],
    enlace
  };
}

function compras({ proveedor, producto }, periodo, fuentes) {
  const enlace = { hash: '#/compras', nombre: 'Compras' };
  const cuando = periodo.nombre;
  const reporte = fuentes.compras(periodo.desde, periodo.hasta);

  if (proveedor) {
    const filas = reporte.proveedores.filter((p) => coincide(p.nombre, proveedor));
    if (!filas.length) return { texto: `No encontré compras a "${proveedor}" ${cuando}.`, filas: [], enlace };
    return {
      texto: `${mayuscula(cuando)} le compraste ${pesos(sumar(filas, 'compras'))} a ${comoSeLlama(filas, proveedor)}, en ${contar(sumar(filas, 'cantidad_compras'), 'compra', 'compras')}.`,
      filas: filas.length > 1 ? recortar(filas.map((p) => ({ nombre: p.nombre, valor: pesos(p.compras) }))) : [],
      enlace
    };
  }
  if (producto) {
    const filas = reporte.productos.filter((p) => coincide(p.nombre, producto));
    if (!filas.length) return { texto: `No encontré compras de "${producto}" ${cuando}.`, filas: [], enlace };
    return {
      texto: `${mayuscula(cuando)} compraste ${pesos(sumar(filas, 'compras'))} de ${comoSeLlama(filas, producto)} (${unidades(sumar(filas, 'unidades'))}).`,
      filas: filas.length > 1 ? recortar(filas.map((p) => ({ nombre: p.nombre, valor: `${unidades(p.unidades)} · ${pesos(p.compras)}` }))) : [],
      enlace
    };
  }

  const { totales } = reporte;
  if (!totales.cantidad_compras) return { texto: `${mayuscula(cuando)} no hubo compras.`, filas: [], enlace };
  return {
    texto: `${mayuscula(cuando)} compraste ${pesos(totales.compras_netas)} en ${contar(totales.cantidad_compras, 'compra', 'compras')}.`,
    filas: recortar(
      reporte.proveedores.filter((p) => p.compras > 0).map((p) => ({ nombre: p.nombre, valor: conPorcentaje(p.compras, totales.compras_netas) }))
    ),
    enlace
  };
}

function masVendidos(datos, periodo, fuentes) {
  const filas = fuentes.ventas(periodo.desde, periodo.hasta).productos.filter((p) => p.ventas > 0);
  if (!filas.length) return { texto: `${mayuscula(periodo.nombre)} no hubo ventas.`, filas: [], enlace: RESUMEN };
  return {
    texto: `Lo que más vendiste ${periodo.nombre}:`,
    filas: filas.slice(0, MAXIMO_FILAS).map((p) => ({ nombre: p.nombre, valor: `${unidades(p.unidades)} · ${pesos(p.ventas)}` })),
    enlace: RESUMEN
  };
}

function mejoresClientes(datos, periodo, fuentes) {
  const filas = fuentes.ventas(periodo.desde, periodo.hasta).clientes.filter((c) => c.ventas > 0);
  if (!filas.length) return { texto: `${mayuscula(periodo.nombre)} no hubo ventas.`, filas: [], enlace: RESUMEN };
  return {
    texto: `Los que más te compraron ${periodo.nombre}:`,
    filas: filas
      .slice(0, MAXIMO_FILAS)
      .map((c) => ({ nombre: c.nombre, valor: `${pesos(c.ventas)} · ${contar(c.cantidad_ventas, 'venta', 'ventas')}` })),
    enlace: RESUMEN
  };
}

const CUENTAS_CORRIENTES = { hash: '#/cuentas-corrientes', nombre: 'Cuentas corrientes' };
// De la deuda más grande a la más chica, con lo atrasada que está.
const filasDeDeuda = (deudas) =>
  recortar(
    [...deudas]
      .sort((a, b) => b.saldo - a.saldo)
      .map((d) => ({
        nombre: d.nombre,
        valor: d.dias_max > 0 ? `${pesos(d.saldo)} · vencido hace ${contar(d.dias_max, 'día', 'días')}` : pesos(d.saldo)
      }))
  );

function meDeben({ cliente }, periodo, fuentes) {
  const deudas = fuentes.deudas().clientes;
  if (cliente) {
    const filas = deudas.filter((d) => coincide(d.nombre, cliente));
    if (!filas.length) return { texto: `"${cliente}" no te debe nada.`, filas: [], enlace: CUENTAS_CORRIENTES };
    return {
      texto: `${comoSeLlama(filas, cliente)} te debe ${pesos(sumar(filas, 'saldo'))}.`,
      filas: filas.length > 1 || filas[0].dias_max > 0 ? filasDeDeuda(filas) : [],
      enlace: CUENTAS_CORRIENTES
    };
  }
  if (!deudas.length) return { texto: 'Nadie te debe nada.', filas: [], enlace: CUENTAS_CORRIENTES };
  return {
    texto: `Te deben ${pesos(sumar(deudas, 'saldo'))} entre ${contar(deudas.length, 'cliente', 'clientes')}.`,
    filas: filasDeDeuda(deudas),
    enlace: CUENTAS_CORRIENTES
  };
}

function debo({ proveedor }, periodo, fuentes) {
  const deudas = fuentes.deudas().proveedores;
  if (proveedor) {
    const filas = deudas.filter((d) => coincide(d.nombre, proveedor));
    if (!filas.length) return { texto: `No le debés nada a "${proveedor}".`, filas: [], enlace: CUENTAS_CORRIENTES };
    return {
      texto: `Le debés ${pesos(sumar(filas, 'saldo'))} a ${comoSeLlama(filas, proveedor)}.`,
      filas: filas.length > 1 || filas[0].dias_max > 0 ? filasDeDeuda(filas) : [],
      enlace: CUENTAS_CORRIENTES
    };
  }
  if (!deudas.length) return { texto: 'No le debés nada a ningún proveedor.', filas: [], enlace: CUENTAS_CORRIENTES };
  return {
    texto: `Debés ${pesos(sumar(deudas, 'saldo'))} entre ${contar(deudas.length, 'proveedor', 'proveedores')}.`,
    filas: filasDeDeuda(deudas),
    enlace: CUENTAS_CORRIENTES
  };
}

const STOCK = { hash: '#/stock', nombre: 'Stock' };
const ESTADO_STOCK = { sin_stock: 'sin stock', bajo: 'queda poco' };
const cuantoHay = (p) => (p.unidad && p.unidad !== 'unidad' ? `${numero(p.stock)} ${p.unidad}` : numero(p.stock));
const filaDeStock = (p) => ({
  nombre: p.nombre,
  valor: [cuantoHay(p), ESTADO_STOCK[p.estado_stock]].filter(Boolean).join(' · ')
});

function reponer(datos, periodo, fuentes) {
  const faltan = fuentes.stock().filter((p) => ESTADO_STOCK[p.estado_stock]);
  if (!faltan.length) {
    return { texto: 'No hay nada para reponer: ningún producto está sin stock ni por debajo de su mínimo.', filas: [], enlace: STOCK };
  }
  const sinStock = faltan.filter((p) => p.estado_stock === 'sin_stock');
  return {
    texto: `Hay ${contar(faltan.length, 'producto', 'productos')} para reponer: ${numero(sinStock.length)} sin stock y ${numero(faltan.length - sinStock.length)} con poco.`,
    filas: recortar([...sinStock, ...faltan.filter((p) => p.estado_stock === 'bajo')].map(filaDeStock), 8),
    enlace: STOCK
  };
}

function stock(datos, periodo, fuentes) {
  const buscado = datos.producto ?? datos.categoria;
  if (!buscado) return reponer(datos, periodo, fuentes);
  const filas = fuentes.stock().filter((p) => coincide(p.nombre, buscado));
  if (!filas.length) return { texto: `No encontré "${buscado}" entre tus productos.`, filas: [], enlace: STOCK };
  if (filas.length > 1) return { texto: `Esto es lo que tenés de "${buscado}":`, filas: recortar(filas.map(filaDeStock), 8), enlace: STOCK };
  const [p] = filas;
  if (p.estado_stock === 'sin_stock') return { texto: `No te queda ${p.nombre}: está sin stock.`, filas: [], enlace: STOCK };
  const aviso = p.estado_stock === 'bajo' ? ' Está por debajo de su mínimo.' : '';
  return { texto: `Te quedan ${cuantoHay(p)} de ${p.nombre}.` + aviso, filas: [], enlace: STOCK };
}

function plata(datos, periodo, fuentes) {
  const cuentas = fuentes.cuentas();
  return {
    texto: `Tenés ${pesos(sumar(cuentas, 'saldo'))} entre todas tus cuentas.`,
    filas: cuentas.map((c) => ({ nombre: c.nombre, valor: pesos(c.saldo) })),
    enlace: { hash: '#/caja', nombre: 'Caja' }
  };
}

const RESPUESTAS = {
  ventas,
  ganancia,
  gastos,
  compras,
  mas_vendidos: masVendidos,
  mejores_clientes: mejoresClientes,
  me_deben: meDeben,
  debo,
  stock,
  reponer,
  plata
};

// datos: lo que llenó la IA en `consultar` ({ tema, periodo, desde, hasta,
// producto, categoria, cliente, proveedor }).
// Devuelve { texto, filas: [{ nombre, valor }], enlace: { hash, nombre } }, o
// null si el tema no es ninguno de los que se saben contestar.
export function responderConsulta(datos, { hoy, esAdmin, fuentes }) {
  const responder = RESPUESTAS[datos?.tema];
  if (!responder) return null;
  if (!esAdmin && !TEMAS_DE_TODOS.has(datos.tema)) {
    return { texto: 'Eso lo ve quien administra el negocio.', filas: [], enlace: null };
  }
  const pedido = {
    producto: dicho(datos.producto),
    categoria: dicho(datos.categoria),
    cliente: dicho(datos.cliente),
    proveedor: dicho(datos.proveedor)
  };
  return responder(pedido, rangoDePeriodo(datos.periodo, datos.desde, datos.hasta, hoy), fuentes);
}

// La misma respuesta como mensaje de WhatsApp.
export function consultaParaWhatsApp({ texto, filas, enlace }) {
  const detalle = filas.map((f) => (f.valor ? `• ${f.nombre}: *${f.valor}*` : `• ${f.nombre}`)).join('\n');
  const donde = enlace ? `\n\n📍 En Nexo: *${enlace.nombre}*.` : '';
  return `📊 ${texto}${detalle ? `\n\n${detalle}` : ''}${donde}`;
}
