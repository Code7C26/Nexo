# Las cuotas de los socios: ¿son ventas?

20 de noviembre de 2026. Pedido del usuario: en Ventas, las cuotas de un
socio aparecen separadas aunque pagó un solo combo (Peludo, BJJ + MMA: dos
ventas de $ 43.636,36 y $ 36.363,64), y no le parece que las cuotas tengan que
estar en Ventas como si fueran un producto. "Averiguar cómo lo tienen los gym".

## Cómo lo hace Nexo hoy

- Cada plan de un socio es una inscripción (`inscripciones_socio`), y cada
  período de cada inscripción es una venta (`generarCuotasDe` en server.js;
  `cuotas_socio.venta_id` es UNIQUE).
- Un combo de dos planes son dos ventas por mes: el precio del combo se
  reparte entre las dos como un porcentaje de descuento.
- Ventas no distingue esas ventas de las del mostrador: se ven, se filtran y
  se suman igual.

Que la cuota sea una venta por dentro tiene su razón: así entra a la cuenta
corriente, se cobra con los medios de siempre, se factura con ARCA, va a la
caja y a los reportes. Eso no se toca. Lo que está mal es **cómo se agrupa** y
**dónde se muestra**.

## Cómo lo hacen los sistemas de gimnasios

- **Gymdesk** (el de artes marciales): lo de las membresías va en Billing →
  Payments ("all payments processed or scheduled": pagado, programado,
  pendiente, vencido, devuelto). En la ficha del socio, lo que compró en el
  punto de venta va aparte: "Purchases made directly through the Online
  Store or Point-of-Sale appear separately in a box below titled
  Purchases". El reporte de ventas es del punto de venta y la tienda; las
  membresías tienen el suyo (crecimiento y proyección de lo que entra por
  mes). Para una familia: "One payer, several students, one invoice".
- **Glofox**: el reporte separa lo que entra todos los meses (las
  membresías) de las compras de una vez, y lo abre por tipo de membresía y
  por medio de pago.
- **Wodify**: al revés, suma lo que el socio compró en el mostrador a la
  próxima factura de su membresía: un solo cobro por persona.
- **En la Argentina** (GymAr, YoFacturo): se habla de "cobro de cuotas", no de
  ventas, y de una factura electrónica por cada cuota cobrada.

Fuentes: [Gymdesk, pagos](https://docs.gymdesk.com/en/help/docs/payments) ·
[Gymdesk, pagos del socio](https://docs.gymdesk.com/en/help/docs/member-payments) ·
[Gymdesk, reportes](https://gymdesk.com/features/reporting) ·
[Gymdesk, cobros de artes marciales](https://gymdesk.com/blog/martial-arts-billing-software) ·
[Glofox, reportes](https://www.glofox.com/features/reporting/) ·
[Wodify, productos](https://www.wodify.com/products) ·
[GymAr](https://www.comparasoftware.com/gymar) ·
[YoFacturo, gimnasios](https://yo-facturo.com/blog/sistema-gestion-gimnasio-fitness/)

## Lo que sale de esto

1. **Una cuota por socio y por período**, con un renglón por plan: Peludo
   paga una cuota de $ 80.000 con BJJ y MMA adentro (y el combo dicho como
   combo, no como dos descuentos raros). Es lo que hacen todos: un pagador,
   un cobro, una factura.
2. **Las cuotas no se listan en Ventas.** Tienen su lugar en Socios (las
   cuotas del mes: cobradas, por cobrar, vencidas), y en Ventas queda lo que
   se vende (el mostrador, los productos). La plata sí entra a la caja, a la
   cuenta corriente y al Resumen, que las muestra aparte: "Cuotas" y
   "Ventas".

Para el punto 1 hay que cambiar el esquema: `cuotas_socio.venta_id` deja de
ser UNIQUE (varias cuotas, una venta), y eso en SQLite es reconstruir la
tabla (CLAUDE.md §34). Además, dos planes que arrancaron en días distintos
tienen períodos distintos: hay que decidir en qué día se cobra.
