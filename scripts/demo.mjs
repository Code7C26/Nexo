// Negocios de ejemplo para mostrar Nexo: `npm run demo -- --url <url> --email <mail>`.
//
// Suma a una cuenta que ya existe un negocio de cada tipo (indumentaria,
// mafaldas con producción, gimnasio, servicios y carnicería), con semanas de
// historia para que el Resumen y los reportes tengan qué mostrar. Como el seed
// (scripts/seed.mjs), todo entra por la API HTTP: pasa por la misma
// validación, auditoría y aislamiento que un operador.
//
// Uso:
//   --url <url>        el servidor (por defecto, el de Nexo).
//   --email <mail>     la cuenta. La contraseña se pide al correr, sin mostrarla
//                      (o NEXO_DEMO_CLAVE).
//   --solo <clave>     uno solo: lola, mafaldas, gimnasio, clima o carniceria.
//
// La cuenta tiene que estar en un negocio con el plan Pro: sumar negocios es
// de Pro, y el nuevo nace con el plan del que se está usando. Un negocio que ya
// existe con el mismo nombre se saltea, así que volver a correrlo no duplica.
//
// La historia va como ventas anteriores ("Lo que ya tenías", handoff 8c): con
// su fecha y su cobro, sin mover el stock ni la caja de hoy. Lo de hoy va con
// el circuito completo: punto de venta con la caja abierta, ventas cobradas,
// presupuestos, trabajos y socios.
import { parseArgs } from 'node:util';

// La dirección y el teléfono dan por hecho "Completá los datos de tu negocio"
// en la guía de Primeros pasos, y salen en los presupuestos.
const NEGOCIOS = {
  lola: { nombre: 'Lola Indumentaria', rubro: 'comercio', datos: { direccion: 'Rivera Indarte 182, Córdoba', telefono: '351 611-2040' }, armar: armarLola },
  mafaldas: { nombre: 'Mafaldas de Sofi', rubro: 'emprendimiento', datos: { direccion: 'Nueva Córdoba, Córdoba', telefono: '351 645-7781' }, armar: armarMafaldas },
  gimnasio: { nombre: 'Gimnasio Fuerza', rubro: 'gimnasio', datos: { direccion: 'Av. Vélez Sarsfield 2150, Córdoba', telefono: '351 466-1100' }, armar: armarGimnasio },
  clima: { nombre: 'Clima Sur', rubro: 'servicios', datos: { direccion: 'Av. Sabattini 3420, Córdoba', telefono: '351 489-3355' }, armar: armarClima },
  carniceria: { nombre: 'Carnicería Don Ramón', rubro: 'carniceria', datos: { direccion: 'Av. Japón 1650, Córdoba', telefono: '351 474-8820' }, armar: armarCarniceria }
};

/* ---------- Conexión ---------- */

async function conectar(url, email, password) {
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(new URL(ruta, url), {
      method: metodo,
      headers: { ...(cookie ? { cookie } : {}), ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
    const sesion = res.headers.getSetCookie().find((c) => c.startsWith('nexo'));
    if (sesion) cookie = sesion.split(';')[0];
    const texto = await res.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      // Una respuesta que no es JSON se muestra tal cual en el error.
    }
    if (res.status >= 300) throw new Error(`${metodo} ${ruta} (${res.status}): ${json?.error ?? texto.slice(0, 300)}`);
    return json;
  };
  await pedir('POST', '/api/auth/login', { email, password });
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
    put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
    patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo)
  };
}

// La contraseña sin que se vea en la pantalla ni quede en el historial.
function pedirClave(pregunta) {
  if (process.env.NEXO_DEMO_CLAVE) return Promise.resolve(process.env.NEXO_DEMO_CLAVE);
  process.stdout.write(pregunta);
  const entrada = process.stdin;
  entrada.setRawMode(true);
  entrada.resume();
  entrada.setEncoding('utf8');
  return new Promise((resolver) => {
    let clave = '';
    entrada.on('data', function leer(texto) {
      for (const letra of texto) {
        if (letra === '\r' || letra === '\n') {
          entrada.setRawMode(false);
          entrada.pause();
          entrada.off('data', leer);
          process.stdout.write('\n');
          return resolver(clave);
        }
        if (letra === '\u0003') process.exit(1);
        if (letra === '\u007f' || letra === '\b') clave = clave.slice(0, -1);
        else clave += letra;
      }
    });
  });
}

/* ---------- Ayudas ---------- */

// La fecha de la Argentina, como la del servidor (UTC-3).
const diasAtras = (n) => new Date(Date.now() - 3 * 3600000 - n * 86400000).toISOString().slice(0, 10);
const enDias = (n) => diasAtras(-n);

// Azar con semilla: la misma corrida arma la misma historia.
function azar(semilla) {
  let s = semilla >>> 0;
  const siguiente = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    entre: (a, b) => a + Math.floor(siguiente() * (b - a + 1)),
    uno: (lista) => lista[Math.floor(siguiente() * lista.length)],
    chance: (p) => siguiente() < p
  };
}

// Lo que todos los negocios usan: catálogos, productos, compras, ventas y
// gastos, sobre la sesión ya parada en el negocio.
async function contexto(api, semilla) {
  const r = azar(semilla);
  const cuentas = await api.get('/api/cuentas-tesoreria');
  const cuenta = (tipo) => cuentas.find((c) => c.tipo === tipo) ?? cuentas[0];
  const caja = cuenta('efectivo');
  const banco = cuenta('banco');
  const mp = cuentas.find((c) => /mercado/i.test(c.nombre)) ?? banco;
  const categorias = new Map();
  const categoriasGasto = new Map((await api.get('/api/categorias-gasto')).map((c) => [c.nombre, c.id]));

  const n = {
    r,
    api,
    caja,
    banco,
    mp,
    async categoria(nombre) {
      if (!categorias.has(nombre)) categorias.set(nombre, (await api.post('/api/categorias', { nombre })).id);
      return categorias.get(nombre);
    },
    async producto({ categoria, ...datos }) {
      const creado = await api.post('/api/productos', {
        stock_minimo: 0,
        ...datos,
        ...(categoria ? { categoria_id: await n.categoria(categoria) } : {})
      });
      return { ...datos, id: creado.id };
    },
    // Un producto con talles: cada talle es una variante con su SKU.
    async conTalles(datos, talles) {
      const producto = await n.producto(datos);
      const atributo = await api.post(`/api/productos/${producto.id}/atributos`, { nombre: 'Talle' });
      producto.variantes = {};
      for (const talle of talles) {
        const valor = await api.post(`/api/productos/${producto.id}/atributos/${atributo.id}/valores`, { valor: talle });
        const variante = await api.post(`/api/productos/${producto.id}/variantes`, {
          valores: [{ atributo_id: atributo.id, valor_id: valor.id }],
          sku: `${datos.sku}-${talle}`,
          precio_venta: datos.precio_venta
        });
        producto.variantes[talle] = variante.id;
      }
      return producto;
    },
    cliente: (datos) => api.post('/api/clientes', datos),
    proveedor: (datos) => api.post('/api/proveedores', datos),
    // Una compra recibida y pagada: fija el stock y el costo promedio.
    async comprar({ proveedor, fecha, items, envio = 0, cuenta = banco }) {
      const compra = await api.post('/api/compras', {
        proveedor,
        fecha,
        items: items.map(([producto, cantidad, costo, variante]) => ({
          producto: producto.nombre,
          ...(variante ? { variante_id: producto.variantes[variante] } : {}),
          cantidad,
          precio_unitario: costo
        })),
        ...(envio ? { costo_envio: envio } : {})
      });
      await api.post(`/api/compras/${compra.id}/confirmar`);
      await api.patch(`/api/compras/${compra.id}/estado-envio`, { estado_envio: 'recibido' });
      const { total } = await api.get(`/api/compras/${compra.id}`);
      await api.post(`/api/compras/${compra.id}/pagos`, { importe: total, cuenta_tesoreria_id: cuenta.id });
      return compra;
    },
    // Las semanas de antes: ventas anteriores con su fecha y su cobro.
    // `canales`: por dónde entró cada una, al azar entre los de la lista (los
    // repetidos pesan más); sin lista, sin indicar.
    async historia({ dias = 42, porDia, canasta, clientes = [], canales = [] }) {
      let cantidad = 0;
      for (let dia = dias; dia >= 1; dia -= 1) {
        const fecha = diasAtras(dia);
        const domingo = new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;
        const ventas = domingo ? r.entre(0, 1) : r.entre(...porDia);
        for (let i = 0; i < ventas; i += 1) {
          const renglones = new Map();
          for (let j = r.entre(1, 3); j > 0; j -= 1) {
            const [producto, minimo, maximo, variante] = r.uno(canasta);
            const talle = variante ?? (producto.variantes ? r.uno(Object.keys(producto.variantes)) : null);
            const clave = `${producto.id}-${talle}`;
            const cant = producto.unidad === 'kg' ? r.entre(minimo * 4, maximo * 4) / 4 : r.entre(minimo, maximo);
            renglones.set(clave, {
              producto_id: producto.id,
              ...(talle ? { variante_id: producto.variantes[talle] } : {}),
              cantidad: (renglones.get(clave)?.cantidad ?? 0) + cant,
              precio_unitario: producto.precio_venta
            });
          }
          const cliente = clientes.length && r.chance(0.35) ? r.uno(clientes) : null;
          await api.post('/api/carga-inicial/ventas', {
            fecha,
            items: [...renglones.values()],
            ...(cliente ? { cliente_id: cliente.id } : { cliente: 'Consumidor final' }),
            cobrada: true,
            cuenta_tesoreria_id: r.uno([caja, caja, mp, banco]).id,
            ...(canales.length ? { canal: r.uno(canales) } : {})
          });
          cantidad += 1;
        }
      }
      return cantidad;
    },
    // Una venta de estos días, cobrada (o a cuenta corriente, sin cobro).
    async vender({ items, cliente, canal, cobrar = true, cuenta = caja }) {
      const venta = await api.post('/api/ventas', {
        ...(cliente ? { cliente_id: cliente.id } : { cliente: 'Consumidor final' }),
        items: items.map(([producto, cantidad, variante]) => ({
          producto_id: producto.id,
          ...(variante ? { variante_id: producto.variantes[variante] } : {}),
          cantidad,
          precio_unitario: producto.precio_venta
        })),
        ...(canal ? { canal } : {}),
        ...(cobrar ? {} : { condicion_pago: 30 })
      });
      if (cobrar) {
        const { total } = await api.get(`/api/ventas/${venta.id}`);
        await api.post(`/api/ventas/${venta.id}/cobros`, { importe: total, cuenta_tesoreria_id: cuenta.id });
      }
      return venta;
    },
    // El mostrador de hoy: la caja abierta con algunas ventas, y queda abierta
    // para seguir vendiendo en la presentación.
    async mostrador(ventas) {
      const { cuentas: saldos } = await api.get('/api/tesoreria');
      const turno = await api.post('/api/turnos-caja', {
        cuenta_tesoreria_id: caja.id,
        contado: saldos.find((c) => c.id === caja.id).saldo
      });
      for (const items of ventas) {
        const renglones = items.map(([producto, cantidad]) => ({ producto_id: producto.id, cantidad, precio_unitario: producto.precio_venta }));
        const total = Math.round(renglones.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0) * 100) / 100;
        const enEfectivo = r.chance(0.6);
        await api.post('/api/pos/ventas', {
          turno_caja_id: turno.id,
          items: renglones,
          cobros: [{ cuenta_tesoreria_id: (enEfectivo ? caja : mp).id, importe: total }]
        });
      }
    },
    async gasto(categoria, importe, fecha, descripcion, cuenta = banco) {
      if (!categoriasGasto.has(categoria)) {
        categoriasGasto.set(categoria, (await api.post('/api/categorias-gasto', { nombre: categoria, tipo: 'operativo' })).id);
      }
      await api.post('/api/gastos', { categoria_id: categoriasGasto.get(categoria), cuenta_tesoreria_id: cuenta.id, importe, fecha, descripcion });
    },
    // Los gastos de cada mes que pasó: el alquiler, la luz y los que se pasen.
    async gastosDelMes(fijos) {
      for (const meses of [1, 0]) {
        for (const [categoria, importe, descripcion, dia] of fijos) {
          const fecha = diasAtras(meses * 30 + 30 - dia);
          if (fecha <= diasAtras(0)) await n.gasto(categoria, importe, fecha, descripcion);
        }
      }
    },
    consulta: (datos) => api.post('/api/crm/oportunidades', datos),
    async seguimiento(consulta, tipo, descripcion, fecha) {
      await api.post('/api/crm/actividades', { oportunidad_id: consulta.id, tipo, descripcion, ...(fecha ? { fecha } : {}) });
    }
  };
  // La plata que había al empezar, para que las cuentas no arranquen en cero.
  for (const [cuentaInicial, importe] of [[caja, 80000], [banco, 900000]]) {
    await api.post('/api/tesoreria/movimientos', {
      cuenta_tesoreria_id: cuentaInicial.id,
      tipo: 'ingreso',
      importe,
      concepto: 'Saldo al empezar con Nexo'
    });
  }
  return n;
}

/* ---------- Lola Indumentaria: comercio con talles, ofertas y CRM ---------- */

async function armarLola(n) {
  const remera = await n.conTalles({ nombre: 'Remera básica', sku: 'REM-BAS', precio_venta: 14900, categoria: 'Remeras', margen_objetivo: 50 }, ['S', 'M', 'L']);
  const oversize = await n.conTalles({ nombre: 'Remera oversize', sku: 'REM-OVR', precio_venta: 18900, categoria: 'Remeras', margen_objetivo: 50 }, ['M', 'L']);
  const buzo = await n.conTalles({ nombre: 'Buzo canguro', sku: 'BUZ-CAN', precio_venta: 36900, categoria: 'Buzos', margen_objetivo: 45 }, ['S', 'M', 'L']);
  const jean = await n.conTalles({ nombre: 'Jean mom', sku: 'JEA-MOM', precio_venta: 42900, categoria: 'Pantalones', margen_objetivo: 45 }, ['38', '40', '42']);
  const jogger = await n.producto({ nombre: 'Jogger frisa', sku: 'JOG-FRI', precio_venta: 28900, categoria: 'Pantalones', stock_minimo: 4, margen_objetivo: 45 });
  const gorra = await n.producto({ nombre: 'Gorra trucker', sku: 'GOR-TRU', precio_venta: 12900, categoria: 'Accesorios', stock_minimo: 3, margen_objetivo: 55 });
  const medias = await n.producto({ nombre: 'Medias x3', sku: 'MED-X3', precio_venta: 6900, categoria: 'Accesorios', stock_minimo: 6, margen_objetivo: 55 });
  const totebag = await n.producto({ nombre: 'Tote bag', sku: 'TOT-BAG', precio_venta: 9900, categoria: 'Accesorios', stock_minimo: 2, margen_objetivo: 55 });

  await n.proveedor({ nombre: 'Textil Norte', telefono: '351 422-1180', condicion_pago: 30 });
  await n.proveedor({ nombre: 'Denim Factory', telefono: '11 4555-2093' });
  await n.proveedor({ nombre: 'Accesorios Mayorista', telefono: '351 488-7012' });
  await n.comprar({
    proveedor: 'Textil Norte',
    fecha: diasAtras(45),
    envio: 18000,
    items: [
      [remera, 20, 6200, 'S'], [remera, 30, 6200, 'M'], [remera, 25, 6200, 'L'],
      [oversize, 20, 8100, 'M'], [oversize, 18, 8100, 'L'],
      [buzo, 10, 17500, 'S'], [buzo, 16, 17500, 'M'], [buzo, 12, 17500, 'L'],
      [jogger, 20, 13200]
    ]
  });
  await n.comprar({ proveedor: 'Denim Factory', fecha: diasAtras(40), items: [[jean, 10, 21000, '38'], [jean, 14, 21000, '40'], [jean, 8, 21000, '42']] });
  await n.comprar({ proveedor: 'Accesorios Mayorista', fecha: diasAtras(38), items: [[gorra, 15, 5200], [medias, 40, 2600], [totebag, 12, 3900]] });

  const clientes = [];
  for (const [nombre, telefono] of [
    ['Camila Herrera', '351 612-3344'], ['Valentina Ríos', '351 655-1020'], ['Martina López', '351 678-4410'],
    ['Florencia Paz', '351 601-7788'], ['Agustina Ferreyra', '351 640-2231'], ['Julieta Molina', '351 699-0145']
  ]) {
    clientes.push(await n.cliente({ nombre, telefono }));
  }
  const boutique = await n.cliente({ nombre: 'Boutique Arenas', documento: '30715558882', telefono: '3543 41-2200', condicion_pago: 30 });

  const ventas = await n.historia({
    porDia: [2, 6],
    clientes,
    canales: ['local', 'local', 'local', 'instagram', 'instagram', 'tiendanube', 'tiendanube', 'whatsapp'],
    canasta: [[remera, 1, 2], [remera, 1, 3], [oversize, 1, 2], [buzo, 1, 1], [jean, 1, 1], [jogger, 1, 1], [gorra, 1, 1], [medias, 1, 2], [totebag, 1, 1]]
  });

  // Estos días: por Instagram y WhatsApp, y una a la boutique a 30 días.
  await n.vender({ items: [[buzo, 1, 'M'], [medias, 1]], cliente: clientes[0], canal: 'instagram', cuenta: n.mp });
  await n.vender({ items: [[jean, 1, '40']], cliente: clientes[2], canal: 'whatsapp', cuenta: n.mp });
  await n.vender({ items: [[remera, 6, 'M'], [remera, 6, 'L'], [oversize, 4, 'L']], cliente: boutique, cobrar: false });
  await n.mostrador([[[jogger, 1], [gorra, 1]], [[medias, 2]], [[totebag, 1], [medias, 1]]]);

  await n.api.post('/api/ofertas', {
    nombre: 'Semana de remeras: 15 % off',
    tipo: 'porcentaje',
    valor: 15,
    alcance: 'categorias',
    categorias: [await n.categoria('Remeras')],
    desde: diasAtras(1),
    hasta: enDias(6)
  });
  await n.api.post('/api/ofertas', { nombre: 'Llevando 2 medias, $5.900 cada una', tipo: 'precio', valor: 5900, cantidad_minima: 2, alcance: 'productos', productos: [medias.id], desde: diasAtras(10) });

  await n.api.post('/api/presupuestos', {
    cliente_id: boutique.id,
    items: [
      { producto_id: buzo.id, variante_id: buzo.variantes.M, cantidad: 8, precio_unitario: 31900 },
      { producto_id: jogger.id, cantidad: 6, precio_unitario: 24900 }
    ],
    vencimiento: enDias(10),
    notas: 'Precio mayorista por cantidad. Envío a cargo de la boutique.'
  });

  const consulta = await n.consulta({ nombre: 'Rocío Gaitán', telefono: '351 633-9081', interes: 'Buzo canguro talle S en negro', origen: 'instagram', valor_estimado: 36900 });
  await n.seguimiento(consulta, 'mensaje', 'Avisarle cuando entren los negros', enDias(1));
  const otra = await n.consulta({ nombre: 'Sol Aguirre', telefono: '351 677-4412', interes: '2 jeans mom para regalo', origen: 'whatsapp', valor_estimado: 85800 });
  await n.seguimiento(otra, 'llamada', 'Confirmar talles', diasAtras(0));
  await n.consulta({ nombre: 'Tienda Mía (Villa María)', telefono: '353 455-1209', interes: 'Revender remeras por mayor', origen: 'otro', valor_estimado: 300000 });

  await n.gastosDelMes([
    ['Alquiler', 380000, 'Alquiler del local', 5],
    ['Servicios', 46000, 'Luz e internet', 12],
    ['Publicidad', 60000, 'Anuncios de Instagram', 15]
  ]);
  return `${ventas} ventas de las últimas 6 semanas, talles, 2 ofertas, un presupuesto mayorista y 3 consultas`;
}

/* ---------- Mafaldas de Sofi: emprendimiento con producción ---------- */

async function armarMafaldas(n) {
  const material = (nombre, unidad, sku, minimo) => n.producto({ nombre, unidad, sku, precio_venta: 0, categoria: 'Materiales', stock_minimo: minimo });
  const harina = await material('Harina 0000', 'kg', 'MAT-HAR', 5);
  const manteca = await material('Manteca', 'kg', 'MAT-MAN', 2);
  const azucar = await material('Azúcar', 'kg', 'MAT-AZU', 2);
  const huevos = await material('Huevos', 'unidad', 'MAT-HUE', 12);
  const ddl = await material('Dulce de leche repostero', 'kg', 'MAT-DDL', 3);
  const chocolate = await material('Chocolate cobertura', 'kg', 'MAT-CHO', 1);
  const caja6 = await material('Caja x 6', 'unidad', 'PAC-CAJ6', 20);
  const bolsa = await material('Bolsa kraft', 'unidad', 'PAC-BOL', 20);
  const sticker = await material('Sticker con el logo', 'unidad', 'PAC-STK', 30);

  const clasica = await n.producto({ nombre: 'Mafalda clásica', sku: 'MAF-CLA', precio_venta: 1800, categoria: 'Mafaldas', stock_minimo: 24, margen_objetivo: 60 });
  const choco = await n.producto({ nombre: 'Mafalda bañada en chocolate', sku: 'MAF-CHO', precio_venta: 2300, categoria: 'Mafaldas', stock_minimo: 24, margen_objetivo: 60 });
  const cajaRegalo = await n.producto({ nombre: 'Caja regalo x 6', sku: 'MAF-CAJ', precio_venta: 11500, categoria: 'Mafaldas', stock_minimo: 4, margen_objetivo: 55 });

  await n.proveedor({ nombre: 'Distribuidora La Panadera', telefono: '351 471-0909' });
  await n.proveedor({ nombre: 'Packaging Córdoba', telefono: '351 455-6120' });
  await n.comprar({
    proveedor: 'Distribuidora La Panadera',
    fecha: diasAtras(30),
    items: [[harina, 25, 1100], [manteca, 8, 9800], [azucar, 10, 1300], [huevos, 180, 210], [ddl, 15, 6400], [chocolate, 5, 14500]]
  });
  await n.comprar({ proveedor: 'Packaging Córdoba', fecha: diasAtras(30), envio: 4500, items: [[caja6, 100, 650], [bolsa, 200, 120], [sticker, 300, 45]] });

  // Lo que suele llevar cada tanda, y lo que salió de verdad al hacerla.
  const receta = (producto, rinde, items) =>
    n.api.post('/api/recetas', { producto_id: producto.id, rinde, items: items.map(([p, cantidad]) => ({ producto_id: p.id, cantidad })) });
  await receta(clasica, 40, [[harina, 1], [manteca, 0.4], [azucar, 0.3], [huevos, 4], [ddl, 1.2]]);
  await receta(choco, 40, [[harina, 1], [manteca, 0.4], [azucar, 0.3], [huevos, 4], [ddl, 1.2], [chocolate, 0.8]]);
  await receta(cajaRegalo, 1, [[clasica, 3], [choco, 3], [caja6, 1]]);
  const producir = (producto, cantidad, items, nota) =>
    n.api.post('/api/producciones', { producto_id: producto.id, cantidad, items: items.map(([p, c]) => ({ producto_id: p.id, cantidad: c })), nota });
  await producir(clasica, 38, [[harina, 1], [manteca, 0.4], [azucar, 0.3], [huevos, 4], [ddl, 1.3]], 'Salieron 38: dos se rompieron al desmoldar');
  await producir(clasica, 41, [[harina, 1], [manteca, 0.4], [azucar, 0.3], [huevos, 4], [ddl, 1.2]]);
  await producir(choco, 36, [[harina, 1], [manteca, 0.4], [azucar, 0.3], [huevos, 4], [ddl, 1.2], [chocolate, 0.9]], 'Se usó más chocolate');
  await producir(cajaRegalo, 6, [[clasica, 18], [choco, 18], [caja6, 6]]);

  // Lo que se usa al vender: una bolsa y un sticker por pedido.
  for (const producto of [clasica, choco, cajaRegalo]) {
    await n.api.put(`/api/productos/${producto.id}/componentes-venta`, {
      componentes: [
        { producto_id: bolsa.id, cantidad: 1, por_venta: true },
        { producto_id: sticker.id, cantidad: 1, por_venta: true }
      ]
    });
  }

  const clientes = [];
  for (const [nombre, telefono] of [['Café Las Rosas', '351 422-8890'], ['Marina Vélez', '351 611-2093'], ['Lucas Bustos', '351 644-1188'], ['Oficina Estudio Pereyra', '351 480-3300']]) {
    clientes.push(await n.cliente({ nombre, telefono }));
  }
  const ventas = await n.historia({
    dias: 28,
    porDia: [1, 4],
    clientes,
    canales: ['whatsapp', 'whatsapp', 'instagram', 'instagram', 'tiendanube', 'local'],
    canasta: [[clasica, 6, 12], [choco, 6, 12], [cajaRegalo, 1, 2], [clasica, 12, 24]]
  });

  await n.vender({ items: [[cajaRegalo, 2]], cliente: clientes[1], canal: 'instagram', cuenta: n.mp });
  await n.vender({ items: [[clasica, 12], [choco, 6]], cliente: clientes[3], canal: 'whatsapp', cuenta: n.mp });
  await n.vender({ items: [[clasica, 24]], cliente: clientes[0], cobrar: false });

  await n.gastosDelMes([
    ['Servicios', 18000, 'Gas', 10],
    ['Publicidad', 25000, 'Anuncios de Instagram', 14],
    ['Envíos', 21000, 'Cadetería de los pedidos', 25]
  ]);
  return `3 recetas, 4 producciones, bolsa y sticker en cada venta, y ${ventas} ventas de 4 semanas`;
}

/* ---------- Gimnasio Fuerza: socios con cuotas, y la barra ---------- */

async function armarGimnasio(n) {
  const pase = await n.api.post('/api/planes-socio', { nombre: 'Pase libre', opciones: [{ meses: 1, precio: 32000 }, { meses: 3, precio: 86000 }, { meses: 12, precio: 310000 }] });
  const musculacion = await n.api.post('/api/planes-socio', { nombre: 'Musculación 3 veces', opciones: [{ meses: 1, precio: 24000 }, { meses: 3, precio: 65000 }] });
  const funcional = await n.api.post('/api/planes-socio', { nombre: 'Funcional', opciones: [{ meses: 1, precio: 22000 }] });
  await n.api.post('/api/descuentos-socio', { nombre: 'Combo musculación + funcional', porcentaje: 15, aplica: 'combo', planes: [musculacion.id, funcional.id] });

  const agua = await n.producto({ nombre: 'Agua 500 ml', sku: 'BAR-AGU', precio_venta: 1500, categoria: 'Barra', stock_minimo: 12, margen_objetivo: 50 });
  const isotonica = await n.producto({ nombre: 'Bebida isotónica', sku: 'BAR-ISO', precio_venta: 2800, categoria: 'Barra', stock_minimo: 12, margen_objetivo: 45 });
  const barra = await n.producto({ nombre: 'Barra de proteína', sku: 'BAR-PRO', precio_venta: 3200, categoria: 'Barra', stock_minimo: 10, margen_objetivo: 45 });
  const proteina = await n.producto({ nombre: 'Proteína whey 1 kg', sku: 'SUP-WHE', precio_venta: 48000, categoria: 'Suplementos', stock_minimo: 2, margen_objetivo: 35 });
  await n.proveedor({ nombre: 'Distribuidora Fitness', telefono: '351 466-2010' });
  await n.comprar({ proveedor: 'Distribuidora Fitness', fecha: diasAtras(25), items: [[agua, 96, 650], [isotonica, 48, 1500], [barra, 40, 1800], [proteina, 6, 33000]] });

  // Los socios: se anotaron en distintos meses; casi todos al día, algunos deben.
  const socios = [
    ['Matías Ortiz', pase.opciones[0], 70, true], ['Brenda Juárez', pase.opciones[1], 40, true], ['Nicolás Gómez', musculacion.opciones[0], 55, true],
    ['Carla Funes', funcional.opciones[0], 20, true], ['Tomás Villalba', pase.opciones[0], 35, false], ['Romina Sosa', musculacion.opciones[1], 15, true],
    ['Ezequiel Luna', pase.opciones[2], 100, true], ['Daniela Paredes', funcional.opciones[0], 45, false], ['Franco Medina', pase.opciones[0], 10, true],
    ['Lucía Correa', musculacion.opciones[0], 25, true], ['Ignacio Reyna', pase.opciones[0], 60, true], ['Pilar Quiroga', funcional.opciones[0], 5, true]
  ];
  let alDia = 0;
  for (const [nombre, opcion, dias, paga] of socios) {
    const socio = await n.api.post('/api/socios', {
      cliente: { nombre, telefono: `351 6${n.r.entre(10, 99)}-${n.r.entre(1000, 9999)}` },
      planes: [{ opcion_id: opcion.id }],
      fecha_alta: diasAtras(dias)
    });
    if (paga) {
      await n.api.post(`/api/socios/${socio.id}/cobros`, { cuenta_tesoreria_id: n.r.chance(0.5) ? n.caja.id : n.mp.id });
      alDia += 1;
    }
    if (n.r.chance(0.6)) await n.api.post(`/api/socios/${socio.id}/ingresos`, {});
  }
  // Una socia con el combo.
  const combo = await n.api.post('/api/socios', {
    cliente: { nombre: 'Sofía Arce', telefono: '351 688-3021' },
    planes: [{ opcion_id: musculacion.opciones[0].id }, { opcion_id: funcional.opciones[0].id }],
    fecha_alta: diasAtras(12)
  });
  await n.api.post(`/api/socios/${combo.id}/cobros`, { cuenta_tesoreria_id: n.mp.id });

  const ventas = await n.historia({ dias: 28, porDia: [2, 6], canales: ['local'], canasta: [[agua, 1, 2], [isotonica, 1, 1], [barra, 1, 2], [proteina, 1, 1]] });
  await n.mostrador([[[agua, 2]], [[isotonica, 1], [barra, 1]], [[agua, 1]]]);

  const consulta = await n.consulta({ nombre: 'Gastón Peralta', telefono: '351 621-7740', interes: 'Pase libre anual', origen: 'instagram', valor_estimado: 310000 });
  await n.seguimiento(consulta, 'llamada', 'Ofrecerle la clase de prueba del jueves', enDias(1));
  await n.consulta({ nombre: 'Melina Castro', telefono: '351 690-1123', interes: 'Funcional para ella y la hermana', origen: 'local', valor_estimado: 44000 });

  await n.gastosDelMes([
    ['Alquiler', 520000, 'Alquiler del salón', 5],
    ['Servicios', 98000, 'Luz', 12],
    ['Mantenimiento', 45000, 'Service de las cintas', 20]
  ]);
  return `${socios.length + 1} socios (${alDia + 1} al día, 2 deben), 3 planes y un combo, y la barra con ${ventas} ventas`;
}

/* ---------- Clima Sur: servicios con presupuestos, trabajos y abonos ---------- */

async function armarClima(n) {
  const servicio = (nombre, sku, precio_venta) => n.producto({ nombre, sku, precio_venta, tipo: 'servicio', categoria: 'Servicios' });
  const instalacion = await servicio('Instalación de split hasta 3000 frigorías', 'SRV-INS', 120000);
  const instalacionGrande = await servicio('Instalación de split de 4500 a 6000 frigorías', 'SRV-INS6', 165000);
  const mantenimiento = await servicio('Mantenimiento preventivo', 'SRV-MAN', 35000);
  const carga = await servicio('Carga de gas', 'SRV-GAS', 55000);
  const visita = await servicio('Visita técnica', 'SRV-VIS', 18000);
  const kit = await servicio('Kit de instalación (caños y soporte)', 'SRV-KIT', 48000);

  const clientes = [];
  for (const [nombre, telefono, direccion] of [
    ['Restaurante El Fogón', '351 425-6610', 'Av. Colón 1820'], ['Consultorio Dra. Pérez', '351 470-2231', 'Bv. San Juan 455'],
    ['Hernán Acosta', '351 633-0912', 'Ituzaingó 1440'], ['Liliana Torres', '351 612-8801', 'Obispo Trejo 880'],
    ['Escribanía Moreno', '351 428-7710', '27 de Abril 370'], ['Gimnasio Fuerza', '351 466-1100', 'Av. Vélez Sarsfield 2150']
  ]) {
    clientes.push(await n.cliente({ nombre, telefono, direccion }));
  }

  const ventas = await n.historia({ dias: 42, porDia: [0, 2], clientes, canasta: [[mantenimiento, 1, 2], [carga, 1, 1], [visita, 1, 1], [instalacion, 1, 1]] });

  const presupuesto = (cliente, items, notas, dias = 15) =>
    n.api.post('/api/presupuestos', {
      cliente_id: cliente.id,
      items: items.map(([producto, cantidad]) => ({ producto_id: producto.id, cantidad, precio_unitario: producto.precio_venta })),
      vencimiento: enDias(dias),
      notas
    });
  // Uno aceptado que ya se hizo, uno aceptado para mañana, uno enviado y uno rechazado.
  const hecho = await presupuesto(clientes[0], [[instalacionGrande, 2], [kit, 2]], 'Dos equipos en el salón. Incluye garantía de 6 meses.');
  const mañana = await presupuesto(clientes[2], [[instalacion, 1], [kit, 1]], 'Equipo en el dormitorio, salida al balcón.');
  await presupuesto(clientes[4], [[instalacion, 3], [kit, 3]], 'Tres oficinas. Se puede hacer en dos días.');
  const rechazado = await presupuesto(clientes[3], [[carga, 1], [visita, 1]], 'Revisar pérdida de gas.');
  for (const p of [hecho, mañana]) await n.api.patch(`/api/presupuestos/${p.id}/estado`, { estado: 'aceptado' });
  await n.api.patch(`/api/presupuestos/${rechazado.id}/estado`, { estado: 'rechazado' });

  const trabajoHecho = await n.api.post('/api/trabajos', { presupuesto_id: hecho.id, fecha: diasAtras(2), hora: '09:00' });
  await n.api.patch(`/api/trabajos/${trabajoHecho.id}/estado`, { estado: 'en_curso' });
  const { venta_id: ventaTrabajo } = await n.api.post(`/api/trabajos/${trabajoHecho.id}/terminar`);
  const { total } = await n.api.get(`/api/ventas/${ventaTrabajo}`);
  await n.api.post(`/api/ventas/${ventaTrabajo}/cobros`, { importe: Math.round(total / 2), cuenta_tesoreria_id: n.banco.id, nota: 'Seña del 50 %' });
  await n.api.post('/api/trabajos', { presupuesto_id: mañana.id, fecha: enDias(1), hora: '10:30' });
  await n.api.post('/api/trabajos', { titulo: 'Revisar equipo que gotea', cliente_id: clientes[5].id, fecha: enDias(2), hora: '16:00', items: [{ producto_id: visita.id, cantidad: 1, precio_unitario: visita.precio_venta }] });

  // Los que pagan el mantenimiento cada tantos meses.
  for (const [cliente, meses, precio, dias] of [[clientes[0], 3, 90000, 80], [clientes[1], 6, 60000, 50], [clientes[4], 3, 75000, 20], [clientes[5], 1, 45000, 35]]) {
    await n.api.post('/api/abonos', { cliente_id: cliente.id, producto_id: mantenimiento.id, precio, meses, fecha_alta: diasAtras(dias), notas: `Mantenimiento cada ${meses === 1 ? 'mes' : `${meses} meses`}` });
  }

  const consulta = await n.consulta({ nombre: 'Colegio San Martín', telefono: '351 421-0033', interes: 'Mantenimiento de 12 equipos', origen: 'otro', valor_estimado: 420000 });
  await n.seguimiento(consulta, 'visita', 'Relevar los equipos con el encargado', enDias(3));
  await n.consulta({ nombre: 'Mariano Díaz', telefono: '351 655-0021', interes: 'Instalar un split en el living', origen: 'whatsapp', valor_estimado: 168000 });

  await n.gastosDelMes([
    ['Combustible', 85000, 'Nafta de la camioneta', 8],
    ['Herramientas', 40000, 'Repuestos y herramientas', 18],
    ['Servicios', 22000, 'Celular e internet', 10]
  ]);
  return `${ventas} servicios de 6 semanas, 4 presupuestos, 3 trabajos (uno terminado y cobrado a medias) y 4 abonos`;
}

/* ---------- Carnicería Don Ramón: por kilo, con balanza y mostrador ---------- */

async function armarCarniceria(n) {
  const corte = (nombre, sku, plu, precio_venta, categoria = 'Vacuno') =>
    n.producto({ nombre, sku, plu, precio_venta, unidad: 'kg', categoria, stock_minimo: 5, margen_objetivo: 35 });
  const asado = await corte('Asado', 'VAC-ASA', 101, 13900);
  const vacio = await corte('Vacío', 'VAC-VAC', 102, 15900);
  const matambre = await corte('Matambre', 'VAC-MAT', 103, 14900);
  const nalga = await corte('Nalga', 'VAC-NAL', 104, 16900);
  const picada = await corte('Carne picada especial', 'VAC-PIC', 105, 10900);
  const pollo = await corte('Pollo entero', 'POL-ENT', 201, 4900, 'Pollo');
  const pechuga = await corte('Pechuga', 'POL-PEC', 202, 8900, 'Pollo');
  const chorizo = await corte('Chorizo puro cerdo', 'CER-CHO', 301, 9900, 'Cerdo');
  const carbon = await n.producto({ nombre: 'Carbón 4 kg', sku: 'ALM-CAR', precio_venta: 6500, categoria: 'Almacén', stock_minimo: 6, margen_objetivo: 40 });

  await n.proveedor({ nombre: 'Frigorífico del Centro', telefono: '351 490-1212', condicion_pago: 15 });
  await n.proveedor({ nombre: 'Granja Los Álamos', telefono: '3572 44-1290' });
  await n.comprar({
    proveedor: 'Frigorífico del Centro',
    fecha: diasAtras(6),
    items: [[asado, 60, 8900], [vacio, 35, 10500], [matambre, 20, 9800], [nalga, 40, 11200], [picada, 45, 6800], [chorizo, 25, 6100], [carbon, 30, 3900]]
  });
  await n.comprar({ proveedor: 'Granja Los Álamos', fecha: diasAtras(3), items: [[pollo, 50, 2900], [pechuga, 25, 5600]] });

  // La balanza imprime "20" + el PLU en 5 cifras + el peso en gramos.
  await n.api.put('/api/negocio/balanza', { formato: { prefijo: '20', plu_digitos: 5, valor: 'peso', decimales: 3 } });

  const clientes = [];
  for (const [nombre, telefono] of [['Parrilla La Esquina', '351 433-2210'], ['Rosa Domínguez', '351 610-4488'], ['Carlos Funes', '351 622-9031']]) {
    clientes.push(await n.cliente({ nombre, telefono }));
  }
  const parrilla = await n.cliente({ nombre: 'Restaurante Don Pepe', telefono: '351 425-7700', condicion_pago: 15 });

  const ventas = await n.historia({
    dias: 28,
    porDia: [6, 12],
    clientes,
    canales: ['local'],
    canasta: [[asado, 1, 3], [vacio, 1, 2], [matambre, 1, 2], [nalga, 0.5, 2], [picada, 0.5, 2], [pollo, 1, 3], [pechuga, 0.5, 1.5], [chorizo, 0.5, 1.5], [carbon, 1, 1]]
  });
  await n.vender({ items: [[asado, 8], [vacio, 5], [chorizo, 3]], cliente: parrilla, cobrar: false });
  await n.mostrador([[[asado, 1.85], [chorizo, 0.6], [carbon, 1]], [[picada, 1.2]], [[pollo, 2.4], [pechuga, 0.9]], [[nalga, 1.1]]]);

  await n.api.post('/api/ofertas', { nombre: 'Picada llevando 2 kg', tipo: 'precio', valor: 9500, cantidad_minima: 2, alcance: 'productos', productos: [picada.id], desde: diasAtras(7) });
  await n.api.post('/api/ofertas', { nombre: 'Pollo de la semana', tipo: 'porcentaje', valor: 10, alcance: 'categorias', categorias: [await n.categoria('Pollo')], desde: diasAtras(2), hasta: enDias(4) });

  await n.gastosDelMes([
    ['Alquiler', 290000, 'Alquiler del local', 5],
    ['Servicios', 135000, 'Luz (cámaras de frío)', 12],
    ['Mantenimiento', 30000, 'Afilado y limpieza de la sierra', 22]
  ]);
  return `cortes por kilo con su código de balanza, ${ventas} ventas de 4 semanas, la caja abierta y 2 ofertas`;
}

/* ---------- Principal ---------- */

async function principal() {
  const { values: op } = parseArgs({
    options: {
      url: { type: 'string', default: 'https://nexosystem.duckdns.org' },
      email: { type: 'string' },
      solo: { type: 'string' }
    }
  });
  if (!op.email) throw new Error('Indicá la cuenta con --email <mail>.');
  if (op.solo && !Object.hasOwn(NEGOCIOS, op.solo)) throw new Error(`--solo es uno de: ${Object.keys(NEGOCIOS).join(', ')}.`);

  const api = await conectar(op.url, op.email, await pedirClave(`Contraseña de ${op.email}: `));
  const existentes = new Set((await api.get('/api/negocios')).map((negocio) => negocio.nombre));
  const claves = op.solo ? [op.solo] : Object.keys(NEGOCIOS);
  for (const [indice, clave] of claves.entries()) {
    const { nombre, rubro, datos, armar } = NEGOCIOS[clave];
    if (existentes.has(nombre)) {
      console.log(`- ${nombre}: ya existe, lo salteo.`);
      continue;
    }
    process.stdout.write(`- ${nombre}: creando… `);
    await api.post('/api/negocios', { nombre, rubro, ya_funcionaba: true });
    await api.put('/api/negocio', datos);
    const resumen = await armar(await contexto(api, 1000 + indice));
    console.log(`listo (${resumen}).`);
  }
  console.log('Listo. Cambiá de negocio con el selector de arriba del menú.');
}

principal().catch((err) => {
  console.error(`\ndemo: ${err.message}`);
  process.exitCode = 1;
});
