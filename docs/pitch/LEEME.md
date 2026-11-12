# Todo para presentar Nexo

| Archivo | Para qué |
|---|---|
| `Presentación — Nexo.html` | Las diapositivas. Se abren con doble clic, sin internet. Flechas o el puntero para avanzar, **F** para pantalla completa, `#21` al final de la dirección salta a la demo. |
| `Guía para presentar — Nexo.pdf` | Qué decir en cada diapositiva, lo técnico explicado simple y qué contestar si preguntan. |
| `Factura de compra de ejemplo.pdf` y `.jpg` | Para la demo de Compras → Nueva compra → "Cargar desde la factura", en Lola Indumentaria. Una sola lectura por vez: la IA tiene cupo. |
| `QR/Probar Nexo.png` | Lleva a nexosystem.duckdns.org/app#/probar: entrar a un negocio de ejemplo sin registrarse. |
| `QR/Repositorio en GitHub.png` | Lleva al código, el README y el manual. |
| `QR/Instagram @nexosystem.app.png` | Lleva al Instagram de Nexo. |

Nada de esta carpeta se edita a mano: se rearma desde las fuentes.

- La presentación sale de `docs/presentacion/index.html`: `npm run presentacion` (en la raíz).
- La guía, la factura y los QR salen de `redes/pitch/guia.html`, `docs/presentacion/factura-textil-norte.html` y `docs/qr/`: `npm run guia` (en `redes/`, después de `npm install`).

Si cambia una diapositiva, se corren los dos y se suben los archivos nuevos.
