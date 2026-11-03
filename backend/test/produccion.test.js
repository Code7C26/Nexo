// Producción básica (Etapa J): la receta de lo que se hace, y producir con lo
// que se usó y lo que salió de verdad, con el costo que sale de los
// materiales. Va aparte porque cada archivo levanta su servidor, y el alta de
// empresas tiene un tope de intentos por IP.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearEmpleado, levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

let servidor;
// Un solo negocio para casi todo: el alta tiene un tope de 5 por IP por hora.
// Cada test arma sus propios productos.
let n;

before(async () => {
  servidor = await levantarServidor();
  n = await registrarEmpresa(servidor, { empresa: 'Mafaldas Juan', usuario: 'mafaldas' });
});

after(async () => {
  await servidor?.cerrar();
});

// Harina (kg) y huevos, cargados con su stock y su costo, y las mafaldas que
// se hacen con ellos. `tanda` distingue los nombres de cada test.
async function materiales(tanda) {
  const harina = (await n.post('/api/productos', { nombre: `Harina ${tanda}`, precio_venta: 1500, unidad: 'kg' })).json.id;
  const huevos = (await n.post('/api/productos', { nombre: `Huevos ${tanda}`, precio_venta: 300 })).json.id;
  const mafalda = (await n.post('/api/productos', { nombre: `Mafalda ${tanda}`, precio_venta: 900 })).json.id;
  const stock = await n.post('/api/carga-inicial/stock', {
    filas: [
      { producto_id: harina, cantidad: 10, costo: 1000 },
      { producto_id: huevos, cantidad: 60, costo: 200 }
    ]
  });
  assert.equal(stock.status, 200, stock.texto);
  return { harina, huevos, mafalda };
}

const producto = async (id) => (await n.get('/api/productos')).json.find((p) => p.id === id);

test('receta: materiales, rinde y el costo de hoy por unidad; una por producto', async () => {
  const { harina, huevos, mafalda } = await materiales('A');
  const receta = {
    producto_id: mafalda,
    rinde: 40,
    items: [
      { producto_id: harina, cantidad: 1 },
      { producto_id: huevos, cantidad: 12 }
    ]
  };
  const alta = await n.post('/api/recetas', receta);
  assert.equal(alta.status, 201, alta.texto);

  // 1 kg × 1.000 + 12 × 200 = 3.400 la tanda de 40: 85 cada una.
  const guardada = (await n.get('/api/recetas')).json.find((r) => r.producto_id === mafalda);
  assert.deepEqual([guardada.nombre, guardada.rinde, guardada.costo], ['Mafalda A', 40, 85]);
  assert.deepEqual(
    guardada.items.map((i) => [i.nombre, i.cantidad, i.stock]),
    [
      ['Harina A', 1, 10],
      ['Huevos A', 12, 60]
    ]
  );

  const repetida = await n.post('/api/recetas', receta);
  assert.equal(repetida.status, 400);
  assert.equal(repetida.json.receta_id, alta.json.id);

  // Editar reemplaza los materiales.
  const edicion = await n.put(`/api/recetas/${alta.json.id}`, { rinde: 20, items: [{ producto_id: harina, cantidad: 0.5 }] });
  assert.equal(edicion.status, 200, edicion.texto);
  const editada = (await n.get(`/api/recetas/${alta.json.id}`)).json;
  assert.deepEqual([editada.rinde, editada.items.length, editada.costo], [20, 1, 25]);

  // Borrarla deja crear otra.
  assert.equal((await n.del(`/api/recetas/${alta.json.id}`)).status, 200);
  assert.ok(!(await n.get('/api/recetas')).json.some((r) => r.producto_id === mafalda));
  assert.equal((await n.post('/api/recetas', receta)).status, 201);
});

test('receta: un material no puede ser lo que se produce, ni estar dos veces, ni ser un servicio', async () => {
  const { harina, mafalda } = await materiales('B');
  const servicio = (await n.post('/api/productos', { nombre: 'Envío', precio_venta: 500, tipo: 'servicio' })).json.id;
  const casos = [
    [{ producto_id: mafalda, rinde: 10, items: [{ producto_id: mafalda, cantidad: 1 }] }, 'material de sí mismo'],
    [
      {
        producto_id: mafalda,
        rinde: 10,
        items: [
          { producto_id: harina, cantidad: 1 },
          { producto_id: harina, cantidad: 2 }
        ]
      },
      'dos veces'
    ],
    [{ producto_id: mafalda, rinde: 10, items: [{ producto_id: servicio, cantidad: 1 }] }, 'servicio'],
    [{ producto_id: servicio, rinde: 10, items: [{ producto_id: harina, cantidad: 1 }] }, 'servicio'],
    [{ producto_id: mafalda, rinde: 0, items: [{ producto_id: harina, cantidad: 1 }] }, 'rinde'],
    [{ producto_id: mafalda, rinde: 10, items: [] }, 'al menos un material'],
    [{ producto_id: mafalda, rinde: 10, items: [{ producto_id: harina, cantidad: -1 }] }, 'mayor a 0']
  ];
  for (const [cuerpo, mensaje] of casos) {
    const r = await n.post('/api/recetas', cuerpo);
    assert.equal(r.status, 400, `${mensaje}: ${r.texto}`);
    assert.match(r.json.error, new RegExp(mensaje));
  }
});

test('producir: salen los materiales usados, entra lo que salió y el costo entra al promedio', async () => {
  const { harina, huevos, mafalda } = await materiales('C');

  // Se esperaban 40 y salieron 38, con un poco más de harina: 1,2 × 1.000 +
  // 12 × 200 = 3.600, a 94,74 cada una.
  const r = await n.post('/api/producciones', {
    producto_id: mafalda,
    cantidad: 38,
    items: [
      { producto_id: harina, cantidad: 1.2 },
      { producto_id: huevos, cantidad: 12 }
    ]
  });
  assert.equal(r.status, 201, r.texto);
  const p = (await n.get(`/api/producciones/${r.json.id}`)).json;
  assert.deepEqual([p.nombre, p.cantidad, p.costo_total, p.estado], ['Mafalda C', 38, 3600, 'activa']);
  assert.equal(Math.round(p.costo_unitario * 100) / 100, 94.74);
  assert.deepEqual(
    p.items.map((i) => [i.nombre, i.cantidad, i.costo_unitario]),
    [
      ['Harina C', 1.2, 1000],
      ['Huevos C', 12, 200]
    ]
  );

  assert.equal((await producto(harina)).stock, 8.8);
  assert.equal((await producto(huevos)).stock, 48);
  const hechas = await producto(mafalda);
  assert.equal(hechas.stock, 38);
  assert.equal(Math.round(hechas.precio_costo * 100) / 100, 94.74);
  // Los materiales no cambian su costo.
  assert.equal((await producto(harina)).precio_costo, 1000);

  const movimientos = (await n.get('/api/movimientos-stock')).json.filter((m) => m.produccion_id === r.json.id);
  assert.deepEqual(movimientos.map((m) => [m.origen, m.tipo]).sort(), [
    ['produccion', 'entrada'],
    ['produccion', 'salida'],
    ['produccion', 'salida']
  ]);

  // Otra tanda, más barata: 40 a 85. El promedio de 78 mafaldas: (3.600 + 3.400) / 78.
  const otra = await n.post('/api/producciones', {
    producto_id: mafalda,
    cantidad: 40,
    items: [
      { producto_id: harina, cantidad: 1 },
      { producto_id: huevos, cantidad: 12 }
    ]
  });
  assert.equal(otra.status, 201, otra.texto);
  assert.equal(Math.round((await producto(mafalda)).precio_costo * 100) / 100, Math.round((7000 / 78) * 100) / 100);
  assert.equal((await n.get('/api/producciones')).json.filter((x) => x.producto_id === mafalda).length, 2);
});

test('producir sin material suficiente no mueve nada', async () => {
  const { harina, mafalda } = await materiales('D');
  const r = await n.post('/api/producciones', { producto_id: mafalda, cantidad: 10, items: [{ producto_id: harina, cantidad: 11 }] });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /No alcanza "Harina D"/);
  assert.equal((await producto(harina)).stock, 10);
  assert.equal((await producto(mafalda)).stock, 0);
  assert.ok(!(await n.get('/api/producciones')).json.some((x) => x.producto_id === mafalda));
});

test('anular: los materiales vuelven, lo producido sale y el costo deja de contarla', async () => {
  const { harina, huevos, mafalda } = await materiales('E');
  const buena = await n.post('/api/producciones', {
    producto_id: mafalda,
    cantidad: 40,
    items: [
      { producto_id: harina, cantidad: 1 },
      { producto_id: huevos, cantidad: 12 }
    ]
  });
  // Un error de tipeo: 4 en vez de 40, que deja el costo por las nubes.
  const mala = await n.post('/api/producciones', {
    producto_id: mafalda,
    cantidad: 4,
    items: [
      { producto_id: harina, cantidad: 1 },
      { producto_id: huevos, cantidad: 12 }
    ]
  });
  assert.equal(mala.status, 201, mala.texto);
  assert.ok((await producto(mafalda)).precio_costo > 85);

  const anulada = await n.post(`/api/producciones/${mala.json.id}/anular`);
  assert.equal(anulada.status, 200, anulada.texto);
  assert.equal((await n.get(`/api/producciones/${mala.json.id}`)).json.estado, 'anulada');
  assert.equal((await n.post(`/api/producciones/${mala.json.id}/anular`)).status, 400);

  const hechas = await producto(mafalda);
  assert.deepEqual([hechas.stock, hechas.precio_costo], [40, 85]);
  assert.equal((await producto(harina)).stock, 9);
  assert.equal((await producto(huevos)).stock, 48);

  // Si lo producido ya se vendió, no se anula.
  const venta = await n.post('/api/ventas', { cliente: 'Consumidor final', items: [{ producto_id: mafalda, cantidad: 39, precio_unitario: 900 }] });
  assert.equal(venta.status, 201, venta.texto);
  const tarde = await n.post(`/api/producciones/${buena.json.id}/anular`);
  assert.equal(tarde.status, 400);
  assert.match(tarde.json.error, /no se puede anular/);
});

test('con variantes: se produce la variante, y cada empresa ve solo lo suyo', async () => {
  const { harina, mafalda } = await materiales('F');
  const alfajor = (await n.post('/api/productos', { nombre: 'Alfajor', precio_venta: 1200 })).json.id;
  const gusto = (await n.post(`/api/productos/${alfajor}/atributos`, { nombre: 'Gusto' })).json.id;
  const valor = (await n.post(`/api/productos/${alfajor}/atributos/${gusto}/valores`, { valor: 'Maicena' })).json.id;
  const variante = await n.post(`/api/productos/${alfajor}/variantes`, { valores: [{ atributo_id: gusto, valor_id: valor }] });
  assert.equal(variante.status, 201, variante.texto);

  const sinVariante = await n.post('/api/producciones', { producto_id: alfajor, cantidad: 10, items: [{ producto_id: harina, cantidad: 1 }] });
  assert.equal(sinVariante.status, 400);
  assert.match(sinVariante.json.error, /variante/);

  const r = await n.post('/api/producciones', {
    producto_id: alfajor,
    variante_id: variante.json.id,
    cantidad: 10,
    items: [{ producto_id: harina, cantidad: 1 }]
  });
  assert.equal(r.status, 201, r.texto);
  const p = (await n.get(`/api/producciones/${r.json.id}`)).json;
  assert.equal(p.nombre, 'Alfajor (Gusto: Maicena)');
  const deVariante = (await n.get(`/api/productos/${alfajor}/variantes`)).json.find((v) => v.id === variante.json.id);
  assert.deepEqual([deVariante.stock, deVariante.precio_costo], [10, 100]);

  // Otra empresa no ve ni usa lo de esta.
  const otra = await registrarEmpresa(servidor, { empresa: 'Otra Panadería', usuario: 'otrapan' });
  assert.deepEqual((await otra.get('/api/producciones')).json, []);
  assert.equal((await otra.get(`/api/producciones/${r.json.id}`)).status, 404);
  const ajena = await otra.post('/api/producciones', { producto_id: mafalda, cantidad: 1, items: [{ producto_id: harina, cantidad: 1 }] });
  assert.equal(ajena.status, 400);
  assert.equal((await otra.post(`/api/producciones/${r.json.id}/anular`)).status, 404);
});

test('el empleado produce sin ver costos, y no arma recetas ni anula', async () => {
  const { harina, huevos, mafalda } = await materiales('G');
  const receta = await n.post('/api/recetas', { producto_id: mafalda, rinde: 40, items: [{ producto_id: harina, cantidad: 1 }] });
  assert.equal(receta.status, 201, receta.texto);
  const empleado = await crearEmpleado(servidor, n, { usuario: 'cocinero' });

  const vista = (await empleado.get('/api/recetas')).json.find((x) => x.producto_id === mafalda);
  assert.equal(vista.costo, undefined);
  assert.equal(vista.items[0].costo_unitario, undefined);
  assert.equal(vista.items[0].stock, 10);

  const r = await empleado.post('/api/producciones', {
    producto_id: mafalda,
    cantidad: 40,
    items: [
      { producto_id: harina, cantidad: 1 },
      { producto_id: huevos, cantidad: 12 }
    ]
  });
  assert.equal(r.status, 201, r.texto);
  const p = (await empleado.get(`/api/producciones/${r.json.id}`)).json;
  assert.deepEqual([p.costo_total, p.costo_unitario, p.items[0].costo_unitario], [undefined, undefined, undefined]);

  assert.equal((await empleado.post('/api/recetas', { producto_id: huevos, rinde: 1, items: [{ producto_id: harina, cantidad: 1 }] })).status, 403);
  assert.equal((await empleado.post(`/api/producciones/${r.json.id}/anular`)).status, 403);
});

test('el módulo viene prendido en Emprendimiento y no en los demás', async () => {
  const emprende = await registrarEmpresa(servidor, { empresa: 'Emprende', usuario: 'emprende', extra: { rubro: 'emprendimiento' } });
  const negocio = (await emprende.get('/api/negocio')).json;
  assert.ok(negocio.modulos.includes('produccion'), JSON.stringify(negocio.modulos));
  // El principal es de comercio, el tipo por defecto.
  assert.ok(!(await n.get('/api/negocio')).json.modulos.includes('produccion'));
});
