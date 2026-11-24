# Una app general y otras especializadas: cómo lo hacen las empresas

Pedido del usuario (23 de noviembre de 2026): pensar Nexo como empresa, con
una aplicación general para cualquier negocio y otras especializadas que se
venden por su cuenta (la primera, para gimnasios de artes marciales). La
consigna del colegio además pide que la empresa y la aplicación tengan
nombres distintos.

## Cómo lo hacen otras empresas

**Block → Square.** Block (antes Square Inc.) es la empresa. Square tuvo
durante años productos separados por rubro: Square for Restaurants, Square
for Retail y Square Appointments. En abril de 2025 los juntó en una sola app,
Square Point of Sale, con **modos** por rubro (comercio, turnos, servicios y
uno general). Lo explican así: un solo código saca funciones más rápido y
cuesta menos mantener, y el 64 % de sus vendedores ya usaba más de un
producto. Lo vertical se sigue vendiendo como "Square para restaurantes",
pero por dentro es un solo sistema.

**Lightspeed Commerce.** Una empresa con tres líneas que se venden por
separado: Retail, Restaurant y Golf. Golf llegó comprando otra empresa
(Chronogolf, 2019). Cada línea tiene su página, su precio y su login, sobre
una plataforma en común.

**Axoft → Tango (Argentina).** Axoft es la empresa; Tango es la marca de los
productos. Tiene Tango Gestión (el general, por módulos), Tango Restó
(gastronomía), Punto de Venta (comercios), Estudios Contables y Tango Factura
(gratis para monotributistas chicos). Es el caso más parecido a lo que
piensa el usuario, y en el mercado de acá.

**Daxko → Zen Planner, Spectrum.** Daxko es la empresa y vende varios
sistemas para gimnasios con marcas propias. Zen Planner es el de los
gimnasios chicos y las artes marciales.

## Lo que se repite

1. **La empresa y el producto se llaman distinto** (Block y Square, Axoft y
   Tango, Daxko y Zen Planner). Sirve justo para lo que pide la consigna, y
   deja sumar productos sin cambiarle el nombre a la empresa.
2. **El producto especializado se vende con su propio nombre y su página**,
   aunque por dentro comparta casi todo con el general. Al dueño de un dojo
   le habla "el sistema para academias de artes marciales", no "un sistema
   de gestión que también tiene socios".
3. **Por dentro, un solo sistema.** Square volvió de varias apps a una sola
   con modos, por costo de mantenimiento. Para un equipo de dos personas,
   mantener dos códigos es lo más caro que se puede elegir.

## Cómo encaja en Nexo

CLAUDE.md §29 ya decidió que hay **un solo sistema configurable** y nunca
una versión del código por rubro. Lo que plantea el usuario no lo contradice
si la app especializada es una **marca y un armado**, no otro código:

- **Mismo servidor, misma base, mismo código.** La app de artes marciales es
  Nexo con el tipo de negocio Gimnasio, los módulos de socios, clases y
  graduaciones prendidos, y lo que no usa apagado.
- **Lo propio de la app especializada:** su nombre, su logo, su página de
  venta, su alta (que ya arranca con las preguntas del dojo), su precio
  (por socios activos, como Gymdesk) y su manual.
- **Lo nuevo de artes marciales** (graduaciones, asistencia por clase) se
  hace como módulos que puede prender cualquier negocio, como pide §29: una
  escuela de natación o de danza también tiene niveles.
- Si algún día hace falta que la app del alumno sea otra cosa (instalable
  aparte, con su ícono), se puede armar como otra PWA sobre el mismo
  servidor.

## Para decidir con Joaquín

- El nombre de la empresa, que se queda con todos los productos. Nexo pasa a
  ser el nombre de la aplicación general.
- El nombre de la app de artes marciales, y si sale con la presentación o
  después (según §40, vender y escalar se decide después de presentar).
- El precio de cada una (`plan-para-vender.md`, punto 7).

Fuentes:
[Square, el punto de venta único](https://squareup.com/us/en/press/single-point-of-sale) ·
[eMarketer sobre Square](https://www.emarketer.com/content/square-brings-all-pos-offerings-under-one-app) ·
[Block, la nueva app de Square](https://block.xyz/inside/introducing-the-next-generation-square-point-of-sale-app) ·
[Lightspeed, tipos de negocio](https://www.lightspeedhq.com/pricing-2/) ·
[NGF sobre Lightspeed Golf](https://www.ngf.org/top-100-business-in-golf/lightspeed/) ·
[Tango Software, formulario de comercialización](https://www.consejo.org.ar/storage/attachments/FORMULARIO%20TANGO%20SOFTWARE.pdf-jnmWYZsJBB.pdf) ·
[Daxko en G2](https://www.g2.com/vendors/daxko)
