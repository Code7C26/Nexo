/**
 * core/tipos-negocio.js
 * Las tarjetas para elegir el tipo de negocio y sus secciones (CLAUDE.md
 * §29). Son las mismas en el alta guiada (alta.js) y en Configuración. El
 * catálogo lo manda el backend (catalogoTiposNegocio() en server.js), así la
 * lista de tipos vive en un solo lugar.
 *
 * Cada tarjeta es un <label> con un radio o un checkbox nativo adentro: las
 * flechas entre radios, el espacio y el lector de pantalla funcionan sin
 * código propio.
 */

import { esc } from "./formato.js";
import { icono } from "./iconos.js";

// El ícono es el id de un <symbol> del sprite que fija el catálogo del
// backend; igual pasa por esc(), como todo lo que llega de la API.
function tarjeta({ tipo, nombre, valor, elegida = false, deshabilitada = false, datos, pastilla = "" }) {
  return `
    <label class="opcion-tarjeta${deshabilitada ? " is-deshabilitada" : ""}">
      <input type="${tipo}" name="${nombre}" value="${esc(valor)}"${elegida ? " checked" : ""}${deshabilitada ? " disabled" : ""} />
      <span class="opcion-tarjeta-icono">${icono(esc(datos.icono))}</span>
      <span class="opcion-tarjeta-texto">
        <span class="opcion-tarjeta-nombre">${esc(datos.nombre)}${pastilla}</span>
        <span class="opcion-tarjeta-desc">${esc(datos.descripcion)}</span>
      </span>
      <span class="opcion-tarjeta-check">${icono("check")}</span>
    </label>`;
}

// Los "Próximamente" se ven, para que se sepa que vienen, pero no se eligen.
export function tarjetasTipo(catalogo, elegido) {
  const disponibles = catalogo.tipos.map((t) =>
    tarjeta({ tipo: "radio", nombre: "rubro", valor: t.clave, elegida: t.clave === elegido, datos: t })
  );
  const proximamente = catalogo.proximamente.map((t) =>
    tarjeta({
      tipo: "radio",
      nombre: "rubro",
      valor: t.clave,
      deshabilitada: true,
      datos: t,
      pastilla: ' <span class="status">Próximamente</span>'
    })
  );
  return [...disponibles, ...proximamente].join("");
}

// Con `tipo` (Configuración, hist. §88), las que trae ese tipo de negocio
// llevan "Viene con …": se ve qué es de base y qué se sumó.
export function tarjetasModulos(catalogo, marcados = [], tipo = null) {
  return catalogo.modulos
    .map((m) =>
      tarjeta({
        tipo: "checkbox",
        nombre: "modulo",
        valor: m.clave,
        elegida: marcados.includes(m.clave),
        datos: m,
        pastilla: tipo?.modulos.includes(m.clave) ? ` <span class="status">Viene con ${esc(tipo.nombre)}</span>` : ""
      })
    )
    .join("");
}

export const tipoDeNegocio = (catalogo, clave) => catalogo.tipos.find((t) => t.clave === clave);

// Al elegir otro tipo se vuelven a marcar sus secciones; se pueden cambiar
// igual antes de seguir.
export function marcarModulosDelTipo(contenedor, catalogo, clave) {
  const modulos = tipoDeNegocio(catalogo, clave)?.modulos ?? [];
  for (const casilla of contenedor.querySelectorAll('input[name="modulo"]')) {
    casilla.checked = modulos.includes(casilla.value);
  }
}
