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
// Decisiones de negocio detrás de esta tabla (ver docs/handoff-historico.md,
// §27 y §28): anular/restaurar, tesorería, alta/edición de
// productos y categorías, ajuste de stock, todo el circuito de compras
// (pagos incluidos) y sus devoluciones a proveedor, y las 5 vistas de
// análisis (resumen y reportes) son admin. Cobros de venta y creación de
// devoluciones de venta quedan del lado del empleado a propósito: es su
// trabajo diario. Auditoría (GET /api/auditoria) fue admin desde la Etapa A
// de multi-tenant porque valor_anterior/valor_nuevo traían costo/margen/
// ganancia sin filtrar; volvió a 'ambos' en hist. §93, con esos JSON podados
// para el empleado y sin las filas de compras, pagos y devoluciones a
// proveedor (ver el endpoint en server.js). El alta y la edición de
// los cinco catálogos (categorías de producto y de gasto, listas de precios,
// depósitos y cuentas de tesorería) también son admin; leerlos es de los dos.
// Socios (hist. §74 y §75): la recepción da de alta, suma planes, elige el
// descuento a mano, cobra y registra ingresos, que es su trabajo diario; crear
// y editar los planes y los descuentos (los precios) es admin.
// Trabajos (hist. §78): programarlos, editarlos y terminarlos es de los dos
// roles, como un presupuesto o una venta.
// Abonos (hist. §79): verlos es de los dos roles; darlos de alta y cambiarles el
// precio es admin, como los planes de socios. Cada cuota se cobra como venta.
export const RUTAS_PERMISOS = {
  'GET /api/auth/estado': 'publico',
  'POST /api/auth/login': 'publico',
  'POST /api/auth/registro': 'publico',
  'GET /api/auth/tipos-negocio': 'publico',
  'GET /api/auth/planes': 'publico',
  'POST /api/publico/consulta': 'publico',
  // El enlace de una invitación (hist. §104): verla y crear la cuenta desde
  // ella, sin sesión. El token prueba que el mail es de quien lo tiene.
  'POST /api/auth/invitacion': 'publico',
  'POST /api/auth/invitacion/cuenta': 'publico',
  // Recuperar la contraseña (hist. §105): quien la pide no puede entrar. El
  // enlace del mail es el que prueba que la cuenta es suya.
  'POST /api/auth/recuperar': 'publico',
  'POST /api/auth/restablecer/enlace': 'publico',
  'POST /api/auth/restablecer': 'publico',
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
  'POST /api/listas-precios': 'admin',
  'PATCH /api/listas-precios/:id': 'admin',
  'GET /api/depositos': 'ambos',
  'POST /api/depositos': 'admin',
  'PATCH /api/depositos/:id': 'admin',
  'GET /api/productos': 'ambos',
  'POST /api/productos': 'admin',
  'PATCH /api/productos/:id': 'admin',
  'POST /api/productos/bulk': 'admin',
  'GET /api/productos/:id/movimientos': 'ambos',
  'GET /api/productos/:id/atributos': 'ambos',
  'POST /api/productos/:id/atributos': 'admin',
  'PATCH /api/productos/:id/atributos/:atributoId': 'admin',
  'DELETE /api/productos/:id/atributos/:atributoId': 'admin',
  'POST /api/productos/:id/atributos/:atributoId/valores': 'admin',
  'DELETE /api/productos/:id/atributos/:atributoId/valores/:valorId': 'admin',
  'GET /api/productos/:id/variantes': 'ambos',
  'POST /api/productos/:id/variantes': 'admin',
  'PATCH /api/productos/:id/variantes/:varianteId': 'admin',
  'GET /api/productos/:id/variantes/:varianteId/movimientos': 'ambos',
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
  'GET /api/trabajos': 'ambos',
  'GET /api/trabajos/responsables': 'ambos',
  'GET /api/trabajos/:id': 'ambos',
  'POST /api/trabajos': 'ambos',
  'PUT /api/trabajos/:id': 'ambos',
  'PATCH /api/trabajos/:id/estado': 'ambos',
  'POST /api/trabajos/:id/terminar': 'ambos',
  'GET /api/abonos': 'ambos',
  'GET /api/abonos/:id': 'ambos',
  'POST /api/abonos': 'admin',
  'PATCH /api/abonos/:id': 'admin',
  'POST /api/abonos/:id/cobros': 'ambos',
  // Consultas (hist. §89): atender y seguir consultas es de los dos roles;
  // las etapas del embudo se editan en Configuración, que es del admin.
  'GET /api/crm/etapas': 'ambos',
  'POST /api/crm/etapas': 'admin',
  'PUT /api/crm/etapas/:id': 'admin',
  'PATCH /api/crm/etapas/orden': 'admin',
  'GET /api/crm/origenes': 'ambos',
  'GET /api/crm/oportunidades': 'ambos',
  'GET /api/crm/oportunidades/:id': 'ambos',
  'POST /api/crm/oportunidades': 'ambos',
  'PUT /api/crm/oportunidades/:id': 'ambos',
  'PATCH /api/crm/oportunidades/:id/etapa': 'ambos',
  'POST /api/crm/oportunidades/:id/cerrar': 'ambos',
  'POST /api/crm/oportunidades/:id/reabrir': 'ambos',
  'POST /api/crm/oportunidades/:id/cliente': 'ambos',
  'GET /api/crm/actividades': 'ambos',
  'POST /api/crm/actividades': 'ambos',
  'PATCH /api/crm/actividades/:id': 'ambos',
  'DELETE /api/crm/actividades/:id': 'ambos',
  'GET /api/crm/para-hoy': 'ambos',
  'GET /api/crm/inactivos': 'ambos',
  'GET /api/crm/reporte': 'ambos',
  'GET /api/turnos-caja': 'ambos',
  'GET /api/turnos-caja/:id': 'ambos',
  'POST /api/turnos-caja': 'ambos',
  'POST /api/turnos-caja/:id/cerrar': 'ambos',
  'GET /api/pos/catalogo': 'ambos',
  'POST /api/pos/ventas': 'ambos',
  'GET /api/planes-socio': 'ambos',
  'POST /api/planes-socio': 'admin',
  'PATCH /api/planes-socio/:id': 'admin',
  'GET /api/descuentos-socio': 'ambos',
  'POST /api/descuentos-socio': 'admin',
  'PATCH /api/descuentos-socio/:id': 'admin',
  'GET /api/socios': 'ambos',
  'GET /api/socios/ingresos': 'ambos',
  'GET /api/socios/:id': 'ambos',
  'POST /api/socios/cotizacion': 'ambos',
  'POST /api/socios': 'ambos',
  'PATCH /api/socios/:id': 'ambos',
  'POST /api/socios/:id/planes': 'ambos',
  'PATCH /api/socios/:id/planes/:inscripcionId': 'ambos',
  'POST /api/socios/:id/cobros': 'ambos',
  'POST /api/socios/:id/ingresos': 'ambos',
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
  'POST /api/categorias-gasto': 'admin',
  'PATCH /api/categorias-gasto/:id': 'admin',
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
  // El mail de la cuenta propia (hist. §102).
  'POST /api/auth/email': 'ambos',
  'POST /api/auth/email/reenviar': 'ambos',
  // Las invitaciones que recibió la cuenta (hist. §104): son de la persona, no
  // de un negocio, y también las alcanza una sesión sin negocio.
  'GET /api/auth/invitaciones': 'ambos',
  'POST /api/auth/invitaciones/:id/aceptar': 'ambos',
  'POST /api/auth/invitaciones/:id/rechazar': 'ambos',
  'POST /api/auth/invitacion/aceptar': 'ambos',
  'GET /api/usuarios': 'admin',
  // Invitar reemplaza al alta de empleados con usuario y contraseña (hist. §104).
  'GET /api/invitaciones': 'admin',
  'POST /api/invitaciones': 'admin',
  'POST /api/invitaciones/:id/reenviar': 'admin',
  'POST /api/invitaciones/:id/cancelar': 'admin',
  'PATCH /api/usuarios/:id': 'admin',
  'POST /api/usuarios/:id/resetear-password': 'admin',
  'GET /api/negocio': 'ambos',
  'GET /api/negocio/primeros-pasos': 'admin',
  'PUT /api/negocio': 'admin',
  // Varios negocios por cuenta (hist. §77): ver los suyos y cambiar es de los
  // dos roles. Crear otro negocio es del admin, pero el control va adentro y no
  // como soloAdmin: una cuenta sin negocio crea el suyo (hist. §104).
  'GET /api/negocios': 'ambos',
  'POST /api/negocios': 'ambos',
  'POST /api/negocios/:id/entrar': 'ambos'
};
