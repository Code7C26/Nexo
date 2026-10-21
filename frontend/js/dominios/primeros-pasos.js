/**
 * dominios/primeros-pasos.js
 * La guía de primeros pasos del Resumen (hist. §81): para quien abre Nexo por
 * primera vez, lo que conviene cargar para dejarlo listo, en orden y según los
 * módulos del negocio. Cada paso se da por hecho con lo que ya hay cargado
 * (GET /api/negocio/primeros-pasos), no con un tilde a mano.
 *
 * Es del admin, como el Resumen. Se puede ocultar (por negocio, en este
 * navegador) y desaparece sola cuando está todo hecho.
 */

import { esAdmin, esc } from "../core/formato.js";
import { api } from "../core/api.js";
import { icono } from "../core/iconos.js";
import { moduloActivo, negocio, termino } from "../core/negocio.js";
import { alEntrarEnVista, recargar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";

const panel = document.getElementById("primerosPasos");
const claveOculto = () => `nexo.primerosPasos.oculto.${document.documentElement.dataset.organizacion}`;

// Cada paso: qué hacer, para qué, si ya está, y adónde lleva (una vista y, si
// hay, el botón que abre el alta, o un hash con subruta).
function pasos(c) {
  const lista = [
    {
      titulo: "Completá los datos de tu negocio",
      detalle: "El CUIT, la dirección y el teléfono que salen en tus presupuestos y facturas.",
      hecho: c.datos_negocio,
      hash: "#/configuracion/negocio"
    },
    {
      titulo: `Cargá tu primer ${termino("singular")}`,
      detalle: `Lo que vendés, con su precio. Después podés sumar ${termino("plural")} de a uno o editarlos en lote.`,
      hecho: c.catalogo > 0,
      vista: "productos",
      boton: "btnNuevoProducto"
    }
  ];
  if (moduloActivo("socios")) {
    lista.push(
      {
        titulo: "Creá tus planes",
        detalle: "Musculación, funcional o pase libre, con el precio de cada duración.",
        hecho: c.planes > 0,
        hash: "#/planes-socio"
      },
      { titulo: "Anotá a tu primer socio", detalle: "Sus cuotas se arman solas desde el día del alta.", hecho: c.socios > 0, hash: "#/socios/nuevo" }
    );
  }
  lista.push({
    titulo: "Cargá un cliente",
    detalle: "Con sus datos y su condición de pago, para venderle a cuenta corriente.",
    hecho: c.clientes > 0,
    vista: "clientes",
    boton: "btnNuevoCliente"
  });
  if (moduloActivo("trabajos")) {
    lista.push({
      titulo: "Programá tu primer trabajo",
      detalle: "Qué hay que hacer, cuándo y quién; al terminarlo, se cobra.",
      hecho: c.trabajos > 0,
      vista: "trabajos",
      boton: "btnNuevoTrabajo"
    });
  }
  if (moduloActivo("abonos")) {
    lista.push({
      titulo: "Cargá un abono",
      detalle: "Un servicio que un cliente te paga todos los meses.",
      hecho: c.abonos > 0,
      vista: "abonos",
      boton: "btnNuevoAbono"
    });
  }
  lista.push(
    moduloActivo("pos")
      ? {
          titulo: "Hacé tu primera venta en el mostrador",
          detalle: "Abrí la caja, buscá lo que se lleva y cobrá en efectivo, con tarjeta o con transferencia.",
          hecho: c.ventas > 0,
          vista: "pos"
        }
      : {
          titulo: "Registrá tu primera venta",
          detalle: moduloActivo("stock")
            ? "Descuenta el stock y, si no te pagan en el acto, queda en la cuenta del cliente."
            : "Si no te pagan en el acto, queda en la cuenta del cliente hasta que la cobres.",
          hecho: c.ventas > 0,
          vista: "ventas",
          boton: "btnNuevaVenta"
        },
    {
      titulo: "Sumá a alguien de tu equipo",
      detalle: "Cada persona entra con su usuario, y ve lo que le corresponde a su rol.",
      hecho: c.usuarios > 1,
      hash: "#/configuracion/usuarios"
    }
  );
  return lista;
}

function pintar(lista) {
  const hechos = lista.filter((p) => p.hecho).length;
  const total = lista.length;
  const faltan = total - hechos;
  const siguiente = lista.findIndex((p) => !p.hecho);
  panel.innerHTML = `
    <div class="primeros-pasos-head">
      <div>
        <h2>Primeros pasos</h2>
        <p class="primeros-pasos-sub">${
          hechos === 0
            ? "Cargá esto y Nexo queda listo para trabajar."
            : `Llevás ${hechos} de ${total}. ${faltan === 1 ? "Te falta uno." : `Te faltan ${faltan}.`}`
        }</p>
      </div>
      <button type="button" class="btn-link" data-ocultar>Ocultar la guía</button>
    </div>
    <div class="primeros-pasos-barra" role="progressbar" aria-label="Primeros pasos" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${hechos}">
      <span style="width: ${(hechos / total) * 100}%"></span>
    </div>
    <ol class="primeros-pasos-lista">
      ${lista
        .map(
          (p, i) => `
        <li class="primeros-paso${p.hecho ? " es-hecho" : ""}${i === siguiente ? " es-siguiente" : ""}">
          <span class="primeros-paso-marca" aria-hidden="true">${p.hecho ? icono("check") : i + 1}</span>
          <div class="primeros-paso-texto">
            <strong>${esc(p.titulo)}</strong>
            <span>${esc(p.detalle)}</span>
          </div>
          ${
            p.hecho
              ? '<span class="visualmente-oculto">Hecho</span>'
              : `<button type="button" class="btn ${i === siguiente ? "btn-primary" : "btn-secundario"}" data-paso="${i}">${
                  i === siguiente ? "Empezar" : "Ir"
                } ${icono("chevron-right")}</button>`
          }
        </li>`
        )
        .join("")}
    </ol>`;
  panel.hidden = false;

  panel.querySelector("[data-ocultar]").addEventListener("click", () => {
    localStorage.setItem(claveOculto(), "1");
    panel.hidden = true;
  });
  panel.querySelectorAll("[data-paso]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const paso = lista[Number(boton.dataset.paso)];
      if (paso.hash) {
        location.hash = paso.hash;
        return;
      }
      mostrarVista(paso.vista);
      // El alta se abre recién con la vista en pantalla: su modal lee los
      // catálogos que la vista ya cargó.
      if (paso.boton) setTimeout(() => document.getElementById(paso.boton)?.click(), 0);
    });
  });
}

async function cargarPrimerosPasos() {
  if (!esAdmin() || localStorage.getItem(claveOculto())) {
    panel.hidden = true;
    return;
  }
  // Con un deep-link al Resumen el negocio todavía no llegó, y los pasos
  // dependen de sus módulos.
  const [conteos] = await Promise.all([api("/api/negocio/primeros-pasos"), negocio.id ? null : recargar("negocio")]);
  const lista = pasos(conteos);
  if (lista.every((p) => p.hecho)) {
    panel.hidden = true;
    return;
  }
  pintar(lista);
}

alEntrarEnVista("dashboard", cargarPrimerosPasos);
