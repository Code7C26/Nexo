// Registro de acciones entre módulos (CLAUDE.md §31).
//
// Los dominios de Nexo se refrescan entre sí (una venta recarga stock, caja y
// resumen) y, si se importaran directo, formarían ciclos. En vez de eso cada
// dominio registra sus acciones por nombre y los demás las invocan por nombre,
// sin conocerse. Las claves son literales a propósito: el test estático de
// backend/test/frontend-modulos.test.js verifica que cada invocar()/recargar()
// tenga su registrar().
//
//   registrar('x', fn)         invocar('x', ...args)
//   registrar('cargar:x', fn)  recargar('x', 'y')  -> corre cargar:x y cargar:y
//   alEntrarEnVista('v', fn)   entrarEnVista('v')  (la llama el router)

const acciones = new Map();
const alEntrar = new Map();

export function registrar(nombre, fn) {
  acciones.set(nombre, fn);
}

export function invocar(nombre, ...args) {
  const fn = acciones.get(nombre);
  if (!fn) throw new Error(`core/registro: "${nombre}" no está registrado.`);
  return fn(...args);
}

// Varias recargas en paralelo; devuelve la Promise de todas.
export function recargar(...nombres) {
  return Promise.all(nombres.map((nombre) => invocar(`cargar:${nombre}`)));
}

// Código a correr cada vez que el router muestra esa vista (nav click,
// deep-link, Atrás/Adelante: los tres pasan por mostrarVista).
export function alEntrarEnVista(vista, fn) {
  alEntrar.set(vista, fn);
}

export function entrarEnVista(vista) {
  alEntrar.get(vista)?.();
}
