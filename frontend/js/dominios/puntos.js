/**
 * dominios/puntos.js
 * Puntos y premios (hist. §223, docs/investigaciones/investigacion-puntos.md),
 * sobre las rutas de server.js, sección "Puntos y premios". Las reglas (cuánto
 * suma una venta, qué vence, cómo baja un premio) son las de core/puntos.js,
 * las mismas que usa el servidor.
 * - la página (#/puntos), solo del admin: la regla, los premios, quién tiene
 *   puntos y los últimos canjes y ajustes;
 * - la de cada premio (#/puntos/premio/nuevo, #/puntos/premio/<id>), en dos
 *   pasos: qué se lleva y cuántos puntos cuesta. Desde ahí se pausa o se borra;
 * - el bloque de la ficha del cliente: su saldo, de dónde salió, avisarle por
 *   WhatsApp y, el admin, sumarle o quitarle a mano.
 * El canje se hace en el mostrador (dominios/pos.js).
 */

import { badge, celdaMovil, esAdmin, esc, fechaAR, fechaHoraAR, money, numero } from "../core/formato.js";
import { avisar, confirmar, filaVacia, tablaCargando } from "../core/ui.js";
import { api } from "../core/api.js";
import { alEntrarEnVista, invocar, registrar } from "../core/registro.js";
import { mostrarVista } from "../core/router.js";
import { moduloActivo, negocio } from "../core/negocio.js";
import { describirPremio, textoPuntos } from "../core/puntos.js";
import { enlaceWhatsApp, llenarMensaje, textoDe } from "../core/mensajes.js";
import { formatear, t } from "../core/idioma.js";

// Cómo se pide el valor según el tipo de premio.
const CAMPO_VALOR = {
  porcentaje: { texto: "Porcentaje", sufijo: "%", placeholder: "10" },
  monto: { texto: "Cuánto menos", sufijo: "$", placeholder: "5000" }
};

let pagina = null; // lo de GET /api/puntos
let catalogo = []; // lo que se puede regalar: productos y variantes
let premioEditado = null;
let regaloElegido = null; // { producto_id, variante_id, nombre }

// El mensaje "Tus puntos" de Configuración › Mensajes de WhatsApp, armado.
function enlacePuntos(cliente, saldo, proximo) {
  if (!cliente.telefono || !(saldo > 0)) return null;
  const texto = llenarMensaje(textoDe("puntos", negocio.mensajes_whatsapp), {
    nombre: cliente.nombre,
    negocio: negocio.nombre,
    puntos: textoPuntos(saldo),
    vencen: proximo ? fechaAR(proximo.fecha) : ""
  });
  return enlaceWhatsApp(cliente.telefono, texto);
}

const mismoTexto = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

const textoProximo = (proximo) => (proximo ? formatear("{0} el {1}", textoPuntos(proximo.puntos), fechaAR(proximo.fecha)) : "—");

/* ---------- La página (#/puntos) ---------- */

const formPrograma = document.getElementById("formProgramaPuntos");

function pintarEjemplo() {
  const cada = Number(formPrograma.puntos_cada.value);
  const meses = Number(formPrograma.vencen_meses.value);
  const ejemplo = formPrograma.querySelector("[data-ejemplo]");
  if (!(cada > 0)) {
    ejemplo.textContent = t("Sin regla, las ventas no suman puntos.");
    return;
  }
  const compra = Math.max(cada * 25, 10000);
  const vencen = meses > 0 ? formatear(" Vencen a los {0} meses de la compra.", numero(meses)) : t(" No vencen.");
  ejemplo.textContent = formatear("Una compra de {0} suma {1}.", money(compra), textoPuntos(Math.floor(compra / cada))) + vencen;
}

formPrograma.addEventListener("input", pintarEjemplo);

formPrograma.addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = formPrograma.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api("/api/puntos/programa", {
      method: "PUT",
      body: { puntos_cada: formPrograma.puntos_cada.value || null, vencen_meses: formPrograma.vencen_meses.value || null },
      error: "No se pudo guardar la regla."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(formPrograma.puntos_cada.value ? "Regla guardada: vale para lo que vendas desde ahora." : "Listo: las ventas dejan de sumar puntos.", "ok");
  await cargarPagina();
});

function pintarPremios() {
  const body = document.getElementById("premiosBody");
  if (pagina.premios.length === 0) {
    body.innerHTML = filaVacia(4, "Todavía no hay premios. Armá el primero: un descuento o algo de regalo.", {
      accionTexto: "+ Nuevo premio",
      accionId: "btnPrimerPremio"
    });
    return;
  }
  body.innerHTML = pagina.premios
    .map((p) => {
      // "Medialuna de regalo" ya dice lo que es: no se repite abajo.
      const queEs = mismoTexto(p.nombre, p.descripcion) ? "" : `<small class="ofertas-cuanto">${esc(p.descripcion)}</small>`;
      return `
    <tr class="fila-clickeable" data-id="${p.id}">
      <td data-label="Premio" class="m-titulo">${esc(p.nombre)}${queEs}</td>
      <td data-label="Cuesta" class="align-right mono m-valor">${esc(textoPuntos(p.puntos))}</td>
      <td data-label="Canjes" class="align-right mono">${esc(numero(p.canjes))}</td>
      <td data-label="Estado">${p.activo ? badge("status-cobrado", "Activo").html : badge("", "Pausado").html}</td>
    </tr>`;
    })
    .join("");
}

document.getElementById("premiosBody").addEventListener("click", (e) => {
  if (e.target.closest('[data-abrir="btnPrimerPremio"]')) return mostrarVista("puntos", { subruta: "premio/nuevo" });
  const fila = e.target.closest("tr[data-id]");
  if (fila) mostrarVista("puntos", { subruta: `premio/${fila.dataset.id}` });
});

function pintarClientes() {
  const body = document.getElementById("puntosClientesBody");
  if (pagina.clientes.length === 0) {
    body.innerHTML = filaVacia(
      4,
      pagina.programa.activo ? "Todavía nadie sumó puntos: suman al pagar sus compras." : "Armá la regla de arriba y tus clientes empiezan a sumar."
    );
    return;
  }
  body.innerHTML = pagina.clientes
    .map((c) => {
      const enlace = enlacePuntos(c, c.saldo, c.proximo);
      const avisarle = enlace
        ? `<a class="btn-link" href="${esc(enlace)}" target="_blank" rel="noopener" data-whatsapp>${esc(t("Avisarle"))}</a>`
        : "";
      return `
    <tr class="fila-clickeable" data-cliente="${c.id}">
      <td data-label="Cliente" class="m-titulo">${esc(c.nombre)}</td>
      ${celdaMovil(c.proximo ? formatear("Vencen {0}", textoProximo(c.proximo)) : "")}
      <td data-label="Puntos" class="align-right mono m-valor">${esc(textoPuntos(c.saldo))}</td>
      <td data-label="Próximos a vencer">${esc(textoProximo(c.proximo))}</td>
      <td data-label="Avisarle" class="align-right">${avisarle}</td>
    </tr>`;
    })
    .join("");
}

document.getElementById("puntosClientesBody").addEventListener("click", (e) => {
  if (e.target.closest("[data-whatsapp]")) return;
  const fila = e.target.closest("tr[data-cliente]");
  if (fila) invocar("abrirFicha:cliente", Number(fila.dataset.cliente));
});

function pintarMovimientos() {
  const body = document.getElementById("puntosMovimientosBody");
  if (pagina.movimientos.length === 0) {
    body.innerHTML = filaVacia(4, "Acá van a aparecer los canjes del mostrador y lo que sumes o quites a mano.");
    return;
  }
  body.innerHTML = pagina.movimientos
    .map((m) => {
      const anulada = m.venta_estado === "anulada";
      const que = `${m.descripcion}${m.venta_id ? ` · ${t("Venta")} #${m.venta_id}` : ""}${anulada ? ` (${t("anulada")})` : ""}`;
      return `
    <tr class="${anulada ? "fila-anulada" : ""}">
      <td data-label="Fecha">${esc(fechaHoraAR(m.fecha))}</td>
      <td data-label="Cliente" class="m-titulo">${esc(m.cliente)}</td>
      <td data-label="Qué">${esc(que)}</td>
      ${celdaMovil(que)}
      <td data-label="Puntos" class="align-right mono m-valor">${m.puntos > 0 ? "+" : ""}${esc(numero(m.puntos))}</td>
    </tr>`;
    })
    .join("");
}

async function cargarPagina() {
  tablaCargando("premiosBody", 4, 2);
  tablaCargando("puntosClientesBody", 4, 3);
  pagina = await api("/api/puntos", { error: "No se pudieron cargar los puntos." });
  document.getElementById("puntosClientes").textContent = numero(pagina.totales.clientes);
  document.getElementById("puntosParaCanjear").textContent = numero(pagina.totales.puntos);
  document.getElementById("puntosCanjesMes").textContent = numero(pagina.totales.canjes_mes.canjes);
  document.getElementById("puntosMontoMes").textContent = money(pagina.totales.canjes_mes.monto);
  formPrograma.puntos_cada.value = pagina.programa.puntos_cada ?? "";
  formPrograma.vencen_meses.value = pagina.programa.vencen_meses ?? "";
  pintarEjemplo();
  pintarPremios();
  pintarClientes();
  pintarMovimientos();
}

/* ---------- Un premio (#/puntos/premio/nuevo, #/puntos/premio/<id>) ---------- */

const formPremio = document.getElementById("formPremio");
const botonPausar = formPremio.querySelector('[data-accion="pausar"]');
const botonBorrar = formPremio.querySelector('[data-accion="borrar"]');
const campoRegalo = document.getElementById("premioProducto");

const tipoElegido = () => formPremio.querySelector('input[name="tipo"]:checked').value;

function pintarTipo() {
  const tipo = tipoElegido();
  for (const bloque of formPremio.querySelectorAll("[data-tipo-premio]")) {
    bloque.hidden = (bloque.dataset.tipoPremio === "producto") !== (tipo === "producto");
  }
  if (tipo === "producto") return;
  const campo = CAMPO_VALOR[tipo];
  formPremio.querySelector("[data-texto-valor]").textContent = t(campo.texto);
  formPremio.querySelector("[data-sufijo]").textContent = campo.sufijo;
  formPremio.valor.placeholder = campo.placeholder;
}

function leerPremio() {
  const tipo = tipoElegido();
  return {
    nombre: formPremio.nombre.value.trim(),
    tipo,
    valor: tipo === "producto" ? null : Number(formPremio.valor.value),
    producto_id: tipo === "producto" ? (regaloElegido?.producto_id ?? null) : null,
    variante_id: tipo === "producto" ? (regaloElegido?.variante_id ?? null) : null,
    puntos: Number(formPremio.puntos.value)
  };
}

// Cuánto hay que comprar para juntarlo, y lo que hace el premio en una línea.
function pintarResumen() {
  const premio = leerPremio();
  const cada = pagina?.programa.puntos_cada;
  formPremio.querySelector("[data-equivale]").textContent =
    premio.puntos > 0 && cada > 0
      ? formatear("Con un punto cada {0}, se junta con {1} en compras.", money(cada), money(premio.puntos * cada))
      : "";
  const listo = premio.puntos > 0 && (premio.tipo === "producto" ? premio.producto_id : premio.valor > 0);
  formPremio.querySelector("[data-resumen]").textContent = listo
    ? formatear("{0} por {1}.", describirPremio(premio, regaloElegido?.nombre), textoPuntos(premio.puntos))
    : t("Completá qué se lleva y cuántos puntos cuesta.");
}

async function prepararPremio(id) {
  [pagina, catalogo] = await Promise.all([
    pagina ? Promise.resolve(pagina) : api("/api/puntos", { error: "No se pudieron cargar los puntos." }),
    api("/api/pos/catalogo", { error: "No se pudo cargar el catálogo." })
  ]);
  premioEditado = id ? (pagina.premios.find((p) => p.id === id) ?? null) : null;
  if (id && !premioEditado) {
    avisar("Ese premio no existe.", "error");
    return mostrarVista("puntos");
  }
  const p = premioEditado;
  formPremio.reset();
  formPremio.nombre.value = p?.nombre ?? "";
  formPremio.tipo.value = p?.tipo ?? "porcentaje";
  formPremio.valor.value = p?.valor ?? "";
  formPremio.puntos.value = p?.puntos ?? "";
  document.getElementById("premioProductos").innerHTML = catalogo.map((i) => `<option value="${esc(i.nombre)}"></option>`).join("");
  regaloElegido = p?.tipo === "producto" ? { producto_id: p.producto_id, variante_id: p.variante_id, nombre: p.producto } : null;
  campoRegalo.value = regaloElegido?.nombre ?? "";

  botonPausar.hidden = !p;
  botonPausar.textContent = p?.activo === false ? t("Volver a activarlo") : t("Pausar");
  // El que ya se canjeó no se borra: el historial de alguien lo nombra.
  botonBorrar.hidden = !p || p.canjes > 0;
  formPremio.querySelector('[type="submit"]').textContent = p ? t("Guardar cambios") : t("Crear premio");
  pintarTipo();
  pintarResumen();
}

formPremio.addEventListener("change", (e) => {
  if (e.target.name === "tipo") pintarTipo();
  pintarResumen();
});
formPremio.addEventListener("input", pintarResumen);

campoRegalo.addEventListener("input", () => {
  const buscado = campoRegalo.value.trim().toLowerCase();
  const item = catalogo.find((i) => i.nombre.trim().toLowerCase() === buscado);
  regaloElegido = item ? { producto_id: item.producto_id, variante_id: item.variante_id, nombre: item.nombre } : null;
  pintarResumen();
});

formPremio.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cuerpo = leerPremio();
  if (!cuerpo.nombre) return avisar("Ponele un nombre al premio.", "error");
  if (cuerpo.tipo === "producto" && !cuerpo.producto_id) return avisar("Elegí de la lista qué producto se lleva.", "error");
  if (cuerpo.tipo !== "producto" && !(cuerpo.valor > 0)) return avisar("Poné cuánto es el descuento.", "error");
  if (!Number.isInteger(cuerpo.puntos) || cuerpo.puntos < 1) return avisar("Poné cuántos puntos cuesta, en números enteros.", "error");
  const boton = formPremio.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(premioEditado ? `/api/premios/${premioEditado.id}` : "/api/premios", {
      method: premioEditado ? "PUT" : "POST",
      body: cuerpo,
      error: "No se pudo guardar el premio."
    });
  } finally {
    boton.disabled = false;
  }
  avisar(premioEditado ? "Premio guardado." : "Premio listo: ya se puede canjear en el punto de venta.", "ok");
  pagina = null;
  mostrarVista("puntos");
});

botonPausar.addEventListener("click", async () => {
  if (!premioEditado) return;
  const activo = !premioEditado.activo;
  await api(`/api/premios/${premioEditado.id}`, { method: "PATCH", body: { activo }, error: "No se pudo cambiar el premio." });
  avisar(activo ? "El premio vuelve a ofrecerse." : "Premio pausado: el mostrador no lo ofrece hasta que lo actives.", "ok");
  pagina = null;
  mostrarVista("puntos");
});

botonBorrar.addEventListener("click", async () => {
  if (!premioEditado) return;
  const ok = await confirmar({
    titulo: "Borrar el premio",
    cuerpo: `"${premioEditado.nombre}" nunca se canjeó: se borra y no se ofrece más.`,
    aceptar: "Borrar",
    destructivo: true
  });
  if (!ok) return;
  await api(`/api/premios/${premioEditado.id}`, { method: "DELETE", error: "No se pudo borrar el premio." });
  avisar("Premio borrado.", "ok");
  pagina = null;
  mostrarVista("puntos");
});

async function entrarAPuntos(subruta) {
  // La vista es del admin: el router no deja entrar al empleado.
  if (!esAdmin()) return;
  const premio = /^premio\/(nuevo|\d+)$/.exec(subruta ?? "");
  for (const seccion of document.querySelectorAll(".puntos-pagina")) seccion.hidden = seccion.dataset.pagina !== (premio ? "premio" : "lista");
  if (premio) return prepararPremio(premio[1] === "nuevo" ? null : Number(premio[1]));
  if (subruta) history.replaceState(null, "", "#/puntos");
  await cargarPagina();
}

alEntrarEnVista("puntos", entrarAPuntos);

/* ---------- La ficha del cliente ---------- */

const formAjuste = document.getElementById("formAjustePuntos");
let clienteDeLaFicha = null;

const TEXTO_ORIGEN = { venta: "Compra", canje: "Canje", ajuste: "A mano" };

async function pintarPuntosDelCliente(cliente) {
  clienteDeLaFicha = cliente;
  formAjuste.hidden = true;
  if (!moduloActivo("puntos")) return;
  const puntos = await api(`/api/clientes/${cliente.id}/puntos`, { error: "No se pudieron cargar sus puntos." });
  // Si mientras tanto se abrió otra ficha, esta ya no va.
  if (clienteDeLaFicha?.id !== cliente.id) return;
  document.getElementById("fichaPuntosSaldo").textContent = textoPuntos(Math.max(0, puntos.saldo));
  document.getElementById("fichaPuntosVence").textContent = puntos.proximo
    ? formatear("{0} vencen el {1}", textoPuntos(puntos.proximo.puntos), fechaAR(puntos.proximo.fecha))
    : puntos.programa.activo
      ? ""
      : t("Las ventas no suman: falta armar la regla en Puntos y premios.");
  const enlace = enlacePuntos(cliente, puntos.saldo, puntos.proximo);
  const whatsapp = document.getElementById("btnPuntosWhatsApp");
  whatsapp.hidden = !enlace;
  if (enlace) whatsapp.href = enlace;
  document.getElementById("fichaPuntosHistorial").innerHTML = puntos.historial.length
    ? puntos.historial
        .slice(0, 15)
        .map(
          (h) => `
      <li class="puntos-movimiento">
        <span class="puntos-movimiento-que">${esc(t(TEXTO_ORIGEN[h.tipo]))} · ${esc(h.descripcion)}<small>${esc(fechaAR(h.fecha))}</small></span>
        <span class="puntos-movimiento-cuanto mono ${h.puntos < 0 ? "negativo" : ""}">${h.puntos > 0 ? "+" : ""}${esc(numero(h.puntos))}</span>
      </li>`
        )
        .join("")
    : `<li class="puntos-vacio">${esc(t("Todavía no tiene puntos: los suma al pagar sus compras."))}</li>`;
}

registrar("pintar:puntosDelCliente", pintarPuntosDelCliente);

document.getElementById("btnAjustarPuntos").addEventListener("click", () => {
  formAjuste.reset();
  formAjuste.hidden = false;
  formAjuste.puntos.focus();
});

formAjuste.querySelector('[data-accion="cancelar"]').addEventListener("click", () => {
  formAjuste.hidden = true;
});

formAjuste.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!clienteDeLaFicha) return;
  const cuantos = Number(formAjuste.puntos.value);
  const motivo = formAjuste.motivo.value.trim();
  if (!Number.isInteger(cuantos) || cuantos < 1) return avisar("Poné cuántos puntos, en números enteros.", "error");
  if (!motivo) return avisar("Contá por qué, así queda en su historial.", "error");
  const boton = formAjuste.querySelector('[type="submit"]');
  boton.disabled = true;
  try {
    await api(`/api/clientes/${clienteDeLaFicha.id}/puntos`, {
      method: "POST",
      body: { puntos: cuantos * Number(formAjuste.signo.value), motivo },
      error: "No se pudieron guardar los puntos."
    });
  } finally {
    boton.disabled = false;
  }
  avisar("Puntos guardados.", "ok");
  await pintarPuntosDelCliente(clienteDeLaFicha);
});
