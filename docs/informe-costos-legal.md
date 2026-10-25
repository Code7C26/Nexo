# Informe Económico, Monetización y Marco Legal — Nexo

**Asignatura / Contexto:** Trabajos prácticos para Classroom  
**Proyecto:** Nexo (Sistema de gestión integral para PyMEs y emprendimientos con IA y PWA)  
**Integrantes:** Santino Solla, Joaquin Tosi  
**Fecha:** Octubre de 2026  

---

## 1. Cuadro de Costos Reales y Monetización de Nexo

Para garantizar la viabilidad comercial y el estándar de producto real de Nexo en el mercado argentino, se detallan a continuación los costos reales (cotizados a valores vigentes en pesos argentinos - ARS y su equivalente operativo), la valorización de horas de desarrollo y el modelo de monetización seleccionado.

### A. Costos Fijos Reales (Anuales y Mensuales)
Son los gastos operativos indispensables para mantener la infraestructura central de Nexo en funcionamiento, con independencia del volumen transaccional de los comercios clientes.

| Concepto | Detalle / Proveedor de Referencia | Periodicidad | Monto en ARS (Estimado 2026) |
| :--- | :--- | :--- | :--- |
| **Dominio Comercial** | Registro oficial de alternativa viable (ej. dominio `.app`, `.net.ar` o `.com` internacional) ante registrador internacional o NIC Argentina | Anual | \$ 24.500 (Estimado para TLD alternativo) |
| **Servidor VPS / Hosting Web** | Instancia cloud escalable (ej. DigitalOcean / Hetzner / AWS básico para Node.js + SQLite multi-tenant) | Mensual | \$ 28.000 / mes (\$ 336.000 anuales) |
| **Herramientas y Licencias de Software** | Entornos de desarrollo, control de versiones, GitHub (plan gratuito/pro), herramientas de monitoreo y CI/CD | Mensual / Anual | \$ 0 (Stack 100% Open Source y gratuito para MVP) |
| **Asesoramiento Contable / Legal** | Mantenimiento fiscal básico (Monotributo / Responsable Inscripto) y asesoramiento legal inicial para contratos de servicios | Mensual | \$ 45.000 / mes (\$ 540.000 anuales) |
| **TOTAL COSTOS FIJOS ANUALES** | | | **\$ 900.500 ARS** (~ \$ 75.040 / mes) |

*Nota sobre dominios:* Ante la indisponibilidad de la marca exacta `nexo.com.ar` en NIC Argentina, se opta operativamente por alternativas estratégicas válidas como `nexo-geston.ar`, `appnexo.com.ar` o extensiones de nivel superior alternativas (`.app` / `.net.ar`), reflejando el costo real de mercado para dominios alternativos.

---

### B. Valorización de Horas / Hombre (Mano de Obra Técnica)
Para calcular el costo real de desarrollo del software sin subestimar el esfuerzo técnico, se toma como referencia la tabla de honorarios y la última encuesta de sueldos del mercado tecnológico argentino (**sysarmy / OpenQube**) para un perfil de **Desarrollador Junior / Semi-Senior de Software (Backend Node.js y Frontend)**.

* **Valor hora de referencia (Desarrollador Junior/Semi-Senior en Argentina):** \$ 12.000 ARS / hora (neto de cargas sociales y costos indirectos de estructura).
* **Horas estimadas de desarrollo del núcleo funcional (V1 completo + multi-tenant + POS + PWA):** 600 horas acumuladas por integrante.
* **Cálculo de inversión de mano de obra inicial:**
  $$\text{600 horas} \times \$ 12.000\text{ ARS/hora} = \$ 7.200.000\text{ ARS por desarrollador}$$
* **Cálculo total del equipo fundador (2 integrantes):**
  $$\$ 7.200.000 \times 2 = \$ 14.400.000\text{ ARS en valor técnico invertido en el MVP}$$

*Nota analítica:* Este valor demuestra que un sistema de gestión de nivel profesional no puede considerarse un desarrollo trivial ni de costo cero; la valorización del tiempo de ingeniería es clave para evaluar el punto de equilibrio.

---

### C. Costos Variables Reales
Son los costos que crecen en proporción directa al uso de la plataforma, la cantidad de comercios activos, el volumen de ventas operadas y el consumo de servicios de terceros (APIs e infraestructura de cobro).

1. **Consumo de Tokens en APIs de IA (Google Gemini / `@google/genai`):**
   * Utilizado para el asistente conversacional por texto y procesamiento de lenguaje natural.
   * *Costo estimado:* Basado en los planes de pago por uso de Google AI Studio, se calcula un promedio de \$ 150 a \$ 400 ARS mensuales por comercio activo con alto uso del asistente operativo.
2. **Comisiones de Pasarelas de Pago (Mercado Pago / Cobros integrados):**
   * Aplicable al módulo de POS y cobros digitales.
   * *Costo:* Aproximadamente un 3.5% + IVA a 5.99% + IVA sobre el volumen transaccional procesado mediante QR o pasarela (costo trasladado o absorbido según acuerdo comercial, estipulado por las tasas vigentes del mercado de pagos argentino).
3. **Ancho de Banda y Almacenamiento Dinámico (Backups y PWA):**
   * Crecimiento marginal de almacenamiento en base de datos SQLite por cada comercio y logs de auditoría. Costo despreciable en etapa inicial, escalando linealmente con la cantidad de transacciones.

---

### D. Modelo de Monetización Seleccionado: SaaS (Software as a Service) por Suscripción Mensual
* **Estrategia elegida:** **SaaS por Suscripción Mensual escalonada (Tiered Subscription)**.
* **Justificación:** 
  * Para el segmento objetivo en Argentina (PyMEs, comercios minoristas, kioscos, carnicerías, verdulerías y prestadores de servicios), el modelo de **SaaS** es el ideal porque elimina la barrera de entrada de un pago único elevado (Licencia Única) y evita los costos de mantenimiento de hardware dedicado (Hardware + Mantenimiento).
  * Permite prever ingresos recurrentes (MRR - *Monthly Recurring Revenue*), financiar los costos fijos de servidores y soporte, y escalar de forma multi-tenant sobre la misma infraestructura sin necesidad de duplicar instalaciones.
  * El precio se establece en un abono mensual competitivo por negocio (ej. planes según cantidad de sucursales o módulos avanzados habilitados como Facturación ARCA o Integración con Mercado Libre).

---

## 2. Investigación de Pasos Legales y Propiedad Intelectual en Argentina

Para formalizar operativamente la agencia / empresa desarrolladora de Nexo y proteger los activos intangibles (software, marca y desarrollos tecnológicos), se deben realizar los siguientes trámites obligatorios ante organismos oficiales de la República Argentina:

### A. Registro de Marca Comercial (INPI)
* **Organismo:** **INPI** (Instituto Nacional de la Propiedad Industrial).
* **Propósito:** Proteger el nombre comercial, logotipo y denominación comercial de la plataforma bajo una alternativa disponible (por ejemplo, *Nexo Gestión* o *Nexo PyME*), evitando que terceros comercialicen productos o servicios idénticos bajo la misma identidad.
* **Pasos del trámite:**
  1. **Boca de expendio virtual:** Realizar la presentación y seguimiento a través del portal oficial de trámites digitales del INPI (con Clave Fiscal de AFIP / ARCA).
  2. **Búsqueda fonética y denominativa previa:** Verificar disponibilidad de la denominación elegida dentro del rubro comercial.
  3. **Clasificación internacional (Clase de Niza):** Para Nexo, corresponde prioritariamente la **Clase 42** (Servicios científicos y tecnológicos, diseño y desarrollo de hardware y software informático) y eventualmente la **Clase 9** (Software registrado en soportes o descargable).
  4. **Pago de la tasa oficial:** Abono del arancel de solicitud inicial ante el INPI.
  5. **Publicación en el Boletín de Marcas:** Cumplido el examen formal, la marca se publica para eventuales oposiciones de terceros durante el plazo legal (30 días hábiles). Si no hay oposiciones, se emite el título de concesión de marca por 10 años renovables.

---

### B. Registro de Derecho de Autor del Software (DNDA)
* **Organismo:** **DNDA** (Dirección Nacional del Derecho de Autor, dependiente del Ministerio de Justicia).
* **Propósito:** Proteger la autoría intelectual del código fuente de Nexo (backend, frontend, esquemas de bases de datos) contra copias no autorizadas, plagio o uso indebido por parte de terceros.
* **Pasos del trámite:**
  1. **Acceso digital:** Ingreso al sistema de Trámites a Distancia (TAD) utilizando CUIT y Clave Fiscal.
  2. **Presentación de la obra inédita o publicada:** Se debe registrar el software como "Obra Inédita" o "Obra Publicada" en la categoría de **Software / Programación de Computadoras**.
  3. **Depósito de documentación fuente:** Consiste en adjuntar copias digitales del código fuente estructurado (primeras y últimas páginas de código según los estándares exigidos por la DNDA) junto con la documentación técnica o manual de usuario que acredite la autoría de los creadores (Santino Solla y Joaquin Tosi).
  4. **Pago de arancel y obtención de certificado:** Abono de la tasa retributiva de servicios y obtención del número de registro y certificado oficial de propiedad intelectual del software con validez legal.

---

### C. Protección de Hardware e Invenciones Originales (Patentes / Modelos Industriales)
* **Organismo:** **INPI** (Dirección de Patentes y Modelos Industriales).
* **Análisis de aplicación para Nexo:**
  * Dado que **Nexo es una plataforma de software integral (PWA, web, backend en Node.js, SQLite, asistente conversacional de IA)** y no un dispositivo físico o hardware original patentable, **no requiere el registro de patentes de invención de hardware** en su estado actual de desarrollo.
  * *Excepción eventual:* Si en futuras etapas evolutivas el equipo decidiera comercializar un dispositivo físico propio de hardware (por ejemplo, un controlador fiscal integrado o un terminal POS de diseño propio), se debería tramitar un **Modelo de Utilidad** o **Patente de Invención** ante el INPI, acreditando novedad mundial, altura inventiva y aplicación industrial. Por el momento, el foco legal se concentra exclusivamente en la propiedad intelectual del software (DNDA) y la marca comercial (INPI).
