# Apertura y cierre de caja con todos los medios de pago

Investigación del 28 de octubre de 2026, por pedido del usuario: "en Nexo
solo está en efectivo, pero creo que en todos los negocios actualmente se
cuenta también el débito". Todavía no está implementado: es un diseño para
planificar.

## 1. Cómo funciona hoy en Nexo

- El turno de caja (`turnos_caja`, CLAUDE.md §30, hist. §67) es de **una
  cuenta de tesorería de tipo efectivo**.
- Al abrir y al cerrar se cuenta solo esa plata. Si lo contado no coincide con
  lo que dice Nexo, la diferencia se asienta como movimiento de esa cuenta.
- El resumen del cierre ya muestra lo cobrado en el turno por cada cuenta
  (`cobros_por_cuenta`), pero solo como dato: lo cobrado con débito,
  transferencia o Mercado Pago no se controla contra nada.
- **Un cobro guarda a qué cuenta entra la plata, no con qué se pagó**
  (`cobros.cuenta_tesoreria_id`, sin medio de pago). El punto de venta muestra
  las cuentas como botones de medio. Si débito y crédito entran a la misma
  cuenta del banco, no hay forma de separarlos. CLAUDE.md §3 y §9 ya piden el
  "método de pago" como entidad aparte de la cuenta; nunca se hizo.

## 2. Cómo lo hacen otros

- **Fudo** (sistema argentino de mostrador y gastronomía),
  [arqueos de caja](https://intercom.help/fudoapp/es/articles/11730865-3-arqueos-de-caja):
  - al abrir se carga **solo el efectivo** (el monto inicial del cajón);
  - al cerrar muestra, por cada medio (efectivo, débito, crédito,
    transferencia, billeteras), lo que dice el sistema y lo que carga el
    cajero, con la diferencia en verde (sobra) o rojo (falta);
  - tiene **arqueo ciego**: el cajero carga lo que contó sin ver lo que
    esperaba el sistema;
  - un arqueo cerrado no se reabre, y el resumen se imprime o va por mail.
- **Dux** ([tesorería](https://intercom.help/duxsoftware/es/articles/7884050-organiza-tu-tesoreria),
  [cupones de tarjeta](https://intercom.help/duxsoftware/es/articles/7874506-como-acreditar-un-cupon-de-tarjeta)):
  - las "cajas diarias" se abren y se cierran; las "cajas mayores" no;
  - las formas de pago son aparte de las cajas: efectivo, tarjeta, cheque y
    las que se configuren;
  - lo cobrado con tarjeta queda como **cupón** y se **acredita después**,
    cuando la tarjeta paga.
- **Loyverse** ([turnos](https://help.loyverse.com/help/shift-management-loyverse-pos)):
  el efectivo esperado sale de las ventas en efectivo, las devoluciones y las
  entradas y salidas de plata. Las tarjetas se controlan aparte, con el
  sistema de cobro.
- **Práctica general**
  ([cierre con arqueo](https://cursa.app/es/pagina/cierre-de-caja-con-arqueo-cuadre-y-documentacion-de-resultados),
  [reportes del POS](https://agendapro.com/blog/como-leer-y-entender-los-reportes-de-tu-terminal-pos/)):
  - el cierre suma por medio de pago y cuenta el efectivo a mano;
  - las tarjetas se controlan con el **cierre de lote** del posnet (Posnet,
    Lapos, Payway, Clover o el lector de Mercado Pago). Ese papel trae el
    total del día por tarjeta, débito y crédito, y lo que se va a depositar
    después de la comisión.

## 3. Conclusión

El usuario tiene razón en lo importante, con un matiz:
- **Al abrir, solo se cuenta el efectivo.** Es el único medio que tiene un
  saldo inicial en el mostrador (el cambio). El débito no tiene: el lote del
  posnet vuelve a cero en cada cierre de lote.
- **Al cerrar, se controlan todos los medios.** El efectivo se cuenta. El
  débito y el crédito se comparan contra el cierre de lote del posnet. Las
  transferencias y Mercado Pago, contra lo que muestra la app.

## 4. Diseño propuesto para Nexo

1. **Medio de pago como entidad propia** (lo que piden CLAUDE.md §3 y §9).
   - Tabla `medios_pago`, por empresa:
     - nombre;
     - tipo (efectivo, débito, crédito, transferencia, billetera u otro);
     - la cuenta de tesorería a la que entra la plata;
     - activo.
   - `cobros.medio_pago_id`: columna nueva, nullable.
   - **Migración aditiva** (CLAUDE.md §34): `CREATE TABLE` y `ADD COLUMN`.
     El backfill crea un medio por cada cuenta que ya existe y se lo asigna a
     sus cobros, así lo de antes se ve igual. Re-ejecutable.
   - Los negocios nuevos nacen con estos medios:
     - Efectivo → Caja;
     - Débito, Crédito y Transferencia → Banco;
     - Mercado Pago → Mercado Pago.
   - El punto de venta y el cobro administrativo muestran **medios**, no
     cuentas.
2. **Apertura:** igual que hoy, solo el efectivo.
3. **Cierre:** una fila por cada medio usado en el turno, con:
   - "Según Nexo";
   - "Lo que contaste o lo que dice el posnet";
   - la diferencia, en verde o en rojo.

   Se guarda en una tabla nueva, `turno_caja_arqueos` (turno, medio, esperado
   y declarado). El turno sigue guardando el efectivo como hoy.
4. **Qué hace la diferencia:**
   - En efectivo, corrige el saldo de la caja, como hoy.
   - En los demás medios **queda registrada, pero no mueve el saldo**. Casi
     siempre es un cobro cargado con el medio equivocado: pagó con débito y
     se marcó efectivo.
   - Cuando sobra en un medio lo mismo que falta en otro, Nexo lo señala
     ("¿un cobro de $ 4.500 quedó en efectivo y era débito?"). Deja corregir
     el medio de ese cobro, y el cambio queda en la auditoría.
5. **Arqueo ciego** (opcional, lo prende el admin): el empleado carga lo que
   contó sin ver lo esperado, y el admin ve la diferencia. Es el control
   contra faltantes que traen los sistemas de mostrador.
6. **Para después:**
   - tarjetas que se acreditan días más tarde y con comisión (cupones o
     liquidaciones, como Dux);
   - imprimir el cierre o mandarlo por mail al dueño;
   - la integración con Mercado Pago (CLAUDE.md §32), que trae sola lo
     cobrado con el lector o el QR.
