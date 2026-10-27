# Logo Nexo — variantes

Generado a partir de `logo.png` (raíz del repo). Cada composición tiene 4 versiones
de color, todas con el mismo trazo, solo cambia tinta y fondo:

- `negro_fondo-transparente` — tinta negra, fondo transparente (para poner sobre cualquier color claro)
- `negro_fondo-blanco` — tinta negra, fondo blanco sólido
- `blanco_fondo-transparente` — tinta blanca, fondo transparente (para poner sobre cualquier color oscuro)
- `blanco_fondo-negro` — tinta blanca, fondo negro sólido

## Composiciones

| Carpeta | Contenido |
|---|---|
| `01-icono` | Solo el símbolo abstracto (sin texto) |
| `02-N` | Solo el monograma "N" suelto |
| `03-wordmark` | "NEXO" solo, sin ícono ni bajada |
| `04-wordmark-tagline` | "NEXO" + "Sistema de gestión para pymes" |
| `05-lockup-completo` | Ícono + "NEXO" + bajada, todo junto (como en `logo.png`) |
| `06-perfil` | El ícono centrado en un cuadrado de 512×512, para foto de perfil (mail, redes). Lleva margen para que el recorte en círculo no lo corte. Solo las dos versiones con fondo sólido: una foto de perfil no admite transparencia |

`06-perfil` copia los píxeles del ícono a escala 1:1, sin agrandarlo: por eso
mide 512 y no más.

## Nota de resolución

`logo.png` original es de 1536×1024 px. Estos recortes están al mismo detalle que
el original — no se agrandó nada artificialmente, así que si necesitás un tamaño
mucho mayor (para imprimir grande, por ejemplo) conviene pedir el archivo fuente
vectorial a quien diseñó el logo, en vez de escalar estos PNG.
