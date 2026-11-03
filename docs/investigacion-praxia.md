# Praxia: qué tiene que a Nexo le falta

Investigación del 3 de noviembre de 2026, por pedido del usuario: Praxia es
el sistema de un compañero, dueño de una carnicería
(<https://praxia-pos.vercel.app/>). Se leyeron la página y el manual del
dueño (versión 1.21, 42 páginas, `manual/Manual-de-usuario-Praxia.pdf` en ese
sitio). Cada punto de "lo que falta" se buscó en el código de Nexo. Nada de
esto está planificado todavía: es una lista de ideas para elegir con el equipo
(CLAUDE.md §27, §38).

## 1. Qué es Praxia

- Dos programas: **la caja** (un `.exe` para Windows, en pantalla completa,
  que arranca con la PC) y **la web de administración**, que es la fuente de
  verdad (precios, ofertas, clientes, gastos, balance).
- La caja guarda una copia del catálogo y **vende sin internet**: la venta se
  manda sola cuando vuelve la conexión.
- Varios negocios con sus datos aislados, varias sucursales por negocio y
  varias cajas por sucursal (cada caja se empareja con un código de un solo
  uso y se da de baja desde la web).
- Factura con ARCA desde la caja, con certificado propio por caja.
- Tipos de negocio: carnicería, almacén/verdulería, tienda o kiosco,
  servicios y fábrica (de alimentos o de embutidos, sin caja).
- **No lleva stock, a propósito**: anota lo que entra y lo que sale, sin saldo
  por producto. Tampoco tiene costo promedio ni margen por venta.

## 2. Lo que a Nexo le falta, por prioridad

### Prioridad 1: el mostrador (rubros que Nexo ya ofrece)

1. **Etiquetas de balanza.** La balanza imprime un código de barras con el
   PLU (el código corto del producto) y el peso; el lector la pasa y el
   renglón entra pesado. El precio lo calcula siempre el sistema con el
   catálogo vigente, nunca el de la etiqueta (que puede estar viejo). El
   formato del código se declara por caja, con un asistente que lo deduce de
   una etiqueta real (código, peso e importe impresos) y pide otra si más de
   un formato la explica. Hay balanzas que solo meten el importe: ahí el peso
   sale de importe ÷ precio. **Nexo: nada de balanza.**
2. **Ofertas con vigencia.** En porcentaje, en pesos o a precio fijo, sobre
   una categoría o productos elegidos, para la lista minorista, la mayorista
   o las dos. Valen entre fechas y, si se quiere, solo ciertos días de la
   semana o del mes; arrancan y terminan solas, en hora de Argentina.
   - Promociones por cantidad con escalones ("2 kg o más a $9.000 el kilo"),
     que la caja anuncia antes de pesar y aplica al llegar al mínimo.
   - Reglas: dos ofertas no se suman (gana la más barata) y una oferta que
     encarecería el producto no se aplica.
   - En pantalla y en el ticket, el precio de lista tachado y "Ahorraste $X".
   - Vista previa de qué productos cambian de precio, con un día elegido.
   - **Nexo: solo listas de precios.**
3. **Recargo por medio de pago.** Crédito +10 %, configurable por medio,
   calculado sobre lo que se paga de verdad. Se ve en el botón y en el total
   antes de cobrar, y va como renglón en el ticket. **Nexo: no existe.**
   Depende de tener el medio de pago como entidad aparte de la cuenta de
   tesorería, que es el punto 8d de `handoff.md`
   (`docs/investigacion-caja.md`).
4. **Todo desde la pantalla del punto de venta.** Al de Nexo le faltan:
   - **cobrar a cuenta:** el cliente paga su deuda sin llevarse nada, con
     cualquier medio menos cuenta corriente, y sale un papel con el saldo
     que le queda;
   - **gastos de caja:** bolsas, flete, lo que sale del cajón, con el total
     del día a la vista y corregibles en el momento;
   - **ver las ventas del día:** reimprimir, y anular con motivo escrito y la
     autorización del dueño;
   - **accesos rápidos:** una botonera con los productos de siempre, que
     arma el cajero desde ahí mismo.
   - Atajos: Praxia usa F1 a F9 y Alt+1 a 5 para el medio de pago; Nexo hoy
     tiene F2 (buscar) y F9 (cobrar).

### Prioridad 2: que el cliente vuelva

5. **Puntos y premios.** Los puntos se calculan desde lo comprado (no hay un
   contador que se desincronice); cambiar la regla recalcula a todos. El
   negocio arma un catálogo de premios, de descuento o de producto, y el
   cajero los canjea en la venta. **Nexo: no tiene programa de fidelidad.**
6. **Mensajes de WhatsApp armados**, uno por situación (compra, puntos,
   premio, deuda), con marcadores (`{nombre}`, `{total}`, `{puntos}`) que el
   negocio edita. "Quiénes deben hace más de un mes", con el recordatorio
   listo. Los manda una persona con un clic. **Nexo: el CRM arma el enlace
   de WhatsApp, sin mensajes ni recordatorio de deuda.**

### Prioridad 3: números y control (etapa H, reportes)

7. **"Para revisar" en el tablero:** avisos con un botón que lleva a donde se
   arreglan. Ventas sin CAE, faltantes de caja grandes (umbral de $15.000 por
   día), cajas que no abrieron, turnos que arrancaron con otro vuelto que el
   que se dejó, y **"el costo subió y los precios no"** (compras de la última
   semana contra las cuatro anteriores, 5 % o más, sin ningún precio tocado
   desde entonces). Es la "sugerencia proactiva" que CLAUDE.md §36 deja
   pendiente.
8. **Ventas por hora del día y por día de la semana.** Nexo no lo tiene.
   Praxia además compara contra el período anterior solo si ese período tuvo
   al menos 20 ventas, para no dar porcentajes sin sentido.
9. **Gastos fijos que se repiten:** el alquiler se carga una vez y se reparte
   solo por semana o por mes desde su fecha hasta que se da de baja (sin
   borrar el pasado). También gastos pendientes o en cuotas. **Nexo: cada
   gasto es único y ya pagado.**
10. **Permisos por sección**, para ver o para editar, y por sucursal (un
    contador, un socio, un encargado). **Nexo: admin y empleado.**

### Para después del 20 de noviembre

- **Vender sin internet en el punto de venta.** En Nexo se puede hacer sin
  costo desde la PWA, con una cola de ventas en el navegador; CLAUDE.md §30
  ya lo anota como pendiente.
- **Sucursales con precio propio** que hereda el general (la multi-sucursal
  que CLAUDE.md §37 marca como faltante).
- **Mercado Pago Point y QR integrados:** el importe va solo a la terminal; si
  no contesta, se cobra tipeándolo como siempre.
- **Condición frente al IVA automática desde el CUIT** (padrón de ARCA). Nexo
  ya valida el dígito verificador (`frontend/js/core/fiscal.js`).
- **Para producción** (la fábrica de Praxia), útil para "¿cuántas puedo
  hacer?": merma real promedio de las últimas cinco tandas para el costo,
  número de lote, la tanda guarda la receta del día en que se hizo, y la
  venta de la fábrica a una sucursal propia entra como compra en la sucursal.
- **Remitos numerados** que salen de un presupuesto y mueven la cuenta
  corriente, **precios especiales por cliente** y **"repetir último
  pedido"**, para quien vende al por mayor.
- Detalles chicos: fecha de nacimiento del cliente, redondeo al peso entero.

### Lo que no conviene copiar

- La grilla de turnos de empleados: CLAUDE.md §39 deja afuera la gestión de
  empleados.
- "Si la plata pasa por un banco, se factura siempre" (con tarjeta no se
  ofrece la venta sin factura): es una regla fiscal; antes de copiarla, la
  confirma un contador.
- La caja como programa de escritorio: Nexo es una PWA que anda en cualquier
  equipo, incluido el celular.

## 3. Lo que Nexo tiene y Praxia no

Stock por depósito con movimientos, costo promedio y margen por venta,
compras con prorrateo, asistente con IA y voz, Mercado Libre y Tienda Nube,
CRM, trabajos, abonos, socios, producción con stock y costo, IVA en compras y
libro IVA, y uso desde el celular. Lo de Praxia se suma arriba de esto.

## 4. Lector de código de barras en Nexo (revisado el mismo día)

- **Hoy funciona:** el lector USB se enchufa y anda (la compu lo toma como un
  teclado), porque el buscador del punto de venta agrega el producto al
  recibir Enter (`frontend/js/dominios/pos.js`, `agregarPorCodigo`). Si el
  foco quedó afuera, la lectura va igual al buscador. Con cámara, donde el
  navegador tiene `BarcodeDetector` (Chrome en Android sí, Safari no).
- **El hueco:** el código leído se busca en el **SKU**. No hay campo de
  código de barras: para que un envasado entre con el lector, hay que cargar
  el número del código de barras como SKU. Un negocio con SKU propios tiene
  que elegir, y un producto no puede tener dos códigos.
- **Lo que sigue:** un campo "código de barras" en el producto y en la
  variante (lo pide CLAUDE.md §4), que el lector busque antes que el SKU. Es
  la base de las etiquetas de balanza (punto 1).

## 5. Recomendación

Antes de la presentación: código de barras propio, etiquetas de balanza,
ofertas, recargo por medio de pago (si llega el 8d) y cobrar a cuenta y
gastos desde el punto de venta. Son baratos, casi no tocan el modelo de
fondo (salvo las tablas nuevas de ofertas) y convierten a la carnicería de
Nexo en algo que un carnicero real usaría. Puntos y "Para revisar", después.
