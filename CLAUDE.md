# Nexo — Instrucciones para Claude Code

## Contexto
Nexo es un sistema de gestión integral para PyMEs y emprendimientos, con
visión a futuro de interfaz conversacional por voz. Nació como proyecto de
escuela, desarrollado por dos integrantes (Santino Solla y Joaquin Tosi), pero
esa procedencia no recorta el objetivo: se construye con el estándar de un
producto real, pensado para que un comercio lo use en serio y para competir
con los sistemas de gestión que ya existen en el mercado argentino (referencias
de competencia: Dux Software, Contagram — ver `docs/competencia.txt` y §37).
"Es un proyecto de escuela" dejó de ser, por decisión del equipo, una razón
válida para recortar alcance o proponer una versión mínima de algo: la única
restricción real es de costo (evitar dependencias pagas o infraestructura
cara), nunca de ambición. Ante dos formas de resolver lo mismo, se elige la más
económica, no la más chica.

Centraliza productos, stock, precios, clientes, proveedores, compras, ventas,
presupuestos, cuentas corrientes, tesorería, gastos y facturación, con visión
de crecer hacia multi-empresa, punto de venta, facturación fiscal electrónica
(ARCA), integraciones con canales de venta (Mercado Libre, Tienda Nube) y una
interfaz conversacional operable por texto y voz.

## Estado real del sistema (evitar asumir el alcance viejo)
El núcleo funcional descripto en §1–§27 **ya está construido y en uso**, no es
una aspiración: productos con variantes (atributos + combinaciones), stock por
depósito con movimientos trazables, multidepósito con transferencias, compras
con costo promedio ponderado y prorrateo de costos, ventas y presupuestos con
listas de precios, cuentas corrientes de cliente y proveedor con vencimientos y
aging, tesorería, gastos, facturación de monto simple, devoluciones (de venta y
a proveedor) con nota de crédito, reportes y dashboard, dos roles (admin/
empleado) con filtrado de campos sensibles en el backend, auditoría completa
(incluido login/logout), y un asistente por texto que interpreta lenguaje
natural con Gemini y propone operaciones para confirmación humana.

Antes de asumir que algo "queda para después", revisar §38 (roadmap) y, si hay
duda, `handoff.md` (en la raíz del repo, no en `docs/`) o el grafo del MCP
`codebase-memory-mcp` — no volver a suponer el alcance de un V1/V2 viejo que ya
no aplica.

## Reglas de negocio acordadas
- V1 (el núcleo descripto en §1–§27) está completo y funcionando de punta a
  punta: productos/inventario, precios y facturación de monto simple ya no son
  una etapa futura. Las decisiones de arquitectura que siguen (§28 en
  adelante) son las que definen las próximas etapas reales del proyecto.
- **IVA entra al modelo** (corrige la decisión anterior de dejarlo fuera):
  el cliente/producto va a tener una categoría fiscal elegible por el usuario,
  y las operaciones (venta, compra, presupuesto) van a discriminar IVA por
  renglón. Ver §16 y §33. Los placeholders `IVA_ALICUOTA` y
  `RETENCION_MP_EJEMPLO` del prototipo dejan de ser código muerto y pasan a
  ser la base de esa implementación — no se borran, se completan cuando se
  planifique esa etapa con el equipo. La retención de Mercado Pago sigue sin
  resolverse y se planifica aparte.
- App móvil: se resuelve como **PWA** (la misma web, instalable, con soporte
  offline básico), no como app nativa en tiendas. Ver §31.
- Frontend: se mantiene **vanilla sin framework**, pero modularizado por
  dominio a medida que crece. Ver §31.
- Multi-empresa: Nexo es **multi-tenant** (varios negocios sobre la misma
  instalación, con sus datos aislados). Ver §28 — el aislamiento por empresa
  ya está implementado en todo el esquema y el backend; falta el alta de
  empresas desde la aplicación.
- Adaptación a rubros (comercio, carnicería, gastronomía, etc.): **un solo
  sistema configurable** por perfil de rubro, nunca versiones de código
  separadas por vertical. Ver §29.
- Base de datos: se sigue con SQLite, preparando el código para poder migrar a
  Postgres cuando haga falta soportar múltiples negocios en producción
  concurrente. Ver §34.

## Reglas de negocio a confirmar (no inventar)
- Alcance y prioridad exacta de cada etapa del roadmap (§38) al momento de
  planificarla con el equipo.
- Alícuotas de IVA aplicables y tratamiento de la retención de Mercado Pago
  (§16, §33).

## Stack técnico
- Backend: Node.js 22+ (requerido por `node:sqlite`) + Express.
- Base de datos: SQLite vía `node:sqlite` (`DatabaseSync`), sin ORM ni driver
  externo. SQL crudo. Ver §34 para la regla de portabilidad hacia Postgres.
- Dependencias de producción reales: `express` y `@google/genai` (asistente
  IA). Nada más — evitar sumar dependencias salvo necesidad concreta,
  coherente con la restricción de costo/complejidad del proyecto.
- Frontend: HTML, CSS y JavaScript vanilla, sin framework ni build step. Ver
  §31 para la evolución hacia módulos ES y PWA.

## Estructura del repositorio
```
/frontend   → UI (index.html, css/, js/, incluye js/vendor/ para libs client-side)
/backend    → servidor Express, esquema (db/schema.sql), acceso a datos
              (db/index.js), permisos.js, interprete.js, test/
/docs       → documentación técnica y análisis del proyecto
/desing     → mockups y diseño visual
/assets     → imágenes, íconos y recursos estáticos
handoff.md  → bitácora de sesión, vive en la raíz del repo (no en /docs)
```

## Herramientas disponibles
- El proyecto está indexado en el MCP `codebase-memory-mcp` (grafo de
  código: funciones, tablas, endpoints y sus relaciones). Usarlo para
  explorar la arquitectura real del código en vez de re-leer archivos o
  pedirle contexto al usuario. Visualizador del grafo corriendo en
  `http://127.0.0.1:9749`. Sigue vigente mantener `handoff.md` (raíz del
  repo): el grafo cubre la estructura del código, no las decisiones de
  negocio ni el estado narrativo de la sesión anterior.

## Reglas de desarrollo
- No inventar reglas de negocio ambiguas: preguntar.
- Trabajar por etapas chicas y testeables.
- Diseño responsive y mobile-first desde el inicio (ver §31).
- Movimientos de datos auditables (quién/cuándo, no solo el estado final).
- No pushear directo a `main`: rama por feature (`feature/<nombre>`) +
  Pull Request. `main` siempre debe quedar en estado funcional.
- Antes de cambiar el esquema de la base de datos, explicar la migración y
  su impacto (ver el patrón de migración idempotente en §34).
- Preferir siempre la solución más económica que cumpla el requisito completo
  (menos dependencias, menos infraestructura) antes que una versión recortada
  del requisito.
- **Es obligatorio mantener `handoff.md` (raíz del repo) actualizado al
  terminar cada sesión de trabajo** (o cada etapa importante dentro de una
  sesión larga): qué se hizo, en qué archivos, qué se intentó y no funcionó, y
  qué sigue. El objetivo es que la próxima sesión pueda retomar el
  proyecto leyendo ese único archivo, con el contexto necesario y sin
  tener que re-explorar el código ni volver a gastar tokens re-derivando
  algo que ya se sabía. Que sea conciso: información necesaria para
  retomar, no un registro exhaustivo de todo lo que pasó.
- **La numeración de secciones (§1 en adelante) es estable y no se
  renumera.** El código (`server.js`, `schema.sql`, `db/index.js`, `app.js`)
  cita este documento por número de sección en decenas de comentarios, y
  `handoff.md` hace lo mismo. Corregir o ampliar el contenido de una sección
  existente es normal; cambiarle el número, fusionarla o reordenarla rompe esas
  referencias y no debe hacerse. Las secciones nuevas se agregan siempre al
  final, con el siguiente número disponible.

# NEXO — CONTEXTO Y REGLAS DEL PROYECTO

## 1. Descripción general

Nexo es un sistema integral de gestión para pequeñas y medianas empresas (pymes).

El objetivo es centralizar y conectar en una única plataforma las principales operaciones de un negocio:

- Productos
- Stock
- Compras
- Ventas
- Clientes
- Proveedores
- Costos
- Caja y tesorería
- Cuentas corrientes
- Gastos
- Presupuestos
- Facturación
- Reportes y dashboards
- Automatizaciones
- Operaciones mediante texto/audio
- Inteligencia artificial

Nexo NO debe ser entendido como un conjunto de módulos independientes.

La característica principal del sistema es que las operaciones están relacionadas entre sí y generan efectos automáticos en otras áreas.

Ejemplo:

Una venta confirmada debe poder:
1. registrar la venta;
2. registrar sus productos y cantidades;
3. descontar stock;
4. tomar el costo correspondiente al momento de la venta;
5. calcular margen y ganancia;
6. registrar el cobro;
7. actualizar la cuenta corriente del cliente si corresponde;
8. actualizar la tesorería;
9. asociar/generar el comprobante correspondiente;
10. registrar auditoría.

La misma lógica debe aplicarse a compras, devoluciones, ajustes y demás operaciones.

---

# 2. PRINCIPIO FUNDAMENTAL DE ARQUITECTURA

Antes de crear cualquier tabla, modelo, endpoint o funcionalidad, analizar:

- qué entidad representa;
- qué operación representa;
- con qué entidades se relaciona;
- qué información necesita;
- qué información modifica;
- qué otras áreas del sistema deben actualizarse;
- qué historial debe conservarse.

No crear tablas aisladas solamente porque una pantalla las necesita.

La base de datos debe representar correctamente el funcionamiento real de un negocio.

Priorizar:

- integridad referencial;
- consistencia de datos;
- trazabilidad;
- normalización razonable;
- escalabilidad;
- claridad;
- mantenibilidad.

---

# 3. ENTIDADES PRINCIPALES

El sistema debe contemplar, como mínimo, las siguientes entidades conceptuales.

## Maestros

- Usuario
- Cliente
- Proveedor
- Producto
- Categoría
- Subcategoría
- Marca
- Unidad de medida
- Depósito
- Lista de precios
- Método de pago
- Cuenta de tesorería
- Categoría de gasto

## Operaciones

- Venta
- Detalle de venta
- Compra
- Detalle de compra
- Presupuesto
- Detalle de presupuesto
- Gasto
- Cobro
- Pago
- Movimiento de stock
- Ajuste de stock
- Transferencia de stock
- Devolución

## Finanzas

- Movimiento de tesorería
- Cuenta corriente de cliente
- Cuenta corriente de proveedor
- Movimiento de cuenta corriente

## Facturación

- Comprobante
- Factura
- Nota de crédito
- Nota de débito
- Datos fiscales
- Punto de venta

## IA / automatización

- Mensaje
- Audio
- Transcripción
- Operación interpretada
- Confirmación
- Registro de automatización

## Auditoría

- Registro de auditoría

---

# 4. PRODUCTOS

Un producto puede tener:

- id
- nombre
- descripción
- SKU
- código de barras
- categoría
- subcategoría
- marca
- unidad de medida (incluye unidades fraccionables/decimales para venta por
  peso o volumen — ej. kg, gramos, litros — necesarias para rubros como
  carnicería o verdulería; ver §29)
- condición frente al IVA / categoría fiscal (determina si el producto se
  factura gravado, exento o no alcanzado; ver §16, §33)
- tipo: producto/servicio
- activo/inactivo
- maneja stock
- stock mínimo
- stock máximo
- proveedor principal
- costo actual
- costo promedio
- último costo
- precio de venta
- margen objetivo
- markup objetivo
- imagen
- observaciones

No almacenar información derivada innecesariamente si puede calcularse de manera confiable.

Cuando sea necesario guardar un valor histórico, conservarlo en la operación correspondiente.

Implementado hoy: productos con atributos y variantes (combinaciones
vendibles con su propio SKU y precio por lista), categorías, listas de
precios, margen objetivo con alerta. Unidad de medida fraccionable y
condición fiscal son las ampliaciones pendientes (§29, §33).

---

# 5. STOCK

El stock debe manejarse por producto y depósito.

No asumir que un producto tiene un único stock global.

Conceptualmente:

Producto
→ Stock por depósito
→ Movimientos de stock

Cada movimiento de stock debe permitir conocer:

- producto
- depósito
- tipo de movimiento
- cantidad
- stock anterior
- stock posterior
- costo unitario cuando corresponda
- fecha
- usuario
- operación relacionada
- motivo

Tipos posibles:

- compra
- venta
- devolución de venta
- devolución a proveedor
- ajuste positivo
- ajuste negativo
- transferencia entrada
- transferencia salida
- merma
- producción
- consumo

IMPORTANTE:

Nunca modificar stock sin dejar trazabilidad del movimiento que provocó el cambio.

---

# 6. COMPRAS

Una compra tiene una cabecera y múltiples detalles.

Compra:

- proveedor
- fecha
- comprobante
- subtotal
- descuentos
- impuestos
- costos adicionales
- total
- estado
- estado de pago
- observaciones
- usuario

Detalle de compra:

- producto
- cantidad
- costo unitario
- descuento
- impuestos
- subtotal
- costos adicionales asignados
- costo real unitario

Una compra confirmada puede:

- aumentar stock;
- actualizar costos;
- generar deuda con proveedor;
- generar un pago;
- modificar tesorería.

Implementado hoy: cabecera y detalle, costo promedio ponderado, prorrateo de
costo de envío (ver §7), ciclo borrador → activa → anulada en paralelo al
estado de envío (pedido → en camino → recibido, el stock sube solo al
recibir). El campo "impuestos" listado arriba es la base sobre la que se
implementa IVA discriminado por renglón cuando se planifique esa etapa (§16,
§33) — hoy no se calcula.

---

# 7. COSTOS

El costo de un producto no debe limitarse al precio indicado por el proveedor.

El costo real puede incluir:

- precio de compra;
- envío;
- embalaje;
- comisiones;
- otros costos directos relacionados.

Cuando una compra contiene diferentes productos y existen costos compartidos, inicialmente se utilizará:

PRORRATEO POR VALOR DEL ÍTEM.

Ejemplo conceptual:

Producto A = $80.000
Producto B = $20.000
Subtotal = $100.000

Si el envío cuesta $10.000:

Producto A absorbe 80% = $8.000
Producto B absorbe 20% = $2.000

El costo real unitario debe reflejar esa distribución.

Para actualizar el costo histórico del inventario se utilizará como criterio principal:

COSTO PROMEDIO PONDERADO.

No sobrescribir indiscriminadamente el historial de costos.

---

# 8. VENTAS

Una venta tiene:

- cliente
- fecha
- vendedor/usuario
- lista de precios
- subtotal
- descuento
- impuestos
- total
- estado
- estado de cobro
- observaciones

Cada detalle de venta contiene:

- producto
- cantidad
- precio unitario
- descuento
- impuesto
- subtotal
- costo unitario histórico
- ganancia
- margen

IMPORTANTE:

Al confirmar una venta se debe conservar el costo utilizado en ese momento.

No recalcular posteriormente la rentabilidad histórica usando el costo actual del producto.

Implementado hoy: cabecera y detalle con costo histórico congelado, margen y
ganancia por renglón, lista de precios y depósito de origen (con fallback al
predeterminado), condición de pago y vencimiento para aging real. Vendedor
identificado por usuario existe (hay login y roles, ver §35), pero el reporte
"ventas por vendedor" todavía no está construido (§20). El
campo "impuestos" es la misma base pendiente que en §6 (ver §16, §33).

---

# 9. COBROS

Una venta puede tener múltiples cobros.

Ejemplo:

Venta = $100.000

Cobros:
- $50.000 efectivo
- $30.000 transferencia
- $20.000 Mercado Pago

Por lo tanto:

Venta 1 → N Cobros

Cada cobro debe guardar:

- venta
- cliente
- fecha
- importe
- medio de pago
- cuenta de tesorería
- usuario
- observación

---

# 10. CLIENTES

Un cliente puede contener:

- nombre
- apellido
- razón social
- DNI
- CUIT
- condición frente al IVA
- email
- teléfono
- dirección
- localidad
- provincia
- código postal
- estado
- límite de crédito
- observaciones

Debe poder relacionarse con:

- ventas;
- cobros;
- facturas;
- presupuestos;
- cuenta corriente.

Los datos como total comprado, cantidad de compras, última compra, etc. deben considerarse datos calculados salvo que exista una razón técnica clara para persistirlos.

Implementado hoy: ficha de cliente con condición de pago habitual y cuenta
corriente con saldo reconstruido desde los movimientos (§12). El campo
"condición frente al IVA" existe como dato pero todavía es informativo; al
implementar IVA (§16, §33) pasa a determinar qué tipo de comprobante se le
puede emitir a ese cliente.

---

# 11. PROVEEDORES

Un proveedor debe poder relacionarse con:

- compras;
- pagos;
- cuenta corriente;
- productos;
- comprobantes.

Datos principales:

- nombre/razón social
- CUIT
- condición IVA
- email
- teléfono
- dirección
- contacto
- estado
- observaciones

---

# 12. CUENTAS CORRIENTES

Debe existir una cuenta corriente para clientes y proveedores.

## Cliente

Venta a crédito:
→ aumenta deuda.

Cobro:
→ disminuye deuda.

## Proveedor

Compra a crédito:
→ aumenta deuda.

Pago:
→ disminuye deuda.

Los movimientos deben ser trazables.

Ejemplo:

Cliente:
Venta $100.000
Cobro $60.000
Saldo $40.000

No depender exclusivamente de un campo "saldo" editable manualmente.

El saldo debe poder reconstruirse a partir de los movimientos.

---

# 13. TESORERÍA

La tesorería representa dónde está el dinero.

Puede incluir:

- efectivo
- banco
- Mercado Pago
- otras cuentas

Una cuenta de tesorería debe permitir registrar:

- saldo inicial;
- movimientos;
- ingresos;
- egresos;
- transferencias.

Una venta NO significa automáticamente dinero cobrado.

Separar:

VENTA
de
COBRO
de
MOVIMIENTO DE TESORERÍA.

Esto es fundamental.

---

# 14. GASTOS

Los gastos son diferentes de las compras de mercadería.

Ejemplos:

- alquiler
- servicios
- publicidad
- mantenimiento
- combustible
- impuestos
- sueldos

Un gasto debe poder tener:

- categoría
- subcategoría
- fecha
- importe
- impuestos
- proveedor opcional
- medio de pago
- cuenta de tesorería
- descripción
- comprobante
- usuario

---

# 15. PRESUPUESTOS

Un presupuesto puede tener:

- cliente
- fecha
- vencimiento
- productos
- cantidades
- precios
- descuentos
- impuestos
- total
- estado

Estados posibles:

- borrador
- enviado
- aceptado
- rechazado
- vencido
- convertido en venta

Un presupuesto NO debe modificar stock.

Puede convertirse posteriormente en una venta.

Implementado hoy: cabecera y detalle multi-ítem con variante de producto,
estados borrador/enviado/aceptado/rechazado/convertido ("vencido" se calcula
comparando `vencimiento` contra hoy, no es un estado persistido), conversión a
venta que congela costos y deja el vínculo `venta_id`. "Impuestos" es la misma
base pendiente de IVA que en §6/§8 (ver §16, §33).

---

# 16. FACTURACIÓN

La venta y la factura son conceptos diferentes.

Venta:
representa la operación comercial.

Factura:
representa el comprobante fiscal.

Una venta puede tener asociado un comprobante.

La arquitectura debe quedar preparada para integración con ARCA.

Datos posibles:

- tipo de comprobante
- letra
- punto de venta
- número
- fecha
- cliente
- CUIT
- condición IVA
- subtotal
- IVA
- otros impuestos
- total
- CAE
- vencimiento CAE
- estado
- respuesta del organismo
- fecha de emisión

Implementado hoy: comprobante con tipo (factura/nota de crédito/nota de
débito), letra, punto de venta y número correlativo garantizado por índice
único (por punto de venta + tipo + letra) — la numeración está lista, pero
**sin IVA calculado y sin conexión real a ARCA todavía**: hoy es monto simple
(`neto = total`) y el comprobante no tiene CAE real.

Esto deja de ser una decisión definitiva y pasa a ser el orden de trabajo real
(corrige la frase anterior "puede desarrollarse progresivamente", que sonaba
opcional):

1. **IVA discriminado por renglón** (§33): alícuota e importe de IVA en cada
   ítem de venta/compra/presupuesto, y categoría fiscal en cliente y producto
   que determina qué letra de comprobante corresponde. Sin esto no se puede
   emitir una factura A válida.
2. **Integración con ARCA** (§33): ambiente de homologación antes que
   producción, certificado y credenciales por empresa (o por punto de venta),
   obtención real de CAE y su vencimiento, y la regla de que una venta sin CAE
   no se presenta como facturada ante el organismo.

Ninguna de las dos etapas se arranca sin planificarla explícitamente con el
equipo (ver §27, §38).

---

# 17. NOTAS DE CRÉDITO Y DÉBITO

Deben poder relacionarse con el comprobante/venta original.

Una nota de crédito puede:

- reducir el importe;
- generar devolución;
- afectar stock cuando corresponda.

Una nota de débito puede aumentar el importe correspondiente.

La arquitectura debe permitir definir explícitamente si una operación afecta stock.

---

# 18. LISTAS DE PRECIOS

Debe ser posible manejar diferentes precios para un mismo producto.

Ejemplo:

Producto X:

Minorista → $20.000
Mayorista → $17.000
Tarjeta → $21.000

La estructura debería separar:

Lista de precios
de
Precio del producto en esa lista.

---

# 19. MULTIDEPÓSITO

La arquitectura debe permitir múltiples depósitos aunque inicialmente solo se implemente uno.

Stock:

Producto X
→ Depósito A = 20
→ Depósito B = 15

Debe ser posible transferir:

Depósito A
→ Depósito B

La transferencia debe generar movimientos de stock trazables.

---

# 20. REPORTES

El sistema debe poder obtener información para:

Ventas:
- por período
- por producto
- por categoría
- por cliente
- por vendedor
- facturación
- ticket promedio
- margen
- ganancia

Compras:
- por proveedor
- por producto
- por categoría
- por período

Stock:
- stock actual
- stock bajo
- sin stock
- movimientos
- rotación

Finanzas:
- ingresos
- egresos
- cobros
- pagos
- cuentas por cobrar
- cuentas por pagar

Rentabilidad:
- ventas
- costo de mercadería
- ganancia bruta
- margen
- gastos
- resultado

Ampliación (para competir con sistemas reales, ver §37):
- Ventas por vendedor/usuario.
- Rentabilidad por canal de venta, una vez que existan integraciones (§32).
- Comparativas interanuales / interperíodo (no solo contra el período
  inmediato anterior).

Implementado hoy: dashboard con resultado del período y comparación contra el
período anterior, qué se vende / qué se compra, stock a reponer y valorizado,
rotación, cuentas corrientes con aging. Las tres ampliaciones de arriba son
las que faltan (§20, §38).

---

# 21. IA Y OPERACIONES POR TEXTO/AUDIO

Una de las características diferenciales de Nexo es poder registrar operaciones utilizando lenguaje natural.

Ejemplo:

"Vendí tres remeras negras talle M a Juan por 45 mil y me pagó por Mercado Pago."

La IA debería interpretar:

operación = VENTA
cliente = Juan
producto = Remera negra M
cantidad = 3
importe = 45000
medio_pago = Mercado Pago

Pero la IA NO debe modificar directamente la base de datos.

Flujo:

1. recibir mensaje/audio;
2. transcribir audio si corresponde;
3. interpretar intención;
4. extraer entidades;
5. validar datos;
6. mostrar operación propuesta;
7. pedir confirmación cuando corresponda;
8. ejecutar operación;
9. registrar auditoría.

La IA es una capa de interpretación, no la fuente de verdad de los datos.

---

# 22. AUDITORÍA

Las operaciones importantes deben ser auditables.

Registrar:

- usuario
- fecha
- acción
- entidad
- ID de entidad
- valor anterior cuando corresponda
- valor nuevo cuando corresponda
- operación relacionada

Ejemplo:

Usuario X
→ modificó stock
→ Producto Y
→ 20 a 15
→ motivo: venta #152

---

# 23. REGLA DE INTEGRIDAD

Las operaciones deben ejecutarse como transacciones cuando impliquen múltiples cambios relacionados.

Ejemplo:

Confirmar venta:

1. validar stock;
2. crear venta;
3. crear detalles;
4. registrar costo histórico;
5. descontar stock;
6. crear movimiento de stock;
7. registrar cobro;
8. registrar tesorería;
9. actualizar cuenta corriente si corresponde;
10. asociar comprobante;
11. registrar auditoría.

Si uno de los pasos críticos falla, evitar dejar el sistema en un estado parcialmente actualizado.

---

# 24. REGLAS DE DESARROLLO

Antes de implementar una funcionalidad:

1. entender el requerimiento;
2. revisar modelos existentes;
3. revisar relaciones existentes;
4. revisar migraciones;
5. evitar duplicar entidades;
6. analizar impacto sobre otras áreas;
7. proponer cambios;
8. implementar;
9. probar;
10. documentar.

NO modificar arquitectura importante sin explicar primero qué se cambia y por qué.

NO eliminar datos o tablas existentes sin verificar dependencias.

NO crear soluciones temporales que contradigan el modelo de negocio.

Priorizar soluciones simples, mantenibles y escalables.

---

# 25. PRINCIPIO DE MVP

Nexo debe tener un MVP realista.

Prioridad inicial:

1. Productos
2. Stock
3. Compras
4. Ventas
5. Clientes
6. Costos
7. Márgenes
8. Caja básica
9. Dashboard
10. Operaciones por texto

Luego:

- audio
- IA avanzada
- WhatsApp
- ARCA
- multidépósito avanzado
- reportes avanzados
- otras integraciones.

**Este MVP está completo** (verificado: las 10 etapas de arriba tienen
implementación funcionando, incluido "operaciones por texto" con el asistente
IA). El "luego" de arriba ya no es la lista completa de lo que sigue: fue
reemplazado y ampliado por el roadmap de §38, que agrega multi-empresa, POS,
IVA, perfiles de rubro e integraciones concretas (Mercado Libre, Tienda Nube).

La existencia de una funcionalidad en este documento NO significa que deba implementarse inmediatamente.

Primero debe existir una arquitectura que permita crecer sin romper el núcleo.

---

# 26. DIFERENCIAL DEL PRODUCTO

Nexo no busca ser simplemente otro sistema de gestión.

La propuesta diferencial es:

GESTIÓN INTEGRADA
+
AUTOMATIZACIÓN
+
INTERFAZ CONVERSACIONAL
+
IA OPERATIVA

La IA debe resolver problemas concretos y no agregarse únicamente por ser una tecnología de moda.

---

# 27. REGLA PARA CLAUDE

Antes de tomar decisiones importantes de arquitectura, explicar:

- qué se quiere hacer;
- qué entidades intervienen;
- qué relaciones existen;
- qué datos se modifican;
- qué consecuencias tiene;
- qué alternativa se descartó y por qué.

Si existe una contradicción entre una nueva petición y este documento, señalarla antes de implementar.

Si falta información importante, no inventarla silenciosamente.

Preguntar o proponer alternativas explícitas.

La prioridad es construir un sistema coherente, no simplemente hacer que una pantalla funcione.

Esta regla se aplica igual a las secciones §28 en adelante: son decisiones de
arquitectura ya tomadas con el equipo (multi-empresa, rubros, PWA, IVA,
integraciones, ARCA), no una lista de tareas para implementar sin planificar
cada una. Antes de tocar alguna, releerla completa — no asumir el resumen.

---

# 28. MULTI-EMPRESA (MULTI-TENANT)

Nexo es un sistema multi-tenant: la misma instalación sirve a varios negocios
("empresas" u "organizaciones"), cada uno con sus datos completamente
aislados. Es requisito para poder ofrecer Nexo a más de un cliente sin montar
una instancia por negocio.

**Estado real: aislamiento implementado, alta de empresas pendiente.**
- Todas las tablas de datos de negocio tienen `organizacion_id`, y toda
  consulta filtra por la empresa de la sesión.
  - Las tablas hijas (ítems, cobros, pagos, atributos/variantes) heredan la
    empresa de su fila padre.
  - Los catálogos (categorías, listas de precios, depósitos, cuentas de
    tesorería, categorías de gasto) son propios de cada empresa, con nombre
    único dentro de ella.
- Lo que falta:
  - crear empresas desde la aplicación (hoy se dan de alta a mano en la base);
  - pasar `organizacion_id` a `NOT NULL` en las tablas que la sumaron nullable.
- Detalle de cada paso y decisiones tomadas: `handoff.md` y
  `docs/handoff-historico.md` (§37–§49).

Diseño que se siguió (y que rige para toda tabla o consulta nueva):

- Toda tabla de datos de negocio (no los catálogos técnicos del sistema en sí)
  agrega `organizacion_id` con FK a `organizaciones`.
- La empresa activa se resuelve desde la sesión del usuario autenticado, nunca
  desde un parámetro que el cliente pueda manipular.
- Ninguna consulta puede cruzar datos de dos empresas. Esto es una regla de
  integridad, no una preferencia: un error acá es una fuga de datos entre
  clientes de Nexo.
- Un usuario puede pertenecer a una empresa (caso simple) o eventualmente a
  varias con cambio de contexto (caso multi-sucursal de un mismo dueño) — a
  definir con el equipo antes de implementar la segunda variante.
- Suscripciones/planes por empresa (qué módulos tiene activos, límites de uso)
  se apoyan en esta misma columna, pero son una etapa aparte.

No confundir con §19 (multidepósito): un depósito es una ubicación física
dentro de una misma empresa; una empresa es un negocio/cliente de Nexo
completo, con sus propios depósitos, productos, usuarios y todo lo demás.

---

# 29. PERFILES DE RUBRO Y MÓDULOS ACTIVABLES

Nexo tiene que poder adaptarse a distintos tipos de comercio (comercio
general, carnicería/fiambrería, verdulería, kiosco/almacén, indumentaria,
gastronomía, ferretería, servicios) sin fragmentar el desarrollo.

**Decisión de arquitectura: un solo sistema configurable, nunca versiones de
código separadas por rubro.** Un "perfil de rubro" es un preset de
configuración por empresa, no una bifurcación de la aplicación:

- Qué unidad de medida por defecto usa el catálogo (unidad, kg, litro) y si
  permite cantidades fraccionarias (ver §4).
- Qué módulos aparecen activos para esa empresa (por ejemplo, un kiosco no
  necesita el circuito de presupuestos; una carnicería probablemente no
  necesita variantes de producto por talle).
- Terminología de la UI cuando cambia el vocabulario del rubro (opcional, no
  prioritario).

Regla que no admite excepciones: **nunca escribir `if (rubro === 'carniceria')`
con lógica de negocio distinta adentro.** El rubro configura datos y activa/
desactiva módulos existentes; no crea caminos de código paralelos. Si un rubro
necesita una funcionalidad genuinamente distinta (por ejemplo, producción con
receta/insumos en gastronomía), esa funcionalidad se diseña como un módulo
nuevo y reusable, disponible para cualquier empresa que lo necesite, no como
una rama exclusiva de un rubro.

El comercio general (el que ya está construido) es el primer perfil y sigue
siendo el foco hasta que el núcleo esté maduro (§38).

---

# 30. PUNTO DE VENTA (POS) Y TURNO DE CAJA

Falta hoy y es, en la práctica, lo más usado de un sistema de gestión de
comercio: una pantalla de mostrador rápida para vender parado frente al
cliente, distinta de la pantalla de "alta de venta" administrativa que ya
existe.

Conceptos que intervienen:

- **Venta rápida**: buscar producto por código de barras (lector físico o
  cámara en PWA, ver §31) o por nombre, sin necesitar cliente cargado,
  cobrar y cerrar en pocos pasos. Reusa la lógica de ventas y cobros ya
  existente (§8, §9) — el POS es una interfaz, no un circuito de datos nuevo.
- **Turno de caja**: apertura con monto inicial, cierre con arqueo (efectivo
  contado vs. esperado según movimientos del turno) y diferencia registrada.
  Se relaciona con tesorería (§13): un turno pertenece a una cuenta de
  tesorería (normalmente "Efectivo") y a un usuario/operador.
- **Cobro mixto**: dividir el cobro de una venta entre varios medios de pago
  en el momento (ya existe la relación venta → N cobros en §9; el POS solo
  necesita una interfaz rápida para cargarlos).

No modifica el modelo de ventas ni de cobros: es una superficie de uso nueva
sobre datos que ya existen. Ver §38 para cuándo se planifica.

---

# 31. FRONTEND, PWA Y ARQUITECTURA DE CLIENTE

**Decisión de arquitectura: seguir sin framework, pero modularizar.**
`frontend/js/app.js` concentra hoy toda la lógica de todas las pantallas en un
solo archivo. A medida que el sistema crece (multi-empresa, POS, perfiles de
rubro), eso deja de ser sostenible. El camino es dividirlo en módulos ES por
dominio (ventas, compras, stock, clientes, etc.), conservando los patrones que
ya funcionan bien y están probados en producción: el router por hash
(`mostrarVista`), `crearFiltros` (motor de filtros), `confirmar` (reemplazo de
`window.confirm`), `crearSeleccion` + `montarBarraSeleccion` (selección
múltiple y acciones en lote), `avisar` (toasts), `descargarCSV` y
`armarHojaComprobante`/`cargarLibsPdf` (impresión y PDF). No se reescriben
estos patrones desde cero: se les da un hogar modular.

**PWA (Progressive Web App)** es la forma elegida de tener "app de celular"
sin pagar cuenta de desarrollador ni mantener un código separado:

- Manifest + service worker para que sea instalable desde el navegador del
  celular (ícono en el escritorio, pantalla completa).
- Soporte offline básico: al menos poder abrir la app y ver los últimos datos
  cargados sin conexión; escribir offline con sincronización posterior es una
  ambición mayor, no un requisito de la primera versión de la PWA.
- Notificaciones (por ejemplo, alertas de stock bajo o cuentas por vencer)
  vía Web Push, sin depender de una tienda de aplicaciones.
- Acceso a cámara para lector de código de barras (relevante para POS, §30) y
  a almacenamiento local para el caso offline.

**Regla de diseño: mobile-first en toda pantalla nueva.** El sistema ya tiene
responsive real (drawer de navegación, tema claro/oscuro, layouts que se
apilan en mobile) — la pantalla nueva se diseña primero para el celular y
después se expande a desktop, no al revés.

No se descarta una futura app nativa (empaquetar la PWA con Capacitor, por
ejemplo) si en algún momento hace falta acceso nativo que la web no puede dar,
pero no es parte del alcance actual (ver §39).

---

# 32. INTEGRACIONES

Nexo tiene que poder conectarse con los canales donde el comercio ya vende o
factura, sin que cada integración reinvente su propia forma de escribir datos.

Modelo común para toda integración, sin excepción:

- Credenciales/tokens de la integración guardados por empresa (ver §28), nunca
  compartidos entre negocios.
- Sincronización idempotente: volver a correr una sincronización no debe
  duplicar ventas, productos ni movimientos.
- Log de sincronización propio (qué se sincronizó, cuándo, con qué resultado)
  — es auditoría de integración, complementaria a la de §22.
- Mapeo explícito entre la entidad externa (ej. "publicación" de Mercado
  Libre) y la entidad de Nexo (`producto`/`producto_variante`), guardado en
  una tabla propia, nunca inferido por nombre o coincidencia aproximada.
- Resolución de conflictos declarada de antemano: si el stock cambia en los
  dos lados a la vez, ¿quién gana? Se decide por integración, no en el
  momento.
- **Una integración nunca escribe directo en las tablas de negocio.** Pasa por
  la misma lógica de validación y auditoría que usaría un operador desde la
  UI (mismo principio que ya rige para la IA en §21: es una capa de entrada,
  no un atajo a la base).

Catálogo de integraciones contempladas (orden de prioridad a definir en
§38): Mercado Libre (publicaciones, stock, precio, importación de ventas),
Tienda Nube (idem, e-commerce propio), Mercado Pago (cobros y conciliación,
sin confundir con la app de e-commerce), ARCA (§33, es la integración fiscal),
WhatsApp y email (notificaciones y eventualmente el canal de entrada de la
IA conversacional, ver §36).

---

# 33. FACTURACIÓN ELECTRÓNICA ARCA

Desarrolla lo que §16 deja planteado como orden de trabajo. Facturar en serio
en Argentina requiere:

- **IVA discriminado por renglón**, previo y obligatorio: alícuota (0%,
  10.5%, 21%, 27%, exento, no gravado) e importe de IVA en cada ítem de venta,
  compra y presupuesto; categoría fiscal (responsable inscripto, monotributo,
  exento, consumidor final, etc.) en cliente y producto, porque determina qué
  letra de comprobante corresponde (A, B, C) y si corresponde retener algo.
- **Ambiente de homologación antes que producción**: ARCA (ex AFIP) exige
  probar contra su ambiente de testing con datos ficticios antes de habilitar
  el ambiente real. No se apunta a producción sin haber homologado.
- **Certificado y credenciales por empresa** (o por punto de venta dentro de
  una empresa), consistente con el aislamiento de §28: cada negocio factura
  con su propio CUIT y su propio certificado, nunca con uno compartido.
- **CAE real**: número, vencimiento y respuesta del organismo persistidos tal
  cual los devuelve ARCA (los campos ya están en el esquema, ver §16); una
  venta sin CAE no se presenta como facturada ante el organismo, aunque tenga
  comprobante interno.
- **Reintentos y manejo de caída del servicio**: ARCA puede estar caído; el
  sistema tiene que poder reintentar la emisión sin duplicar el comprobante
  (mismo principio de idempotencia que §32).

Retención de Mercado Pago (mencionada en el preámbulo como pendiente) se
resuelve en la misma etapa que IVA, porque ambas dependen de tener categoría
fiscal del cliente resuelta.

---

# 34. PORTABILIDAD DE DATOS Y EVOLUCIÓN DEL ESQUEMA

**Se sigue con SQLite** (vía `node:sqlite`, sin ORM) mientras el volumen de
datos y la concurrencia de escritura lo permitan — es gratis, no requiere
infraestructura, y hoy alcanza de sobra. La condición para migrar a Postgres
es concreta, no una fecha: cuando haya múltiples empresas (§28) escribiendo
en simultáneo de forma real, porque `node:sqlite` es síncrono y una escritura
bloquea a las demás.

Para que esa migración, el día que haga falta, sea un cambio de motor y no una
reescritura del sistema:

- Preferir SQL portable: evitar funciones o sintaxis específicas de SQLite
  cuando exista un equivalente estándar razonable.
- Mantener el acceso a datos concentrado en `backend/db/` (como ya está: todo
  handler de `server.js` pasa por `db.prepare(...)`, no hay SQL disperso fuera
  de esa capa) — es lo que permite cambiar el motor sin tocar cada endpoint.
- Seguir el patrón de migración idempotente ya establecido en
  `backend/db/index.js` para cualquier cambio de esquema nuevo: aditivo
  (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN`, siempre nullable o con
  `DEFAULT`, con backfill re-ejecutable) para agregar columnas; rebuild
  completo (`DROP` de vistas dependientes → tabla nueva → `INSERT..SELECT`
  preservando ids → `DROP` + `RENAME`, todo en una transacción con
  `PRAGMA foreign_keys=OFF/ON`) solo cuando hace falta cambiar un `CHECK`, que
  SQLite no permite alterar directamente. No introducir un framework de
  migraciones nuevo sin discutirlo primero: el patrón actual es simple y ya
  probado en 12 migraciones reales.

---

# 35. SEGURIDAD Y OPERACIÓN

Lo que ya existe y hay que seguir respetando: contraseñas con scrypt (nunca
texto plano ni un hash débil), normalización NFKC antes de hashear,
comparación con tiempo constante, sesiones persistidas en tabla (no JWT, para
poder revocar de inmediato dando de baja a un usuario), cookie `httpOnly` +
`sameSite`, rate limit de intentos de login, y el filtro de campos sensibles
por nombre de clave en las respuestas para el rol empleado (costos, márgenes,
ganancia).

Pendiente para producción real, a incorporar progresivamente sin bloquear el
resto del roadmap:

- **Backups** de la base de datos (crítico apenas haya un negocio real
  operando con esto).
- **Recuperación de contraseña** sin depender de que un admin la resetee a
  mano (hoy es la única vía).
- **HTTPS** obligatorio fuera de desarrollo local.
- **Límites de tamaño/tasa de request** más allá del rate limit de login.
- **Paginación**: hoy casi ningún `GET` pagina resultados; con volumen real de
  datos (multi-empresa, POS generando muchas ventas) deja de ser opcional.

Deuda conocida y aceptada por ahora: el filtro de campos sensibles corta por
nombre de clave, así que un campo nuevo con un nombre no incluido en la lista
se expone sin querer al rol empleado — hay que agregar explícitamente a esa
lista cualquier campo nuevo que sea costo, margen o ganancia.

---

# 36. IA OPERATIVA

Amplía §21 sin contradecirlo — la regla de esa sección sigue intacta y es la
más importante de todo el módulo de IA: **la IA propone, el humano confirma,
y el módulo que interpreta lenguaje natural nunca escribe directo en la base**
(hoy `backend/interprete.js` ni siquiera importa el módulo de acceso a datos;
eso se mantiene así al extender el módulo).

Ampliaciones previstas sobre la base ya construida (interpretación de texto
con function-calling contra un esquema fijo, confirmación humana obligatoria,
auditoría con actor `asistente`):

- **Audio/voz**: transcripción antes de interpretar, mismo flujo de
  confirmación después.
- **WhatsApp** como canal de entrada, apoyado en la integración de §32.
- **Consultas en lenguaje natural sobre los datos** ("¿cuánto vendí este mes
  de remeras?"), que es lectura y no requiere confirmación porque no modifica
  nada — distinto del flujo de registrar operaciones.
- **Sugerencias proactivas**: reposición de stock bajo, productos con margen
  por debajo del objetivo, cuentas por cobrar próximas a vencer. Son
  sugerencias que el operador revisa, no acciones automáticas.

---

# 37. QUÉ SIGNIFICA "COMPETIR"

Para que las decisiones de alcance se midan contra algo concreto y no contra
una intuición: la vara es la funcionalidad estándar de los sistemas de
gestión para PyMEs que ya se usan en Argentina (referencias anotadas por el
equipo: Dux Software, Contagram — `docs/competencia.txt`).

Capacidades típicas de esos sistemas que Nexo todavía no tiene, y que por eso
están en el roadmap (§38): facturación electrónica con CAE real, punto de
venta de mostrador, multi-empresa/multi-sucursal, integración con
marketplaces y e-commerce, app o acceso móvil instalable, reportes
comparativos entre períodos.

Esto no significa copiar función por función: significa que, antes de
considerar una etapa "terminada", vale la pena preguntarse si un sistema de
gestión real la resolvería de otra forma, y por qué Nexo elige la suya.

---

# 38. ROADMAP POR ETAPAS

Este orden es la propuesta vigente, pensada para que abarate lo que sigue y
para que las dos personas del equipo puedan trabajar en paralelo sin pisarse
(multi-empresa es cambio de backend/esquema; modularizar el frontend es
cambio de cliente). **Estar en esta lista no autoriza a empezar una etapa sin
planificarla primero con el equipo** (regla de §27, sigue vigente sin
excepciones).

| Etapa | Qué | Por qué en ese lugar |
|---|---|---|
| 0 | Cerrar el trabajo pendiente de margen objetivo (pasada visual en navegador + commit) | Hay cambios sin commitear en el árbol de trabajo; no se empieza nada nuevo arriba de eso |
| A | Multi-empresa: `organizacion_id`, aislamiento, resolución desde sesión (§28) | Cuanto más crezca el esquema, más caro se vuelve; conviene hacerlo temprano |
| B | Modularizar `app.js` por dominio + base de PWA (§31) | Habilita todas las pantallas que siguen y el uso desde el celular; en paralelo con A |
| C | IVA discriminado y categoría fiscal (§16, §33) | Bloqueante de ARCA y de facturar en serio |
| D | Punto de venta (POS) y turno de caja (§30) | Es el uso diario más visible de un comercio real |
| E | ARCA: homologación → producción (§33) | Depende de C |
| F | Perfiles de rubro + unidad de medida fraccionable (§29, §4) | Abre carnicería/verdulería/etc. sin tocar el núcleo |
| G | Integraciones: Mercado Libre, Tienda Nube (§32) | Se apoya en que stock y precios ya son sólidos |
| H | Reportes avanzados y dashboard por rubro (§20) | Rinde más con volumen real de datos |
| I | IA: voz y WhatsApp (§36) | El diferencial del producto, sobre un núcleo ya maduro |

---

# 39. FUERA DE ALCANCE POR AHORA

Explícito para que ninguna sesión lo arranque por su cuenta sin hablarlo antes
con el equipo:

- Métricas de publicidad paga (Meta Ads / Google Ads, ROAS, CPA) — reconocido
  como parte de la visión a futuro, pospuesto deliberadamente.
- App nativa publicada en tiendas (Google Play / App Store) — se resuelve con
  PWA (§31) hasta que haya una razón concreta para necesitar más.
- Sucursales con operación offline y sincronización diferida (más allá del
  soporte offline básico de lectura de la PWA).
- Producción con recetas/insumos (relevante para gastronomía) como módulo
  propio — puede aparecer si un perfil de rubro lo necesita (§29), pero no es
  parte del alcance actual.
- Gestión de empleados y sueldos.
- Contabilidad de partida doble / libro mayor contable formal (Nexo lleva
  tesorería y cuentas corrientes, no reemplaza a un sistema contable).
- Facturación internacional / multi-moneda.