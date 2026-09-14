// Tabla de clasificación de rutas por permiso: la especificación legible y
// versionada de quién puede llamar a cada endpoint. No se usa en runtime
// (server.js sigue poniendo `soloAdmin` como argumento explícito en cada
// endpoint que lo necesita, no un middleware que lea esta tabla) — esto es
// deliberado, ver el comentario largo en server.js junto a `soloAdmin`.
// Esta tabla existe para que `test/permisos.test.js` la contraste contra
// las rutas reales de server.js: si alguien agrega el endpoint #106 sin
// clasificarlo acá, o lo clasifica 'admin' pero se olvida el argumento
// `soloAdmin`, el test rompe. Es la fuente de verdad de la política, no
// una copia que se pueda desincronizar en silencio.
//
// Tres valores posibles:
// - 'publico': sin sesión, declarado antes de `app.use('/api', autenticar)`.
// - 'ambos': requiere sesión (admin o empleado), sin `soloAdmin`.
// - 'admin': requiere sesión Y rol admin (`soloAdmin` como argumento).
//
// Decisiones de negocio detrás de esta tabla (ver handoff.md, sección de
// permisos por rol): anular/restaurar, tesorería, alta/edición de
// productos y categorías, ajuste de stock, todo el circuito de compras
// (pagos incluidos) y sus devoluciones a proveedor, y las 5 vistas de
// análisis (resumen y reportes) son admin. Cobros de venta y creación de
// devoluciones de venta quedan del lado del empleado a propósito: es su
// trabajo diario.
//
// Gap conocido, no resuelto todavía (preguntar antes de restringir, no
// inventar): el ABM de listas de precios, depósitos y categorías de gasto
// quedó 'ambos' porque no se decidió explícitamente con el usuario si
// deberían ser admin, a diferencia de categorías de producto y productos
// que sí se decidieron. Son maestros de la misma naturaleza; revisar en la
// próxima sesión de permisos.
export const RUTAS_PERMISOS = {
  'GET /api/auth/estado': 'publico',
  'POST /api/auth/login': 'publico',
  'POST /api/auth/bootstrap': 'publico',
  'GET /api/clientes': 'ambos',
  'GET /api/clientes/:id': 'ambos',
  'POST /api/clientes': 'ambos',
  'PATCH /api/clientes/:id': 'ambos',
  'GET /api/facturas': 'ambos',
  'GET /api/facturas/:id': 'ambos',
  'POST /api/facturas': 'ambos',
  'GET /api/categorias': 'ambos',
  'POST /api/categorias': 'admin',
  'PATCH /api/categorias/:id': 'admin',
  'GET /api/listas-precios': 'ambos',
  'POST /api/listas-precios': 'ambos',
  'PATCH /api/listas-precios/:id': 'ambos',
  'GET /api/depositos': 'ambos',
  'POST /api/depositos': 'ambos',
  'PATCH /api/depositos/:id': 'ambos',
  'GET /api/productos': 'ambos',
  'POST /api/productos': 'admin',
  'PATCH /api/productos/:id': 'admin',
  'POST /api/productos/bulk': 'admin',
  'GET /api/productos/:id/movimientos': 'ambos',
  'GET /api/proveedores': 'ambos',
  'GET /api/proveedores/:id': 'ambos',
  'POST /api/proveedores': 'ambos',
  'PATCH /api/proveedores/:id': 'ambos',
  'GET /api/stock': 'ambos',
  'POST /api/stock/ajuste': 'admin',
  'GET /api/movimientos-stock': 'ambos',
  'GET /api/transferencias': 'ambos',
  'POST /api/transferencias': 'ambos',
  'POST /api/transferencias/:id/anular': 'admin',
  'GET /api/ventas': 'ambos',
  'GET /api/ventas/:id': 'ambos',
  'POST /api/ventas': 'ambos',
  'PUT /api/ventas/:id': 'ambos',
  'GET /api/ventas/:id/cobros': 'ambos',
  'POST /api/ventas/:id/cobros': 'ambos',
  'POST /api/ventas/:id/facturar': 'ambos',
  'POST /api/ventas/:id/anular': 'admin',
  'POST /api/ventas/:id/restaurar': 'admin',
  'GET /api/presupuestos': 'ambos',
  'GET /api/presupuestos/:id': 'ambos',
  'POST /api/presupuestos': 'ambos',
  'PUT /api/presupuestos/:id': 'ambos',
  'PATCH /api/presupuestos/:id/estado': 'ambos',
  'POST /api/presupuestos/:id/convertir': 'ambos',
  'GET /api/devoluciones': 'ambos',
  'GET /api/devoluciones/:id': 'ambos',
  'POST /api/devoluciones': 'ambos',
  'POST /api/devoluciones/:id/nota-credito': 'ambos',
  'POST /api/devoluciones/:id/anular': 'admin',
  'POST /api/devoluciones/:id/restaurar': 'admin',
  'GET /api/compras': 'admin',
  'GET /api/compras/:id': 'admin',
  'POST /api/compras': 'admin',
  'PUT /api/compras/:id': 'admin',
  'POST /api/compras/:id/confirmar': 'admin',
  'POST /api/compras/:id/anular': 'admin',
  'POST /api/compras/:id/restaurar': 'admin',
  'PATCH /api/compras/:id/estado-envio': 'admin',
  'POST /api/compras/bulk/estado-envio': 'admin',
  'GET /api/compras/:id/pagos': 'admin',
  'POST /api/compras/:id/pagos': 'admin',
  'GET /api/devoluciones-proveedor': 'admin',
  'GET /api/devoluciones-proveedor/:id': 'admin',
  'POST /api/devoluciones-proveedor': 'admin',
  'POST /api/devoluciones-proveedor/:id/nota-credito': 'admin',
  'POST /api/devoluciones-proveedor/:id/anular': 'admin',
  'POST /api/devoluciones-proveedor/:id/restaurar': 'admin',
  'GET /api/cuentas-tesoreria': 'ambos',
  'POST /api/cuentas-tesoreria': 'admin',
  'PATCH /api/cuentas-tesoreria/:id': 'admin',
  'GET /api/tesoreria': 'ambos',
  'GET /api/tesoreria/movimientos': 'ambos',
  'POST /api/tesoreria/movimientos': 'admin',
  'POST /api/tesoreria/transferencias': 'admin',
  'GET /api/categorias-gasto': 'ambos',
  'POST /api/categorias-gasto': 'ambos',
  'PATCH /api/categorias-gasto/:id': 'ambos',
  'GET /api/gastos': 'ambos',
  'POST /api/gastos': 'ambos',
  'PUT /api/gastos/:id': 'ambos',
  'POST /api/gastos/:id/anular': 'admin',
  'POST /api/gastos/:id/restaurar': 'admin',
  'GET /api/cuentas-corrientes': 'ambos',
  'GET /api/resumen': 'admin',
  'GET /api/resumen/evolucion': 'admin',
  'GET /api/reportes/ventas': 'admin',
  'GET /api/reportes/compras': 'admin',
  'GET /api/reportes/stock': 'admin',
  'POST /api/asistente/interpretar': 'ambos',
  'POST /api/asistente/:id/descartar': 'ambos',
  'POST /api/asistente/ejecutar': 'ambos',
  'GET /api/auditoria': 'ambos',
  'POST /api/auth/logout': 'ambos',
  'POST /api/auth/cambiar-password': 'ambos',
  'GET /api/usuarios': 'admin',
  'POST /api/usuarios': 'admin',
  'PATCH /api/usuarios/:id': 'admin',
  'POST /api/usuarios/:id/resetear-password': 'admin',
  'GET /api/negocio': 'ambos',
  'PUT /api/negocio': 'admin'
};
