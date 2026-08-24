# Nexö — Instrucciones para Claude Code

## Contexto
Nexö es un sistema de gestión integral para PyMEs y emprendimientos, con
visión a futuro de interfaz conversacional por voz. Es un proyecto de
escuela desarrollado por dos integrantes: Santino Solla y Joaquin Tosi.
Centraliza inventario, precios, clientes y facturación.

## Reglas de negocio acordadas
- IVA y retención de Mercado Pago quedan **fuera de V1** — decisión ya
  tomada por el equipo. No se calculan ni se guardan; el placeholder que
  existe en el prototipo (`IVA_ALICUOTA`, `RETENCION_MP_EJEMPLO`) no se
  traduce a lógica real por ahora. Se retoma en una etapa posterior si el
  equipo lo decide.
- V1 trabaja con facturas de monto simple: `neto` = `total`, sin impuestos.
- Productos/inventario y precios quedan para una segunda etapa (V2), una
  vez que clientes + facturas funcionen de punta a punta.

## Reglas de negocio a confirmar (no inventar)
- Alcance exacto de "gestión de precios" e "inventario" para V1.

## Stack técnico
- Backend: Node.js + Express.
- Base de datos: SQLite.
- Frontend: HTML, CSS y JavaScript vanilla (sin framework por ahora).

## Estructura del repositorio
```
/frontend   → prototipo/UI (index.html, css/, js/)
/backend    → servidor Express, esquema y acceso a datos SQLite
/docs       → documentación técnica y análisis del proyecto
/desing     → mockups y diseño visual
/assets     → imágenes, íconos y recursos estáticos
```

## Reglas de desarrollo
- No inventar reglas de negocio ambiguas: preguntar.
- Trabajar por etapas chicas y testeables.
- Diseño responsive desde el inicio.
- Movimientos de datos auditables (quién/cuándo, no solo el estado final).
- No pushear directo a `main`: rama por feature (`feature/<nombre>`) +
  Pull Request. `main` siempre debe quedar en estado funcional.
- Antes de cambiar el esquema de la base de datos, explicar la migración y
  su impacto.

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
- unidad de medida
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

La integración real con ARCA puede desarrollarse progresivamente.

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