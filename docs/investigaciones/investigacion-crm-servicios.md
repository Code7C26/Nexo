# CRM y negocios de servicios: investigación y diseño

> Pedido del usuario del 20 de octubre de 2026:
> - un **CRM completo, adaptado a cada tipo de negocio**, para manejar
>   consultas, clientes y clientes potenciales, que llegue a la presentación;
> - **afilar el tipo de negocio "Servicios"**, para que se carguen servicios en
>   vez de productos y tenga funciones propias.
>
> Este documento junta lo que se investigó y el diseño elegido. El orden de
> trabajo está en `handoff.md` (puntos 6a y 6b del plan).

## 1. Qué se investigó

### La competencia argentina no tiene CRM

- **Dux Software:**
  - tiene base de clientes, historial de compras, cuentas corrientes,
    suscripciones mensuales con facturas recurrentes y un portal de clientes;
  - no encontramos un módulo de oportunidades ni un embudo de ventas.
- **Contagram** (hoy de Visma):
  - tiene clientes, presupuestos, abonos (facturación recurrente), cobranzas
    e informes por cliente;
  - tampoco tiene leads, etapas ni embudo.
- **Conclusión:** los dos cubren lo que pasa *después* de la venta. La etapa
  anterior (la consulta, el seguimiento, el cliente potencial) la resuelve un
  CRM aparte. **Un CRM integrado a la gestión es un diferencial real frente a
  los dos.**

### Los CRM más usados

- **Kommo** (ex amoCRM), muy usado en Latinoamérica:
  - parte de los chats: WhatsApp, Instagram y Messenger en una sola bandeja;
  - cada conversación nueva crea un cliente potencial en la primera etapa del
    embudo;
  - las etapas se mueven arrastrando y disparan seguimientos;
  - registra el motivo cuando una oportunidad se pierde;
  - **no tiene facturación ni stock.**
- **Pipedrive:**
  - separa la **bandeja de clientes potenciales** (todavía sin calificar) del
    **embudo de oportunidades**;
  - cada actividad (llamada, reunión, tarea) cuelga de una oportunidad y sale en
    un calendario;
  - marca las oportunidades **sin próxima actividad** (las "que se enfrían")
    para que ninguna quede olvidada;
  - admite varios embudos.
- **HubSpot gratis:** contactos, un embudo, tareas. Las automatizaciones son
  pagas.

### Por tipo de negocio

- **Gimnasios** (Gymdesk, PushPress, Zen Planner, ClubOS):
  - el circuito es consulta → clase de prueba → socio;
  - avisos de seguimiento y recuperación de quien no vino a la prueba;
  - de dónde llegó cada consulta (Instagram, un conocido, pasó por la puerta);
  - tasa de conversión de prueba a socio;
  - **el cliente potencial pasa a socio sin volver a cargar sus datos.**
- **Servicios** (Jobber, que es lo estándar en servicios a domicilio):
  - el circuito es pedido → presupuesto → trabajo programado → hecho →
    facturado y cobrado;
  - recordatorio automático de los presupuestos sin respuesta;
  - el presupuesto aprobado pasa a trabajo sin cargar nada de nuevo;
  - trabajos que se repiten.
- **Dux y Contagram** suman lo que todo negocio de servicios pide:
  - **abonos** (un servicio que se cobra todos los meses);
  - facturación recurrente.

## 2. Diseño del CRM (punto 6b)

Es un módulo `crm`, que se puede prender en cualquier negocio (CLAUDE.md §29):
el tipo de negocio decide sus etapas y si viene prendido, y nunca hay código
propio de un tipo.

### Entidades

- **Oportunidad:** una consulta o un cliente potencial.
  - **Quién:** un contacto suelto (nombre, teléfono, email) o un cliente que ya
    existe.
  - **Cómo llegó:** el origen (WhatsApp, Instagram, pasó por el local, un
    conocido, la web, otro).
  - **Qué busca:** lo que le interesa, el valor estimado y quién la sigue.
  - **Dónde está:** su etapa, y abierta, ganada o perdida, con el motivo si se
    perdió.
  - **Qué falta:** la próxima acción, con su fecha.
- **Etapas:** propias de cada negocio y editables. Cada tipo de negocio trae
  las suyas de partida (es un preset, son datos):
  - comercio: Consulta → Presupuesto enviado → Negociación;
  - gimnasio: Consulta → Clase de prueba → Seguimiento;
  - servicios: Consulta → Visita o relevamiento → Presupuesto enviado.
  - Ganada y Perdida son los cierres, comunes a todos.
- **Actividad:** llamada, mensaje, visita, nota o tarea, con su fecha y si
  está hecha. Cuelga de una oportunidad o de un cliente.

### Lo que lo hace distinto de Kommo o Pipedrive

Está integrado con la gestión:
- **Pasa a lo que corresponde sin cargar de nuevo:** una oportunidad pasa a
  cliente, a presupuesto, a socio (gimnasio) o a venta.
- **Se gana sola:** cuando su presupuesto se convierte en venta, o cuando el
  cliente potencial se da de alta como socio.
- **Ficha de cliente completa:** sus consultas, actividades, presupuestos,
  ventas, cobros y saldo, en una sola línea de tiempo.
- **Clientes que dejaron de comprar:** los que no compran hace un tiempo, para
  volver a contactarlos. Sale de las ventas, no se carga a mano.

### Pantallas

- **Embudo:** columnas por etapa, con arrastrar y soltar en el escritorio; en
  el celular, una lista por etapa.
  - Avisa las oportunidades sin próxima acción, o con la acción vencida.
- **"Para hoy":** las actividades que vencen hoy o ya vencieron. También va en
  el Resumen.
- **Alta rápida de una consulta:** tres campos (nombre, teléfono, qué busca).
  Es lo que se carga parado en el mostrador.
- **Reportes:** consultas por origen, conversión por etapa y motivos de
  pérdida.

### Después de la primera versión

- WhatsApp (etapa I del plan): un mensaje nuevo crea la consulta solo, como en
  Kommo.
- El asistente: "me consultó Juan por un plan anual" crea la oportunidad,
  siempre con confirmación (CLAUDE.md §21).
- Un formulario de contacto en la landing.
- Envío de mensajes por lote y automatizaciones de seguimiento.

## 3. Diseño de Servicios (punto 6a)

Hoy un servicio es un producto con `tipo = 'servicio'`, sin stock. El tipo de
negocio "Servicios" solo cambia el tipo con que nace un producto y deja
prendidos los presupuestos. La pantalla sigue siendo la de un comercio:
Productos, SKU, código de barras, variantes.

1. **Catálogo de servicios:**
   - **Nombre de la sección:** la palabra "Productos" o "Servicios" sale del
     preset del tipo de negocio, como dato y no con un `if`.
   - **Formulario de servicio:** nombre, descripción, categoría, precio fijo o
     por hora y duración estimada. La unidad suma `hora`.
   - Sin SKU, código de barras, stock ni variantes, salvo que se pidan.
2. **Trabajos (órdenes de trabajo):** el circuito de Jobber sobre lo que ya
   existe.
   - Presupuesto aceptado → trabajo, con fecha, responsable, estado
     (pendiente, en curso, terminado o cancelado) y notas.
   - Al terminar, pasa a una venta, que se cobra y se factura como siempre.
   - Los trabajos del día y de la semana se ven en una lista.
3. **Abonos:** un servicio que se cobra todos los meses (mantenimiento,
   honorarios, una agencia). Lo tienen Dux y Contagram.
   - Es el mismo mecanismo que las cuotas de socios (§74, §75): una venta por
     período, generada sin cron y de forma idempotente.
   - Se reusa ese mecanismo, no se escribe uno nuevo.
4. **Recordatorio de presupuestos sin respuesta:** los enviados hace más de N
   días, en "Para hoy". Lo comparte con el CRM.

Para después: agenda con turnos (es el módulo que espera la barbería), registro
de horas por cliente y portal del cliente.

## Fuentes

- [Kommo: guía completa del CRM para WhatsApp e Instagram](https://www.orbis.agency/blog/kommo-pillar/)
- [Kommo (ex amoCRM): qué es, cómo funciona y para quién conviene](https://olpagroup.com/kommo-amocrm-que-es-como-funciona/)
- [Kommo: precios, funciones y opiniones (ComparaSoftware Argentina)](https://www.comparasoftware.com.ar/kommo-crm-es)
- [Pipedrive: gestión de clientes potenciales](https://www.pipedrive.com/en/products/sales/leads)
- [Pipedrive: clientes potenciales y oportunidades](https://zeeg.me/en/blog/post/pipedrive-deals-vs-leads)
- [Pipedrive vs HubSpot, comparación 2026](https://www.emailtooltester.com/en/blog/pipedrive-vs-hubspot/)
- [Límites de HubSpot gratis en 2026](https://www.engagebay.com/blog/is-hubspot-free/)
- [Dux Software: gestión de ventas](https://duxsoftware.com.ar/gestion-ventas)
- [Dux Software: portal de clientes](https://duxsoftware.com.ar/portal-de-clientes)
- [Contagram en Capterra](https://www.capterra.com/p/202060/Contagram/)
- [Contagram: centro de ayuda](https://help.contagram.com/es/)
- [Gymdesk: gestión de clientes potenciales para gimnasios](https://gymdesk.com/features/lead-management)
- [PushPress: los mejores CRM para gimnasios en 2026](https://www.pushpress.com/blog/best-gym-crm-software)
- [Zen Planner: funciones de gestión de clientes potenciales](https://www.zenplanner.com/blog/blogs/fitness-lead-management-software-features-that-convert-more-prospects-into-members)
- [Jobber: funciones y precios 2026](https://fieldserviceshq.com/jobber/)
