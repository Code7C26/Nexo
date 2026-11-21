# Vender en cuotas con financiación propia: cómo lo resuelve la competencia

21 de noviembre de 2026. Pedido del usuario: el profe vende conjuntos a "un
pago de $100.000, dos de $65.000 o tres de $50.000", y lo que se debe tiene que
quedar en la cuenta corriente del cliente. Hecho en hist. §216.

## Lo que hay

- **Odoo — condiciones de pago con cuotas** ("payment terms and installment
  plans"): una sola factura cuya deuda se parte en varios vencimientos (30 %
  hoy, 70 % a 30 días, o N cuotas iguales). Cada parte tiene su fecha y el
  atraso se mide por parte, no por la factura entera.
  (odoo.com/documentation, Accounting › Customer invoices › Payment terms)
- **Dux Software — planes de cuotas en la forma de pago**: cada medio tiene sus
  planes (1, 3, 12 cuotas) con un recargo para el cliente que se suma al total
  de la venta. Es pensado para tarjeta; aparte, las "condiciones de pago" dan el
  plazo, y los informes de clientes muestran saldo y deuda.
  (intercom.help/duxsoftware: "Cómo crear formas de pago", "Cómo activar
  condiciones de pago")
- **Shopify POS** no lo trae: lo resuelven pagos parciales (layaway) o apps
  ("Payment Plans", "Layaway: Reserve & Deposit") que cobran una seña y el
  resto después.
- En Argentina lo habitual para "cuotas sin tarjeta" son financieras que le
  pagan todo al comercio (Nave, GOcuotas, Credicuotas): no es el caso del
  profe, que financia él.

## Qué toma Nexo

- Del **producto** (como pide el usuario): sus planes, "N pagos de $X", con el
  total y cuánto más que de contado a la vista. El de un pago es el precio de
  siempre. No es un recargo porcentual como Dux: el negocio pone el número
  redondo que cobra.
- De **Odoo**: una sola venta con un cronograma de vencimientos (uno por mes,
  el primero el día de la venta). Lo cobrado salda de la cuota más vieja a la
  más nueva, y en la cuenta corriente solo es vencido lo que ya venció.
- No se hizo: recargo por mora, cuotas cada otro período que no sea un mes,
  ni planes distintos por variante (los planes son del producto).
