/**
 * core/filtros.js
 * Motor de filtros estilo Notion (chips por propiedad, operador y valor).
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

import { numero } from "./formato.js";

/* ---------- Filtros (estilo Notion) ---------- */

// La idea es la de Notion: la pantalla no muestra una fila de campos
// siempre visible, sino un botón "+ Filtro". Elegís la propiedad, se
// agrega un chip "Propiedad · operador · valor", y ese chip se edita o se
// borra. Qué operadores hay depende del tipo de la propiedad: un texto se
// puede "contener", un monto puede ser "mayor que", una fecha puede caer
// "entre" dos días o en un período relativo como "este mes".
//
// campos: [{ clave, etiqueta, tipo: "texto"|"numero"|"fecha"|"select", opciones }]
// Un filtro guardado es { campo, operador, valor, valor2 }.

const OPERADORES = {
  texto: [
    { valor: "contiene", texto: "contiene", pide: 1 },
    { valor: "no_contiene", texto: "no contiene", pide: 1 },
    { valor: "es", texto: "es exactamente", pide: 1 },
    { valor: "no_es", texto: "no es", pide: 1 },
    { valor: "empieza", texto: "empieza con", pide: 1 },
    { valor: "vacio", texto: "está vacío", pide: 0 },
    { valor: "no_vacio", texto: "no está vacío", pide: 0 }
  ],
  numero: [
    { valor: "mayor", texto: "es mayor que", pide: 1 },
    { valor: "mayor_igual", texto: "es mayor o igual que", pide: 1 },
    { valor: "menor", texto: "es menor que", pide: 1 },
    { valor: "menor_igual", texto: "es menor o igual que", pide: 1 },
    { valor: "igual", texto: "es igual a", pide: 1 },
    { valor: "distinto", texto: "es distinto de", pide: 1 },
    { valor: "entre", texto: "está entre", pide: 2 }
  ],
  fecha: [
    // Los relativos van primero porque son los que más se usan: "¿cómo me
    // fue este mes?" no debería obligar a tipear dos fechas.
    { valor: "hoy", texto: "es hoy", pide: 0 },
    { valor: "ayer", texto: "es ayer", pide: 0 },
    { valor: "ultimos_7", texto: "está en los últimos 7 días", pide: 0 },
    { valor: "ultimos_30", texto: "está en los últimos 30 días", pide: 0 },
    { valor: "este_mes", texto: "es este mes", pide: 0 },
    { valor: "mes_pasado", texto: "es el mes pasado", pide: 0 },
    { valor: "este_anio", texto: "es este año", pide: 0 },
    { valor: "es", texto: "es el día", pide: 1 },
    { valor: "despues", texto: "es posterior a", pide: 1 },
    { valor: "en_o_despues", texto: "es desde el", pide: 1 },
    { valor: "antes", texto: "es anterior a", pide: 1 },
    { valor: "en_o_antes", texto: "es hasta el", pide: 1 },
    { valor: "entre", texto: "está entre", pide: 2 }
  ],
  select: [
    { valor: "es", texto: "es", pide: 1 },
    { valor: "no_es", texto: "no es", pide: 1 },
    { valor: "vacio", texto: "está vacío", pide: 0 },
    { valor: "no_vacio", texto: "no está vacío", pide: 0 }
  ]
};

// Traduce un operador relativo a un par de fechas concretas. Devuelve null
// si el operador no es relativo, y ahí el filtro usa las fechas tipeadas.
function rangoRelativo(operador) {
  const iso = (d) => d.toLocaleDateString("sv-SE");
  const hoy = new Date();
  const corrido = (dias) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + dias);
    return d;
  };

  switch (operador) {
    case "hoy":
      return [iso(hoy), iso(hoy)];
    case "ayer":
      return [iso(corrido(-1)), iso(corrido(-1))];
    case "ultimos_7":
      return [iso(corrido(-6)), iso(hoy)];
    case "ultimos_30":
      return [iso(corrido(-29)), iso(hoy)];
    case "este_mes":
      // El día 0 del mes siguiente es el último del actual.
      return [
        iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
        iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
      ];
    case "mes_pasado":
      return [
        iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0))
      ];
    case "este_anio":
      return [`${hoy.getFullYear()}-01-01`, `${hoy.getFullYear()}-12-31`];
    default:
      return null;
  }
}

// Un filtro de fecha, sea relativo o tipeado, se puede expresar siempre
// como un desde/hasta. Lo usa el Resumen, que le manda el rango al backend
// en vez de filtrar en memoria.
export function rangoDeFiltroFecha(filtro) {
  const relativo = rangoRelativo(filtro.operador);
  if (relativo) return { desde: relativo[0], hasta: relativo[1] };

  const { operador, valor, valor2 } = filtro;
  if (!valor) return {};
  switch (operador) {
    case "es":
      return { desde: valor, hasta: valor };
    case "despues":
    case "en_o_despues":
      return { desde: valor };
    case "antes":
    case "en_o_antes":
      return { hasta: valor };
    case "entre":
      return valor2 ? { desde: valor, hasta: valor2 } : { desde: valor };
    default:
      return {};
  }
}

const estaVacio = (v) => v === null || v === undefined || String(v).trim() === "";

function cumpleFiltro(fila, filtro, campo) {
  const bruto = fila[filtro.campo];
  const { operador, valor, valor2 } = filtro;

  if (operador === "vacio") return estaVacio(bruto);
  if (operador === "no_vacio") return !estaVacio(bruto);

  if (campo.tipo === "fecha") {
    const relativo = rangoRelativo(operador);
    if (relativo) return bruto >= relativo[0] && bruto <= relativo[1];
    if (!valor) return true; // filtro a medio cargar: no esconde nada
    switch (operador) {
      case "es": return bruto === valor;
      case "antes": return bruto < valor;
      case "despues": return bruto > valor;
      case "en_o_antes": return bruto <= valor;
      case "en_o_despues": return bruto >= valor;
      case "entre": return bruto >= valor && (!valor2 || bruto <= valor2);
      default: return true;
    }
  }

  if (campo.tipo === "numero") {
    if (estaVacio(valor)) return true;
    const n = Number(bruto);
    const v = Number(valor);
    switch (operador) {
      case "igual": return n === v;
      case "distinto": return n !== v;
      case "mayor": return n > v;
      case "mayor_igual": return n >= v;
      case "menor": return n < v;
      case "menor_igual": return n <= v;
      case "entre": return n >= v && (estaVacio(valor2) || n <= Number(valor2));
      default: return true;
    }
  }

  if (estaVacio(valor)) return true;
  // Los select comparan el valor crudo (suelen ser ids); los textos
  // comparan sin distinguir mayúsculas ni acentos de más.
  if (campo.tipo === "select") {
    if (operador === "es") return String(bruto) === String(valor);
    if (operador === "no_es") return String(bruto) !== String(valor);
    return true;
  }
  const texto = String(bruto ?? "").toLowerCase();
  const busca = String(valor).toLowerCase();
  switch (operador) {
    case "contiene": return texto.includes(busca);
    case "no_contiene": return !texto.includes(busca);
    case "es": return texto === busca;
    case "no_es": return texto !== busca;
    case "empieza": return texto.startsWith(busca);
    default: return true;
  }
}

// Todos los filtros tienen que cumplirse (Y), como el modo básico de Notion.
function aplicarFiltros(lista, filtros, campos) {
  if (filtros.length === 0) return lista;
  return lista.filter((fila) =>
    filtros.every((filtro) => {
      const campo = campos.find((c) => c.clave === filtro.campo);
      return !campo || cumpleFiltro(fila, filtro, campo);
    })
  );
}


export function crearFiltros(contenedorId, campos, onCambio) {
  const contenedor = document.getElementById(contenedorId);
  const claveGuardado = `nexo.filtros.${contenedorId}`;

  // Los filtros sobreviven a recargar la página. Se descartan los que
  // apuntan a un campo que ya no existe, para que un cambio de config no
  // deje filtros fantasma escondiendo datos.
  let filtros = [];
  try {
    const guardado = JSON.parse(localStorage.getItem(claveGuardado) ?? "[]");
    if (Array.isArray(guardado)) {
      filtros = guardado.filter((f) => campos.some((c) => c.clave === f.campo));
    }
  } catch {
    filtros = [];
  }

  const buscarCampo = (clave) => campos.find((c) => c.clave === clave);
  const operadoresDe = (clave) => OPERADORES[buscarCampo(clave).tipo];

  function guardar() {
    try {
      localStorage.setItem(claveGuardado, JSON.stringify(filtros));
    } catch {
      // Modo privado o storage lleno: los filtros siguen funcionando en
      // esta sesión, solo no se recuerdan.
    }
  }

  function textoValor(filtro, campo) {
    if (campo.tipo === "select") {
      return campo.opciones?.find((o) => String(o.valor) === String(filtro.valor))?.texto ?? filtro.valor;
    }
    if (campo.tipo === "numero") {
      const n = Number(filtro.valor);
      return Number.isFinite(n) ? numero(n) : filtro.valor;
    }
    return filtro.valor;
  }

  function etiquetaChip(filtro) {
    const campo = buscarCampo(filtro.campo);
    const op = operadoresDe(filtro.campo).find((o) => o.valor === filtro.operador);
    if (!op) return campo.etiqueta;

    let texto = `<strong>${campo.etiqueta}</strong> ${op.texto}`;
    if (op.pide >= 1) {
      texto += ` <strong>${estaVacio(filtro.valor) ? "…" : textoValor(filtro, campo)}</strong>`;
    }
    if (op.pide === 2) {
      texto += ` y <strong>${estaVacio(filtro.valor2) ? "…" : textoValor({ ...filtro, valor: filtro.valor2 }, campo)}</strong>`;
    }
    return texto;
  }

  function cerrarPopover() {
    contenedor.querySelector(".filtro-popover")?.remove();
    contenedor.querySelectorAll(".filtro-chip.is-abierto").forEach((c) => c.classList.remove("is-abierto"));
  }

  // Popover 1: elegir sobre qué propiedad filtrar.
  function abrirSelectorCampo(anclaje) {
    cerrarPopover();
    const pop = document.createElement("div");
    pop.className = "filtro-popover";
    pop.innerHTML =
      `<p class="filtro-popover-titulo">Filtrar por</p>` +
      campos
        .map((c) => `<button type="button" class="filtro-opcion" data-campo="${c.clave}">${c.etiqueta}</button>`)
        .join("");
    contenedor.appendChild(pop);
    // Clamp de los dos lados: antes solo se evitaba desbordar por la
    // izquierda (Math.max(0, ...)), así que un chip cerca del final de una
    // fila con flex-wrap podía abrir el popover fuera del ancho de
    // .main. Se mide después de appendear porque offsetWidth recién
    // existe con el elemento en el DOM.
    const maxLeft = Math.max(0, contenedor.clientWidth - pop.offsetWidth);
    pop.style.left = `${Math.max(0, Math.min(anclaje.offsetLeft, maxLeft))}px`;
    // Sin esto, el click sale del popover, llega al listener de "click
    // afuera" y —como para entonces este popover ya fue reemplazado— se
    // interpreta como un click externo que cierra el editor recién abierto.
    pop.addEventListener("click", (e) => e.stopPropagation());

    pop.querySelectorAll(".filtro-opcion").forEach((btn) => {
      btn.addEventListener("click", () => {
        const clave = btn.dataset.campo;
        // Arranca con el primer operador del tipo, que es el más usado.
        filtros.push({ campo: clave, operador: operadoresDe(clave)[0].valor, valor: "", valor2: "" });
        guardar();
        render();
        // Se abre enseguida para poder completar el valor sin otro click.
        const chip = contenedor.querySelectorAll(".filtro-chip")[filtros.length - 1];
        abrirEditorFiltro(filtros.length - 1, chip);
      });
    });
  }

  // Popover 2: editar un filtro ya puesto (propiedad, operador y valores).
  function abrirEditorFiltro(indice, anclaje) {
    cerrarPopover();
    anclaje.classList.add("is-abierto");

    const filtro = filtros[indice];
    const campo = buscarCampo(filtro.campo);
    const op = operadoresDe(filtro.campo).find((o) => o.valor === filtro.operador);

    const inputValor = (cual, valor) => {
      if (campo.tipo === "select") {
        return `<select class="filtro-input" data-cual="${cual}">
            <option value="">Elegir…</option>
            ${(campo.opciones ?? [])
              .map(
                (o) =>
                  `<option value="${o.valor}" ${String(o.valor) === String(valor) ? "selected" : ""}>${o.texto}</option>`
              )
              .join("")}
          </select>`;
      }
      const tipo = campo.tipo === "fecha" ? "date" : campo.tipo === "numero" ? "number" : "text";
      return `<input class="filtro-input" data-cual="${cual}" type="${tipo}" value="${valor ?? ""}" placeholder="Valor" />`;
    };

    const pop = document.createElement("div");
    pop.className = "filtro-popover";
    pop.innerHTML = `
      <select class="filtro-input filtro-campo-select">
        ${campos
          .map((c) => `<option value="${c.clave}" ${c.clave === filtro.campo ? "selected" : ""}>${c.etiqueta}</option>`)
          .join("")}
      </select>
      <select class="filtro-input filtro-operador-select">
        ${operadoresDe(filtro.campo)
          .map((o) => `<option value="${o.valor}" ${o.valor === filtro.operador ? "selected" : ""}>${o.texto}</option>`)
          .join("")}
      </select>
      ${op && op.pide >= 1 ? inputValor("valor", filtro.valor) : ""}
      ${op && op.pide === 2 ? inputValor("valor2", filtro.valor2) : ""}
      <button type="button" class="filtro-eliminar">Eliminar filtro</button>
    `;
    contenedor.appendChild(pop);
    // Mismo clamp de ambos lados que abrirSelectorCampo — ver comentario ahí.
    const maxLeft = Math.max(0, contenedor.clientWidth - pop.offsetWidth);
    pop.style.left = `${Math.max(0, Math.min(anclaje.offsetLeft, maxLeft))}px`;
    pop.addEventListener("click", (e) => e.stopPropagation());

    // Cambiar de propiedad reinicia el operador: los de un texto no tienen
    // sentido en una fecha.
    pop.querySelector(".filtro-campo-select").addEventListener("change", (e) => {
      filtros[indice] = { campo: e.target.value, operador: operadoresDe(e.target.value)[0].valor, valor: "", valor2: "" };
      guardar();
      render();
      abrirEditorFiltro(indice, contenedor.querySelectorAll(".filtro-chip")[indice]);
      onCambio(filtros);
    });

    pop.querySelector(".filtro-operador-select").addEventListener("change", (e) => {
      filtros[indice].operador = e.target.value;
      guardar();
      render();
      abrirEditorFiltro(indice, contenedor.querySelectorAll(".filtro-chip")[indice]);
      onCambio(filtros);
    });

    pop.querySelectorAll("[data-cual]").forEach((input) => {
      input.addEventListener(input.tagName === "SELECT" || input.type === "date" ? "change" : "input", () => {
        filtros[indice][input.dataset.cual] = input.value;
        guardar();
        // Solo se repinta el texto del chip: repintar todo sacaría el foco
        // del campo mientras se está escribiendo.
        contenedor.querySelectorAll(".filtro-chip")[indice].querySelector(".filtro-chip-texto").innerHTML =
          etiquetaChip(filtros[indice]);
        onCambio(filtros);
      });
    });

    pop.querySelector(".filtro-eliminar").addEventListener("click", () => {
      filtros.splice(indice, 1);
      guardar();
      cerrarPopover();
      render();
      onCambio(filtros);
    });

    pop.querySelector(".filtro-input")?.focus();
  }

  function render() {
    const abierto = contenedor.querySelector(".filtro-popover");
    contenedor.innerHTML =
      filtros
        .map(
          (filtro, i) => `
        <span class="filtro-chip" data-indice="${i}">
          <button type="button" class="filtro-chip-texto">${etiquetaChip(filtro)}</button>
          <button type="button" class="filtro-chip-x" title="Quitar filtro" aria-label="Quitar filtro">✕</button>
        </span>`
        )
        .join("") +
      `<button type="button" class="btn-agregar-filtro">${filtros.length ? "+" : "+ Filtro"}</button>` +
      (filtros.length > 1 ? `<button type="button" class="btn-limpiar-filtros">Limpiar todo</button>` : "");
    if (abierto) contenedor.appendChild(abierto);

    contenedor.querySelectorAll(".filtro-chip-texto").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirEditorFiltro(Number(btn.closest(".filtro-chip").dataset.indice), btn.closest(".filtro-chip"));
      });
    });

    contenedor.querySelectorAll(".filtro-chip-x").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        filtros.splice(Number(btn.closest(".filtro-chip").dataset.indice), 1);
        guardar();
        cerrarPopover();
        render();
        onCambio(filtros);
      });
    });

    contenedor.querySelector(".btn-agregar-filtro").addEventListener("click", (e) => {
      e.stopPropagation();
      abrirSelectorCampo(e.currentTarget);
    });

    contenedor.querySelector(".btn-limpiar-filtros")?.addEventListener("click", () => {
      filtros = [];
      guardar();
      cerrarPopover();
      render();
      onCambio(filtros);
    });
  }

  // Un click afuera cierra el popover, como en Notion.
  document.addEventListener("click", (e) => {
    if (!contenedor.contains(e.target)) cerrarPopover();
  });

  render();

  return {
    get filtros() {
      return filtros;
    },
    // Los selects que se llenan con datos que llegan después (cuentas,
    // categorías, productos) actualizan sus opciones acá.
    setOpciones(clave, opciones) {
      const campo = buscarCampo(clave);
      if (campo) campo.opciones = opciones;
      render();
    },
    aplicar(lista) {
      return aplicarFiltros(lista, filtros, campos);
    },
    // Para el botón "Limpiar filtros" del estado vacío filtrado — mismo
    // efecto que vaciar los filtros a mano desde los chips.
    limpiar() {
      filtros = [];
      guardar();
      cerrarPopover();
      render();
      onCambio(filtros);
    }
  };
}
