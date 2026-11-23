# Puntos y premios: cómo lo hace la competencia

Investigado el 22 de noviembre de 2026, antes de armar el programa de puntos
(punto 9 del plan de `handoff.md`, punto 5 de `investigacion-praxia.md`).
Se leyó la ayuda de cada uno, no la publicidad.

## Qué hace cada uno

**Praxia** (comercio argentino, ver `investigacion-praxia.md`): los puntos se
calculan desde lo comprado, sin un contador que se desincronice, y **cambiar
la regla recalcula a todos**. El negocio arma un catálogo de premios (de
descuento o de producto) y el cajero los canjea en la venta. Tiene un mensaje
de WhatsApp armado para los puntos.

**Square Loyalty** (el más usado en mostradores; ayuda de Square, artículos
5744, 6462 y 3952):
- Una sola regla para sumar: por monto gastado (el ejemplo es 1 punto cada
  US$ 5, antes de la propina, con impuestos incluidos de partida), por visita
  o por artículo.
- **Vencimiento opcional**, en meses. Un cambio de vencimiento vale solo para
  los puntos que se ganan después: los que ya tiene cada cliente vencen con la
  regla del día en que los ganó. Al canjear se usan primero los que vencen
  antes. Avisa por SMS 14 días antes de que venzan.
- Premios: un porcentaje o un monto de descuento sobre toda la venta, un
  descuento en ciertos productos o categorías, o un producto gratis. Puede
  haber varios escalones.
- Se canjea en el cobro: se busca al cliente por nombre o teléfono, se toca
  Canjear y el premio se aplica a la venta en curso.

**Apps de puntos de Shopify POS** (Shopify no lo trae; ayuda de Yotpo, Rivo,
LoLoyal, Marsello y bitLoyalty):
- Una devolución saca los puntos que había dado la compra: entera, todos;
  parcial, los equivalentes a lo devuelto (LoLoyal, Yotpo). Casi todas lo
  traen prendido de partida.
- Los puntos gastados en un premio de valor fijo vuelven solo si se devuelve
  la compra entera (Yotpo).

**Argentinas sueltas** (Tienda de Puntos, Loybox, Puntito, Loyalz): son
servicios aparte del sistema de gestión, con su app o su QR para el cliente y
una suscripción mensual. Puntito suma un panel con la frecuencia de visitas y
los puntos sin canjear.

## Qué toma Nexo

- **Un punto cada $ X**, que elige el negocio (como Square por monto). Se
  suman sobre **lo cobrado** de cada venta, sin lo que se devolvió: lo que
  quedó fiado suma cuando se paga. Así un socio que no pagó la cuota no junta
  puntos.
- **La regla se congela en cada venta** (como Square, no como Praxia):
  cambiar "cada $ 1.000" por "cada $ 500" vale para lo que se vende desde
  ahí, y nadie gana ni pierde puntos de golpe. Se guarda en la venta, como el
  costo histórico (CLAUDE.md §8).
- **Vencimiento opcional en meses**, congelado también en cada venta. Al
  canjear se usan primero los que vencen antes.
- **Premios:** un porcentaje o un monto de descuento sobre la venta, o un
  producto de regalo (que sale del stock y cuyo costo entra en la venta).
  El descuento en ciertos productos o categorías y los escalones quedan para
  después.
- **Se canjea en el mostrador**, con el cliente elegido, y se puede sumar más
  de un premio si alcanzan los puntos.
- **Anular la venta** saca los puntos que dio y devuelve los que se
  canjearon en ella. Una devolución parcial saca los puntos de lo devuelto;
  los canjeados no vuelven (como Yotpo).
- **Sumar o quitar a mano**, con el motivo (para pasar las tarjetitas de
  papel o regalar puntos), solo el admin, con auditoría.
- **Los mensajes de WhatsApp** de compra y de puntos (los de Praxia), con los
  marcadores de siempre, en Configuración → Mensajes de WhatsApp.
- No se hace: la app o el QR del cliente (es lo que cobran los servicios
  argentinos) ni el aviso automático antes de que venzan, que pide mandar
  mensajes solos (la API de WhatsApp Business, "Para más adelante").

## Fuentes

- [Square Loyalty FAQ](https://squareup.com/help/us/en/article/6462)
- [Overview of Square Loyalty](https://squareup.com/help/us/en/article/5744)
- [Square Loyalty: redeem rewards](https://squareup.com/help/us/en/article/3952)
- [Yotpo: point balance for refunded orders](https://support.yotpo.com/docs/point-balance-for-refunded-orders)
- [Rivo: adjust points on refunded or canceled orders](https://help.rivo.io/en/articles/6670948-automatically-adjust-points-on-refunded-or-canceled-orders)
- [LoLoyal: points cancellation for refunded orders](https://help.loloyal.com/en/articles/11798047-points-cancellation-for-refunded-or-canceled-orders)
- [Marsello: remove loyalty points for Shopify orders](https://help.marsello.com/how-do-i-automatically-remove-loyalty-points-for-shopify-orders-marsello-help-center)
- [Puntito (Infonegocios)](https://infonegocios.info/nota-principal/nace-puntito-la-app-cordobesa-que-digitaliza-la-fidelizacion-de-los-comercios-de-barrio-promete-hasta-95-mas-de-ganancias)
- [Tienda de Puntos (iProUP)](https://www.iproup.com/startups/64457-argentinos-crean-ia-para-atraer-clientes-vender-mas-1000-comercios-tienda-de-puntos)
