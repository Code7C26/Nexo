# Cómo arman el menú los sistemas que se usan (23 de noviembre de 2026)

Pedido del usuario: "no entiendo eso de 'maestros', para muchos negocios el CRM
no es un maestro … se podría hacer personalizable también". Antes de cambiarlo
se miró cómo lo resuelven otros (regla de `docs/investigaciones/`).

## Qué hace cada uno

- **Shopify** ([Navigating the Shopify admin](https://help.shopify.com/manual/shopify-admin/shopify-admin-overview)):
  arriba, sin título de grupo, Inicio, Pedidos, Productos y Clientes. Los
  canales y las apps van en sus propios grupos, y cada persona fija ahí los que
  usa y los ordena arrastrando; para sacarlos, se desfijan.
- **Tiendanube** ([la app y el menú lateral](https://ayuda.tiendanube.com/es_AR/159567-por-tiendanube/como-gestionar-mi-tiendanube-desde-la-aplicacion-movil)):
  Ventas, Productos y Clientes son secciones sueltas, sin "maestros". Para ir
  directo a algo, el buscador con Ctrl+K.
- **Linear** ([Personalized sidebar](https://linear.app/changelog/2024-12-18-personalized-sidebar)):
  cada persona ordena el menú arrastrando y esconde lo que casi no usa; lo
  escondido no se pierde, queda en un "More".
- **Dux y Contagram** (los de referencia, `competencia.txt`): menú por módulo
  contable (Ventas, Compras, Stock, Tesorería), con los clientes dentro de
  Ventas y los productos dentro de Stock. Es el modelo del que venía "Maestros".

## Qué toma Nexo

- **Sin "Maestros"**: arriba de todo, sin grupo, lo de todos los días, como en
  Shopify y Tiendanube: Resumen, Asistente, el catálogo, los clientes (o el
  CRM) y Puntos y premios. Debajo siguen los grupos (Ventas, Socios, Compras,
  Stock, Producción, Finanzas, Administración).
- **Personalizable por persona, como Linear y los fijados de Shopify**:
  Configuración → Menú. Cada sección de un grupo se puede **poner arriba**, lo
  de arriba se ordena arrastrando desde las tres rayas (como el Resumen), y
  cualquier sección se **esconde** sacándole la tilde. Lo escondido queda en
  "Más secciones", al final del menú, a un toque.
- Es de la persona en cada negocio (como el Resumen) y la sigue en el celular
  y la compu. Los dos roles arman el suyo. No da permisos: lo que el rol o los
  módulos no muestran sigue sin mostrarse.
- No se tomó el menú por módulo contable de Dux y Contagram: es el que daba
  "Maestros", una palabra que un comercio chico no usa.
