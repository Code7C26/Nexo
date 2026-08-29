/**
 * app.js
 * -----------------------------------------------------------
 * Trabaja contra la API real del backend (/api/facturas) en vez
 * de datos estáticos. IVA y retención de Mercado Pago quedan
 * fuera de V1 (decisión del equipo): las facturas se manejan con
 * un único monto (`total`), sin impuestos.
 */

let facturas = [];

document.getElementById("todayDate").textContent = new Date().toLocaleDateString("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long"
});

const money = (n) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

const numero = (n) => n.toLocaleString("es-AR");

const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // formato AAAA-MM-DD, para <input type="date">

// Versión abreviada de money(), para las etiquetas del eje del gráfico de
// evolución: "$450.000,00" no entra en la canaleta angosta del eje.
// Conserva el signo.
function moneyCorto(n) {
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${signo}$${(abs / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `${signo}$${Math.round(abs / 1e3)}k`;
  return `${signo}$${Math.round(abs)}`;
}

const ICONO_TACHO =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/>' +
  '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
  '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

const ICONO_LAPIZ =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 20h9"/>' +
  '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// Botón de editar que va en una fila de tabla. Se usa igual en Productos,
// Clientes y Proveedores para que sea una sola convención: el click en la
// fila abre la ficha completa, el lápiz va directo al modal de edición.
const botonEditarFila = (clase, id, que) =>
  `<button type="button" class="btn-icon ${clase}" data-id="${id}" title="Editar ${que}" aria-label="Editar ${que}">${ICONO_LAPIZ}</button>`;

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
function rangoDeFiltroFecha(filtro) {
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

/* ---------- Orden de tablas (click en el encabezado) ---------- */

// Mismo espíritu que crearFiltros: la tabla ya tiene su <thead> fijo en el
// HTML (los <th data-orden="campo" data-tipo="texto|numero|fecha"> marcan
// qué columnas se pueden ordenar), así que alcanza con engancharle los
// listeners una vez al arrancar. El estado se guarda por tabla y
// sobrevive a recargar, igual que los filtros.
// idBody es el id del <tbody> (la única marca que ya llevan estas tablas
// en el HTML); el <thead> se busca subiendo a la <table> que lo contiene,
// para no tener que agregarle un id nuevo a cada <table>.
function crearOrden(idBody, onCambio) {
  const tabla = document.getElementById(idBody).closest("table");
  const claveGuardado = `nexo.orden.${idBody}`;
  const ths = [...tabla.querySelectorAll("thead th[data-orden]")];

  let orden = null; // { campo, tipo, dir: "asc" | "desc" }
  try {
    const guardado = JSON.parse(localStorage.getItem(claveGuardado) ?? "null");
    // Se descarta si apunta a una columna que ya no existe (cambió el
    // markup): un orden fantasma no debería esconder filas en silencio.
    if (guardado?.campo && ths.some((th) => th.dataset.orden === guardado.campo)) {
      orden = guardado;
    }
  } catch {
    orden = null;
  }

  function guardar() {
    try {
      localStorage.setItem(claveGuardado, JSON.stringify(orden));
    } catch {
      // Modo privado o storage lleno: el orden sigue andando en esta
      // sesión, solo no se recuerda.
    }
  }

  function actualizar() {
    for (const th of ths) {
      const activo = orden && th.dataset.orden === orden.campo;
      th.classList.toggle("th-ordenado", Boolean(activo));
      const flecha = th.querySelector(".th-flecha");
      if (flecha) flecha.textContent = activo ? (orden.dir === "asc" ? "↑" : "↓") : "";
    }
  }

  for (const th of ths) {
    th.classList.add("th-ordenable");
    th.setAttribute("tabindex", "0");
    th.setAttribute("role", "button");
    th.insertAdjacentHTML("beforeend", ` <span class="th-flecha"></span>`);

    const alternar = () => {
      const campo = th.dataset.orden;
      const tipo = th.dataset.tipo || "texto";
      orden =
        orden && orden.campo === campo
          ? { campo, tipo, dir: orden.dir === "asc" ? "desc" : "asc" }
          : { campo, tipo, dir: "asc" };
      guardar();
      actualizar();
      onCambio(orden);
    };

    th.addEventListener("click", alternar);
    // El th también actúa como botón: el teclado tiene que poder
    // disparar el mismo alternar() que el mouse.
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alternar();
      }
    });
  }

  actualizar();

  return {
    get orden() {
      return orden;
    },
    aplicar(lista) {
      if (!orden) return lista;
      const { campo, tipo, dir } = orden;
      const signo = dir === "asc" ? 1 : -1;
      // Los vacíos van al final sea cual sea el sentido: un campo sin
      // cargar (SKU, descripción, margen sin calcular) no debería
      // aparecer primero solo porque el orden es descendente.
      return [...lista].sort((a, b) => {
        const av = a[campo];
        const bv = b[campo];
        const aVacio = av === null || av === undefined || av === "";
        const bVacio = bv === null || bv === undefined || bv === "";
        if (aVacio && bVacio) return 0;
        if (aVacio) return 1;
        if (bVacio) return -1;

        if (tipo === "numero") {
          return (Number(av) - Number(bv)) * signo;
        }
        // "fecha" son strings ISO (AAAA-MM-DD): el orden lexicográfico ya
        // es el orden cronológico, así que comparten la rama de texto.
        return String(av).localeCompare(String(bv), "es") * signo;
      });
    }
  };
}

function crearFiltros(contenedorId, campos, onCambio) {
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
    pop.style.left = `${anclaje.offsetLeft}px`;
    pop.innerHTML =
      `<p class="filtro-popover-titulo">Filtrar por</p>` +
      campos
        .map((c) => `<button type="button" class="filtro-opcion" data-campo="${c.clave}">${c.etiqueta}</button>`)
        .join("");
    contenedor.appendChild(pop);
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
    pop.style.left = `${Math.max(0, anclaje.offsetLeft)}px`;
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

/* ---------- Resumen (resultado del negocio) ---------- */

// El resultado lo calcula el backend, que es quien puede recorrer ventas
// y gastos con el rango de fechas aplicado. Acá solo se muestra.
//
// El filtro de fecha, sea "este mes" o un desde/hasta tipeado, se traduce
// a un rango concreto que entiende el backend. La usan tanto cargarResumen
// como cargarEvolucion, así los dos fetch quedan sobre el mismo rango.
function rangoActualResumen() {
  const filtroFecha = filtrosResumen.filtros.find((f) => f.campo === "fecha");
  return filtroFecha ? rangoDeFiltroFecha(filtroFecha) : {};
}

async function cargarResumen() {
  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const resumen = await (await fetch(`/api/resumen${params ? "?" + params : ""}`)).json();

  document.getElementById("sumVentas").textContent = money(resumen.ventas);
  document.getElementById("sumCosto").textContent = money(resumen.costo_mercaderia);
  document.getElementById("sumGananciaBruta").textContent = money(resumen.ganancia_bruta);
  document.getElementById("sumGastosOperativos").textContent = money(resumen.gastos_operativos);
  document.getElementById("sumInversiones").textContent = money(resumen.inversiones);
  document.getElementById("sumRetiros").textContent = money(resumen.retiros);

  // Un resultado negativo es información importante, no un detalle: va en
  // rojo para que no pase desapercibido entre el resto de los números.
  const elResultado = document.getElementById("sumResultado");
  elResultado.textContent = money(resumen.resultado);
  elResultado.classList.toggle("saldo-negativo", resumen.resultado < 0);
  elResultado.classList.toggle("ledger-ok", resumen.resultado >= 0);

  renderUltimosMovimientos(rango);

  // Sin await a propósito: este es el número que el operador está mirando
  // cuando carga una venta o un gasto (cargarResumen() se llama tras casi
  // toda mutación), así que tiene que quedar al día ya. La evolución
  // (gráfico + tabla + deltas) es una vista más profunda que puede llegar
  // unos milisegundos después sin que nadie lo note.
  cargarEvolucion().catch(() => {});
}

// Métrica → si "subir" es una mejora. Para gastos es al revés que para el
// resto: un aumento de gastos operativos es peor, no mejor, y pintarlo de
// verde porque el número subió sería directamente incorrecto.
const MEJOR_SI_SUBE = {
  ventas: true,
  ganancia_bruta: true,
  gastos_operativos: false,
  resultado: true
};

function formatearDelta(campo, delta) {
  if (!delta || !delta.comparable) {
    return `<span class="ledger-delta-neutro">— sin período anterior</span>`;
  }
  const mejoro = MEJOR_SI_SUBE[campo] ? delta.abs >= 0 : delta.abs <= 0;
  const clase = delta.abs === 0 ? "ledger-delta-neutro" : mejoro ? "ledger-delta-ok" : "ledger-delta-mal";
  const flecha = delta.abs > 0 ? "▲" : delta.abs < 0 ? "▼" : "—";
  const abs = money(Math.abs(delta.abs));
  if (delta.cruza_cero) {
    // Un porcentaje acá sería técnicamente correcto pero absurdo de leer
    // (de -1000 a +10 da +101%): se muestra solo el cambio absoluto, con
    // texto explícito de qué cruzó.
    const texto = delta.abs > 0 ? "de pérdida a ganancia" : "de ganancia a pérdida";
    return `<span class="${clase}">${flecha} ${abs} (${texto})</span>`;
  }
  return `<span class="${clase}">${flecha} ${abs} (${porcentaje(Math.abs(delta.pct))})</span>`;
}

function renderDeltas(data) {
  const nota = document.getElementById("resumenRangoNota");
  if (!data.delta) {
    nota.textContent = data.rango.acotado
      ? `Del ${data.rango.desde} al ${data.rango.hasta}.`
      : `Del ${data.rango.desde} al ${data.rango.hasta} (todo lo cargado hasta hoy).`;
  } else {
    nota.textContent = `Del ${data.rango.desde} al ${data.rango.hasta}, comparado contra el ${data.anterior.rango.desde} al ${data.anterior.rango.hasta}.`;
  }

  for (const [campo, id] of [
    ["ventas", "deltaVentas"],
    ["ganancia_bruta", "deltaGananciaBruta"],
    ["gastos_operativos", "deltaGastosOperativos"],
    ["resultado", "deltaResultado"]
  ]) {
    document.getElementById(id).innerHTML = formatearDelta(campo, data.delta?.[campo]);
  }
}

function renderTablaEvolucion(serie) {
  const body = document.getElementById("evolucionBody");
  if (serie.length === 0) {
    body.innerHTML = filaVacia(7, "No hay operaciones en este período.");
    return;
  }
  body.innerHTML = serie
    .map((p) => {
      const margen = p.ventas > 0 ? porcentaje((p.ganancia_bruta / p.ventas) * 100) : "—";
      return `
    <tr>
      <td data-label="Período">${p.etiqueta}${p.parcial ? " (parcial)" : ""}</td>
      <td data-label="Ventas" class="align-right mono">${money(p.ventas)}</td>
      <td data-label="Costo" class="align-right mono">${money(p.costo_mercaderia)}</td>
      <td data-label="Ganancia bruta" class="align-right mono">${money(p.ganancia_bruta)}</td>
      <td data-label="Margen" class="align-right mono">${margen}</td>
      <td data-label="Gastos" class="align-right mono">${money(p.gastos_operativos)}</td>
      <td data-label="Resultado" class="align-right mono ${p.resultado < 0 ? "saldo-negativo" : ""}">${money(p.resultado)}</td>
    </tr>`;
    })
    .join("");
}

// Gráfico de barras del resultado por período, en SVG dibujado a mano
// (el proyecto no tiene librería de gráficos ni build step). Los colores
// van por variable CSS (var(--accent-ok) etc.), nunca hardcodeados: como
// esos tokens ya se redefinen para modo oscuro, el gráfico sigue el tema
// sin una sola línea de JS y sin volver a dibujarse — no "arreglar" esto
// pasando colores por parámetro.
function renderGraficoResultado(serie) {
  const contenedor = document.getElementById("graficoResultado");

  const hayDatos = serie.some((p) => p.ventas !== 0 || p.resultado !== 0);
  if (serie.length === 0 || !hayDatos) {
    contenedor.innerHTML = `<p class="tabla-vacia">No hay operaciones en este período.</p>`;
    return;
  }

  const W = 800;
  const H = 260;
  const M = { top: 16, right: 8, bottom: 28, left: 64 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  const valores = serie.map((p) => p.resultado);
  // El 0 se fuerza dentro del dominio a propósito: así la línea de base
  // siempre está visible y las barras negativas crecen hacia abajo solas,
  // sin ningún caso especial para el signo.
  let maxV = Math.max(0, ...valores);
  let minV = Math.min(0, ...valores);
  if (maxV === minV) {
    maxV = 1;
    minV = 0;
  }
  const span = maxV - minV;
  const y = (v) => M.top + ((maxV - v) / span) * ph;
  const y0 = y(0);

  const paso = pw / serie.length;
  const ancho = Math.max(2, Math.min(48, paso * 0.62));
  const x = (i) => M.left + paso * i + (paso - ancho) / 2;

  // Cuántas etiquetas del eje X entran sin amontonarse, determinístico
  // (sin medir texto): a partir de un ancho mínimo estimado por etiqueta.
  const anchoMinEtiqueta = 34;
  const pasoEtiqueta = Math.max(1, Math.ceil(anchoMinEtiqueta / paso));

  const barras = serie
    .map((p, i) => {
      const yTop = Math.min(y(p.resultado), y0);
      const alto = Math.max(Math.abs(y(p.resultado) - y0), p.resultado === 0 ? 0 : 1);
      const color = p.resultado >= 0 ? "var(--accent-ok)" : "var(--accent-danger)";
      const opacidad = p.parcial ? "0.75" : "1";
      const dash = p.parcial ? ' stroke-dasharray="2,2" stroke="var(--ink-muted)"' : "";
      const titulo = `${p.etiqueta}${p.parcial ? " (parcial)" : ""}: ${money(p.resultado)}`;
      // rx chico: el mismo gesto de "esquina de ticket" que ya usan los
      // chips y botones de la app (--r-sm/--r-full), pero apenas
      // insinuado — una barra de resultado no es una píldora.
      return `<rect x="${x(i).toFixed(1)}" y="${yTop.toFixed(1)}" width="${ancho.toFixed(1)}" height="${alto.toFixed(
        1
      )}" rx="2" fill="${color}" opacity="${opacidad}"${dash}><title>${titulo}</title></rect>`;
    })
    .join("");

  const etiquetasX = serie
    .map((p, i) => {
      const esUltima = i === serie.length - 1;
      if (!esUltima && i % pasoEtiqueta !== 0) return "";
      return `<text x="${(x(i) + ancho / 2).toFixed(1)}" y="${H - M.bottom + 16}" text-anchor="middle" font-size="11" fill="var(--ink-muted)">${p.etiqueta}</text>`;
    })
    .join("");

  const refs = [maxV, 0, minV].filter((v, i, arr) => arr.indexOf(v) === i);
  const ejeY = refs
    .map(
      (v) => `
    <line x1="${M.left}" y1="${y(v).toFixed(1)}" x2="${W - M.right}" y2="${y(v).toFixed(1)}"
          stroke="${v === 0 ? "var(--ink-muted)" : "var(--line)"}" stroke-width="1" />
    <text x="${M.left - 8}" y="${y(v).toFixed(1)}" text-anchor="end" dominant-baseline="middle"
          font-size="11" fill="var(--ink-muted)">${moneyCorto(v)}</text>`
    )
    .join("");

  const mejor = serie.reduce((a, b) => (b.resultado > a.resultado ? b : a));
  const peor = serie.reduce((a, b) => (b.resultado < a.resultado ? b : a));
  const resumenTexto = `Resultado por período, de ${serie[0].etiqueta} a ${serie[serie.length - 1].etiqueta}. Mejor: ${
    mejor.etiqueta
  } con ${money(mejor.resultado)}. Peor: ${peor.etiqueta} con ${money(peor.resultado)}.`;

  contenedor.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="graficoResultadoTitulo">
      <title id="graficoResultadoTitulo">${resumenTexto}</title>
      <style>text { font-family: var(--font-mono); }</style>
      ${ejeY}
      ${barras}
      ${etiquetasX}
    </svg>`;
}

// Dos refrescos pueden solaparse (cargarResumen dispara este sin esperar,
// y el usuario puede cambiar el filtro de nuevo antes de que responda el
// primero): el token descarta la respuesta si ya no es la más reciente,
// para que una serie vieja no pise a una fresca que llegó antes.
let tokenEvolucion = 0;

async function cargarEvolucion() {
  const mio = ++tokenEvolucion;
  const rango = rangoActualResumen();
  const params = new URLSearchParams(rango).toString();
  const data = await (await fetch(`/api/resumen/evolucion${params ? "?" + params : ""}`)).json();
  if (mio !== tokenEvolucion) return;

  document.getElementById("graficoGranularidad").textContent =
    { dia: "por día", mes: "por mes", anio: "por año" }[data.granularidad] ?? "";

  renderDeltas(data);
  renderTablaEvolucion(data.serie);
  renderGraficoResultado(data.serie);
}

// Las tres operaciones que mueven plata, juntas y ordenadas por fecha. Se
// arma con los cachés que ya tienen las otras pantallas, así que no
// necesita un fetch propio.
function renderUltimosMovimientos(rango = {}) {
  const body = document.getElementById("movimientosBody");

  const dentroDelRango = (fecha) =>
    (!rango.desde || fecha >= rango.desde) && (!rango.hasta || fecha <= rango.hasta);

  const movimientos = [
    ...ventas
      .filter((v) => v.estado === "activa")
      .map((v) => ({ fecha: v.fecha, tipo: "Venta", detalle: v.cliente, importe: v.total, signo: 1 })),
    ...compras
      .filter((c) => c.estado === "activa")
      .map((c) => ({ fecha: c.fecha, tipo: "Compra", detalle: c.proveedor, importe: c.total, signo: -1 })),
    ...gastos
      .filter((g) => g.estado === "activo")
      .map((g) => ({
        fecha: g.fecha,
        tipo: "Gasto",
        detalle: `${g.categoria}${g.descripcion ? " · " + g.descripcion : ""}`,
        importe: g.importe,
        signo: -1
      })),
    ...devoluciones
      .filter((d) => d.estado === "activa")
      .map((d) => ({ fecha: d.fecha, tipo: "Devolución", detalle: d.cliente, importe: d.total, signo: -1 }))
  ]
    .filter((m) => dentroDelRango(m.fecha))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 15);

  if (movimientos.length === 0) {
    body.innerHTML = filaVacia(4, "No hay movimientos en este período.");
    return;
  }

  body.innerHTML = movimientos
    .map(
      (m) => `
    <tr>
      <td data-label="Fecha">${m.fecha}</td>
      <td data-label="Tipo">${m.tipo}</td>
      <td data-label="Detalle">${m.detalle}</td>
      <td data-label="Importe" class="align-right mono ${m.signo < 0 ? "saldo-negativo" : ""}">${
        m.signo < 0 ? "-" : "+"
      }${money(m.importe)}</td>
    </tr>`
    )
    .join("");
}

const filtrosResumen = crearFiltros(
  "filtrosResumen",
  [{ clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }],
  () => cargarResumen()
);

/* ---------- Reportes: qué se vende y a quién ---------- */
//
// Vista derivada como Resumen y Cuentas corrientes: no guarda estado
// propio más allá de lo que devuelve GET /api/reportes/ventas (que ya
// hace el neteo de devoluciones y el cálculo de márgenes), así que acá
// solo hace falta pintar la respuesta.

const filtrosReporteVentas = crearFiltros(
  "filtrosReporteVentas",
  [{ clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }],
  () => cargarReporteVentas()
);

function rangoActualReporteVentas() {
  const filtroFecha = filtrosReporteVentas.filtros.find((f) => f.campo === "fecha");
  return filtroFecha ? rangoDeFiltroFecha(filtroFecha) : {};
}

function renderReporteProductos(lista) {
  const body = document.getElementById("reporteProductosBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Unidades" class="align-right mono">${numero(p.unidades)}</td>
      <td data-label="Ventas" class="align-right mono">${money(p.ventas)}</td>
      <td data-label="Ganancia" class="align-right mono ${p.ganancia < 0 ? "saldo-negativo" : ""}">${money(p.ganancia)}</td>
      <td data-label="Margen" class="align-right mono">${porcentaje(p.margen_pct)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(p.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

// Un producto sin categoría cae en el balde "Sin categoría" que ya arma
// el backend (GROUP BY sobre categoria_id, que es NULL para esos
// productos) — no se filtra ni se distingue especialmente acá.
function renderReporteCategorias(lista) {
  const body = document.getElementById("reporteCategoriasBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
    <tr>
      <td data-label="Categoría">${c.nombre}</td>
      <td data-label="Unidades" class="align-right mono">${numero(c.unidades)}</td>
      <td data-label="Ventas" class="align-right mono">${money(c.ventas)}</td>
      <td data-label="Ganancia" class="align-right mono ${c.ganancia < 0 ? "saldo-negativo" : ""}">${money(c.ganancia)}</td>
      <td data-label="Margen" class="align-right mono">${porcentaje(c.margen_pct)}</td>
      <td data-label="% del total" class="align-right mono">${porcentaje(c.participacion_pct)}</td>
    </tr>`
    )
    .join("");
}

function renderReporteClientes(lista) {
  const body = document.getElementById("reporteClientesBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "No hay ventas en este período.");
    return;
  }
  body.innerHTML = lista
    .map(
      (c) => `
    <tr>
      <td data-label="Cliente"><button type="button" class="btn-link reporte-cliente-ficha" data-id="${c.id}">${c.nombre}</button></td>
      <td data-label="Ventas" class="align-right mono">${numero(c.cantidad_ventas)}</td>
      <td data-label="Total" class="align-right mono">${money(c.ventas)}</td>
      <td data-label="Ticket promedio" class="align-right mono">${money(c.ticket_promedio)}</td>
      <td data-label="Ganancia" class="align-right mono ${c.ganancia < 0 ? "saldo-negativo" : ""}">${money(c.ganancia)}</td>
      <td data-label="Última compra">${c.ultima_compra ?? "—"}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".reporte-cliente-ficha").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaCliente(Number(btn.dataset.id)));
  });
}

async function cargarReporteVentas() {
  tablaCargando("reporteProductosBody", 6);
  tablaCargando("reporteCategoriasBody", 6);
  tablaCargando("reporteClientesBody", 6);

  const rango = rangoActualReporteVentas();
  const params = new URLSearchParams(rango).toString();
  const datos = await (await fetch(`/api/reportes/ventas${params ? "?" + params : ""}`)).json();

  document.getElementById("reporteVentasNetas").textContent = money(datos.totales.ventas_netas);
  document.getElementById("reporteTicketPromedio").textContent = money(datos.totales.ticket_promedio);
  document.getElementById("reporteUnidades").textContent = numero(datos.totales.unidades);
  const elGanancia = document.getElementById("reporteGananciaBruta");
  elGanancia.textContent = money(datos.totales.ganancia_bruta);
  elGanancia.classList.toggle("saldo-negativo", datos.totales.ganancia_bruta < 0);
  elGanancia.classList.toggle("ledger-ok", datos.totales.ganancia_bruta >= 0);

  document.getElementById("reporteVentasRangoNota").textContent = datos.rango.acotado
    ? `Del ${datos.rango.desde} al ${datos.rango.hasta}.`
    : `Del ${datos.rango.desde} al ${datos.rango.hasta} (todo lo cargado hasta hoy).`;

  renderReporteProductos(ordenReporteProductos.aplicar(datos.productos));
  renderReporteCategorias(ordenReporteCategorias.aplicar(datos.categorias));
  renderReporteClientes(ordenReporteClientes.aplicar(datos.clientes));
}

const ordenReporteProductos = crearOrden("reporteProductosBody", () => cargarReporteVentas());
const ordenReporteCategorias = crearOrden("reporteCategoriasBody", () => cargarReporteVentas());
const ordenReporteClientes = crearOrden("reporteClientesBody", () => cargarReporteVentas());

/* ---------- Reportes: stock (qué reponer, valorizado, rotación) ---------- */
//
// El filtro de fecha define el ritmo de venta contra el que se mide la
// rotación (días de inventario) — no cambia el stock actual, que siempre
// es "ahora mismo". STOCK_CLASE/STOCK_LABEL se definen más abajo (sección
// Productos) pero se referencian acá recién al pintar, nunca al cargar el
// módulo, así que el orden de declaración no importa.

const filtrosReporteStock = crearFiltros(
  "filtrosReporteStock",
  [{ clave: "fecha", etiqueta: "Fecha", tipo: "fecha" }],
  () => cargarReporteStock()
);

function rangoActualReporteStock() {
  const filtroFecha = filtrosReporteStock.filtros.find((f) => f.campo === "fecha");
  return filtroFecha ? rangoDeFiltroFecha(filtroFecha) : {};
}

function renderReporteStock(lista) {
  const body = document.getElementById("reporteStockBody");
  if (lista.length === 0) {
    body.innerHTML = filaVacia(6, "Todavía no hay productos cargados.");
    return;
  }
  body.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Stock" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Estado"><span class="status ${STOCK_CLASE[p.estado_stock]}">${STOCK_LABEL[p.estado_stock]}</span></td>
      <td data-label="Valorizado" class="align-right mono">${money(p.valorizado)}</td>
      <td data-label="Vendidas en el período" class="align-right mono">${numero(p.unidades_vendidas)}</td>
      <td data-label="Días de inventario" class="align-right mono">${p.dias_inventario === null ? "—" : numero(p.dias_inventario)}</td>
    </tr>`
    )
    .join("");
}

async function cargarReporteStock() {
  tablaCargando("reporteStockBody", 6);

  const rango = rangoActualReporteStock();
  const params = new URLSearchParams(rango).toString();
  const datos = await (await fetch(`/api/reportes/stock${params ? "?" + params : ""}`)).json();

  document.getElementById("reporteStockValorizado").textContent = money(datos.resumen.total_valorizado);
  document.getElementById("reporteStockSinStock").textContent = numero(datos.resumen.cantidad_sin_stock);
  document.getElementById("reporteStockBajo").textContent = numero(datos.resumen.cantidad_bajo);
  document.getElementById("reporteStockCantidad").textContent = numero(datos.resumen.cantidad_productos);

  document.getElementById("reporteStockRangoNota").textContent = datos.rango.acotado
    ? `Rotación medida del ${datos.rango.desde} al ${datos.rango.hasta}.`
    : `Rotación medida del ${datos.rango.desde} al ${datos.rango.hasta} (todo lo cargado hasta hoy) — para una estimación más realista, probá filtrar por "Últimos 30 días".`;

  renderReporteStock(ordenReporteStock.aplicar(datos.productos));
}

const ordenReporteStock = crearOrden("reporteStockBody", () => cargarReporteStock());

// El backend ya resuelve comprobante y estado_cobro (derivado de los
// cobros reales cuando la factura respalda una venta — ver
// SELECT_FACTURA en server.js). Acá solo se agrega `respalda_venta`, una
// marca de sí/no para que el filtro "Respalda una venta" pueda usar el
// mismo motor select que el resto de los filtros, sin agregarle un caso
// especial.
function filtrarFacturas() {
  const lista = filtrosFacturas.aplicar(
    ordenFacturas.aplicar(facturas.map((f) => ({ ...f, respalda_venta: f.venta_id ? "si" : "no" })))
  );

  const facturado = lista.reduce((acc, f) => acc + f.total, 0);
  const cobrado = lista
    .filter((f) => f.estado_cobro === "cobrado")
    .reduce((acc, f) => acc + f.total, 0);
  const pendiente = lista
    .filter((f) => f.estado_cobro !== "cobrado")
    .reduce((acc, f) => acc + f.total, 0);
  document.getElementById("facturasFacturadoStrip").textContent = money(facturado);
  document.getElementById("facturasCobradoStrip").textContent = money(cobrado);
  document.getElementById("facturasPendienteStrip").textContent = money(pendiente);

  renderFacturas(lista);
}

const ESTADO_COBRO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", cobrado: "status-cobrado" };
// Antes se mostraba el valor crudo del backend ("pendiente", "parcial",
// "cobrado") tal cual, sin pasar por un diccionario — a diferencia de
// PRESUPUESTO_LABEL, STOCK_LABEL y TIPO_GASTO_LABEL, que ya seguían este
// mismo criterio. Reusado por Facturas, Ventas y el historial de Clientes.
const ESTADO_COBRO_LABEL = { pendiente: "Pendiente", parcial: "Parcial", cobrado: "Cobrado" };

function renderFacturas(lista) {
  const body = document.getElementById("facturasBody");

  if (lista.length === 0) {
    if (filtrosFacturas.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(6);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosFacturas.limpiar());
    } else {
      body.innerHTML = filaVacia(6, "Todavía no hay facturas cargadas.", { accionTexto: "+ Nueva factura", accionId: "btnNuevaFactura" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (f) => `
    <tr class="fila-clickeable" data-id="${f.id}">
      <td data-label="Comprobante" class="mono">${f.comprobante}</td>
      <td data-label="Fecha">${f.fecha}</td>
      <td data-label="Cliente">${f.cliente}</td>
      <td data-label="Origen">${
        f.venta_id
          ? `<a href="#" class="btn-link ficha-factura-ver-venta" data-venta-id="${f.venta_id}">Venta #${f.venta_id}</a>`
          : `<span class="status status-pendiente">Suelta</span>`
      }</td>
      <td data-label="Importe" class="align-right mono">${money(f.total)}</td>
      <td data-label="Cobro"><span class="status ${ESTADO_COBRO_CLASE[f.estado_cobro]}">${ESTADO_COBRO_LABEL[f.estado_cobro]}</span></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      abrirFichaFactura(Number(tr.dataset.id));
    });
  });

  body.querySelectorAll(".ficha-factura-ver-venta").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirFichaVenta(Number(a.dataset.ventaId));
    });
  });
}

const filtrosFacturas = crearFiltros(
  "filtrosFacturas",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "factura", texto: "Factura" },
        { valor: "nota_credito", texto: "Nota de crédito" },
        { valor: "nota_debito", texto: "Nota de débito" }
      ]
    },
    {
      clave: "letra",
      etiqueta: "Letra",
      tipo: "select",
      opciones: [
        { valor: "A", texto: "A" },
        { valor: "B", texto: "B" },
        { valor: "C", texto: "C" }
      ]
    },
    { clave: "punto_venta", etiqueta: "Punto de venta", tipo: "numero" },
    {
      clave: "condicion",
      etiqueta: "Medio de pago",
      tipo: "select",
      opciones: [
        { valor: "efectivo", texto: "Efectivo" },
        { valor: "transferencia", texto: "Transferencia" },
        { valor: "mercadopago", texto: "Mercado Pago" }
      ]
    },
    {
      clave: "estado_cobro",
      etiqueta: "Estado de cobro",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "cobrado", texto: "Cobrado" }
      ]
    },
    { clave: "total", etiqueta: "Importe", tipo: "numero" },
    {
      clave: "respalda_venta",
      etiqueta: "Respalda una venta",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Sí" },
        { valor: "no", texto: "No (suelta)" }
      ]
    }
  ],
  filtrarFacturas
);
const ordenFacturas = crearOrden("facturasBody", filtrarFacturas);

async function cargarFacturas() {
  tablaCargando("facturasBody", 6);
  const res = await fetch("/api/facturas");
  facturas = await res.json();
  filtrarFacturas();
}

cargarFacturas();

async function abrirFichaFactura(id) {
  const res = await fetch(`/api/facturas/${id}`);
  if (!(await manejarError(res, "No se pudo cargar la factura."))) return;
  const factura = await res.json();

  document.getElementById("fichaFacturaTitulo").textContent = factura.comprobante;

  const campos = [
    ["Cliente", factura.cliente],
    ["Fecha", factura.fecha],
    ["Concepto", factura.concepto],
    ["Medio de pago", factura.condicion],
    ["Importe", money(factura.total)],
    ["Estado de cobro", ESTADO_COBRO_LABEL[factura.estado_cobro] ?? factura.estado_cobro],
    ["Origen", factura.venta_id ? `Venta #${factura.venta_id}` : "Factura suelta (sin venta asociada)"]
  ];
  document.getElementById("fichaFacturaDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor ?? "—"}</dd></div>`)
    .join("");

  const panelItems = document.getElementById("fichaFacturaItemsPanel");
  if (factura.venta_id) {
    panelItems.hidden = false;
    document.getElementById("fichaFacturaVerVenta").onclick = (e) => {
      e.preventDefault();
      abrirFichaVenta(factura.venta_id);
    };
    document.getElementById("fichaFacturaItems").innerHTML = factura.items
      .map(
        (i) => `
      <tr>
        <td data-label="Producto">${i.producto}</td>
        <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
        <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
        <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
      </tr>`
      )
      .join("");
  } else {
    panelItems.hidden = true;
  }

  mostrarVista("factura-detalle", { titulo: factura.comprobante });
}

document.getElementById("btnVolverFacturas").addEventListener("click", () => mostrarVista("facturas"));

/* ---------- Modal nueva factura ---------- */

const modal = document.getElementById("modalFactura");

document.getElementById("btnNuevaFactura").addEventListener("click", () => {
  modal.hidden = false;
});

document.getElementById("modalClose").addEventListener("click", () => {
  modal.hidden = true;
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.hidden = true;
});

document.getElementById("formFactura").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch("/api/facturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cliente: form.cliente.value,
      concepto: form.concepto.value,
      neto: parseFloat(form.neto.value),
      condicion: form.condicion.value,
      tipo: form.tipo.value,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    })
  });
  if (!(await manejarError(res, "No se pudo registrar la factura."))) return;
  const { id } = await res.json();

  await cargarFacturas();
  form.reset();
  modal.hidden = true;
  avisar(`Factura #${id} registrada.`, "ok");
});

/* ---------- Filas de items (Venta / Compra) ---------- */

function actualizarSubtotalFila(fila) {
  const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
  const precio = Number(fila.querySelector(".item-precio").value) || 0;
  fila.querySelector(".item-subtotal").textContent = money(cantidad * precio);
}

// limitarStock: en una venta la cantidad no puede superar el stock actual,
// pero en un presupuesto sí — se puede cotizar algo que todavía no está en
// el depósito (CLAUDE.md §15). El tope se valida igual al convertir.
function agregarFilaItemVenta(contenedor, listaProductos, limitarStock = true) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosVenta" placeholder="Buscar producto…" />
    <input type="hidden" class="item-producto-id" />
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Precio unit." step="0.01" min="0" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">✕</button>
  `;

  const productoInput = fila.querySelector(".item-producto");
  const productoIdInput = fila.querySelector(".item-producto-id");
  const cantidad = fila.querySelector(".item-cantidad");
  const precio = fila.querySelector(".item-precio");

  productoInput.addEventListener("input", () => {
    // Búsqueda por nombre exacto (vía <datalist>, no un <select> cerrado):
    // si el texto matchea un producto existente, se resuelve su id y se
    // sugiere precio y tope de stock; si no matchea nada, no se puede
    // vender un producto que no existe.
    const buscado = productoInput.value.trim().toLowerCase();
    const producto = listaProductos.find((p) => p.nombre.trim().toLowerCase() === buscado);
    if (producto) {
      productoIdInput.value = producto.id;
      // Si el producto todavía no tiene precio de venta configurado, se
      // deja el campo vacío en vez de rellenarlo con el costo — así queda
      // claro que hay que ponerle un precio, no un número que parece uno.
      precio.value = producto.precio_venta > 0 ? producto.precio_venta : "";
      if (limitarStock) cantidad.max = producto.stock;
    } else {
      productoIdInput.value = "";
      cantidad.removeAttribute("max");
    }
    actualizarSubtotalFila(fila);
    contenedor.dispatchEvent(new Event("item-change"));
  });

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

function agregarFilaItemCompra(contenedor) {
  const fila = document.createElement("div");
  fila.className = "item-row";

  fila.innerHTML = `
    <input type="text" class="item-producto" list="productosSugeridos" placeholder="Producto…" />
    <input type="number" class="item-cantidad" placeholder="Cant." step="1" min="1" />
    <input type="number" class="item-precio" placeholder="Costo unit." step="0.01" min="0" />
    <span class="item-subtotal mono">${money(0)}</span>
    <button type="button" class="item-row-remove" aria-label="Quitar producto">✕</button>
  `;

  fila.querySelectorAll(".item-cantidad, .item-precio").forEach((input) => {
    input.addEventListener("input", () => {
      actualizarSubtotalFila(fila);
      contenedor.dispatchEvent(new Event("item-change"));
    });
  });

  fila.querySelector(".item-row-remove").addEventListener("click", () => {
    fila.remove();
    contenedor.dispatchEvent(new Event("item-change"));
  });

  contenedor.appendChild(fila);
}

function leerItemsVenta(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto_id = Number(fila.querySelector(".item-producto-id").value);
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto_id && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto_id, cantidad, precio_unitario });
    }
  });
  return items;
}

function leerItemsCompra(contenedor) {
  const items = [];
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const producto = fila.querySelector(".item-producto").value.trim();
    const cantidad = Number(fila.querySelector(".item-cantidad").value);
    const precio_unitario = Number(fila.querySelector(".item-precio").value);
    if (producto && cantidad > 0 && precio_unitario >= 0) {
      items.push({ producto, cantidad, precio_unitario });
    }
  });
  return items;
}

function totalItems(contenedor) {
  let total = 0;
  contenedor.querySelectorAll(".item-row").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".item-cantidad").value) || 0;
    const precio_unitario = Number(fila.querySelector(".item-precio").value) || 0;
    total += cantidad * precio_unitario;
  });
  return total;
}

/* ---------- Productos ---------- */

let productos = [];
let categorias = [];
let productoEditandoId = null;
let productoFichaId = null;

function poblarDatalistProductos() {
  const opciones = productos.map((p) => `<option value="${p.nombre}"></option>`).join("");
  document.getElementById("productosSugeridos").innerHTML = opciones;
  document.getElementById("productosVenta").innerHTML = opciones;
}

const porcentaje = (n) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;

function renderProductos(lista) {
  const body = document.getElementById("productosBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosProductos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(9);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosProductos.limpiar());
    } else {
      body.innerHTML = filaVacia(9, "Todavía no hay productos cargados.", { accionTexto: "+ Nuevo producto", accionId: "btnNuevoProducto" });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    // Editable directo desde la lista: no hace falta entrar a la ficha
    // solo para cambiar el precio. Sin precio configurado (0) se muestra
    // vacío con placeholder en rojo, no "$0,00" (que da a entender que de
    // verdad vale cero).
    const precioCelda = `<input type="number" class="input-inline precio-venta-inline${
      p.precio_venta > 0 ? "" : " precio-sin-configurar"
    }" data-id="${p.id}" value="${p.precio_venta > 0 ? p.precio_venta : ""}" placeholder="Sin precio" step="0.01" min="0" />`;
    tr.innerHTML = `
      <td data-label="Nombre">${p.nombre}</td>
      <td data-label="SKU">${p.sku || "—"}</td>
      <td data-label="Categoría">${p.categoria || "—"}</td>
      <td data-label="Costo" class="align-right mono">${money(p.precio_costo)}</td>
      <td data-label="Valorizado" class="align-right mono">${money(p.valorizado)}</td>
      <td data-label="Precio" class="align-right">${precioCelda}</td>
      <td data-label="Margen" class="align-right mono">${p.margen === null ? "—" : porcentaje(p.margen)}</td>
      <td data-label="Stock" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Activo"><span class="status ${p.activo ? "status-cobrado" : "status-vencido"}">${
        p.activo ? "Activo" : "Inactivo"
      }</span></td>
      <td data-label="">${botonEditarFila("btn-editar-producto", p.id, "producto")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, input")) return;
      abrirFichaProducto(p.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-editar-producto").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalProducto(productos.find((p) => p.id === Number(btn.dataset.id)));
    });
  });

  body.querySelectorAll(".precio-venta-inline").forEach((input) => {
    input.addEventListener("change", async () => {
      const producto = productos.find((p) => p.id === Number(input.dataset.id));
      if (!producto) return;
      // El PATCH espera el producto completo (no solo el precio): se arma
      // con los datos que ya están en caché, cambiando nada más el precio.
      const res = await fetch(`/api/productos/${producto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: producto.nombre,
          sku: producto.sku,
          precio_venta: input.value === "" ? 0 : Number(input.value),
          activo: !!producto.activo,
          stock_minimo: producto.stock_minimo,
          stock_maximo: producto.stock_maximo
        })
      });
      await manejarError(res, "No se pudo actualizar el precio.");
      await cargarProductos();
    });
  });
}

// La ficha se arma con la fila que ya está en el array `productos` (la
// lista trae todo lo que hace falta), así que el único fetch es el del
// historial de movimientos.
async function abrirFichaProducto(id) {
  productoFichaId = id;
  const producto = productos.find((p) => p.id === id);
  if (!producto) return;

  document.getElementById("fichaProductoNombre").textContent = producto.nombre;
  document.getElementById("fichaProductoCosto").textContent = money(producto.precio_costo);
  document.getElementById("fichaProductoStock").textContent = numero(producto.stock);
  document.getElementById("fichaProductoValorizado").textContent = money(producto.valorizado);

  const campos = [
    ["SKU", producto.sku],
    ["Categoría", producto.categoria],
    [
      "Precio de venta",
      producto.precio_venta > 0
        ? money(producto.precio_venta)
        : '<span class="precio-sin-configurar">Sin precio</span>'
    ],
    ["Margen", producto.margen === null ? null : porcentaje(producto.margen)],
    ["Stock mínimo", numero(producto.stock_minimo)],
    ["Stock máximo", producto.stock_maximo === null ? null : numero(producto.stock_maximo)],
    ["Estado de stock", STOCK_LABEL[producto.estado_stock]],
    ["Activo", producto.activo ? "Sí" : "No"]
  ];
  document.getElementById("fichaProductoDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const movimientos = await (await fetch(`/api/productos/${id}/movimientos`)).json();
  const body = document.getElementById("fichaProductoMovimientos");
  body.innerHTML =
    movimientos.length === 0
      ? filaVacia(5, "Este producto todavía no tiene movimientos de stock.")
      : movimientos
          .map((m) => {
            const origen =
              m.origen === "venta"
                ? `Venta #${m.venta_id}`
                : m.origen === "compra"
                ? `Compra #${m.compra_id}`
                : m.origen === "devolucion"
                ? `Devolución #${m.devolucion_id}`
                : "Ajuste manual";
            const signo = m.delta > 0 ? "+" : "";
            return `
        <tr>
          <td data-label="Fecha">${m.fecha}</td>
          <td data-label="Origen">${origen}</td>
          <td data-label="Cantidad" class="align-right mono">${signo}${numero(m.delta)}</td>
          <td data-label="Stock resultante" class="align-right mono">${numero(m.stock_posterior)}</td>
          <td data-label="Nota">${m.nota || "—"}</td>
        </tr>`;
          })
          .join("");

  mostrarVista("producto-detalle", { titulo: producto.nombre });
}

async function cargarProductos() {
  tablaCargando("productosBody", 9);
  const [listaProductos, listaCategorias] = await Promise.all([
    fetch("/api/productos").then((r) => r.json()),
    fetch("/api/categorias").then((r) => r.json())
  ]);
  productos = listaProductos;
  categorias = listaCategorias;
  poblarDatalistProductos();
  poblarSelectCategorias();

  filtrosProductos.setOpciones(
    "categoria_id",
    categorias.filter((c) => c.activa).map((c) => ({ valor: String(c.id), texto: c.nombre }))
  );

  filtrarProductos();
}

// Llena el <select> de categoría del formulario de alta/edición de
// producto — mismo criterio que poblarSelectCuentas (Ventas/Compras): las
// opciones dependen de datos que llegan por fetch, así que se arman en
// runtime en vez de quedar fijas en el HTML.
function poblarSelectCategorias() {
  const select = document.querySelector('#formProducto [name="categoria_id"]');
  const actual = select.value;
  select.innerHTML =
    '<option value="">Sin categoría</option>' +
    categorias
      .filter((c) => c.activa)
      .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
      .join("");
  select.value = actual;
}

function filtrarProductos() {
  const q = document.getElementById("productosSearch").value.trim().toLowerCase();
  const porTexto = productos.filter((p) =>
    [p.nombre, p.sku].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  renderProductos(ordenProductos.aplicar(filtrosProductos.aplicar(porTexto)));
}

const OPCIONES_ESTADO_STOCK = [
  { valor: "sin_stock", texto: "Sin stock" },
  { valor: "bajo", texto: "Bajo" },
  { valor: "normal", texto: "Normal" },
  { valor: "alto", texto: "Alto" }
];

const filtrosProductos = crearFiltros(
  "filtrosProductos",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "sku", etiqueta: "SKU", tipo: "texto" },
    { clave: "categoria_id", etiqueta: "Categoría", tipo: "select", opciones: [] },
    {
      clave: "activo",
      etiqueta: "Activo",
      tipo: "select",
      opciones: [
        { valor: "1", texto: "Sí" },
        { valor: "0", texto: "No" }
      ]
    },
    { clave: "estado_stock", etiqueta: "Estado de stock", tipo: "select", opciones: OPCIONES_ESTADO_STOCK },
    { clave: "precio_venta", etiqueta: "Precio de venta", tipo: "numero" },
    { clave: "precio_costo", etiqueta: "Costo", tipo: "numero" },
    { clave: "margen", etiqueta: "Margen", tipo: "numero" },
    { clave: "stock", etiqueta: "Stock", tipo: "numero" },
    { clave: "valorizado", etiqueta: "Valorizado", tipo: "numero" }
  ],
  filtrarProductos
);

document.getElementById("productosSearch").addEventListener("input", filtrarProductos);
const ordenProductos = crearOrden("productosBody", filtrarProductos);

const modalProducto = document.getElementById("modalProducto");

function abrirModalProducto(producto = null) {
  productoEditandoId = producto?.id ?? null;
  const form = document.getElementById("formProducto");
  document.getElementById("modalProductoTitulo").textContent = producto ? "Editar producto" : "Nuevo producto";
  form.nombre.value = producto?.nombre ?? "";
  form.sku.value = producto?.sku ?? "";
  form.categoria_id.value = producto?.categoria_id ?? "";
  form.precio_venta.value = producto?.precio_venta ?? "";
  form.stock_minimo.value = producto?.stock_minimo ?? "";
  form.stock_maximo.value = producto?.stock_maximo ?? "";
  form.activo.checked = producto ? !!producto.activo : true;
  modalProducto.hidden = false;
}

document.getElementById("btnNuevoProducto").addEventListener("click", () => abrirModalProducto());
document.getElementById("btnEditarProducto").addEventListener("click", () => {
  abrirModalProducto(productos.find((p) => p.id === productoFichaId));
});
document.getElementById("btnVolverProductos").addEventListener("click", () => mostrarVista("productos"));
document.getElementById("modalProductoClose").addEventListener("click", () => {
  modalProducto.hidden = true;
});
modalProducto.addEventListener("click", (e) => {
  if (e.target === modalProducto) modalProducto.hidden = true;
});

document.getElementById("formProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    sku: form.sku.value || null,
    categoria_id: form.categoria_id.value || null,
    precio_venta: form.precio_venta.value,
    stock_minimo: form.stock_minimo.value,
    stock_maximo: form.stock_maximo.value,
    activo: form.activo.checked
  };

  const res = await fetch(
    productoEditandoId ? `/api/productos/${productoEditandoId}` : "/api/productos",
    {
      method: productoEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el producto."))) return;

  const eraEdicion = productoEditandoId !== null;
  // categoria_id también puede cambiar acá, y "Ventas por categoría" (en
  // Qué se vende) agrupa por la categoría ACTUAL del producto, no por una
  // foto histórica — así que también hay que refrescarlo.
  await Promise.all([cargarProductos(), cargarReporteStock(), cargarReporteVentas()]);
  // Si se editaba desde la ficha, se refresca para que muestre los datos
  // nuevos en vez de quedar con los viejos detrás del modal.
  if (eraEdicion && productoFichaId) await abrirFichaProducto(productoFichaId);
  form.reset();
  modalProducto.hidden = true;
  avisar(eraEdicion ? "Producto actualizado." : "Producto creado.", "ok");
});

/* ---------- Categorías de productos ---------- */
//
// Calcado del modal de categorías de gasto (Gastos, más abajo): mismo
// patrón de formulario inline + tabla editable, sin campo Tipo. La baja es
// lógica (activa = 0) desde el mismo PATCH que edita, nunca DELETE — un
// producto con esa categoría no puede quedar apuntando a una fila borrada.

const modalCategoriasProductos = document.getElementById("modalCategoriasProductos");

function renderCategoriasProductos() {
  const body = document.getElementById("categoriasProductosBody");
  if (categorias.length === 0) {
    body.innerHTML = filaVacia(2, "Todavía no hay categorías.");
    return;
  }

  body.innerHTML = categorias
    .map(
      (c) => `
    <tr class="${c.activa ? "" : "fila-anulada"}">
      <td data-label="Categoría">${c.nombre}</td>
      <td data-label="">${botonEditarFila("btn-editar-categoria-producto", c.id, "categoría")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-categoria-producto").forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoria = categorias.find((c) => c.id === Number(btn.dataset.id));
      const form = document.getElementById("formCategoriaProducto");
      form.id.value = categoria.id;
      form.nombre.value = categoria.nombre;
      document.getElementById("formCategoriaProductoSubmit").textContent = "Guardar cambios";
    });
  });
}

document.getElementById("btnCategoriasProductos").addEventListener("click", () => {
  document.getElementById("formCategoriaProducto").reset();
  document.getElementById("formCategoriaProducto").id.value = "";
  document.getElementById("formCategoriaProductoSubmit").textContent = "Agregar categoría";
  renderCategoriasProductos();
  modalCategoriasProductos.hidden = false;
});
document.getElementById("modalCategoriasProductosClose").addEventListener("click", () => {
  modalCategoriasProductos.hidden = true;
});
modalCategoriasProductos.addEventListener("click", (e) => {
  if (e.target === modalCategoriasProductos) modalCategoriasProductos.hidden = true;
});

document.getElementById("formCategoriaProducto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  const res = await fetch(editandoId ? `/api/categorias/${editandoId}` : "/api/categorias", {
    method: editandoId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: form.nombre.value, activa: 1 })
  });
  if (!(await manejarError(res, "No se pudo guardar la categoría."))) return;

  const eraEdicion = Boolean(editandoId);
  // Una categoría nueva o renombrada cambia el select del formulario de
  // producto y el agrupamiento de "Ventas por categoría".
  await Promise.all([cargarProductos(), cargarReporteVentas()]);
  renderCategoriasProductos();
  form.reset();
  form.id.value = "";
  document.getElementById("formCategoriaProductoSubmit").textContent = "Agregar categoría";
  avisar(eraEdicion ? "Categoría actualizada." : "Categoría creada.", "ok");
});

/* ---------- Cuentas de tesorería ---------- */

// Las llena cargarCaja() (más abajo, en la sección de Caja): ese endpoint
// devuelve las cuentas con su saldo, que es un superconjunto de lo que
// necesitan los selects de Cobrar y Pagar, así que alcanza con una carga.
let cuentasTesoreria = [];

function poblarSelectCuentas(select, seleccionada = null) {
  select.innerHTML = cuentasTesoreria.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
  if (seleccionada !== null) select.value = seleccionada;
}

/* ---------- Avisos y confirmaciones (reemplazan alert()/confirm() nativos) ---------- */

// Toast que se apila abajo a la izquierda y se retira solo — no bloquea
// el hilo ni rompe la identidad visual con el chrome del navegador.
// tono: "ok" | "atencion" | "error".
const avisosEl = document.getElementById("avisos");

function avisar(mensaje, tono = "ok") {
  const aviso = document.createElement("div");
  aviso.className = `aviso aviso-${tono}`;
  aviso.setAttribute("role", tono === "error" ? "alert" : "status");
  aviso.textContent = mensaje;
  avisosEl.appendChild(aviso);
  setTimeout(() => aviso.remove(), 4200);
}

// Reemplaza confirm(): abre el modal de confirmación en vez de bloquear
// la página con el diálogo nativo, y resuelve una Promise<boolean> según
// qué botón se apriete (Enter confirma, Escape o click afuera cancela).
const modalConfirmar = document.getElementById("modalConfirmar");
const modalConfirmarTitulo = document.getElementById("modalConfirmarTitulo");
const modalConfirmarCuerpo = document.getElementById("modalConfirmarCuerpo");
const btnConfirmarAceptar = document.getElementById("modalConfirmarAceptar");
const btnConfirmarCancelar = document.getElementById("modalConfirmarCancelar");
let confirmarActivo = null;

function confirmarCerrar(resultado) {
  if (!confirmarActivo) return;
  modalConfirmar.hidden = true;
  document.removeEventListener("keydown", confirmarKeydown);
  const { resolve, trigger } = confirmarActivo;
  confirmarActivo = null;
  trigger?.focus();
  resolve(resultado);
}

function confirmarKeydown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    confirmarCerrar(false);
  }
  if (e.key === "Enter") {
    e.preventDefault();
    confirmarCerrar(true);
  }
}

function confirmar({ titulo = "Confirmar", cuerpo, aceptar = "Confirmar", destructivo = false } = {}) {
  return new Promise((resolve) => {
    modalConfirmarTitulo.textContent = titulo;
    modalConfirmarCuerpo.textContent = cuerpo;
    btnConfirmarAceptar.textContent = aceptar;
    btnConfirmarAceptar.className = `btn ${destructivo ? "btn-peligro" : "btn-primary"}`;
    confirmarActivo = { resolve, trigger: document.activeElement };
    modalConfirmar.hidden = false;
    document.addEventListener("keydown", confirmarKeydown);
    btnConfirmarCancelar.focus();
  });
}

btnConfirmarAceptar.addEventListener("click", () => confirmarCerrar(true));
btnConfirmarCancelar.addEventListener("click", () => confirmarCerrar(false));
modalConfirmar.addEventListener("click", (e) => {
  if (e.target === modalConfirmar) confirmarCerrar(false);
});

/* ---------- Accesibilidad de modales (foco, Escape, Tab) ---------- */

// Se engancha al atributo hidden de cada .modal con un MutationObserver
// en vez de tocar los ~90 lugares que ya hacen `modalX.hidden = true/false`
// desde botones, submits y clicks afuera — así cualquier apertura/cierre
// existente hereda foco y Escape sin reescribir esos call sites.
// modalConfirmar queda afuera: ya tiene su propio manejo arriba, necesario
// porque tiene que resolver una promesa según qué botón se apriete, no
// solo abrir o cerrar.
const FOCUSABLES_MODAL = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

document.querySelectorAll(".modal").forEach((modal) => {
  if (modal.id === "modalConfirmar") return;

  let trigger = null;

  new MutationObserver(() => {
    if (modal.hidden) {
      trigger?.focus();
    } else {
      trigger = document.activeElement;
      // El botón ✕ es siempre el primer focusable en el DOM (va al
      // principio del modal-head), pero no es un buen destino de foco
      // inicial: hay que saltarlo y arrancar en el primer campo real.
      const focosables = [...modal.querySelectorAll(FOCUSABLES_MODAL)];
      const objetivo = focosables.find((el) => !el.classList.contains("modal-close")) ?? focosables[0] ?? modal;
      objetivo.focus();
    }
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      modal.hidden = true;
      return;
    }
    if (e.key !== "Tab") return;
    const focosables = [...modal.querySelectorAll(FOCUSABLES_MODAL)].filter((el) => el.offsetParent !== null);
    if (focosables.length === 0) return;
    const primero = focosables[0];
    const ultimo = focosables[focosables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });
});

async function manejarError(res, accionDefault) {
  if (res.ok) return true;
  let mensaje = accionDefault;
  try {
    const cuerpo = await res.json();
    if (cuerpo.error) mensaje = cuerpo.error;
  } catch {
    // sin cuerpo JSON, se usa el mensaje por defecto
  }
  avisar(mensaje, "error");
  return false;
}

/* ---------- Estado de tablas: carga y vacío ---------- */

// Fila de estado vacío. Con accionTexto+accionId agrega un botón que
// dispara el mismo control que ya abre el alta correspondiente (así no
// duplica la lógica de apertura de cada modal).
function filaVacia(colspan, mensaje, { accionTexto, accionId } = {}) {
  const accion =
    accionTexto && accionId
      ? ` <button type="button" class="btn-link tabla-vacia-accion" data-abrir="${accionId}">${accionTexto}</button>`
      : "";
  return `<tr><td colspan="${colspan}" class="tabla-vacia">${mensaje}${accion}</td></tr>`;
}

// Distingue "no hay nada cargado" de "el filtro no encontró nada": en el
// segundo caso invitar a crear un registro sería confuso (puede que sí
// existan, el filtro los está ocultando), así que se ofrece limpiarlos.
function filaVaciaFiltrada(colspan) {
  return `<tr><td colspan="${colspan}" class="tabla-vacia">Ningún resultado para estos filtros. <button type="button" class="btn-link tabla-vacia-limpiar">Limpiar filtros</button></td></tr>`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".tabla-vacia-accion");
  if (btn) document.getElementById(btn.dataset.abrir)?.click();
});

// Filas skeleton mientras el fetch de un cargar*() todavía está en
// curso — se llama al principio de esas funciones, antes del await.
function tablaCargando(bodyId, colspan, filas = 3) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = Array.from({ length: filas })
    .map(() => `<tr class="fila-cargando"><td colspan="${colspan}"><div class="skeleton-linea"></div></td></tr>`)
    .join("");
}

/* ---------- Stock ---------- */

// El "alto" comparte color con el pendiente (naranja): no es un error,
// pero es plata inmovilizada de más y conviene que salte a la vista.
const STOCK_CLASE = {
  sin_stock: "status-vencido",
  bajo: "status-vencido",
  normal: "status-cobrado",
  alto: "status-pendiente"
};
const STOCK_LABEL = {
  sin_stock: "Sin stock",
  bajo: "Stock bajo",
  normal: "Normal",
  alto: "Stock alto"
};

function renderStock(lista) {
  const body = document.getElementById("stockBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosStock.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(5);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosStock.limpiar());
    } else {
      body.innerHTML = filaVacia(5, "Todavía no hay productos con stock.", { accionTexto: "+ Nuevo producto", accionId: "btnNuevoProducto" });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Producto">${p.nombre}</td>
      <td data-label="Costo" class="align-right mono">${money(p.precio_costo)}</td>
      <td data-label="Stock actual" class="align-right mono">${numero(p.stock)}</td>
      <td data-label="Estado"><span class="status ${STOCK_CLASE[p.estado_stock]}">${
        STOCK_LABEL[p.estado_stock]
      }</span></td>
      <td data-label=""><button type="button" class="btn-fila btn-ajustar-stock" data-id="${p.id}">Ajustar</button></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-ajustar-stock").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalAjusteStock(Number(btn.dataset.id)));
  });
}

// Historial general de movimientos, de todos los productos juntos. Viaja
// pegado a cargarStock() (mismo fetch inicial que dispara todo lo demás)
// para no tener que acordarse de refrescarlo aparte en cada lugar que
// toca stock.
function renderMovimientosStock(movimientos) {
  const body = document.getElementById("stockMovimientosBody");
  if (movimientos.length === 0) {
    if (filtrosStockMov.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(5);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosStockMov.limpiar());
    } else {
      body.innerHTML = filaVacia(5, "Todavía no hay movimientos de stock.");
    }
    return;
  }
  body.innerHTML = movimientos
    .map((m) => {
      const origen =
        m.origen === "venta"
          ? `Venta #${m.venta_id}`
          : m.origen === "compra"
          ? `Compra #${m.compra_id}`
          : m.origen === "devolucion"
          ? `Devolución #${m.devolucion_id}`
          : "Ajuste manual";
      const signo = m.tipo === "salida" ? "-" : m.tipo === "entrada" ? "+" : m.cantidad >= 0 ? "+" : "-";
      return `
    <tr>
      <td data-label="Fecha">${m.fecha}</td>
      <td data-label="Producto">${m.producto}</td>
      <td data-label="Origen">${origen}</td>
      <td data-label="Cantidad" class="align-right mono">${signo}${numero(Math.abs(m.cantidad))}</td>
      <td data-label="Nota">${m.nota || "—"}</td>
    </tr>`;
    })
    .join("");
}

let stockCache = [];

// El listado de stock se filtra en memoria (está entero acá), pero el
// historial de movimientos va al servidor: tiene tope de filas, así que
// filtrarlo acá mentiría en cuanto se pida un rango de fechas viejo.
function filtrarStock() {
  const texto = document.getElementById("stockSearch").value.trim().toLowerCase();
  const porTexto = stockCache.filter((p) => p.nombre.toLowerCase().includes(texto));
  renderStock(ordenStock.aplicar(filtrosStock.aplicar(porTexto)));
}

const filtrosStock = crearFiltros(
  "filtrosStock",
  [
    { clave: "nombre", etiqueta: "Producto", tipo: "texto" },
    { clave: "estado_stock", etiqueta: "Estado", tipo: "select", opciones: OPCIONES_ESTADO_STOCK },
    { clave: "stock", etiqueta: "Stock actual", tipo: "numero" },
    { clave: "stock_minimo", etiqueta: "Stock mínimo", tipo: "numero" },
    { clave: "precio_costo", etiqueta: "Costo", tipo: "numero" },
    { clave: "valorizado", etiqueta: "Valorizado", tipo: "numero" }
  ],
  filtrarStock
);
const ordenStock = crearOrden("stockBody", filtrarStock);

const filtrosStockMov = crearFiltros(
  "filtrosStockMov",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "producto_id", etiqueta: "Producto", tipo: "select", opciones: [] },
    {
      clave: "origen",
      etiqueta: "Origen",
      tipo: "select",
      opciones: [
        { valor: "venta", texto: "Venta" },
        { valor: "compra", texto: "Compra" },
        { valor: "devolucion", texto: "Devolución" },
        { valor: "ajuste_manual", texto: "Ajuste manual" }
      ]
    },
    { clave: "cantidad", etiqueta: "Cantidad", tipo: "numero" },
    { clave: "nota", etiqueta: "Nota", tipo: "texto" }
  ],
  () => renderMovimientosStock(filtrosStockMov.aplicar(movimientosStockCache))
);

// El historial llega entero y se filtra acá, con el mismo motor que el
// resto (ver el comentario de TOPE_MOVIMIENTOS en el backend).
let movimientosStockCache = [];

async function cargarMovimientosStock() {
  tablaCargando("stockMovimientosBody", 5);
  movimientosStockCache = await (await fetch("/api/movimientos-stock")).json();
  renderMovimientosStock(filtrosStockMov.aplicar(movimientosStockCache));
}

async function cargarStock() {
  tablaCargando("stockBody", 5);
  const stockRes = await fetch("/api/stock");
  stockCache = await stockRes.json();
  filtrosStockMov.setOpciones(
    "producto_id",
    stockCache.map((p) => ({ valor: p.id, texto: p.nombre }))
  );
  filtrarStock();
  await cargarMovimientosStock();
}

document.getElementById("stockSearch").addEventListener("input", filtrarStock);

const modalAjusteStock = document.getElementById("modalAjusteStock");

function poblarSelectProductos(select) {
  select.innerHTML =
    '<option value="">Producto…</option>' +
    productos.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
}

function abrirModalAjusteStock(productoIdPreseleccionado = null) {
  const select = document.querySelector('#formAjusteStock select[name="producto_id"]');
  poblarSelectProductos(select);
  if (productoIdPreseleccionado) select.value = productoIdPreseleccionado;
  modalAjusteStock.hidden = false;
}

document.getElementById("btnAjusteStock").addEventListener("click", () => abrirModalAjusteStock());
document.getElementById("modalAjusteStockClose").addEventListener("click", () => {
  modalAjusteStock.hidden = true;
});
modalAjusteStock.addEventListener("click", (e) => {
  if (e.target === modalAjusteStock) modalAjusteStock.hidden = true;
});

document.getElementById("formAjusteStock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch("/api/stock/ajuste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      producto_id: Number(form.producto_id.value),
      cantidad: parseFloat(form.cantidad.value),
      nota: form.nota.value || null
    })
  });
  if (!(await manejarError(res, "No se pudo registrar el ajuste."))) return;

  await Promise.all([cargarStock(), cargarProductos(), cargarReporteStock()]);
  form.reset();
  modalAjusteStock.hidden = true;
  avisar("Stock ajustado.", "ok");
});

/* ---------- Presupuestos ---------- */

// Un presupuesto es una oferta, no una operación: no descuenta stock ni
// genera deuda. Todo eso pasa recién al convertirlo en venta.
let presupuestos = [];
let presupuestoEditandoId = null;
let presupuestoFichaId = null;

const PRESUPUESTO_LABEL = {
  borrador: "Borrador",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  vencido: "Vencido",
  convertido: "Convertido"
};

const PRESUPUESTO_CLASE = {
  borrador: "status-pendiente",
  enviado: "status-pendiente",
  aceptado: "status-cobrado",
  rechazado: "status-vencido",
  vencido: "status-vencido",
  convertido: "status-cobrado"
};

function renderPresupuestos(lista) {
  const body = document.getElementById("presupuestosBody");

  // Los totales acompañan al filtro, igual que en Ventas y Compras.
  const sumar = (fn) => lista.filter(fn).reduce((acc, p) => acc + p.total, 0);
  document.getElementById("presupuestadoStrip").textContent = money(
    lista.reduce((acc, p) => acc + p.total, 0)
  );
  document.getElementById("presupuestoAceptadoStrip").textContent = money(
    sumar((p) => p.estado_efectivo === "aceptado")
  );
  document.getElementById("presupuestoConvertidoStrip").textContent = money(
    sumar((p) => p.estado_efectivo === "convertido")
  );

  if (lista.length === 0) {
    if (filtrosPresupuestos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(8);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosPresupuestos.limpiar());
    } else {
      body.innerHTML = filaVacia(8, "Todavía no hay presupuestos cargados.", { accionTexto: "+ Nuevo presupuesto", accionId: "btnNuevoPresupuesto" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (p) => `
    <tr class="fila-clickeable" data-id="${p.id}">
      <td data-label="N°" class="mono">#${p.id}</td>
      <td data-label="Cliente">${p.cliente}</td>
      <td data-label="Productos">${p.items_resumen || "—"}</td>
      <td data-label="Fecha">${p.fecha}</td>
      <td data-label="Vence">${p.vencimiento || "—"}</td>
      <td data-label="Total" class="align-right mono">${money(p.total)}</td>
      <td data-label="Estado"><span class="status ${PRESUPUESTO_CLASE[p.estado_efectivo]}">${
        PRESUPUESTO_LABEL[p.estado_efectivo]
      }</span></td>
      <td data-label="">${
        p.estado === "convertido"
          ? `<button type="button" class="btn-link btn-ver-venta-presu" data-venta="${p.venta_id}">Venta #${p.venta_id}</button>`
          : botonEditarFila("btn-editar-presupuesto", p.id, "presupuesto")
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      abrirFichaPresupuesto(Number(tr.dataset.id));
    });
  });

  body.querySelectorAll(".btn-editar-presupuesto").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await fetch(`/api/presupuestos/${btn.dataset.id}`);
      if (!(await manejarError(res, "No se pudo cargar el presupuesto."))) return;
      abrirModalPresupuesto(await res.json());
    });
  });

  body.querySelectorAll(".btn-ver-venta-presu").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaVenta(Number(btn.dataset.venta)));
  });
}

function filtrarPresupuestos() {
  renderPresupuestos(ordenPresupuestos.aplicar(filtrosPresupuestos.aplicar(presupuestos)));
}

const filtrosPresupuestos = crearFiltros(
  "filtrosPresupuestos",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "vencimiento", etiqueta: "Vencimiento", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    {
      clave: "estado_efectivo",
      etiqueta: "Estado",
      tipo: "select",
      opciones: [
        { valor: "borrador", texto: "Borrador" },
        { valor: "enviado", texto: "Enviado" },
        { valor: "aceptado", texto: "Aceptado" },
        { valor: "rechazado", texto: "Rechazado" },
        { valor: "vencido", texto: "Vencido" },
        { valor: "convertido", texto: "Convertido" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "notas", etiqueta: "Notas", tipo: "texto" }
  ],
  filtrarPresupuestos
);
const ordenPresupuestos = crearOrden("presupuestosBody", filtrarPresupuestos);

async function cargarPresupuestos() {
  tablaCargando("presupuestosBody", 8);
  const res = await fetch("/api/presupuestos");
  presupuestos = await res.json();
  filtrarPresupuestos();
}

/* --- Ficha --- */

async function abrirFichaPresupuesto(id) {
  presupuestoFichaId = id;
  const res = await fetch(`/api/presupuestos/${id}`);
  if (!(await manejarError(res, "No se pudo cargar el presupuesto."))) return;
  const p = await res.json();

  document.getElementById("fichaPresupuestoTitulo").textContent = `Presupuesto #${p.id}`;
  document.getElementById("fichaPresupuestoTotal").textContent = money(p.total);

  const campos = [
    ["Cliente", p.cliente],
    ["Fecha", p.fecha],
    ["Válido hasta", p.vencimiento || "Sin vencimiento"],
    ["Estado", PRESUPUESTO_LABEL[p.estado_efectivo]],
    ["Notas", p.notas]
  ];
  document.getElementById("fichaPresupuestoDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  // Las acciones dependen del estado: un presupuesto convertido ya es una
  // venta, así que lo único que ofrece es el link para ir a verla.
  const acciones = document.getElementById("fichaPresupuestoAcciones");
  if (p.estado === "convertido") {
    acciones.innerHTML = `<button type="button" class="btn btn-secundario" id="btnIrAVentaPresu">Ver la venta #${p.venta_id}</button>`;
    acciones.querySelector("#btnIrAVentaPresu").addEventListener("click", () =>
      abrirFichaVenta(p.venta_id)
    );
  } else {
    const botonEstado = (estado, texto, clase = "btn-secundario") =>
      p.estado === estado
        ? ""
        : `<button type="button" class="btn ${clase} btn-estado-presu" data-estado="${estado}">${texto}</button>`;

    acciones.innerHTML = `
      <button type="button" class="btn btn-secundario" id="btnEditarPresupuesto">Editar</button>
      ${botonEstado("enviado", "Marcar enviado")}
      ${botonEstado("aceptado", "Aceptar")}
      ${botonEstado("rechazado", "Rechazar")}
      <button type="button" class="btn btn-primary" id="btnConvertirPresupuesto">Convertir en venta</button>
    `;

    acciones.querySelector("#btnEditarPresupuesto").addEventListener("click", () =>
      abrirModalPresupuesto(p)
    );

    acciones.querySelectorAll(".btn-estado-presu").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const r = await fetch(`/api/presupuestos/${p.id}/estado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: btn.dataset.estado })
        });
        if (!(await manejarError(r, "No se pudo cambiar el estado."))) return;
        await cargarPresupuestos();
        await abrirFichaPresupuesto(p.id);
      });
    });

    acciones.querySelector("#btnConvertirPresupuesto").addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Convertir este presupuesto en venta? Se va a descontar el stock y generar la deuda del cliente.",
          aceptar: "Convertir"
        }))
      )
        return;
      const r = await fetch(`/api/presupuestos/${p.id}/convertir`, { method: "POST" });
      if (!(await manejarError(r, "No se pudo convertir el presupuesto."))) return;
      avisar(`Presupuesto #${p.id} convertido en venta.`, "ok");
      // La conversión mueve stock, cuenta corriente y resultado.
      await Promise.all([
        cargarPresupuestos(),
        cargarVentas(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        cargarCuentasCorrientes(),
        cargarResumen(),
        cargarReporteVentas(),
        cargarReporteStock()
      ]);
      await abrirFichaPresupuesto(p.id);
    });
  }

  document.getElementById("fichaPresupuestoItems").innerHTML = p.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${i.producto}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
    </tr>`
    )
    .join("");

  mostrarVista("presupuesto-detalle", { titulo: `Presupuesto #${p.id}` });
}

document.getElementById("btnVolverPresupuestos").addEventListener("click", () =>
  mostrarVista("presupuestos")
);

/* --- Modal (alta y edición) --- */

const modalPresupuesto = document.getElementById("modalPresupuesto");
const presupuestoItemsEl = document.getElementById("presupuestoItems");

function actualizarTotalPresupuesto() {
  document.getElementById("presupuestoTotal").textContent = money(totalItems(presupuestoItemsEl));
}
presupuestoItemsEl.addEventListener("item-change", actualizarTotalPresupuesto);

function abrirModalPresupuesto(presupuesto = null) {
  presupuestoEditandoId = presupuesto?.id ?? null;
  document.getElementById("modalPresupuestoTitulo").textContent = presupuesto
    ? "Editar presupuesto"
    : "Nuevo presupuesto";
  document.getElementById("formPresupuestoSubmit").textContent = presupuesto
    ? "Guardar cambios"
    : "Guardar presupuesto";

  const form = document.getElementById("formPresupuesto");
  form.cliente.value = presupuesto?.cliente ?? "";
  form.fecha.value = presupuesto?.fecha ?? hoyISO();
  form.vencimiento.value = presupuesto?.vencimiento ?? "";
  form.notas.value = presupuesto?.notas ?? "";

  presupuestoItemsEl.innerHTML = "";
  if (presupuesto) {
    for (const item of presupuesto.items) {
      // limitarStock en false: un presupuesto puede cotizar más de lo que
      // hay en el depósito.
      agregarFilaItemVenta(presupuestoItemsEl, productos, false);
      const fila = presupuestoItemsEl.lastElementChild;
      fila.querySelector(".item-producto").value = item.producto;
      fila.querySelector(".item-producto-id").value = item.producto_id;
      fila.querySelector(".item-cantidad").value = item.cantidad;
      fila.querySelector(".item-precio").value = item.precio_unitario;
      actualizarSubtotalFila(fila);
    }
  } else {
    agregarFilaItemVenta(presupuestoItemsEl, productos, false);
  }
  actualizarTotalPresupuesto();
  modalPresupuesto.hidden = false;
}

document.getElementById("btnNuevoPresupuesto").addEventListener("click", () =>
  abrirModalPresupuesto()
);
document.getElementById("btnAgregarItemPresupuesto").addEventListener("click", () => {
  agregarFilaItemVenta(presupuestoItemsEl, productos, false);
});
document.getElementById("modalPresupuestoClose").addEventListener("click", () => {
  modalPresupuesto.hidden = true;
});
modalPresupuesto.addEventListener("click", (e) => {
  if (e.target === modalPresupuesto) modalPresupuesto.hidden = true;
});

document.getElementById("formPresupuesto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = leerItemsVenta(presupuestoItemsEl);

  if (items.length === 0) {
    avisar("Agregá al menos un producto al presupuesto.", "atencion");
    return;
  }

  const nombreCliente = form.cliente.value.trim();
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
  );

  const body = JSON.stringify({
    cliente: nombreCliente,
    cliente_id: clienteExistente?.id ?? null,
    fecha: form.fecha.value,
    vencimiento: form.vencimiento.value || null,
    notas: form.notas.value || null,
    items
  });

  const res = await fetch(
    presupuestoEditandoId ? `/api/presupuestos/${presupuestoEditandoId}` : "/api/presupuestos",
    {
      method: presupuestoEditandoId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el presupuesto."))) return;

  const idEditado = presupuestoEditandoId;
  // Puede haber creado un cliente nuevo; el stock no se toca nunca acá.
  await Promise.all([cargarPresupuestos(), cargarClientes()]);
  form.reset();
  modalPresupuesto.hidden = true;
  if (idEditado) await abrirFichaPresupuesto(idEditado);
  avisar(idEditado ? "Presupuesto actualizado." : "Presupuesto creado.", "ok");
});

/* ---------- Ventas ---------- */

function renderVentas(lista) {
  const body = document.getElementById("ventasBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosVentas.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(8);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosVentas.limpiar());
    } else {
      body.innerHTML = filaVacia(8, "Todavía no hay ventas registradas.", { accionTexto: "+ Nueva venta", accionId: "btnNuevaVenta" });
    }
    return;
  }

  for (const v of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";

    const accionFactura = v.facturada
      ? `<span class="status status-cobrado">Facturada</span>`
      : `<button type="button" class="btn-fila btn-facturar-venta" data-id="${v.id}">Facturar</button>`;
    const accionCobro =
      v.estado_cobro === "cobrado"
        ? ""
        : `<button type="button" class="btn-fila btn-cobrar-venta" data-id="${v.id}">Cobrar</button>`;
    // Anular solo tiene sentido si no está facturada, no tiene cobros ni
    // devoluciones asociadas (el backend lo vuelve a validar, esto es
    // nada más para no invitar a un click que ya sabemos que va a fallar).
    const accionAnular =
      !v.facturada && !v.tiene_devolucion && v.estado_cobro === "pendiente"
        ? `<button type="button" class="btn-icon-danger btn-anular-venta" data-id="${v.id}" title="Anular venta" aria-label="Anular venta">${ICONO_TACHO}</button>`
        : "";

    tr.innerHTML = `
      <td data-label="N°" class="mono">#${v.id}</td>
      <td data-label="Cliente">${v.cliente}</td>
      <td data-label="Productos">${v.items_resumen || "—"}</td>
      <td data-label="Fecha">${v.fecha}</td>
      <td data-label="Costo" class="align-right mono">${money(v.costo_total)}</td>
      <td data-label="Total" class="align-right mono">${money(v.total)}</td>
      <td data-label="Ganancia" class="align-right mono">${money(v.margen)}</td>
      <td data-label="Cobro"><span class="status ${ESTADO_COBRO_CLASE[v.estado_cobro]}">${ESTADO_COBRO_LABEL[v.estado_cobro]}</span></td>
      <td data-label=""><div class="fila-acciones">${accionFactura} ${accionCobro} ${accionAnular}</div></td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      abrirFichaVenta(v.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-facturar-venta").forEach((btn) => {
    btn.addEventListener("click", () => {
      ventaAFacturarId = Number(btn.dataset.id);
      modalFacturarVenta.hidden = false;
    });
  });

  body.querySelectorAll(".btn-anular-venta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta venta? Va a la papelera y el stock vuelve al depósito.",
          aceptar: "Anular venta",
          destructivo: true
        }))
      )
        return;
      const res = await fetch(`/api/ventas/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular la venta."))) return;
      avisar(`Venta #${btn.dataset.id} anulada.`, "ok");
      await Promise.all([cargarVentas(), cargarStock(), cargarProductos(), cargarClientes(), cargarCuentasCorrientes(), cargarReporteVentas(), cargarReporteStock()]);
    });
  });

  body.querySelectorAll(".btn-cobrar-venta").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalCobrarVenta(Number(btn.dataset.id)));
  });
}

// Los totales acompañan al filtro: si mirás julio, el strip muestra julio.
// Un resumen que se quedara con el acumulado histórico mientras la tabla
// muestra un mes se prestaría a leer mal el número.
function filtrarVentas() {
  const activas = ventas.filter((v) => v.estado !== "anulada");
  const lista = filtrosVentas.aplicar(activas);

  const total = lista.reduce((acc, v) => acc + v.total, 0);
  const costo = lista.reduce((acc, v) => acc + v.costo_total, 0);
  document.getElementById("ventasTotalStrip").textContent = money(total);
  document.getElementById("ventasCostoStrip").textContent = money(costo);
  document.getElementById("ventasGananciaStrip").textContent = money(total - costo);

  renderVentas(ordenVentas.aplicar(lista));
}

const filtrosVentas = crearFiltros(
  "filtrosVentas",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    {
      clave: "estado_cobro",
      etiqueta: "Estado de cobro",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "cobrado", texto: "Cobrado" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "costo_total", etiqueta: "Costo", tipo: "numero" },
    { clave: "margen", etiqueta: "Ganancia", tipo: "numero" },
    { clave: "cobrado", etiqueta: "Cobrado", tipo: "numero" }
  ],
  filtrarVentas
);
const ordenVentas = crearOrden("ventasBody", filtrarVentas);

// `ventas` guarda todo lo que devuelve la API (incluidas las anuladas)
// porque la papelera se arma sobre ese mismo array; la tabla de Ventas
// filtra al renderizar.
async function cargarVentas() {
  tablaCargando("ventasBody", 8);
  const res = await fetch("/api/ventas");
  ventas = await res.json();
  filtrarVentas();
  renderPapelera();
}

let ventas = [];
let ventaAFacturarId = null;
let ventaEditandoId = null;
let ventaFichaId = null;

const modalVenta = document.getElementById("modalVenta");
const ventaItemsEl = document.getElementById("ventaItems");

function actualizarTotalVenta() {
  document.getElementById("ventaTotal").textContent = money(totalItems(ventaItemsEl));
}
ventaItemsEl.addEventListener("item-change", actualizarTotalVenta);

// Modo alta y modo edición comparten el mismo modal: sin venta se arranca
// en blanco, con venta se precargan cliente/fecha/items y el submit más
// abajo decide POST o PUT según `ventaEditandoId`.
function abrirModalVenta(venta = null) {
  ventaEditandoId = venta?.id ?? null;
  document.getElementById("modalVentaTitulo").textContent = venta ? "Editar venta" : "Nueva venta";
  document.getElementById("formVentaSubmit").textContent = venta ? "Guardar cambios" : "Registrar venta";

  const form = document.getElementById("formVenta");
  form.cliente.value = venta?.cliente ?? "";
  form.fecha.value = venta?.fecha ?? hoyISO();

  ventaItemsEl.innerHTML = "";
  if (venta) {
    for (const item of venta.items) {
      agregarFilaItemVenta(ventaItemsEl, productos);
      const fila = ventaItemsEl.lastElementChild;
      fila.querySelector(".item-producto").value = item.producto;
      fila.querySelector(".item-producto-id").value = item.producto_id;
      fila.querySelector(".item-cantidad").value = item.cantidad;
      fila.querySelector(".item-precio").value = item.precio_unitario;
      // El tope de stock de este renglón tiene que contemplar que su
      // propia cantidad ya está "afuera" (reservada por esta misma
      // venta): si no, al editar sin cambiar nada el tope quedaría más
      // bajo que la cantidad ya cargada.
      const productoCache = productos.find((p) => p.id === item.producto_id);
      if (productoCache) {
        fila.querySelector(".item-cantidad").max = productoCache.stock + item.cantidad;
      }
      actualizarSubtotalFila(fila);
    }
  } else {
    agregarFilaItemVenta(ventaItemsEl, productos);
  }
  actualizarTotalVenta();
  modalVenta.hidden = false;
}

document.getElementById("btnNuevaVenta").addEventListener("click", () => abrirModalVenta());
document.getElementById("btnAgregarItemVenta").addEventListener("click", () => {
  agregarFilaItemVenta(ventaItemsEl, productos);
});
document.getElementById("modalVentaClose").addEventListener("click", () => {
  modalVenta.hidden = true;
});
modalVenta.addEventListener("click", (e) => {
  if (e.target === modalVenta) modalVenta.hidden = true;
});

document.getElementById("formVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  for (const fila of ventaItemsEl.querySelectorAll(".item-row")) {
    const cantidadInput = fila.querySelector(".item-cantidad");
    const tope = cantidadInput.max ? Number(cantidadInput.max) : null;
    if (tope !== null && Number(cantidadInput.value) > tope) {
      avisar(`No hay suficiente stock de "${fila.querySelector(".item-producto").value}" (disponible: ${numero(tope)}).`, "atencion");
      return;
    }
  }

  const items = leerItemsVenta(ventaItemsEl);

  if (items.length === 0) {
    avisar("Agregá al menos un producto a la venta.", "atencion");
    return;
  }

  // Si el nombre tipeado matchea exactamente un cliente que ya existe, se
  // manda su id para no crear un duplicado; si no, se manda el nombre y el
  // backend lo crea (así "elegir existente o crear nuevo" es un solo campo).
  const nombreCliente = form.cliente.value.trim();
  const clienteExistente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombreCliente.toLowerCase()
  );

  const body = JSON.stringify({
    cliente: nombreCliente,
    cliente_id: clienteExistente?.id ?? null,
    fecha: form.fecha.value,
    items
  });

  const res = ventaEditandoId
    ? await fetch(`/api/ventas/${ventaEditandoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body
      })
    : await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
  if (!(await manejarError(res, ventaEditandoId ? "No se pudo guardar la venta." : "No se pudo registrar la venta."))) return;

  const idEditado = ventaEditandoId;
  await Promise.all([cargarVentas(), cargarStock(), cargarProductos(), cargarClientes(), cargarCuentasCorrientes(), cargarReporteVentas(), cargarReporteStock()]);
  form.reset();
  modalVenta.hidden = true;
  // Si se estaba editando desde la ficha, volver a esa ficha con los
  // datos ya actualizados en vez de dejar al usuario en la lista.
  if (idEditado) await abrirFichaVenta(idEditado);
  avisar(idEditado ? `Venta #${idEditado} actualizada.` : "Venta registrada.", "ok");
});

async function abrirFichaVenta(id) {
  ventaFichaId = id;
  const res = await fetch(`/api/ventas/${id}`);
  if (!(await manejarError(res, "No se pudo cargar la venta."))) return;
  const venta = await res.json();

  document.getElementById("fichaVentaTitulo").textContent = `Venta #${venta.id}`;
  // Editar reemplaza los items enteros, y una devolución apunta a esos
  // renglones exactos (venta_item_id): si se pudiera editar, la
  // devolución quedaría apuntando a renglones que ya no existen. El
  // backend ya lo rechaza, esto es para no invitar a un click que va a
  // fallar.
  document.getElementById("btnEditarVenta").hidden = venta.facturada || venta.tiene_devolucion;
  document.getElementById("btnDevolverVenta").hidden =
    venta.estado === "anulada" || venta.items.every((i) => i.disponible_devolucion <= 0);

  const campos = [
    ["Cliente", venta.cliente],
    ["Fecha", venta.fecha],
    ["Cobrado", `${money(venta.cobrado)} de ${money(venta.neto)}`],
    ["Estado de cobro", ESTADO_COBRO_LABEL[venta.estado_cobro] ?? venta.estado_cobro],
    ["Facturada", venta.facturada ? "Sí" : "No"]
  ];
  document.getElementById("fichaVentaDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor ?? "—"}</dd></div>`)
    .join("");

  document.getElementById("fichaVentaCosto").textContent = money(venta.costo_total);
  document.getElementById("fichaVentaTotal").textContent = money(venta.total);
  document.getElementById("fichaVentaDevuelto").textContent = money(venta.devuelto);
  document.getElementById("fichaVentaNeto").textContent = money(venta.neto);
  document.getElementById("fichaVentaGanancia").textContent = money(venta.margen);

  document.getElementById("fichaVentaItems").innerHTML = venta.items
    .map(
      (i) => `
        <tr>
          <td data-label="Producto">${i.producto}</td>
          <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
          <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
          <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
          <td data-label="Devuelto" class="align-right mono">${
            i.cantidad_devuelta > 0 ? numero(i.cantidad_devuelta) : "—"
          }</td>
          <td data-label="Ganancia" class="align-right mono">${money(i.ganancia)}</td>
        </tr>`
    )
    .join("");

  // Las devoluciones de esta venta viven en su propio caché (cargarDevoluciones,
  // ya resuelto para cuando se navega acá); el panel entero se oculta si no hay
  // ninguna, para no mostrar una tabla vacía en la mayoría de las ventas.
  const devolucionesDeVenta = devoluciones.filter((d) => d.venta_id === venta.id);
  const panelDevoluciones = document.getElementById("fichaVentaDevolucionesPanel");
  panelDevoluciones.hidden = devolucionesDeVenta.length === 0;
  document.getElementById("fichaVentaDevolucionesBody").innerHTML = devolucionesDeVenta
    .map(
      (d) => `
    <tr>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Productos">${d.items_resumen || "—"}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Estado">${
        d.estado === "anulada"
          ? `<span class="status status-vencido">Anulada</span>`
          : `<span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
              d.reintegrada ? "Reintegrada" : "Crédito a favor"
            }</span>`
      }</td>
      <td data-label=""><button type="button" class="btn-link btn-ver-devolucion" data-id="${d.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  document.querySelectorAll("#fichaVentaDevolucionesBody .btn-ver-devolucion").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaDevolucion(Number(btn.dataset.id)));
  });

  mostrarVista("venta-detalle", { titulo: `Venta #${venta.id}` });
}

document.getElementById("btnEditarVenta").addEventListener("click", async () => {
  const res = await fetch(`/api/ventas/${ventaFichaId}`);
  if (!(await manejarError(res, "No se pudo cargar la venta."))) return;
  abrirModalVenta(await res.json());
});
document.getElementById("btnVolverVentas").addEventListener("click", () => mostrarVista("ventas"));

const modalFacturarVenta = document.getElementById("modalFacturarVenta");

document.getElementById("modalFacturarVentaClose").addEventListener("click", () => {
  modalFacturarVenta.hidden = true;
});
modalFacturarVenta.addEventListener("click", (e) => {
  if (e.target === modalFacturarVenta) modalFacturarVenta.hidden = true;
});

document.getElementById("formFacturarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/ventas/${ventaAFacturarId}/facturar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condicion: form.condicion.value,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    })
  });
  if (!(await manejarError(res, "No se pudo generar la factura."))) return;

  await Promise.all([cargarVentas(), cargarFacturas()]);
  avisar(`Venta #${ventaAFacturarId} facturada.`, "ok");
  ventaAFacturarId = null;
  modalFacturarVenta.hidden = true;
});

/* ---------- Cobrar venta ---------- */

const modalCobrarVenta = document.getElementById("modalCobrarVenta");
let ventaACobrarId = null;

function renderHistorialPagos(contenedorId, lista) {
  const contenedor = document.getElementById(contenedorId);
  if (lista.length === 0) {
    contenedor.innerHTML = "";
    return;
  }
  contenedor.innerHTML =
    `<div class="historial-pagos">` +
    lista
      .map((p) => `<div class="historial-pagos-item"><span>${p.fecha} · ${p.cuenta}</span><span class="mono">${money(p.importe)}</span></div>`)
      .join("") +
    `</div>`;
}

async function abrirModalCobrarVenta(id) {
  ventaACobrarId = id;
  const venta = ventas.find((v) => v.id === id);
  document.getElementById("cobroVentaTotal").textContent = money(venta.neto);
  document.getElementById("cobroVentaCobrado").textContent = money(venta.cobrado);
  document.getElementById("cobroVentaSaldo").textContent = money(venta.neto - venta.cobrado);

  poblarSelectCuentas(document.querySelector('#formCobrarVenta select[name="cuenta_tesoreria_id"]'));

  const cobros = await (await fetch(`/api/ventas/${id}/cobros`)).json();
  renderHistorialPagos("cobroVentaHistorial", cobros);

  modalCobrarVenta.hidden = false;
}

document.getElementById("modalCobrarVentaClose").addEventListener("click", () => {
  modalCobrarVenta.hidden = true;
});
modalCobrarVenta.addEventListener("click", (e) => {
  if (e.target === modalCobrarVenta) modalCobrarVenta.hidden = true;
});

document.getElementById("formCobrarVenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/ventas/${ventaACobrarId}/cobros`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    })
  });

  if (!(await manejarError(res, "No se pudo registrar el cobro."))) return;

  // Un cobro entra plata en una cuenta y baja la deuda del cliente, así
  // que Caja y Clientes también quedan desactualizados.
  await Promise.all([cargarVentas(), cargarCaja(), cargarClientes(), cargarCuentasCorrientes()]);
  form.reset();
  modalCobrarVenta.hidden = true;
  avisar("Cobro registrado.", "ok");
});

/* ---------- Devoluciones ---------- */

// Una devolución revierte parte (o todo) de una venta ya confirmada: no es
// una operación nueva independiente, así que se registra desde la ficha
// de la venta que revierte (botón "Devolver"), no desde un "+ Nuevo" en
// su propia pantalla — esta pantalla es nada más el listado y la ficha.
let devoluciones = [];
let devolucionFichaId = null;
let ventaADevolverId = null;

function renderDevoluciones(lista) {
  const body = document.getElementById("devolucionesBody");

  document.getElementById("devueltoStrip").textContent = money(
    lista.reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("reintegradoStrip").textContent = money(
    lista.filter((d) => d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("creditoAFavorStrip").textContent = money(
    lista.filter((d) => !d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );

  if (lista.length === 0) {
    if (filtrosDevoluciones.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosDevoluciones.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay devoluciones registradas.");
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (d) => `
    <tr class="fila-clickeable" data-id="${d.id}">
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Cliente">${d.cliente}</td>
      <td data-label="Productos">${d.items_resumen || "—"}</td>
      <td data-label="Fecha">${d.fecha}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Plata"><span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
        d.reintegrada ? "Reintegrada" : "Crédito a favor"
      }</span></td>
      <td data-label="">${
        d.tiene_nota_credito ? `<span class="status status-cobrado">Con nota de crédito</span>` : ""
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirFichaDevolucion(Number(tr.dataset.id)));
  });
}

// Igual que Ventas y Compras: las anuladas no se muestran en el listado
// principal (solo en la papelera), así que ni entran en los totales del strip.
function filtrarDevoluciones() {
  const activas = devoluciones
    .filter((d) => d.estado !== "anulada")
    .map((d) => ({ ...d, reintegrada_txt: d.reintegrada ? "si" : "no" }));
  renderDevoluciones(ordenDevoluciones.aplicar(filtrosDevoluciones.aplicar(activas)));
}

const filtrosDevoluciones = crearFiltros(
  "filtrosDevoluciones",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cliente", etiqueta: "Cliente", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    {
      clave: "reintegrada_txt",
      etiqueta: "Plata",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Reintegrada" },
        { valor: "no", texto: "Crédito a favor" }
      ]
    },
    { clave: "motivo", etiqueta: "Motivo", tipo: "texto" }
  ],
  filtrarDevoluciones
);
const ordenDevoluciones = crearOrden("devolucionesBody", filtrarDevoluciones);

async function cargarDevoluciones() {
  tablaCargando("devolucionesBody", 7);
  const res = await fetch("/api/devoluciones");
  devoluciones = await res.json();
  filtrarDevoluciones();
  renderPapelera();
}

/* --- Ficha --- */

async function abrirFichaDevolucion(id) {
  devolucionFichaId = id;
  const res = await fetch(`/api/devoluciones/${id}`);
  if (!(await manejarError(res, "No se pudo cargar la devolución."))) return;
  const d = await res.json();

  document.getElementById("fichaDevolucionTitulo").textContent = `Devolución #${d.id}`;
  document.getElementById("fichaDevolucionTotal").textContent = money(d.total);

  const campos = [
    ["Cliente", d.cliente],
    ["Fecha", d.fecha],
    ["Venta de origen", `Venta #${d.venta_id}`],
    ["Motivo", d.motivo],
    [
      "Plata",
      d.reintegrada ? `Reintegrada por ${d.cuenta}` : "Crédito a favor del cliente"
    ],
    ["Estado", d.estado === "anulada" ? "Anulada" : "Activa"]
  ];
  document.getElementById("fichaDevolucionDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const acciones = document.getElementById("fichaDevolucionAcciones");
  const botones = [
    `<button type="button" class="btn btn-secundario" id="btnVerVentaDevolucion">Ver la venta #${d.venta_id}</button>`
  ];
  if (d.estado !== "anulada") {
    if (d.tiene_nota_credito) {
      botones.push(`<span class="status status-cobrado">Con nota de crédito</span>`);
    } else {
      botones.push(
        `<button type="button" class="btn btn-secundario" id="btnNotaCreditoDevolucion">Emitir nota de crédito</button>`
      );
      botones.push(
        `<button type="button" class="btn-icon-danger" id="btnAnularDevolucion" title="Anular devolución" aria-label="Anular devolución">${ICONO_TACHO}</button>`
      );
    }
  }
  acciones.innerHTML = botones.join(" ");

  acciones.querySelector("#btnVerVentaDevolucion").addEventListener("click", () => abrirFichaVenta(d.venta_id));

  const btnNotaCredito = acciones.querySelector("#btnNotaCreditoDevolucion");
  if (btnNotaCredito) {
    btnNotaCredito.addEventListener("click", () => {
      devolucionANotaCreditoId = d.id;
      modalNotaCredito.hidden = false;
    });
  }

  const btnAnular = acciones.querySelector("#btnAnularDevolucion");
  if (btnAnular) {
    btnAnular.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta devolución? El stock y la cuenta corriente vuelven a como estaban.",
          aceptar: "Anular devolución",
          destructivo: true
        }))
      )
        return;
      const r = await fetch(`/api/devoluciones/${d.id}/anular`, { method: "POST" });
      if (!(await manejarError(r, "No se pudo anular la devolución."))) return;
      avisar(`Devolución #${d.id} anulada.`, "ok");
      await Promise.all([
        cargarDevoluciones(),
        cargarVentas(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        cargarCaja(),
        cargarCuentasCorrientes(),
        cargarResumen(),
        cargarReporteVentas(),
        cargarReporteStock()
      ]);
      await abrirFichaDevolucion(d.id);
    });
  }

  document.getElementById("fichaDevolucionItems").innerHTML = d.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${i.producto}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
      <td data-label="Vuelve al stock">${i.vuelve_stock ? "Sí" : "No (pérdida)"}</td>
    </tr>`
    )
    .join("");

  mostrarVista("devolucion-detalle", { titulo: `Devolución #${d.id}` });
}

document.getElementById("btnVolverDevoluciones").addEventListener("click", () => mostrarVista("devoluciones"));

/* --- Modal: registrar devolución (se abre desde la ficha de la venta) --- */

const modalDevolucion = document.getElementById("modalDevolucion");
const devolucionItemsEl = document.getElementById("devolucionItems");
let ventaADevolverItems = [];

function actualizarTotalDevolucion() {
  let total = 0;
  devolucionItemsEl.querySelectorAll(".item-row-devolucion").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".devolucion-cantidad").value) || 0;
    const precio = Number(fila.dataset.precio);
    total += cantidad * precio;
  });
  document.getElementById("devolucionTotal").textContent = money(total);
}

// La lista de Ventas (GET /api/ventas) no trae los items con detalle, así
// que hace falta traer la ficha completa (GET /api/ventas/:id) para saber
// cuánto queda disponible para devolver de cada renglón.
async function abrirModalDevolucion(ventaId) {
  ventaADevolverId = ventaId;
  const res = await fetch(`/api/ventas/${ventaId}`);
  if (!(await manejarError(res, "No se pudo cargar la venta."))) return;
  const venta = await res.json();
  document.getElementById("modalDevolucionTitulo").textContent = `Registrar devolución — Venta #${ventaId}`;

  devolucionItemsEl.innerHTML = "";
  for (const item of venta.items) {
    if (item.disponible_devolucion <= 0) continue;
    const fila = document.createElement("div");
    fila.className = "item-row item-row-devolucion";
    fila.dataset.ventaItemId = item.id;
    fila.dataset.precio = item.precio_unitario;
    fila.innerHTML = `
      <span class="devolucion-producto">${item.producto} <span class="mono" style="color: var(--ink-muted)">(vendidas: ${numero(
        item.cantidad
      )}, disponibles: ${numero(item.disponible_devolucion)})</span></span>
      <input type="number" class="devolucion-cantidad" placeholder="Cant." step="1" min="0" max="${
        item.disponible_devolucion
      }" value="0" />
      <label class="form-check">
        <input type="checkbox" class="devolucion-vuelve-stock" checked /> Vuelve al stock
      </label>
    `;
    fila.querySelector(".devolucion-cantidad").addEventListener("input", actualizarTotalDevolucion);
    devolucionItemsEl.appendChild(fila);
  }

  document.getElementById("formDevolucion").reset();
  document.getElementById("devolucionReintegrar").checked = false;
  document.getElementById("devolucionCuentaLabel").hidden = true;
  actualizarTotalDevolucion();
  modalDevolucion.hidden = false;
}

// Como abrirModalDevolucion arma las filas a mano (no reusa
// agregarFilaItemVenta: acá no se agrega un producto nuevo, se elige
// cuánto devolver de cada renglón ya vendido), el listener de cantidad
// se cablea al crear cada fila, arriba.

document.getElementById("btnDevolverVenta").addEventListener("click", async () => {
  await abrirModalDevolucion(ventaFichaId);
});

document.getElementById("modalDevolucionClose").addEventListener("click", () => {
  modalDevolucion.hidden = true;
});
modalDevolucion.addEventListener("click", (e) => {
  if (e.target === modalDevolucion) modalDevolucion.hidden = true;
});

document.getElementById("devolucionReintegrar").addEventListener("change", (e) => {
  const label = document.getElementById("devolucionCuentaLabel");
  label.hidden = !e.target.checked;
  if (e.target.checked) {
    poblarSelectCuentas(label.querySelector("select"));
  }
});

document.getElementById("formDevolucion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const items = [...devolucionItemsEl.querySelectorAll(".item-row-devolucion")]
    .map((fila) => ({
      venta_item_id: Number(fila.dataset.ventaItemId),
      cantidad: Number(fila.querySelector(".devolucion-cantidad").value) || 0,
      vuelve_stock: fila.querySelector(".devolucion-vuelve-stock").checked
    }))
    .filter((i) => i.cantidad > 0);

  if (items.length === 0) {
    avisar("Ingresá una cantidad a devolver de al menos un producto.", "atencion");
    return;
  }

  const reintegrar = document.getElementById("devolucionReintegrar").checked;

  const res = await fetch("/api/devoluciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venta_id: ventaADevolverId,
      items,
      motivo: form.motivo.value || null,
      cuenta_tesoreria_id: reintegrar ? Number(form.cuenta_tesoreria_id.value) : null
    })
  });
  if (!(await manejarError(res, "No se pudo registrar la devolución."))) return;
  avisar("Devolución registrada.", "ok");

  // Toca stock, cuenta corriente, caja (si hubo reintegro) y el resultado.
  await Promise.all([
    cargarDevoluciones(),
    cargarVentas(),
    cargarStock(),
    cargarProductos(),
    cargarClientes(),
    cargarCaja(),
    cargarCuentasCorrientes(),
    cargarResumen(),
    cargarReporteVentas(),
    cargarReporteStock()
  ]);
  modalDevolucion.hidden = true;
  await abrirFichaVenta(ventaADevolverId);
});

/* --- Modal: emitir nota de crédito (se abre desde la ficha de la devolución) --- */

const modalNotaCredito = document.getElementById("modalNotaCredito");
let devolucionANotaCreditoId = null;

document.getElementById("modalNotaCreditoClose").addEventListener("click", () => {
  modalNotaCredito.hidden = true;
});
modalNotaCredito.addEventListener("click", (e) => {
  if (e.target === modalNotaCredito) modalNotaCredito.hidden = true;
});

document.getElementById("formNotaCredito").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/devoluciones/${devolucionANotaCreditoId}/nota-credito`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condicion: form.condicion.value,
      letra: form.letra.value,
      punto_venta: Number(form.punto_venta.value) || 1
    })
  });
  if (!(await manejarError(res, "No se pudo emitir la nota de crédito."))) return;

  await Promise.all([cargarDevoluciones(), cargarFacturas()]);
  modalNotaCredito.hidden = true;
  await abrirFichaDevolucion(devolucionANotaCreditoId);
  avisar("Nota de crédito emitida.", "ok");
});


/* ---------- Compras ---------- */

const ENVIO_LABEL = { pedido: "Pedido", en_camino: "En camino", recibido: "Recibido" };
const ESTADO_PAGO_CLASE = { pendiente: "status-vencido", parcial: "status-pendiente", pagado: "status-cobrado" };
const ESTADO_PAGO_LABEL = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };

function renderCompras(lista) {
  const body = document.getElementById("comprasBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosCompras.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosCompras.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay compras registradas.", { accionTexto: "+ Nueva compra", accionId: "btnNuevaCompra" });
    }
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, select, a")) return;
      abrirFichaCompra(c.id);
    });
    const borrador = c.estado === "borrador";

    // Anular solo tiene sentido si no tiene pagos (el backend lo vuelve a
    // validar, esto es nada más para no invitar a un click que ya sabemos
    // que va a fallar).
    const accionAnular =
      c.estado_pago === "pendiente"
        ? `<button type="button" class="btn-icon-danger btn-anular-compra" data-id="${c.id}" title="Anular compra" aria-label="Anular compra">${ICONO_TACHO}</button>`
        : "";

    // Un borrador todavía no le debe nada a nadie, así que no se puede
    // pagar ni tiene estado de envío que tocar: lo único que ofrece es
    // efectuar el pedido.
    if (borrador) {
      tr.innerHTML = `
        <td data-label="N°" class="mono">#${c.id}</td>
        <td data-label="Proveedor">${c.proveedor}</td>
        <td data-label="Fecha">${c.fecha}</td>
        <td data-label="Total" class="align-right mono">${money(c.total)}</td>
        <td data-label="Pago"><span class="status status-pendiente">borrador</span></td>
        <td data-label="Envío">—</td>
        <td data-label=""><div class="fila-acciones"><button type="button" class="btn-fila btn-confirmar-compra" data-id="${c.id}">Efectuar pedido</button> ${accionAnular}</div></td>
      `;
      body.appendChild(tr);
      continue;
    }

    const accionPago =
      c.estado_pago === "pagado"
        ? ""
        : `<button type="button" class="btn-fila btn-pagar-compra" data-id="${c.id}">Pagar</button>`;
    // Una vez recibida no se puede volver atrás (el costo promedio ya se
    // recalculó), así que el selector se reemplaza por texto plano.
    const celdaEnvio =
      c.estado_envio === "recibido"
        ? `<span class="status status-cobrado">Recibido</span>`
        : `<select class="select-inline select-estado-envio" data-id="${c.id}">${Object.entries(ENVIO_LABEL)
            .map(
              ([valor, label]) =>
                `<option value="${valor}" ${valor === c.estado_envio ? "selected" : ""}>${label}</option>`
            )
            .join("")}</select>`;

    tr.innerHTML = `
      <td data-label="N°" class="mono">#${c.id}</td>
      <td data-label="Proveedor">${c.proveedor}</td>
      <td data-label="Fecha">${c.fecha}</td>
      <td data-label="Total" class="align-right mono">${money(c.total)}</td>
      <td data-label="Pago"><span class="status ${ESTADO_PAGO_CLASE[c.estado_pago]}">${ESTADO_PAGO_LABEL[c.estado_pago]}</span></td>
      <td data-label="Envío">${celdaEnvio}</td>
      <td data-label=""><div class="fila-acciones">${accionPago} ${accionAnular}</div></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-confirmar-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Efectuar el pedido? Se va a registrar la deuda con el proveedor.",
          aceptar: "Efectuar pedido"
        }))
      )
        return;
      const res = await fetch(`/api/compras/${btn.dataset.id}/confirmar`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo efectuar el pedido."))) return;
      avisar(`Compra #${btn.dataset.id} efectuada.`, "ok");
      await Promise.all([cargarCompras(), cargarProveedores(), cargarCuentasCorrientes()]);
    });
  });

  body.querySelectorAll(".btn-pagar-compra").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalPagarCompra(Number(btn.dataset.id)));
  });

  body.querySelectorAll(".btn-anular-compra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta compra? Va a la papelera y el stock que sumó se revierte.",
          aceptar: "Anular compra",
          destructivo: true
        }))
      )
        return;
      const res = await fetch(`/api/compras/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular la compra."))) return;
      avisar(`Compra #${btn.dataset.id} anulada.`, "ok");
      await Promise.all([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), cargarCuentasCorrientes(), cargarReporteStock()]);
    });
  });

  body.querySelectorAll(".select-estado-envio").forEach((select) => {
    select.addEventListener("change", async () => {
      if (
        select.value === "recibido" &&
        !(await confirmar({
          cuerpo: "¿Marcar la compra como recibida? Se va a sumar el stock y recalcular el costo.",
          aceptar: "Marcar recibida"
        }))
      ) {
        await cargarCompras();
        return;
      }
      const res = await fetch(`/api/compras/${select.dataset.id}/estado-envio`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_envio: select.value })
      });
      if (!(await manejarError(res, "No se pudo cambiar el estado de envío."))) {
        await cargarCompras();
        return;
      }
      // Recibir una compra mueve stock y costo, así que hay que refrescar
      // esas pantallas también.
      await Promise.all([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), cargarReporteStock()]);
    });
  });
}

let compras = [];
let compraEditandoId = null;
let compraFichaId = null;

function filtrarCompras() {
  const activas = compras.filter((c) => c.estado !== "anulada");
  const lista = filtrosCompras.aplicar(activas);

  const total = lista.reduce((acc, c) => acc + c.total, 0);
  const pagado = lista.reduce((acc, c) => acc + c.pagado, 0);
  document.getElementById("comprasTotalStrip").textContent = money(total);
  document.getElementById("comprasPagadoStrip").textContent = money(pagado);
  document.getElementById("comprasDeudaStrip").textContent = money(total - pagado);

  renderCompras(ordenCompras.aplicar(lista));
}

const filtrosCompras = crearFiltros(
  "filtrosCompras",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    {
      clave: "estado",
      etiqueta: "Estado",
      tipo: "select",
      opciones: [
        { valor: "borrador", texto: "Borrador" },
        { valor: "activa", texto: "Efectuada" }
      ]
    },
    {
      clave: "estado_pago",
      etiqueta: "Estado de pago",
      tipo: "select",
      opciones: [
        { valor: "pendiente", texto: "Pendiente" },
        { valor: "parcial", texto: "Parcial" },
        { valor: "pagado", texto: "Pagado" }
      ]
    },
    {
      clave: "estado_envio",
      etiqueta: "Envío",
      tipo: "select",
      opciones: [
        { valor: "pedido", texto: "Pedido" },
        { valor: "en_camino", texto: "En camino" },
        { valor: "recibido", texto: "Recibido" }
      ]
    },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    { clave: "pagado", etiqueta: "Pagado", tipo: "numero" },
    { clave: "costo_envio", etiqueta: "Costo de envío", tipo: "numero" }
  ],
  filtrarCompras
);
const ordenCompras = crearOrden("comprasBody", filtrarCompras);

async function cargarCompras() {
  tablaCargando("comprasBody", 7);
  const res = await fetch("/api/compras");
  compras = await res.json();
  filtrarCompras();
  renderPapelera();
}

const modalCompra = document.getElementById("modalCompra");
const compraItemsEl = document.getElementById("compraItems");
const compraCostoEnvioEl = document.getElementById("compraCostoEnvio");

// El envío vive fuera de #compraItems (no es un ítem), así que totalItems()
// no lo ve y hay que sumarlo aparte.
function actualizarTotalCompra() {
  const envio = Number(compraCostoEnvioEl.value) || 0;
  document.getElementById("compraTotal").textContent = money(totalItems(compraItemsEl) + envio);
}
compraItemsEl.addEventListener("item-change", actualizarTotalCompra);
compraCostoEnvioEl.addEventListener("input", actualizarTotalCompra);

// Igual que con ventas: el mismo modal sirve para alta y edición. La nota
// de "se guarda como borrador" solo tiene sentido al crear, así que se
// oculta al editar (una compra editada nunca cambia de estado).
function abrirModalCompra(compra = null) {
  compraEditandoId = compra?.id ?? null;
  document.getElementById("modalCompraTitulo").textContent = compra ? "Editar compra" : "Nueva compra";
  document.getElementById("formCompraSubmit").textContent = compra ? "Guardar cambios" : "Guardar borrador";
  document.getElementById("compraFormNota").hidden = Boolean(compra);

  const form = document.getElementById("formCompra");
  form.proveedor.value = compra?.proveedor ?? "";
  form.fecha.value = compra?.fecha ?? hoyISO();
  compraCostoEnvioEl.value = compra?.costo_envio ?? "";

  compraItemsEl.innerHTML = "";
  if (compra) {
    for (const item of compra.items) {
      agregarFilaItemCompra(compraItemsEl);
      const fila = compraItemsEl.lastElementChild;
      fila.querySelector(".item-producto").value = item.producto;
      fila.querySelector(".item-cantidad").value = item.cantidad;
      fila.querySelector(".item-precio").value = item.precio_unitario;
      actualizarSubtotalFila(fila);
    }
  } else {
    agregarFilaItemCompra(compraItemsEl);
  }
  actualizarTotalCompra();
  modalCompra.hidden = false;
}

document.getElementById("btnNuevaCompra").addEventListener("click", () => abrirModalCompra());
document.getElementById("btnAgregarItemCompra").addEventListener("click", () => {
  agregarFilaItemCompra(compraItemsEl);
});
document.getElementById("modalCompraClose").addEventListener("click", () => {
  modalCompra.hidden = true;
});
modalCompra.addEventListener("click", (e) => {
  if (e.target === modalCompra) modalCompra.hidden = true;
});

document.getElementById("formCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const items = leerItemsCompra(compraItemsEl);

  if (items.length === 0) {
    avisar("Agregá al menos un producto a la compra.", "atencion");
    return;
  }

  const body = JSON.stringify({
    proveedor: form.proveedor.value,
    fecha: form.fecha.value,
    costo_envio: form.costo_envio.value,
    items
  });

  const res = compraEditandoId
    ? await fetch(`/api/compras/${compraEditandoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body
      })
    : await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
  if (!(await manejarError(res, "No se pudo guardar la compra."))) return;

  const idEditado = compraEditandoId;
  await Promise.all([cargarCompras(), cargarStock(), cargarProductos(), cargarProveedores(), cargarCuentasCorrientes(), cargarReporteStock()]);
  form.reset();
  modalCompra.hidden = true;
  if (idEditado) await abrirFichaCompra(idEditado);
  avisar(idEditado ? `Compra #${idEditado} actualizada.` : "Compra registrada.", "ok");
});

async function abrirFichaCompra(id) {
  compraFichaId = id;
  const res = await fetch(`/api/compras/${id}`);
  if (!(await manejarError(res, "No se pudo cargar la compra."))) return;
  const compra = await res.json();

  document.getElementById("fichaCompraTitulo").textContent = `Compra #${compra.id}`;
  // Editar reemplaza los items enteros, y una devolución a proveedor apunta
  // a esos renglones exactos (compra_item_id): si se pudiera editar, la
  // devolución quedaría apuntando a renglones que ya no existen. El
  // backend ya lo rechaza, esto es para no invitar a un click que va a fallar.
  document.getElementById("btnEditarCompra").hidden = compra.tiene_devolucion;
  document.getElementById("btnDevolverCompra").hidden =
    compra.estado !== "activa" || !compra.stock_aplicado || compra.items.every((i) => i.disponible_devolucion <= 0);

  const campos = [
    ["Proveedor", compra.proveedor],
    ["Fecha", compra.fecha],
    ["Estado", compra.estado === "borrador" ? "Borrador" : "Efectuada"],
    ["Envío", ENVIO_LABEL[compra.estado_envio] ?? "—"],
    ["Pago", `${money(compra.pagado)} de ${money(compra.neto)} (${ESTADO_PAGO_LABEL[compra.estado_pago] ?? compra.estado_pago})`]
  ];
  document.getElementById("fichaCompraDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor ?? "—"}</dd></div>`)
    .join("");

  document.getElementById("fichaCompraSubtotal").textContent = money(compra.subtotal);
  document.getElementById("fichaCompraEnvio").textContent = money(compra.costo_envio);
  document.getElementById("fichaCompraTotal").textContent = money(compra.total);
  document.getElementById("fichaCompraDevuelto").textContent = money(compra.devuelto);
  document.getElementById("fichaCompraNeto").textContent = money(compra.neto);

  document.getElementById("fichaCompraItems").innerHTML = compra.items
    .map(
      (i) => `
        <tr>
          <td data-label="Producto">${i.producto}</td>
          <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
          <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
          <td data-label="Costo real (con envío)" class="align-right mono">${money(i.costo_real_unitario)}</td>
          <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
          <td data-label="Devuelto" class="align-right mono">${
            i.cantidad_devuelta > 0 ? numero(i.cantidad_devuelta) : "—"
          }</td>
        </tr>`
    )
    .join("");

  // Las devoluciones a esta compra viven en su propio caché
  // (cargarDevolucionesProveedor, ya resuelto para cuando se navega acá);
  // el panel entero se oculta si no hay ninguna.
  const devolucionesDeCompra = devolucionesProveedor.filter((d) => d.compra_id === compra.id);
  const panelDevoluciones = document.getElementById("fichaCompraDevolucionesPanel");
  panelDevoluciones.hidden = devolucionesDeCompra.length === 0;
  document.getElementById("fichaCompraDevolucionesBody").innerHTML = devolucionesDeCompra
    .map(
      (d) => `
    <tr>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Productos">${d.items_resumen || "—"}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Estado">${
        d.estado === "anulada"
          ? `<span class="status status-vencido">Anulada</span>`
          : `<span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
              d.reintegrada ? "Reintegrada" : "Crédito a favor"
            }</span>`
      }</td>
      <td data-label=""><button type="button" class="btn-link btn-ver-devolucion-proveedor" data-id="${d.id}">Ver</button></td>
    </tr>`
    )
    .join("");
  document.querySelectorAll("#fichaCompraDevolucionesBody .btn-ver-devolucion-proveedor").forEach((btn) => {
    btn.addEventListener("click", () => abrirFichaDevolucionProveedor(Number(btn.dataset.id)));
  });

  mostrarVista("compra-detalle", { titulo: `Compra #${compra.id}` });
}

document.getElementById("btnEditarCompra").addEventListener("click", async () => {
  const res = await fetch(`/api/compras/${compraFichaId}`);
  if (!(await manejarError(res, "No se pudo cargar la compra."))) return;
  abrirModalCompra(await res.json());
});
document.getElementById("btnVolverCompras").addEventListener("click", () => mostrarVista("compras"));

/* ---------- Pagar compra ---------- */

const modalPagarCompra = document.getElementById("modalPagarCompra");
let compraAPagarId = null;

async function abrirModalPagarCompra(id) {
  compraAPagarId = id;
  const compra = compras.find((c) => c.id === id);
  document.getElementById("pagoCompraTotal").textContent = money(compra.total);
  document.getElementById("pagoCompraPagado").textContent = money(compra.pagado);
  document.getElementById("pagoCompraSaldo").textContent = money(compra.total - compra.pagado);

  poblarSelectCuentas(document.querySelector('#formPagarCompra select[name="cuenta_tesoreria_id"]'));

  const pagos = await (await fetch(`/api/compras/${id}/pagos`)).json();
  renderHistorialPagos("pagoCompraHistorial", pagos);

  modalPagarCompra.hidden = false;
}

document.getElementById("modalPagarCompraClose").addEventListener("click", () => {
  modalPagarCompra.hidden = true;
});
modalPagarCompra.addEventListener("click", (e) => {
  if (e.target === modalPagarCompra) modalPagarCompra.hidden = true;
});

document.getElementById("formPagarCompra").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/compras/${compraAPagarId}/pagos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importe: parseFloat(form.importe.value),
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      nota: form.nota.value || null
    })
  });

  if (!(await manejarError(res, "No se pudo registrar el pago."))) return;

  // Un pago saca plata de una cuenta y baja la deuda con el proveedor.
  await Promise.all([cargarCompras(), cargarCaja(), cargarProveedores(), cargarCuentasCorrientes()]);
  form.reset();
  modalPagarCompra.hidden = true;
  avisar("Pago registrado.", "ok");
});

/* ---------- Devoluciones a proveedor ---------- */

// Espejo de Devoluciones (venta), del lado de compras: revierte parte de
// una compra ya recibida, devolviéndole mercadería al proveedor. Se
// registra desde la ficha de la compra que revierte (botón "Devolver"),
// no desde un "+ Nuevo" en su propia pantalla.
let devolucionesProveedor = [];
let devolucionProveedorFichaId = null;
let compraADevolverId = null;

function renderDevolucionesProveedor(lista) {
  const body = document.getElementById("devolucionesProveedorBody");

  document.getElementById("devueltoProveedorStrip").textContent = money(
    lista.reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("reintegradoProveedorStrip").textContent = money(
    lista.filter((d) => d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );
  document.getElementById("creditoProveedorStrip").textContent = money(
    lista.filter((d) => !d.reintegrada).reduce((acc, d) => acc + d.total, 0)
  );

  if (lista.length === 0) {
    if (filtrosDevolucionesProveedor.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosDevolucionesProveedor.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay devoluciones a proveedor registradas.");
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (d) => `
    <tr class="fila-clickeable" data-id="${d.id}">
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Proveedor">${d.proveedor}</td>
      <td data-label="Productos">${d.items_resumen || "—"}</td>
      <td data-label="Fecha">${d.fecha}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label="Plata"><span class="status ${d.reintegrada ? "status-cobrado" : "status-pendiente"}">${
        d.reintegrada ? "Reintegrada" : "Crédito a favor"
      }</span></td>
      <td data-label="">${
        d.tiene_nota_credito ? `<span class="status status-cobrado">Con nota de crédito</span>` : ""
      }</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => abrirFichaDevolucionProveedor(Number(tr.dataset.id)));
  });
}

// Igual que Devoluciones (venta): las anuladas no se muestran en el
// listado principal (solo en la papelera), así que ni entran en los
// totales del strip.
function filtrarDevolucionesProveedor() {
  const activas = devolucionesProveedor
    .filter((d) => d.estado !== "anulada")
    .map((d) => ({ ...d, reintegrada_txt: d.reintegrada ? "si" : "no" }));
  renderDevolucionesProveedor(
    ordenDevolucionesProveedor.aplicar(filtrosDevolucionesProveedor.aplicar(activas))
  );
}

const filtrosDevolucionesProveedor = crearFiltros(
  "filtrosDevolucionesProveedor",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "items_resumen", etiqueta: "Productos", tipo: "texto" },
    { clave: "total", etiqueta: "Total", tipo: "numero" },
    {
      clave: "reintegrada_txt",
      etiqueta: "Plata",
      tipo: "select",
      opciones: [
        { valor: "si", texto: "Reintegrada" },
        { valor: "no", texto: "Crédito a favor" }
      ]
    },
    { clave: "motivo", etiqueta: "Motivo", tipo: "texto" }
  ],
  filtrarDevolucionesProveedor
);
const ordenDevolucionesProveedor = crearOrden("devolucionesProveedorBody", filtrarDevolucionesProveedor);

async function cargarDevolucionesProveedor() {
  tablaCargando("devolucionesProveedorBody", 7);
  const res = await fetch("/api/devoluciones-proveedor");
  devolucionesProveedor = await res.json();
  filtrarDevolucionesProveedor();
  renderPapelera();
}

/* --- Ficha --- */

async function abrirFichaDevolucionProveedor(id) {
  devolucionProveedorFichaId = id;
  const res = await fetch(`/api/devoluciones-proveedor/${id}`);
  if (!(await manejarError(res, "No se pudo cargar la devolución."))) return;
  const d = await res.json();

  document.getElementById("fichaDevolucionProveedorTitulo").textContent = `Devolución a proveedor #${d.id}`;
  document.getElementById("fichaDevolucionProveedorTotal").textContent = money(d.total);

  const campos = [
    ["Proveedor", d.proveedor],
    ["Fecha", d.fecha],
    ["Compra de origen", `Compra #${d.compra_id}`],
    ["Motivo", d.motivo],
    ["Plata", d.reintegrada ? `Reintegrada por ${d.cuenta}` : "Crédito con el proveedor"],
    ["Nota de crédito del proveedor", d.nota_credito_proveedor_numero],
    ["Estado", d.estado === "anulada" ? "Anulada" : "Activa"]
  ];
  document.getElementById("fichaDevolucionProveedorDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const acciones = document.getElementById("fichaDevolucionProveedorAcciones");
  const botones = [
    `<button type="button" class="btn btn-secundario" id="btnVerCompraDevolucionProveedor">Ver la compra #${d.compra_id}</button>`
  ];
  if (d.estado !== "anulada") {
    if (d.tiene_nota_credito) {
      botones.push(`<span class="status status-cobrado">Con nota de crédito</span>`);
    } else {
      botones.push(
        `<button type="button" class="btn btn-secundario" id="btnNotaCreditoDevolucionProveedor">Asociar nota de crédito</button>`
      );
      botones.push(
        `<button type="button" class="btn-icon-danger" id="btnAnularDevolucionProveedor" title="Anular devolución" aria-label="Anular devolución">${ICONO_TACHO}</button>`
      );
    }
  }
  acciones.innerHTML = botones.join(" ");

  acciones
    .querySelector("#btnVerCompraDevolucionProveedor")
    .addEventListener("click", () => abrirFichaCompra(d.compra_id));

  const btnNotaCredito = acciones.querySelector("#btnNotaCreditoDevolucionProveedor");
  if (btnNotaCredito) {
    btnNotaCredito.addEventListener("click", () => {
      devolucionProveedorANotaCreditoId = d.id;
      document.getElementById("formNotaCreditoProveedor").reset();
      modalNotaCreditoProveedor.hidden = false;
    });
  }

  const btnAnular = acciones.querySelector("#btnAnularDevolucionProveedor");
  if (btnAnular) {
    btnAnular.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular esta devolución? El stock y la cuenta corriente vuelven a como estaban.",
          aceptar: "Anular devolución",
          destructivo: true
        }))
      )
        return;
      const r = await fetch(`/api/devoluciones-proveedor/${d.id}/anular`, { method: "POST" });
      if (!(await manejarError(r, "No se pudo anular la devolución."))) return;
      avisar(`Devolución #${d.id} anulada.`, "ok");
      await Promise.all([
        cargarDevolucionesProveedor(),
        cargarCompras(),
        cargarStock(),
        cargarProductos(),
        cargarProveedores(),
        cargarCaja(),
        cargarCuentasCorrientes(),
        cargarResumen(),
        cargarReporteStock()
      ]);
      await abrirFichaDevolucionProveedor(d.id);
    });
  }

  document.getElementById("fichaDevolucionProveedorItems").innerHTML = d.items
    .map(
      (i) => `
    <tr>
      <td data-label="Producto">${i.producto}</td>
      <td data-label="Cantidad" class="align-right mono">${numero(i.cantidad)}</td>
      <td data-label="Precio unit." class="align-right mono">${money(i.precio_unitario)}</td>
      <td data-label="Subtotal" class="align-right mono">${money(i.subtotal)}</td>
    </tr>`
    )
    .join("");

  mostrarVista("devolucion-proveedor-detalle", { titulo: `Devolución a proveedor #${d.id}` });
}

document
  .getElementById("btnVolverDevolucionesProveedor")
  .addEventListener("click", () => mostrarVista("devoluciones-proveedor"));

/* --- Modal: registrar devolución a proveedor (se abre desde la ficha de la compra) --- */

const modalDevolucionProveedor = document.getElementById("modalDevolucionProveedor");
const devolucionProveedorItemsEl = document.getElementById("devolucionProveedorItems");

function actualizarTotalDevolucionProveedor() {
  let total = 0;
  devolucionProveedorItemsEl.querySelectorAll(".item-row-devolucion").forEach((fila) => {
    const cantidad = Number(fila.querySelector(".devolucion-cantidad").value) || 0;
    const precio = Number(fila.dataset.precio);
    total += cantidad * precio;
  });
  document.getElementById("devolucionProveedorTotal").textContent = money(total);
}

// La lista de Compras (GET /api/compras) no trae los items con detalle, así
// que hace falta traer la ficha completa (GET /api/compras/:id) para saber
// cuánto queda disponible para devolver de cada renglón.
async function abrirModalDevolucionProveedor(compraId) {
  compraADevolverId = compraId;
  const res = await fetch(`/api/compras/${compraId}`);
  if (!(await manejarError(res, "No se pudo cargar la compra."))) return;
  const compra = await res.json();
  document.getElementById(
    "modalDevolucionProveedorTitulo"
  ).textContent = `Registrar devolución — Compra #${compraId}`;

  devolucionProveedorItemsEl.innerHTML = "";
  for (const item of compra.items) {
    if (item.disponible_devolucion <= 0) continue;
    const fila = document.createElement("div");
    fila.className = "item-row item-row-devolucion";
    fila.dataset.compraItemId = item.id;
    fila.dataset.precio = item.precio_unitario;
    fila.innerHTML = `
      <span class="devolucion-producto">${item.producto} <span class="mono" style="color: var(--ink-muted)">(compradas: ${numero(
        item.cantidad
      )}, disponibles: ${numero(item.disponible_devolucion)})</span></span>
      <input type="number" class="devolucion-cantidad" placeholder="Cant." step="1" min="0" max="${
        item.disponible_devolucion
      }" value="0" />
    `;
    fila.querySelector(".devolucion-cantidad").addEventListener("input", actualizarTotalDevolucionProveedor);
    devolucionProveedorItemsEl.appendChild(fila);
  }

  document.getElementById("formDevolucionProveedor").reset();
  document.getElementById("devolucionProveedorReintegrar").checked = false;
  document.getElementById("devolucionProveedorCuentaLabel").hidden = true;
  actualizarTotalDevolucionProveedor();
  modalDevolucionProveedor.hidden = false;
}

document.getElementById("btnDevolverCompra").addEventListener("click", async () => {
  await abrirModalDevolucionProveedor(compraFichaId);
});

document.getElementById("modalDevolucionProveedorClose").addEventListener("click", () => {
  modalDevolucionProveedor.hidden = true;
});
modalDevolucionProveedor.addEventListener("click", (e) => {
  if (e.target === modalDevolucionProveedor) modalDevolucionProveedor.hidden = true;
});

document.getElementById("devolucionProveedorReintegrar").addEventListener("change", (e) => {
  const label = document.getElementById("devolucionProveedorCuentaLabel");
  label.hidden = !e.target.checked;
  if (e.target.checked) {
    poblarSelectCuentas(label.querySelector("select"));
  }
});

document.getElementById("formDevolucionProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const items = [...devolucionProveedorItemsEl.querySelectorAll(".item-row-devolucion")]
    .map((fila) => ({
      compra_item_id: Number(fila.dataset.compraItemId),
      cantidad: Number(fila.querySelector(".devolucion-cantidad").value) || 0
    }))
    .filter((i) => i.cantidad > 0);

  if (items.length === 0) {
    avisar("Ingresá una cantidad a devolver de al menos un producto.", "atencion");
    return;
  }

  const reintegrar = document.getElementById("devolucionProveedorReintegrar").checked;

  const res = await fetch("/api/devoluciones-proveedor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compra_id: compraADevolverId,
      items,
      motivo: form.motivo.value || null,
      cuenta_tesoreria_id: reintegrar ? Number(form.cuenta_tesoreria_id.value) : null
    })
  });
  if (!(await manejarError(res, "No se pudo registrar la devolución."))) return;
  avisar("Devolución registrada.", "ok");

  // Toca stock, costo, cuenta corriente y caja (si hubo reintegro).
  await Promise.all([
    cargarDevolucionesProveedor(),
    cargarCompras(),
    cargarStock(),
    cargarProductos(),
    cargarProveedores(),
    cargarCaja(),
    cargarCuentasCorrientes(),
    cargarResumen(),
    cargarReporteStock()
  ]);
  modalDevolucionProveedor.hidden = true;
  await abrirFichaCompra(compraADevolverId);
});

/* --- Modal: asociar nota de crédito del proveedor (se abre desde la ficha de la devolución) --- */

const modalNotaCreditoProveedor = document.getElementById("modalNotaCreditoProveedor");
let devolucionProveedorANotaCreditoId = null;

document.getElementById("modalNotaCreditoProveedorClose").addEventListener("click", () => {
  modalNotaCreditoProveedor.hidden = true;
});
modalNotaCreditoProveedor.addEventListener("click", (e) => {
  if (e.target === modalNotaCreditoProveedor) modalNotaCreditoProveedor.hidden = true;
});

document.getElementById("formNotaCreditoProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(`/api/devoluciones-proveedor/${devolucionProveedorANotaCreditoId}/nota-credito`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numero: form.numero.value })
  });
  if (!(await manejarError(res, "No se pudo guardar la nota de crédito."))) return;

  await cargarDevolucionesProveedor();
  modalNotaCreditoProveedor.hidden = true;
  await abrirFichaDevolucionProveedor(devolucionProveedorANotaCreditoId);
  avisar("Nota de crédito guardada.", "ok");
});

/* ---------- Clientes (CRM) ---------- */

let clientes = [];
let clienteEditandoId = null;
let clienteFichaId = null;

function renderClientes(lista) {
  const body = document.getElementById("clientesBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosClientes.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(5);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosClientes.limpiar());
    } else {
      body.innerHTML = filaVacia(5, "Todavía no hay clientes cargados.", { accionTexto: "+ Nuevo cliente", accionId: "btnNuevoCliente" });
    }
    return;
  }

  for (const c of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    const contacto = [c.telefono, c.email].filter(Boolean).join(" · ") || "—";
    tr.innerHTML = `
      <td data-label="Nombre">${c.nombre}</td>
      <td data-label="Contacto">${contacto}</td>
      <td data-label="Compras" class="align-right mono">${numero(c.cantidad_compras)}</td>
      <td data-label="Total gastado" class="align-right mono">${money(c.total_gastado)}</td>
      <td data-label="Deuda" class="align-right mono">${money(c.deuda)}</td>
      <td data-label="">${botonEditarFila("btn-editar-cliente", c.id, "cliente")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      abrirFichaCliente(c.id);
    });
    body.appendChild(tr);
  }

  // El objeto de la lista ya trae todos los campos del modal (la API hace
  // SELECT clientes.*), así que no hace falta ir a buscarlo de nuevo.
  body.querySelectorAll(".btn-editar-cliente").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalCliente(clientes.find((c) => c.id === Number(btn.dataset.id)));
    });
  });
}

function poblarDatalistClientes() {
  document.getElementById("clientesSugeridos").innerHTML = clientes
    .map((c) => `<option value="${c.nombre}"></option>`)
    .join("");
}

async function cargarClientes() {
  tablaCargando("clientesBody", 5);
  const res = await fetch("/api/clientes");
  clientes = await res.json();
  filtrarClientes();
  poblarDatalistClientes();
}

function filtrarClientes() {
  const q = document.getElementById("clientesSearch").value.trim().toLowerCase();
  const porTexto = clientes.filter((c) =>
    [c.nombre, c.email, c.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  renderClientes(ordenClientes.aplicar(filtrosClientes.aplicar(porTexto)));
}

// "Deuda mayor que 0" reemplaza al viejo select de sí/no: el mismo campo
// ahora sirve para pedir quién debe, quién debe más de cierto monto, o
// quién está al día.
const filtrosClientes = crearFiltros(
  "filtrosClientes",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "deuda", etiqueta: "Deuda", tipo: "numero" },
    { clave: "total_gastado", etiqueta: "Total gastado", tipo: "numero" },
    { clave: "cantidad_compras", etiqueta: "Cantidad de compras", tipo: "numero" },
    { clave: "ultima_compra", etiqueta: "Última compra", tipo: "fecha" },
    { clave: "email", etiqueta: "Email", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
    { clave: "documento", etiqueta: "CUIT / DNI", tipo: "texto" }
  ],
  filtrarClientes
);

document.getElementById("clientesSearch").addEventListener("input", filtrarClientes);
const ordenClientes = crearOrden("clientesBody", filtrarClientes);

async function abrirFichaCliente(id) {
  clienteFichaId = id;
  const cliente = await (await fetch(`/api/clientes/${id}`)).json();

  document.getElementById("fichaClienteNombre").textContent = cliente.nombre;
  document.getElementById("fichaClienteTotal").textContent = money(cliente.total_gastado);
  document.getElementById("fichaClienteCompras").textContent = numero(cliente.cantidad_compras);
  document.getElementById("fichaClienteDeuda").textContent = money(cliente.deuda);

  const campos = [
    ["Email", cliente.email],
    ["Teléfono", cliente.telefono],
    ["Dirección", cliente.direccion],
    ["CUIT / DNI", cliente.documento],
    ["Última compra", cliente.ultima_compra],
    ["Notas", cliente.notas]
  ];
  document.getElementById("fichaClienteDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const historialBody = document.getElementById("fichaClienteHistorial");
  historialBody.innerHTML =
    cliente.historial.length === 0
      ? filaVacia(4, "Este cliente todavía no tiene compras.")
      : cliente.historial
          .map((v) => {
            const anulada = v.estado === "anulada";
            return `
        <tr class="${anulada ? "fila-anulada" : ""}">
          <td data-label="N°" class="mono">#${v.id}</td>
          <td data-label="Fecha">${v.fecha}</td>
          <td data-label="Total" class="align-right mono">${money(v.total)}</td>
          <td data-label="Cobro"><span class="status ${
            anulada ? "status-vencido" : ESTADO_COBRO_CLASE[v.estado_cobro]
          }">${anulada ? "Anulada" : ESTADO_COBRO_LABEL[v.estado_cobro]}</span></td>
        </tr>`;
          })
          .join("");

  mostrarVista("cliente-detalle", { titulo: cliente.nombre });
}

const modalCliente = document.getElementById("modalCliente");

function abrirModalCliente(cliente = null) {
  clienteEditandoId = cliente?.id ?? null;
  const form = document.getElementById("formCliente");
  document.getElementById("modalClienteTitulo").textContent = cliente ? "Editar cliente" : "Nuevo cliente";
  form.nombre.value = cliente?.nombre ?? "";
  form.email.value = cliente?.email ?? "";
  form.telefono.value = cliente?.telefono ?? "";
  form.direccion.value = cliente?.direccion ?? "";
  form.documento.value = cliente?.documento ?? "";
  form.notas.value = cliente?.notas ?? "";
  modalCliente.hidden = false;
}

document.getElementById("btnNuevoCliente").addEventListener("click", () => abrirModalCliente());
document.getElementById("btnEditarCliente").addEventListener("click", async () => {
  const cliente = await (await fetch(`/api/clientes/${clienteFichaId}`)).json();
  abrirModalCliente(cliente);
});
document.getElementById("modalClienteClose").addEventListener("click", () => {
  modalCliente.hidden = true;
});
modalCliente.addEventListener("click", (e) => {
  if (e.target === modalCliente) modalCliente.hidden = true;
});
document.getElementById("btnVolverClientes").addEventListener("click", () => mostrarVista("clientes"));

document.getElementById("formCliente").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    email: form.email.value || null,
    telefono: form.telefono.value || null,
    direccion: form.direccion.value || null,
    documento: form.documento.value || null,
    notas: form.notas.value || null
  };

  const res = await fetch(
    clienteEditandoId ? `/api/clientes/${clienteEditandoId}` : "/api/clientes",
    {
      method: clienteEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el cliente."))) return;

  const eraEdicion = clienteEditandoId !== null;
  await cargarClientes();
  if (eraEdicion && clienteFichaId) await abrirFichaCliente(clienteFichaId);
  form.reset();
  modalCliente.hidden = true;
  avisar(eraEdicion ? "Cliente actualizado." : "Cliente creado.", "ok");
});

/* ---------- Proveedores ---------- */

// Espejo de Clientes: misma lista, misma ficha, mismo modal. La diferencia
// conceptual es de qué lado está la plata — al cliente le vendemos y nos
// debe, al proveedor le compramos y le debemos.
let proveedores = [];
let proveedorEditandoId = null;
let proveedorFichaId = null;

function renderProveedores(lista) {
  const body = document.getElementById("proveedoresBody");
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtrosProveedores.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(6);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosProveedores.limpiar());
    } else {
      body.innerHTML = filaVacia(6, "Todavía no hay proveedores cargados.", { accionTexto: "+ Nuevo proveedor", accionId: "btnNuevoProveedor" });
    }
    return;
  }

  for (const p of lista) {
    const tr = document.createElement("tr");
    tr.className = "fila-clickeable";
    const contacto = [p.telefono, p.email].filter(Boolean).join(" · ") || "—";
    tr.innerHTML = `
      <td data-label="Nombre">${p.nombre}</td>
      <td data-label="Contacto">${contacto}</td>
      <td data-label="Compras" class="align-right mono">${numero(p.cantidad_compras)}</td>
      <td data-label="Total comprado" class="align-right mono">${money(p.total_comprado)}</td>
      <td data-label="Deuda" class="align-right mono">${money(p.deuda)}</td>
      <td data-label="">${botonEditarFila("btn-editar-proveedor", p.id, "proveedor")}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      abrirFichaProveedor(p.id);
    });
    body.appendChild(tr);
  }

  body.querySelectorAll(".btn-editar-proveedor").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalProveedor(proveedores.find((p) => p.id === Number(btn.dataset.id)));
    });
  });
}

async function cargarProveedores() {
  tablaCargando("proveedoresBody", 6);
  const res = await fetch("/api/proveedores");
  proveedores = await res.json();
  filtrarProveedores();
}

function filtrarProveedores() {
  const q = document.getElementById("proveedoresSearch").value.trim().toLowerCase();
  const porTexto = proveedores.filter((p) =>
    [p.nombre, p.email, p.telefono].some((campo) => (campo ?? "").toLowerCase().includes(q))
  );
  renderProveedores(ordenProveedores.aplicar(filtrosProveedores.aplicar(porTexto)));
}

const filtrosProveedores = crearFiltros(
  "filtrosProveedores",
  [
    { clave: "nombre", etiqueta: "Nombre", tipo: "texto" },
    { clave: "deuda", etiqueta: "Deuda", tipo: "numero" },
    { clave: "total_comprado", etiqueta: "Total comprado", tipo: "numero" },
    { clave: "cantidad_compras", etiqueta: "Cantidad de compras", tipo: "numero" },
    { clave: "ultima_compra", etiqueta: "Última compra", tipo: "fecha" },
    { clave: "email", etiqueta: "Email", tipo: "texto" },
    { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
    { clave: "documento", etiqueta: "CUIT / DNI", tipo: "texto" }
  ],
  filtrarProveedores
);

document.getElementById("proveedoresSearch").addEventListener("input", filtrarProveedores);
const ordenProveedores = crearOrden("proveedoresBody", filtrarProveedores);

async function abrirFichaProveedor(id) {
  proveedorFichaId = id;
  const res = await fetch(`/api/proveedores/${id}`);
  if (!(await manejarError(res, "No se pudo cargar el proveedor."))) return;
  const proveedor = await res.json();

  document.getElementById("fichaProveedorNombre").textContent = proveedor.nombre;
  document.getElementById("fichaProveedorTotal").textContent = money(proveedor.total_comprado);
  document.getElementById("fichaProveedorCompras").textContent = numero(proveedor.cantidad_compras);
  document.getElementById("fichaProveedorDeuda").textContent = money(proveedor.deuda);

  const campos = [
    ["Email", proveedor.email],
    ["Teléfono", proveedor.telefono],
    ["Dirección", proveedor.direccion],
    ["CUIT / DNI", proveedor.documento],
    ["Última compra", proveedor.ultima_compra],
    ["Notas", proveedor.notas]
  ];
  document.getElementById("fichaProveedorDatos").innerHTML = campos
    .map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor || "—"}</dd></div>`)
    .join("");

  const historialBody = document.getElementById("fichaProveedorHistorial");
  historialBody.innerHTML =
    proveedor.historial.length === 0
      ? filaVacia(4, "Este proveedor todavía no tiene compras.")
      : proveedor.historial
          .map((c) => {
            const anulada = c.estado === "anulada";
            const borrador = c.estado === "borrador";
            const etiqueta = anulada ? "Anulada" : borrador ? "Borrador" : ESTADO_PAGO_LABEL[c.estado_pago];
            const clase = anulada
              ? "status-vencido"
              : borrador
              ? "status-pendiente"
              : ESTADO_PAGO_CLASE[c.estado_pago];
            return `
        <tr class="${anulada ? "fila-anulada" : ""}">
          <td data-label="N°" class="mono">#${c.id}</td>
          <td data-label="Fecha">${c.fecha}</td>
          <td data-label="Total" class="align-right mono">${money(c.total)}</td>
          <td data-label="Pago"><span class="status ${clase}">${etiqueta}</span></td>
        </tr>`;
          })
          .join("");

  const pagosBody = document.getElementById("fichaProveedorPagos");
  pagosBody.innerHTML =
    proveedor.pagos.length === 0
      ? filaVacia(5, "Todavía no se le pagó nada a este proveedor.")
      : proveedor.pagos
          .map(
            (p) => `
        <tr>
          <td data-label="Fecha">${p.fecha}</td>
          <td data-label="Compra" class="mono">#${p.compra_id}</td>
          <td data-label="Cuenta">${p.cuenta}</td>
          <td data-label="Importe" class="align-right mono">${money(p.importe)}</td>
          <td data-label="Nota">${p.nota || "—"}</td>
        </tr>`
          )
          .join("");

  mostrarVista("proveedor-detalle", { titulo: proveedor.nombre });
}

const modalProveedor = document.getElementById("modalProveedor");

function abrirModalProveedor(proveedor = null) {
  proveedorEditandoId = proveedor?.id ?? null;
  const form = document.getElementById("formProveedor");
  document.getElementById("modalProveedorTitulo").textContent = proveedor
    ? "Editar proveedor"
    : "Nuevo proveedor";
  form.nombre.value = proveedor?.nombre ?? "";
  form.email.value = proveedor?.email ?? "";
  form.telefono.value = proveedor?.telefono ?? "";
  form.direccion.value = proveedor?.direccion ?? "";
  form.documento.value = proveedor?.documento ?? "";
  form.notas.value = proveedor?.notas ?? "";
  modalProveedor.hidden = false;
}

document.getElementById("btnNuevoProveedor").addEventListener("click", () => abrirModalProveedor());
document.getElementById("btnEditarProveedor").addEventListener("click", () => {
  abrirModalProveedor(proveedores.find((p) => p.id === proveedorFichaId));
});
document.getElementById("modalProveedorClose").addEventListener("click", () => {
  modalProveedor.hidden = true;
});
modalProveedor.addEventListener("click", (e) => {
  if (e.target === modalProveedor) modalProveedor.hidden = true;
});
document.getElementById("btnVolverProveedores").addEventListener("click", () =>
  mostrarVista("proveedores")
);

document.getElementById("formProveedor").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    nombre: form.nombre.value,
    email: form.email.value || null,
    telefono: form.telefono.value || null,
    direccion: form.direccion.value || null,
    documento: form.documento.value || null,
    notas: form.notas.value || null
  };

  const res = await fetch(
    proveedorEditandoId ? `/api/proveedores/${proveedorEditandoId}` : "/api/proveedores",
    {
      method: proveedorEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    }
  );
  if (!(await manejarError(res, "No se pudo guardar el proveedor."))) return;

  const eraEdicion = proveedorEditandoId !== null;
  await cargarProveedores();
  if (eraEdicion && proveedorFichaId) await abrirFichaProveedor(proveedorFichaId);
  form.reset();
  modalProveedor.hidden = true;
  avisar(eraEdicion ? "Proveedor actualizado." : "Proveedor creado.", "ok");
});

/* ---------- Caja / Tesorería ---------- */

// Dónde está la plata. El saldo de cada cuenta lo calcula el backend como
// saldo_inicial + movimientos: acá nunca se guarda ni se edita un saldo,
// solo se muestra lo que se reconstruye del historial.
function renderCuentasTesoreria(cuentas) {
  const body = document.getElementById("cajaCuentasBody");
  const TIPO_LABEL = {
    efectivo: "Efectivo",
    banco: "Banco",
    mercadopago: "Mercado Pago",
    otro: "Otro"
  };

  body.innerHTML = cuentas
    .map(
      (c) => `
    <tr>
      <td data-label="Cuenta">${c.nombre}</td>
      <td data-label="Tipo">${TIPO_LABEL[c.tipo] ?? c.tipo}</td>
      <td data-label="Saldo inicial" class="align-right mono">${money(c.saldo_inicial)}</td>
      <td data-label="Saldo actual" class="align-right mono ${
        c.saldo < 0 ? "saldo-negativo" : ""
      }">${money(c.saldo)}</td>
      <td data-label="">${botonEditarFila("btn-editar-cuenta", c.id, "cuenta")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-cuenta").forEach((btn) => {
    btn.addEventListener("click", () => {
      abrirModalCuenta(cuentasTesoreria.find((c) => c.id === Number(btn.dataset.id)));
    });
  });
}

function renderMovimientosTesoreria(movimientos) {
  const body = document.getElementById("cajaMovimientosBody");

  if (movimientos.length === 0) {
    if (filtrosCaja.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(4);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosCaja.limpiar());
    } else {
      body.innerHTML = filaVacia(4, "Todavía no hay movimientos de caja.", { accionTexto: "+ Movimiento", accionId: "btnMovimientoTesoreria" });
    }
    return;
  }

  body.innerHTML = movimientos
    .map((m) => {
      // Cada origen se explica distinto: el cobro y el pago apuntan a su
      // documento, la transferencia a la otra cuenta, y el manual solo
      // tiene el concepto que escribió el usuario.
      let concepto;
      if (m.origen === "cobro") {
        concepto = `Cobro de venta #${m.venta_id}`;
      } else if (m.origen === "pago") {
        concepto = `Pago de compra #${m.compra_id}`;
      } else if (m.origen === "transferencia") {
        const direccion = m.tipo === "egreso" ? "a" : "desde";
        concepto = `Transferencia ${direccion} ${m.contraparte ?? "—"}`;
      } else {
        concepto = m.concepto || "Movimiento manual";
      }
      // Solo cobro/pago/transferencia calcularon una etiqueta separada de
      // m.concepto arriba — a esos sí les suma la nota como extra. Los
      // demás orígenes (manual, gasto, devolución...) ya USARON m.concepto
      // como etiqueta principal en el else de arriba: sumarlo de nuevo acá
      // lo duplicaba ("Primero · Primero").
      if (["cobro", "pago", "transferencia"].includes(m.origen) && m.concepto) {
        concepto += ` · ${m.concepto}`;
      }

      const signo = m.tipo === "ingreso" ? "+" : "-";
      return `
        <tr>
          <td data-label="Fecha">${m.fecha}</td>
          <td data-label="Cuenta">${m.cuenta}</td>
          <td data-label="Concepto">${concepto}</td>
          <td data-label="Importe" class="align-right mono ${
            m.tipo === "egreso" ? "saldo-negativo" : ""
          }">${signo}${money(m.importe)}</td>
        </tr>`;
    })
    .join("");
}

// Los filtros de esta pantalla van al servidor, no en memoria: la consulta
// de movimientos tiene tope de filas, así que filtrar acá sobre una lista
// ya recortada devolvería resultados incompletos sin avisar.
const filtrosCaja = crearFiltros(
  "filtrosCaja",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "cuenta_tesoreria_id", etiqueta: "Cuenta", tipo: "select", opciones: [] },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "ingreso", texto: "Ingreso" },
        { valor: "egreso", texto: "Egreso" }
      ]
    },
    {
      clave: "origen",
      etiqueta: "Origen",
      tipo: "select",
      opciones: [
        { valor: "cobro", texto: "Cobro de venta" },
        { valor: "pago", texto: "Pago de compra" },
        { valor: "gasto", texto: "Gasto" },
        { valor: "manual", texto: "Manual" },
        { valor: "transferencia", texto: "Transferencia" }
      ]
    },
    { clave: "importe", etiqueta: "Importe", tipo: "numero" },
    { clave: "concepto", etiqueta: "Concepto", tipo: "texto" }
  ],
  () => renderMovimientosTesoreria(filtrosCaja.aplicar(movimientosCajaCache))
);

// El historial llega entero y se filtra acá, con el mismo motor que el
// resto de las pantallas (ver TOPE_MOVIMIENTOS en el backend).
let movimientosCajaCache = [];

async function cargarCaja() {
  tablaCargando("cajaMovimientosBody", 4);
  const [tesoreria, movimientos] = await Promise.all([
    fetch("/api/tesoreria").then((r) => r.json()),
    fetch("/api/tesoreria/movimientos").then((r) => r.json())
  ]);

  cuentasTesoreria = tesoreria.cuentas;
  movimientosCajaCache = movimientos;

  document.getElementById("cajaTotal").textContent = money(tesoreria.total);
  document.getElementById("cajaIngresos").textContent = money(tesoreria.ingresos);
  document.getElementById("cajaEgresos").textContent = money(tesoreria.egresos);

  renderCuentasTesoreria(cuentasTesoreria);

  filtrosCaja.setOpciones(
    "cuenta_tesoreria_id",
    cuentasTesoreria.map((c) => ({ valor: c.id, texto: c.nombre }))
  );
  renderMovimientosTesoreria(filtrosCaja.aplicar(movimientosCajaCache));
}

/* --- Modal de cuenta (alta y edición) --- */

const modalCuenta = document.getElementById("modalCuenta");
let cuentaEditandoId = null;

function abrirModalCuenta(cuenta = null) {
  cuentaEditandoId = cuenta?.id ?? null;
  const form = document.getElementById("formCuenta");
  document.getElementById("modalCuentaTitulo").textContent = cuenta ? "Editar cuenta" : "Nueva cuenta";
  form.nombre.value = cuenta?.nombre ?? "";
  form.tipo.value = cuenta?.tipo ?? "efectivo";
  form.saldo_inicial.value = cuenta?.saldo_inicial ?? "";
  modalCuenta.hidden = false;
}

document.getElementById("btnNuevaCuenta").addEventListener("click", () => abrirModalCuenta());
document.getElementById("modalCuentaClose").addEventListener("click", () => {
  modalCuenta.hidden = true;
});
modalCuenta.addEventListener("click", (e) => {
  if (e.target === modalCuenta) modalCuenta.hidden = true;
});

document.getElementById("formCuenta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch(
    cuentaEditandoId ? `/api/cuentas-tesoreria/${cuentaEditandoId}` : "/api/cuentas-tesoreria",
    {
      method: cuentaEditandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre.value,
        tipo: form.tipo.value,
        saldo_inicial: form.saldo_inicial.value
      })
    }
  );
  if (!(await manejarError(res, "No se pudo guardar la cuenta."))) return;

  const eraEdicion = cuentaEditandoId !== null;
  await cargarCaja();
  form.reset();
  modalCuenta.hidden = true;
  avisar(eraEdicion ? "Cuenta actualizada." : "Cuenta creada.", "ok");
});

/* --- Modal de movimiento manual --- */

const modalMovimientoCaja = document.getElementById("modalMovimientoCaja");

document.getElementById("btnMovimientoTesoreria").addEventListener("click", () => {
  const form = document.getElementById("formMovimientoCaja");
  form.reset();
  poblarSelectCuentas(document.getElementById("movimientoCajaCuenta"));
  form.fecha.value = hoyISO();
  modalMovimientoCaja.hidden = false;
});
document.getElementById("modalMovimientoCajaClose").addEventListener("click", () => {
  modalMovimientoCaja.hidden = true;
});
modalMovimientoCaja.addEventListener("click", (e) => {
  if (e.target === modalMovimientoCaja) modalMovimientoCaja.hidden = true;
});

document.getElementById("formMovimientoCaja").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch("/api/tesoreria/movimientos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
      tipo: form.tipo.value,
      importe: parseFloat(form.importe.value),
      fecha: form.fecha.value,
      concepto: form.concepto.value || null
    })
  });
  if (!(await manejarError(res, "No se pudo registrar el movimiento."))) return;

  await cargarCaja();
  form.reset();
  modalMovimientoCaja.hidden = true;
  avisar("Movimiento registrado.", "ok");
});

/* --- Modal de transferencia --- */

const modalTransferencia = document.getElementById("modalTransferencia");

document.getElementById("btnTransferencia").addEventListener("click", () => {
  if (cuentasTesoreria.length < 2) {
    avisar("Necesitás al menos dos cuentas para poder transferir entre ellas.", "atencion");
    return;
  }
  const form = document.getElementById("formTransferencia");
  form.reset();
  // Origen y destino arrancan en cuentas distintas para que la primera
  // opción del formulario ya sea válida.
  poblarSelectCuentas(document.getElementById("transferenciaOrigen"), cuentasTesoreria[0].id);
  poblarSelectCuentas(document.getElementById("transferenciaDestino"), cuentasTesoreria[1].id);
  form.fecha.value = hoyISO();
  modalTransferencia.hidden = false;
});
document.getElementById("modalTransferenciaClose").addEventListener("click", () => {
  modalTransferencia.hidden = true;
});
modalTransferencia.addEventListener("click", (e) => {
  if (e.target === modalTransferencia) modalTransferencia.hidden = true;
});

document.getElementById("formTransferencia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const res = await fetch("/api/tesoreria/transferencias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origen_id: Number(form.origen_id.value),
      destino_id: Number(form.destino_id.value),
      importe: parseFloat(form.importe.value),
      fecha: form.fecha.value,
      concepto: form.concepto.value || null
    })
  });
  if (!(await manejarError(res, "No se pudo hacer la transferencia."))) return;

  await cargarCaja();
  form.reset();
  modalTransferencia.hidden = true;
  avisar("Transferencia registrada.", "ok");
});

/* ---------- Cuentas corrientes (a cobrar y a pagar) ---------- */

// Mismo criterio de color que ESTADO_COBRO_CLASE: verde = sin urgencia,
// amarillo = empieza a atrasarse, rojo = viejo. El backend ya calcula el
// tramo por operación (server.js, tramoDeAntiguedad) con los mismos
// cortes — acá solo se traduce a clase/etiqueta visual.
const CC_TRAMO_CLASE = { al_dia: "status-cobrado", atrasado: "status-pendiente", vencido: "status-vencido" };
const CC_TRAMO_LABEL = { al_dia: "Al día", atrasado: "Atrasado", vencido: "Vencido" };

// La operación "más vieja" tiene que ser la deuda más vieja, no
// simplemente operaciones[0]: si una entidad tiene una operación con
// crédito a favor (pendiente negativo, sin tramo) fechada antes que su
// deuda real, esa no cuenta para "hace cuánto que me debe".
function ccMasVieja(entidad) {
  const conDeuda = entidad.operaciones.filter((o) => o.tramo);
  return conDeuda.find((o) => o.dias === entidad.dias_max) ?? conDeuda[0] ?? entidad.operaciones[0];
}

function renderCcTabla(bodyId, lista, filtros, { tipoLabel, tipoClave, accionLabel, abrirFicha, abrirAccion }) {
  const body = document.getElementById(bodyId);
  body.innerHTML = "";

  if (lista.length === 0) {
    if (filtros.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(6);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtros.limpiar());
    } else {
      body.innerHTML = filaVacia(
        6,
        tipoClave === "cliente" ? "Nadie te debe: todo cobrado." : "No le debés nada a nadie: todo pagado."
      );
    }
    return;
  }

  for (const e of lista) {
    const masVieja = ccMasVieja(e);
    const fila = document.createElement("tr");
    fila.className = "fila-clickeable";
    fila.innerHTML = `
      <td data-label="${tipoLabel}"><button type="button" class="btn-link cc-abrir-ficha" data-id="${e.id}">${e.nombre}</button></td>
      <td data-label="Deuda" class="align-right mono">${money(e.saldo)}</td>
      <td data-label="Operaciones">${numero(e.operaciones.length)}</td>
      <td data-label="Más vieja">${masVieja.fecha}</td>
      <td data-label="Antigüedad"><span class="status ${CC_TRAMO_CLASE[masVieja.tramo]}">${CC_TRAMO_LABEL[masVieja.tramo]}</span></td>
      <td data-label="" class="cc-chevron">▸</td>
    `;

    const detalle = document.createElement("tr");
    detalle.className = "cc-detalle-fila";
    detalle.hidden = true;
    detalle.innerHTML = `
      <td colspan="6">
        <table class="cc-detalle">
          <tbody>
            ${e.operaciones
              .map(
                (o) => `
              <tr>
                <td>${o.fecha}</td>
                <td class="align-right mono">${money(o.pendiente)}</td>
                <td>${o.dias !== null ? `${numero(o.dias)} días` : "A favor"}</td>
                <td><button type="button" class="btn-fila cc-accion" data-id="${o.id}">${accionLabel}</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </td>`;

    fila.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      detalle.hidden = !detalle.hidden;
      fila.querySelector(".cc-chevron").textContent = detalle.hidden ? "▸" : "▾";
    });
    fila.querySelector(".cc-abrir-ficha").addEventListener("click", () => abrirFicha(e.id));

    body.appendChild(fila);
    body.appendChild(detalle);
  }

  body.querySelectorAll(".cc-accion").forEach((btn) => {
    btn.addEventListener("click", () => abrirAccion(Number(btn.dataset.id)));
  });
}

function renderCuentasCorrientes(datos) {
  const { por_cobrar, por_pagar, a_favor_clientes, a_favor_proveedores, totales } = datos;

  document.getElementById("ccPorCobrar").textContent = money(totales.por_cobrar);
  document.getElementById("ccPorPagar").textContent = money(totales.por_pagar);
  const neto = document.getElementById("ccNeto");
  neto.textContent = money(totales.neto);
  neto.classList.toggle("saldo-negativo", totales.neto < 0);
  neto.classList.toggle("ledger-ok", totales.neto >= 0);

  const notaFavorClientes = document.getElementById("ccNotaFavorClientes");
  notaFavorClientes.hidden = a_favor_clientes.length === 0;
  if (a_favor_clientes.length > 0) {
    notaFavorClientes.textContent = `A favor de ${a_favor_clientes.length} cliente(s) por ${money(totales.a_favor_clientes)} (crédito de una devolución sin reintegro): no suma a la deuda de nadie más.`;
  }
  const notaFavorProveedores = document.getElementById("ccNotaFavorProveedores");
  notaFavorProveedores.hidden = a_favor_proveedores.length === 0;
  if (a_favor_proveedores.length > 0) {
    notaFavorProveedores.textContent = `A favor de ${a_favor_proveedores.length} proveedor(es) por ${money(totales.a_favor_proveedores)}: no compensa la deuda con otro proveedor.`;
  }

  renderCcTabla(
    "ccCobrarBody",
    ordenCcCobrar.aplicar(filtrosCcCobrar.aplicar(por_cobrar)),
    filtrosCcCobrar,
    {
      tipoLabel: "Cliente",
      tipoClave: "cliente",
      accionLabel: "Cobrar",
      abrirFicha: abrirFichaCliente,
      abrirAccion: abrirModalCobrarVenta
    }
  );
  renderCcTabla(
    "ccPagarBody",
    ordenCcPagar.aplicar(filtrosCcPagar.aplicar(por_pagar)),
    filtrosCcPagar,
    {
      tipoLabel: "Proveedor",
      tipoClave: "proveedor",
      accionLabel: "Pagar",
      abrirFicha: abrirFichaProveedor,
      abrirAccion: abrirModalPagarCompra
    }
  );
}

function filtrarCcCobrar() {
  renderCuentasCorrientes(ccUltimaRespuesta);
}
function filtrarCcPagar() {
  renderCuentasCorrientes(ccUltimaRespuesta);
}

const filtrosCcCobrar = crearFiltros(
  "filtrosCcCobrar",
  [
    { clave: "nombre", etiqueta: "Cliente", tipo: "texto" },
    { clave: "saldo", etiqueta: "Deuda", tipo: "numero" },
    { clave: "dias_max", etiqueta: "Antigüedad (días)", tipo: "numero" }
  ],
  filtrarCcCobrar
);
const ordenCcCobrar = crearOrden("ccCobrarBody", filtrarCcCobrar);

const filtrosCcPagar = crearFiltros(
  "filtrosCcPagar",
  [
    { clave: "nombre", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "saldo", etiqueta: "Deuda", tipo: "numero" },
    { clave: "dias_max", etiqueta: "Antigüedad (días)", tipo: "numero" }
  ],
  filtrarCcPagar
);
const ordenCcPagar = crearOrden("ccPagarBody", filtrarCcPagar);

// Guarda la última respuesta cruda del endpoint para que los filtros y el
// orden (que solo tocan una de las dos tablas) puedan re-renderizar sin
// pedir los datos de nuevo — es una foto de hoy, no cambia entre filtros.
let ccUltimaRespuesta = {
  por_cobrar: [],
  por_pagar: [],
  a_favor_clientes: [],
  a_favor_proveedores: [],
  totales: { por_cobrar: 0, por_pagar: 0, a_favor_clientes: 0, a_favor_proveedores: 0, neto: 0 }
};

async function cargarCuentasCorrientes() {
  tablaCargando("ccCobrarBody", 6);
  tablaCargando("ccPagarBody", 6);
  const datos = await (await fetch("/api/cuentas-corrientes")).json();
  ccUltimaRespuesta = datos;
  renderCuentasCorrientes(datos);
}

/* ---------- Gastos ---------- */

// Los gastos son lo que le falta al sistema para saber si el negocio gana
// plata: las ventas y su costo ya estaban, pero el alquiler y la luz no.
// El tipo de cada gasto decide si pesa o no en el resultado (ver
// schema.sql): los tres bajan la caja, solo el operativo baja el resultado.
let gastos = [];
let categoriasGasto = [];
let gastoEditandoId = null;

const TIPO_GASTO_LABEL = { operativo: "Operativo", inversion: "Inversión", retiro: "Retiro" };
const TIPO_GASTO_CLASE = {
  operativo: "status-vencido",
  inversion: "status-pendiente",
  retiro: "status-pendiente"
};

function renderGastos(lista) {
  const body = document.getElementById("gastosBody");

  document.getElementById("gastosOperativos").textContent = money(
    lista.filter((g) => g.tipo === "operativo").reduce((acc, g) => acc + g.importe, 0)
  );
  document.getElementById("gastosInversiones").textContent = money(
    lista.filter((g) => g.tipo === "inversion").reduce((acc, g) => acc + g.importe, 0)
  );
  document.getElementById("gastosRetiros").textContent = money(
    lista.filter((g) => g.tipo === "retiro").reduce((acc, g) => acc + g.importe, 0)
  );

  if (lista.length === 0) {
    if (categoriasGasto.length === 0) {
      body.innerHTML = filaVacia(7, "Primero creá una categoría de gasto (botón «Categorías») y después vas a poder cargar gastos.");
    } else if (filtrosGastos.filtros.length > 0) {
      body.innerHTML = filaVaciaFiltrada(7);
      body.querySelector(".tabla-vacia-limpiar").addEventListener("click", () => filtrosGastos.limpiar());
    } else {
      body.innerHTML = filaVacia(7, "Todavía no hay gastos registrados.", { accionTexto: "+ Nuevo gasto", accionId: "btnNuevoGasto" });
    }
    return;
  }

  body.innerHTML = lista
    .map(
      (g) => `
    <tr>
      <td data-label="Fecha">${g.fecha}</td>
      <td data-label="Categoría">${g.categoria}</td>
      <td data-label="Tipo"><span class="status ${TIPO_GASTO_CLASE[g.tipo]}">${
        TIPO_GASTO_LABEL[g.tipo]
      }</span></td>
      <td data-label="Descripción">${g.descripcion || "—"}</td>
      <td data-label="Cuenta">${g.cuenta}</td>
      <td data-label="Importe" class="align-right mono">${money(g.importe)}</td>
      <td data-label=""><div class="fila-acciones">
        ${botonEditarFila("btn-editar-gasto", g.id, "gasto")}
        <button type="button" class="btn-icon-danger btn-anular-gasto" data-id="${g.id}" title="Anular gasto" aria-label="Anular gasto">${ICONO_TACHO}</button>
      </div></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-gasto").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalGasto(gastos.find((g) => g.id === Number(btn.dataset.id))));
  });

  body.querySelectorAll(".btn-anular-gasto").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (
        !(await confirmar({
          cuerpo: "¿Anular este gasto? Va a la papelera y la plata vuelve a la cuenta.",
          aceptar: "Anular gasto",
          destructivo: true
        }))
      )
        return;
      const res = await fetch(`/api/gastos/${btn.dataset.id}/anular`, { method: "POST" });
      if (!(await manejarError(res, "No se pudo anular el gasto."))) return;
      avisar(`Gasto #${btn.dataset.id} anulado.`, "ok");
      await Promise.all([cargarGastos(), cargarCaja(), cargarResumen()]);
    });
  });
}

function filtrarGastos() {
  const activos = gastos.filter((g) => g.estado === "activo");
  renderGastos(ordenGastos.aplicar(filtrosGastos.aplicar(activos)));
}

const filtrosGastos = crearFiltros(
  "filtrosGastos",
  [
    { clave: "fecha", etiqueta: "Fecha", tipo: "fecha" },
    { clave: "categoria_id", etiqueta: "Categoría", tipo: "select", opciones: [] },
    {
      clave: "tipo",
      etiqueta: "Tipo",
      tipo: "select",
      opciones: [
        { valor: "operativo", texto: "Operativo" },
        { valor: "inversion", texto: "Inversión" },
        { valor: "retiro", texto: "Retiro" }
      ]
    },
    { clave: "cuenta_tesoreria_id", etiqueta: "Cuenta", tipo: "select", opciones: [] },
    { clave: "importe", etiqueta: "Importe", tipo: "numero" },
    { clave: "descripcion", etiqueta: "Descripción", tipo: "texto" },
    { clave: "proveedor", etiqueta: "Proveedor", tipo: "texto" },
    { clave: "comprobante", etiqueta: "Comprobante", tipo: "texto" }
  ],
  filtrarGastos
);
const ordenGastos = crearOrden("gastosBody", filtrarGastos);

async function cargarGastos() {
  tablaCargando("gastosBody", 7);
  const [listaGastos, listaCategorias] = await Promise.all([
    fetch("/api/gastos").then((r) => r.json()),
    fetch("/api/categorias-gasto").then((r) => r.json())
  ]);
  gastos = listaGastos;
  categoriasGasto = listaCategorias;

  filtrosGastos.setOpciones(
    "categoria_id",
    categoriasGasto.map((c) => ({ valor: c.id, texto: c.nombre }))
  );
  filtrosGastos.setOpciones(
    "cuenta_tesoreria_id",
    cuentasTesoreria.map((c) => ({ valor: c.id, texto: c.nombre }))
  );

  filtrarGastos();
  renderCategorias();
  renderPapelera();
}

/* --- Modal de gasto --- */

const modalGasto = document.getElementById("modalGasto");

function abrirModalGasto(gasto = null) {
  if (categoriasGasto.length === 0) {
    avisar("Primero creá una categoría de gasto desde el botón «Categorías».", "atencion");
    return;
  }
  gastoEditandoId = gasto?.id ?? null;
  document.getElementById("modalGastoTitulo").textContent = gasto ? "Editar gasto" : "Nuevo gasto";
  document.getElementById("formGastoSubmit").textContent = gasto ? "Guardar cambios" : "Registrar gasto";

  const form = document.getElementById("formGasto");
  // Solo se ofrecen las categorías activas, salvo la del gasto que se está
  // editando: si se desactivó después, igual tiene que poder verse.
  const categoriasDisponibles = categoriasGasto.filter(
    (c) => c.activa || c.id === gasto?.categoria_id
  );
  document.getElementById("gastoCategoria").innerHTML = categoriasDisponibles
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");
  poblarSelectCuentas(document.getElementById("gastoCuenta"));
  document.getElementById("gastoProveedor").innerHTML =
    `<option value="">Sin proveedor</option>` +
    proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");

  form.categoria_id.value = gasto?.categoria_id ?? categoriasDisponibles[0]?.id ?? "";
  form.tipo.value = gasto?.tipo ?? categoriasDisponibles[0]?.tipo ?? "operativo";
  form.importe.value = gasto?.importe ?? "";
  form.cuenta_tesoreria_id.value = gasto?.cuenta_tesoreria_id ?? cuentasTesoreria[0]?.id ?? "";
  form.fecha.value = gasto?.fecha ?? hoyISO();
  form.descripcion.value = gasto?.descripcion ?? "";
  form.proveedor_id.value = gasto?.proveedor_id ?? "";
  form.comprobante.value = gasto?.comprobante ?? "";

  modalGasto.hidden = false;
}

// Elegir categoría arrastra su tipo: es lo que hace que no haya que
// acordarse de si el alquiler era operativo o no.
document.getElementById("gastoCategoria").addEventListener("change", (e) => {
  const categoria = categoriasGasto.find((c) => c.id === Number(e.target.value));
  if (categoria) document.getElementById("gastoTipo").value = categoria.tipo;
});

document.getElementById("btnNuevoGasto").addEventListener("click", () => abrirModalGasto());
document.getElementById("modalGastoClose").addEventListener("click", () => {
  modalGasto.hidden = true;
});
modalGasto.addEventListener("click", (e) => {
  if (e.target === modalGasto) modalGasto.hidden = true;
});

document.getElementById("formGasto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const datos = {
    categoria_id: Number(form.categoria_id.value),
    cuenta_tesoreria_id: Number(form.cuenta_tesoreria_id.value),
    proveedor_id: form.proveedor_id.value ? Number(form.proveedor_id.value) : null,
    tipo: form.tipo.value,
    importe: parseFloat(form.importe.value),
    fecha: form.fecha.value,
    descripcion: form.descripcion.value || null,
    comprobante: form.comprobante.value || null
  };

  const res = await fetch(gastoEditandoId ? `/api/gastos/${gastoEditandoId}` : "/api/gastos", {
    method: gastoEditandoId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  });
  if (!(await manejarError(res, "No se pudo guardar el gasto."))) return;

  const eraEdicion = gastoEditandoId !== null;
  // Un gasto mueve plata y cambia el resultado: hay que refrescar las tres.
  await Promise.all([cargarGastos(), cargarCaja(), cargarResumen()]);
  form.reset();
  modalGasto.hidden = true;
  avisar(eraEdicion ? "Gasto actualizado." : "Gasto registrado.", "ok");
});

/* --- Modal de categorías --- */

const modalCategorias = document.getElementById("modalCategorias");

function renderCategorias() {
  const body = document.getElementById("categoriasBody");
  if (categoriasGasto.length === 0) {
    body.innerHTML = filaVacia(3, "Todavía no hay categorías.");
    return;
  }

  body.innerHTML = categoriasGasto
    .map(
      (c) => `
    <tr class="${c.activa ? "" : "fila-anulada"}">
      <td data-label="Categoría">${c.nombre}</td>
      <td data-label="Tipo"><span class="status ${TIPO_GASTO_CLASE[c.tipo]}">${
        TIPO_GASTO_LABEL[c.tipo]
      }</span></td>
      <td data-label="">${botonEditarFila("btn-editar-categoria", c.id, "categoría")}</td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-editar-categoria").forEach((btn) => {
    btn.addEventListener("click", () => {
      const categoria = categoriasGasto.find((c) => c.id === Number(btn.dataset.id));
      const form = document.getElementById("formCategoria");
      form.id.value = categoria.id;
      form.nombre.value = categoria.nombre;
      form.tipo.value = categoria.tipo;
      document.getElementById("formCategoriaSubmit").textContent = "Guardar cambios";
    });
  });
}

document.getElementById("btnCategoriasGasto").addEventListener("click", () => {
  document.getElementById("formCategoria").reset();
  document.getElementById("formCategoria").id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  renderCategorias();
  modalCategorias.hidden = false;
});
document.getElementById("modalCategoriasClose").addEventListener("click", () => {
  modalCategorias.hidden = true;
});
modalCategorias.addEventListener("click", (e) => {
  if (e.target === modalCategorias) modalCategorias.hidden = true;
});

document.getElementById("formCategoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const editandoId = form.id.value;

  const res = await fetch(
    editandoId ? `/api/categorias-gasto/${editandoId}` : "/api/categorias-gasto",
    {
      method: editandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: form.nombre.value, tipo: form.tipo.value, activa: 1 })
    }
  );
  if (!(await manejarError(res, "No se pudo guardar la categoría."))) return;

  const eraEdicion = Boolean(editandoId);
  await cargarGastos();
  form.reset();
  form.id.value = "";
  document.getElementById("formCategoriaSubmit").textContent = "Agregar categoría";
  avisar(eraEdicion ? "Categoría actualizada." : "Categoría creada.", "ok");
});

/* ---------- Asistente flotante (operaciones por texto, CLAUDE.md §21) ---------- */
//
// No es una pantalla más: es un widget flotante (círculo abajo a la
// derecha) disponible desde cualquier vista, con un hilo de conversación
// tipo Notion/Canva AI — cada frase que se manda queda apilada en
// #asistenteHilo junto con su respuesta, y el hilo no se borra al
// confirmar u otro. Vive solo en memoria (no se persiste): una propuesta
// vieja apunta a precios/stock que pueden haber cambiado, así que no
// tiene sentido mostrarla como vigente después de recargar la página.
//
// Flujo por turno: interpretar (solo lectura, arma una propuesta) -> el
// usuario la revisa/edita en la tarjeta de ESE turno -> confirmar recién
// ejecuta. Como puede haber VARIAS tarjetas pendientes al mismo tiempo
// (una por turno), nada se busca por id global: cada tarjeta recibe su
// propio nodo raíz y resuelve todo con `raiz.querySelector(...)`, nunca
// `document.getElementById(...)` — evita que confirmar una tarjeta lea
// por accidente los campos de otra.
//
// Reusa a propósito los mismos helpers de fila de item que los modales de
// Venta y Compra (agregarFilaItemVenta/Compra, leerItemsVenta/Compra,
// totalItems, actualizarSubtotalFila) — ya reciben un contenedor
// explícito, así que ya eran seguros por tarjeta sin tocarlos — y
// poblarSelectCuentas para las cuentas de tesorería. Los caches globales
// (productos, clientes, proveedores, cuentasTesoreria, categoriasGasto)
// ya están cargados por la secuencia de arranque de más abajo en este
// archivo, así que no hace falta un fetch propio acá.

const ASISTENTE_ESTADO_CLASE = {
  resuelto: "status-cobrado",
  ambiguo: "status-pendiente",
  no_encontrado: "status-pendiente",
  no_dado: "status-vencido"
};

// `ref` es un objeto resuelto de la propuesta ({estado, valor,
// nombre_resuelto, id, candidatos}, ver resolverPropuesta en server.js).
// creaSiNoExiste: true para cliente/proveedor (y producto en una compra),
// que si no existen se dan de alta por nombre — en esos casos
// "no_encontrado" es informativo, no un problema.
function asistenteBadge(ref, { creaSiNoExiste = false } = {}) {
  if (!ref) return "";
  let texto;
  if (ref.estado === "resuelto") texto = "encontrado";
  else if (ref.estado === "ambiguo") texto = "hay varios, elegí uno";
  else if (ref.estado === "no_encontrado") texto = creaSiNoExiste ? "no existe, se va a crear" : "no existe";
  else texto = "falta";
  const clase = ref.estado === "no_encontrado" && !creaSiNoExiste ? "status-vencido" : ASISTENTE_ESTADO_CLASE[ref.estado];
  return `<span class="status ${clase}">${texto}</span>`;
}

function asistenteNotaCandidatos(candidatos) {
  return candidatos?.length
    ? `<p class="form-note">Coinciden: ${candidatos.map((c) => c.nombre).join(", ")}</p>`
    : "";
}

/* --- Apertura/cierre del panel --- */

const asistenteLauncher = document.getElementById("asistenteLauncher");
const asistentePanel = document.getElementById("asistentePanel");
const asistenteHilo = document.getElementById("asistenteHilo");
const asistenteTextoEl = document.getElementById("asistenteTexto");
const formAsistente = document.getElementById("formAsistente");
const btnAsistenteEnviar = document.getElementById("btnAsistenteEnviar");

function asistenteAbrir() {
  asistentePanel.hidden = false;
  asistenteLauncher.setAttribute("aria-expanded", "true");
  asistenteTextoEl.focus();
  asistenteScrollAlFinal();
}

function asistenteCerrar() {
  asistentePanel.hidden = true;
  asistenteLauncher.setAttribute("aria-expanded", "false");
  asistenteLauncher.focus();
}

asistenteLauncher.addEventListener("click", () => {
  if (asistentePanel.hidden) asistenteAbrir();
  else asistenteCerrar();
});
document.getElementById("asistentePanelClose").addEventListener("click", asistenteCerrar);
// Escape cierra; un clic afuera NO — se puede estar mirando otra pantalla
// con el panel abierto mientras se decide qué hacer con una propuesta.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !asistentePanel.hidden) asistenteCerrar();
});

// Enter envía, Shift+Enter hace salto de línea (como Notion/Canva AI); el
// textarea crece con el contenido en vez de scrollear internamente.
asistenteTextoEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formAsistente.requestSubmit();
  }
});
function asistenteAjustarAltoTextarea() {
  asistenteTextoEl.style.height = "auto";
  asistenteTextoEl.style.height = `${asistenteTextoEl.scrollHeight}px`;
}
asistenteTextoEl.addEventListener("input", asistenteAjustarAltoTextarea);

function asistenteScrollAlFinal() {
  asistenteHilo.scrollTop = asistenteHilo.scrollHeight;
}

/* --- El hilo: un turno por intercambio --- */

function asistenteAgregarTurnoUsuario(texto) {
  const turno = document.createElement("div");
  turno.className = "asistente-turno asistente-turno-usuario";
  const p = document.createElement("p");
  p.textContent = texto; // textContent: es texto tipeado por el usuario, nunca HTML.
  turno.appendChild(p);
  asistenteHilo.appendChild(turno);
}

function asistenteAgregarTurnoRespuesta() {
  const turno = document.createElement("div");
  turno.className = "asistente-turno asistente-turno-respuesta";
  turno.innerHTML = `<p class="asistente-pensando" aria-live="polite">Pensando…</p>`;
  asistenteHilo.appendChild(turno);
  return turno;
}

formAsistente.addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = asistenteTextoEl.value.trim();
  if (!texto) return;

  asistenteAgregarTurnoUsuario(texto);
  const turnoRespuesta = asistenteAgregarTurnoRespuesta();
  asistenteTextoEl.value = "";
  asistenteAjustarAltoTextarea();
  asistenteScrollAlFinal();

  btnAsistenteEnviar.disabled = true;
  try {
    const res = await fetch("/api/asistente/interpretar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto })
    });
    if (!(await manejarError(res, "No se pudo interpretar el texto."))) {
      turnoRespuesta.remove();
      return;
    }
    asistenteRenderRespuesta(turnoRespuesta, await res.json());
  } finally {
    btnAsistenteEnviar.disabled = false;
    asistenteScrollAlFinal();
  }
});

function asistenteRenderRespuesta(turnoEl, data) {
  if (!data.tipo) {
    turnoEl.innerHTML = `<p>${data.mensaje ?? "No identifiqué ninguna operación en ese texto."}</p>`;
    return;
  }

  const plantillas = { venta: plantillaAsistenteVenta, compra: plantillaAsistenteCompra, gasto: plantillaAsistenteGasto };
  turnoEl.innerHTML = plantillas[data.tipo](data.propuesta);
  const tarjeta = turnoEl.querySelector(".asistente-propuesta");

  if (data.problemas?.length) {
    tarjeta.insertAdjacentHTML(
      "afterbegin",
      `<p class="form-note asistente-problemas">${data.problemas.join(" · ")}</p>`
    );
  }

  const activadores = { venta: activarAsistenteVenta, compra: activarAsistenteCompra, gasto: activarAsistenteGasto };
  activadores[data.tipo](tarjeta, data.propuesta, data.mensaje_id, turnoEl);

  tarjeta
    .querySelector(".btn-asistente-descartar")
    .addEventListener("click", () => asistenteDescartar(data.mensaje_id, turnoEl));
}

// Confirmada: la tarjeta colapsa a una línea de resultado y queda como
// historial del turno — el hilo entero no se borra por esto.
async function asistenteEjecutar(mensajeId, tipo, propuesta, turnoEl) {
  const res = await fetch("/api/asistente/ejecutar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje_id: mensajeId, tipo, propuesta })
  });
  if (!(await manejarError(res, "No se pudo registrar la operación."))) return;

  const { id } = await res.json();
  const etiqueta = { venta: "Venta", compra: "Compra", gasto: "Gasto" }[tipo];
  turnoEl.innerHTML = `<p class="asistente-resuelto asistente-confirmado">✓ ${etiqueta} #${id} registrada.</p>`;
  asistenteScrollAlFinal();

  // Toda la cascada real la hizo el backend; acá solo hace falta refrescar
  // los caches que la operación pudo haber tocado, para que el resto de
  // las pantallas no queden desactualizadas hasta el próximo F5.
  await Promise.all([
    cargarVentas(),
    cargarCompras(),
    cargarGastos(),
    cargarStock(),
    cargarProductos(),
    cargarClientes(),
    cargarProveedores(),
    cargarCaja(),
    cargarCuentasCorrientes(),
    cargarResumen(),
    cargarReporteVentas(),
    cargarReporteStock()
  ]);
}

async function asistenteDescartar(mensajeId, turnoEl) {
  if (mensajeId) {
    await fetch(`/api/asistente/${mensajeId}/descartar`, { method: "POST" });
  }
  turnoEl.innerHTML = `<p class="asistente-resuelto asistente-descartado">Descartada.</p>`;
}

/* --- Venta --- */

function plantillaAsistenteVenta(propuesta) {
  const clienteNombre = propuesta.cliente.nombre_resuelto || propuesta.cliente.valor || "";
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Venta</p>
      <form class="form">
        <label>
          <span>Cliente ${asistenteBadge(propuesta.cliente, { creaSiNoExiste: true })}</span>
          <input type="text" class="asistente-cliente" list="clientesSugeridos" value="${clienteNombre}" placeholder="Nombre del cliente" />
        </label>
        <label class="asistente-cliente-ambiguo-wrap" ${propuesta.cliente.estado === "ambiguo" ? "" : "hidden"}>
          <span>Elegí cuál es</span>
          <select class="asistente-cliente-ambiguo">
            <option value="">— elegí uno —</option>
            ${propuesta.cliente.candidatos.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}
          </select>
        </label>

        <div class="item-rows asistente-venta-items"></div>
        <button type="button" class="btn-add-item asistente-agregar-item">+ agregar producto</button>
        <p class="item-total">Total: <span class="mono asistente-venta-total">$0,00</span></p>

        <label class="form-check">
          <input type="checkbox" class="asistente-cobro-toggle" ${propuesta.cobro ? "checked" : ""} />
          Ya se cobró (total o parcial)
        </label>
        <label class="asistente-cobro-cuenta-wrap" ${propuesta.cobro ? "" : "hidden"}>
          <span>Cuenta ${propuesta.cobro ? asistenteBadge(propuesta.cobro.cuenta) : ""}</span>
          <select class="asistente-cobro-cuenta"></select>
        </label>
        <label class="asistente-cobro-importe-wrap" ${propuesta.cobro ? "" : "hidden"}>
          <span>Importe cobrado (vacío = el total)</span>
          <input type="number" class="asistente-cobro-importe" step="0.01" min="0" value="${propuesta.cobro?.importe ?? ""}" />
        </label>

        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${propuesta.fecha ?? ""}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteVenta(raiz, propuesta, mensajeId, turnoEl) {
  const clienteInput = raiz.querySelector(".asistente-cliente");
  // Igual que el campo Cliente del modal manual de Venta: texto libre con
  // sugerencias, crearVenta lo resuelve por nombre o lo crea. La única
  // diferencia es cuando hay ambigüedad — ahí SÍ hace falta un id
  // concreto, para no crear un cliente nuevo por accidente.
  let clienteIdManual = propuesta.cliente.estado === "resuelto" ? propuesta.cliente.id : null;
  clienteInput.addEventListener("input", () => {
    clienteIdManual = null;
  });
  const clienteAmbiguoSelect = raiz.querySelector(".asistente-cliente-ambiguo");
  clienteAmbiguoSelect?.addEventListener("change", () => {
    const candidato = propuesta.cliente.candidatos.find((c) => c.id === Number(clienteAmbiguoSelect.value));
    if (candidato) {
      clienteIdManual = candidato.id;
      clienteInput.value = candidato.nombre;
    }
  });

  const itemsEl = raiz.querySelector(".asistente-venta-items");
  const totalEl = raiz.querySelector(".asistente-venta-total");
  const actualizarTotal = () => {
    totalEl.textContent = money(totalItems(itemsEl));
  };
  itemsEl.addEventListener("item-change", actualizarTotal);

  for (const item of propuesta.items) {
    agregarFilaItemVenta(itemsEl, productos, true);
    const fila = itemsEl.lastElementChild;
    fila.querySelector(".item-producto").value = item.producto.nombre_resuelto || item.producto.valor || "";
    fila.querySelector(".item-producto-id").value = item.producto.id ?? "";
    fila.querySelector(".item-cantidad").value = item.cantidad ?? "";
    fila.querySelector(".item-precio").value = item.precio_unitario ?? "";
    actualizarSubtotalFila(fila);
    if (item.producto.estado === "ambiguo") {
      fila.insertAdjacentHTML("afterend", asistenteNotaCandidatos(item.producto.candidatos));
    }
  }
  actualizarTotal();

  raiz.querySelector(".asistente-agregar-item").addEventListener("click", () => {
    agregarFilaItemVenta(itemsEl, productos, true);
  });

  const cobroToggle = raiz.querySelector(".asistente-cobro-toggle");
  const cuentaWrap = raiz.querySelector(".asistente-cobro-cuenta-wrap");
  const importeWrap = raiz.querySelector(".asistente-cobro-importe-wrap");
  const cuentaSelect = raiz.querySelector(".asistente-cobro-cuenta");
  poblarSelectCuentas(cuentaSelect, propuesta.cobro?.cuenta?.id ?? cuentasTesoreria[0]?.id ?? null);
  const sincronizarCobro = () => {
    cuentaWrap.hidden = !cobroToggle.checked;
    importeWrap.hidden = !cobroToggle.checked;
  };
  cobroToggle.addEventListener("change", sincronizarCobro);

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = leerItemsVenta(itemsEl);
    if (items.length === 0) {
      avisar("Falta elegir, para cada item, un producto que exista en el catálogo.", "atencion");
      return;
    }
    const clienteTexto = clienteInput.value.trim();
    if (!clienteIdManual && !clienteTexto) {
      avisar("Falta el cliente.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "venta",
      {
        cliente: {
          id: clienteIdManual,
          valor: clienteTexto,
          nombre_resuelto: clienteIdManual ? clienteTexto : null
        },
        items: items.map((it) => ({
          producto: { id: it.producto_id },
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario
        })),
        cobro: cobroToggle.checked
          ? {
              cuenta: { id: Number(cuentaSelect.value) },
              importe: raiz.querySelector(".asistente-cobro-importe").value
                ? Number(raiz.querySelector(".asistente-cobro-importe").value)
                : null
            }
          : null,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* --- Compra --- */

function plantillaAsistenteCompra(propuesta) {
  const proveedorNombre = propuesta.proveedor.nombre_resuelto || propuesta.proveedor.valor || "";
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Compra</p>
      <form class="form">
        <label>
          <span>Proveedor ${asistenteBadge(propuesta.proveedor, { creaSiNoExiste: true })}</span>
          <input type="text" class="asistente-proveedor" value="${proveedorNombre}" placeholder="Nombre del proveedor" />
        </label>
        <label class="asistente-proveedor-ambiguo-wrap" ${propuesta.proveedor.estado === "ambiguo" ? "" : "hidden"}>
          <span>Elegí cuál es</span>
          <select class="asistente-proveedor-ambiguo">
            <option value="">— elegí uno —</option>
            ${propuesta.proveedor.candidatos.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("")}
          </select>
        </label>

        <div class="item-rows asistente-compra-items"></div>
        <button type="button" class="btn-add-item asistente-agregar-item">+ agregar producto</button>
        <p class="item-total">Total: <span class="mono asistente-compra-total">$0,00</span></p>

        <label>
          <span>Costo de envío</span>
          <input type="number" class="asistente-costo-envio" step="0.01" min="0" value="${propuesta.costo_envio ?? 0}" />
        </label>
        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${propuesta.fecha ?? ""}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteCompra(raiz, propuesta, mensajeId, turnoEl) {
  const proveedorInput = raiz.querySelector(".asistente-proveedor");
  // Una compra siempre resuelve proveedor/producto por NOMBRE (crea el que
  // falte, igual que el modal manual) — no hace falta trackear un id acá,
  // ni siquiera con ambigüedad: elegir un candidato solo completa el
  // nombre exacto en el input de texto.
  const proveedorAmbiguoSelect = raiz.querySelector(".asistente-proveedor-ambiguo");
  proveedorAmbiguoSelect?.addEventListener("change", () => {
    const candidato = propuesta.proveedor.candidatos.find((c) => c.id === Number(proveedorAmbiguoSelect.value));
    if (candidato) proveedorInput.value = candidato.nombre;
  });

  const itemsEl = raiz.querySelector(".asistente-compra-items");
  const totalEl = raiz.querySelector(".asistente-compra-total");
  const actualizarTotal = () => {
    totalEl.textContent = money(totalItems(itemsEl));
  };
  itemsEl.addEventListener("item-change", actualizarTotal);

  for (const item of propuesta.items) {
    agregarFilaItemCompra(itemsEl);
    const fila = itemsEl.lastElementChild;
    fila.querySelector(".item-producto").value = item.producto.nombre_resuelto || item.producto.valor || "";
    fila.querySelector(".item-cantidad").value = item.cantidad ?? "";
    fila.querySelector(".item-precio").value = item.precio_unitario ?? "";
    actualizarSubtotalFila(fila);
    if (item.producto.estado === "ambiguo") {
      fila.insertAdjacentHTML("afterend", asistenteNotaCandidatos(item.producto.candidatos));
    }
  }
  actualizarTotal();

  raiz.querySelector(".asistente-agregar-item").addEventListener("click", () => {
    agregarFilaItemCompra(itemsEl);
  });

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = leerItemsCompra(itemsEl);
    if (items.length === 0) {
      avisar("Falta al menos un producto con cantidad y costo válidos.", "atencion");
      return;
    }
    const proveedorTexto = proveedorInput.value.trim();
    if (!proveedorTexto) {
      avisar("Falta el proveedor.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "compra",
      {
        proveedor: { valor: proveedorTexto, nombre_resuelto: proveedorTexto },
        items: items.map((it) => ({
          producto: { valor: it.producto, nombre_resuelto: it.producto },
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario
        })),
        costo_envio: Number(raiz.querySelector(".asistente-costo-envio").value) || 0,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* --- Gasto --- */

function plantillaAsistenteGasto(propuesta) {
  return `
    <div class="asistente-propuesta">
      <p class="asistente-propuesta-titulo">Gasto</p>
      <form class="form">
        <label>
          <span>Categoría ${asistenteBadge(propuesta.categoria)}</span>
          <select class="asistente-categoria"></select>
        </label>
        <label>
          <span>Cuenta ${asistenteBadge(propuesta.cuenta)}</span>
          <select class="asistente-cuenta"></select>
        </label>
        <label>
          <span>Proveedor (opcional) ${propuesta.proveedor ? asistenteBadge(propuesta.proveedor) : ""}</span>
          <select class="asistente-proveedor-gasto"></select>
        </label>
        <label>
          <span>Importe</span>
          <input type="number" class="asistente-importe" step="0.01" min="0.01" value="${propuesta.importe ?? ""}" />
        </label>
        <label>
          <span>Tipo</span>
          <select class="asistente-tipo-gasto">
            <option value="">Heredar de la categoría</option>
            <option value="operativo">Operativo</option>
            <option value="inversion">Inversión</option>
            <option value="retiro">Retiro</option>
          </select>
        </label>
        <label>
          <span>Descripción</span>
          <input type="text" class="asistente-descripcion" value="${propuesta.descripcion ?? ""}" />
        </label>
        <label>
          <span>Fecha (vacío = hoy)</span>
          <input type="date" class="asistente-fecha" value="${propuesta.fecha ?? ""}" />
        </label>

        <div class="panel-acciones">
          <button type="button" class="btn btn-secundario btn-asistente-descartar">Descartar</button>
          <button type="submit" class="btn btn-primary">Confirmar y registrar</button>
        </div>
      </form>
    </div>
  `;
}

function activarAsistenteGasto(raiz, propuesta, mensajeId, turnoEl) {
  const categoriaSelect = raiz.querySelector(".asistente-categoria");
  categoriaSelect.innerHTML = categoriasGasto
    .filter((c) => c.activa)
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");
  if (propuesta.categoria.estado === "resuelto") categoriaSelect.value = propuesta.categoria.id;

  poblarSelectCuentas(
    raiz.querySelector(".asistente-cuenta"),
    propuesta.cuenta.estado === "resuelto" ? propuesta.cuenta.id : null
  );

  const proveedorSelect = raiz.querySelector(".asistente-proveedor-gasto");
  proveedorSelect.innerHTML =
    `<option value="">Sin proveedor</option>` + proveedores.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join("");
  if (propuesta.proveedor?.estado === "resuelto") proveedorSelect.value = propuesta.proveedor.id;

  raiz.querySelector(".asistente-tipo-gasto").value = propuesta.tipo ?? "";

  raiz.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!categoriaSelect.value) {
      avisar("Falta elegir una categoría.", "atencion");
      return;
    }
    const cuentaValue = raiz.querySelector(".asistente-cuenta").value;
    if (!cuentaValue) {
      avisar("Falta elegir una cuenta.", "atencion");
      return;
    }

    await asistenteEjecutar(
      mensajeId,
      "gasto",
      {
        categoria: { id: Number(categoriaSelect.value) },
        cuenta: { id: Number(cuentaValue) },
        proveedor: proveedorSelect.value ? { id: Number(proveedorSelect.value) } : null,
        importe: Number(raiz.querySelector(".asistente-importe").value),
        tipo: raiz.querySelector(".asistente-tipo-gasto").value || null,
        descripcion: raiz.querySelector(".asistente-descripcion").value.trim() || null,
        fecha: raiz.querySelector(".asistente-fecha").value || null
      },
      turnoEl
    );
  });
}

/* ---------- Papelera ---------- */

// Se arma sobre los arrays que ya tienen Ventas, Compras, Gastos y
// Devoluciones (la API devuelve las anuladas junto con el resto), así que
// no hace falta un fetch propio. La llaman esos cargarX() después de
// refrescarse.
function renderPapelera() {
  const body = document.getElementById("papeleraBody");
  const anulados = [
    ...ventas
      .filter((v) => v.estado === "anulada")
      .map((v) => ({ tipo: "Venta", id: v.id, fecha: v.fecha, quien: v.cliente, total: v.total })),
    ...compras
      .filter((c) => c.estado === "anulada")
      .map((c) => ({ tipo: "Compra", id: c.id, fecha: c.fecha, quien: c.proveedor, total: c.total })),
    ...gastos
      .filter((g) => g.estado === "anulado")
      .map((g) => ({ tipo: "Gasto", id: g.id, fecha: g.fecha, quien: g.categoria, total: g.importe })),
    ...devoluciones
      .filter((d) => d.estado === "anulada")
      .map((d) => ({ tipo: "Devolución", id: d.id, fecha: d.fecha, quien: d.cliente, total: d.total })),
    ...devolucionesProveedor
      .filter((d) => d.estado === "anulada")
      .map((d) => ({ tipo: "Dev. a proveedor", id: d.id, fecha: d.fecha, quien: d.proveedor, total: d.total }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);

  if (anulados.length === 0) {
    body.innerHTML = filaVacia(6, "La papelera está vacía.");
    return;
  }

  body.innerHTML = anulados
    .map(
      (d) => `
    <tr>
      <td data-label="Tipo">${d.tipo}</td>
      <td data-label="N°" class="mono">#${d.id}</td>
      <td data-label="Fecha">${d.fecha}</td>
      <td data-label="Cliente / Proveedor">${d.quien}</td>
      <td data-label="Total" class="align-right mono">${money(d.total)}</td>
      <td data-label=""><button type="button" class="btn-fila btn-restaurar"
        data-tipo="${
          d.tipo === "Venta"
            ? "ventas"
            : d.tipo === "Compra"
            ? "compras"
            : d.tipo === "Devolución"
            ? "devoluciones"
            : d.tipo === "Dev. a proveedor"
            ? "devoluciones-proveedor"
            : "gastos"
        }" data-id="${d.id}">Restaurar</button></td>
    </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-restaurar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const res = await fetch(`/api/${btn.dataset.tipo}/${btn.dataset.id}/restaurar`, {
        method: "POST"
      });
      if (!(await manejarError(res, "No se pudo restaurar el documento."))) return;
      await Promise.all([
        cargarVentas(),
        cargarCompras(),
        cargarGastos(),
        cargarDevoluciones(),
        cargarDevolucionesProveedor(),
        cargarStock(),
        cargarProductos(),
        cargarClientes(),
        cargarProveedores(),
        cargarCaja(),
        cargarCuentasCorrientes(),
        cargarResumen(),
        cargarReporteVentas(),
        cargarReporteStock()
      ]);
    });
  });
}

// El orden importa en dos puntos: Caja llena `cuentasTesoreria`, que
// Gastos necesita para su filtro y su modal; y el Resumen va último
// porque su tabla de últimos movimientos se arma con los cachés de
// ventas, compras y gastos ya cargados. Cuentas corrientes y los reportes
// de qué se vende y de stock no dependen de ningún caché del frontend
// (traen su propio fetch), así que entran en el mismo último grupo que
// Resumen.
Promise.all([cargarClientes(), cargarProveedores(), cargarCaja()])
  .then(() => Promise.all([cargarGastos(), cargarProductos()]))
  .then(() => Promise.all([cargarVentas(), cargarCompras(), cargarStock(), cargarPresupuestos(), cargarDevoluciones()]))
  .then(() => cargarDevolucionesProveedor())
  .then(() => Promise.all([cargarResumen(), cargarCuentasCorrientes(), cargarReporteVentas(), cargarReporteStock()]));

/* ---------- Tema claro / oscuro ---------- */

// La elección explícita (si existe) ya se aplicó al <html> antes de que
// esta página pintara nada (ver el script inline en el <head>, que evita
// el flash de tema claro). Acá solo hace falta el botón para cambiarla.
const btnTema = document.getElementById("btnTema");

function temaActual() {
  const guardado = localStorage.getItem("nexo.tema");
  if (guardado) return guardado;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

btnTema.addEventListener("click", () => {
  const nuevo = temaActual() === "oscuro" ? "claro" : "oscuro";
  document.documentElement.setAttribute("data-tema", nuevo);
  try {
    localStorage.setItem("nexo.tema", nuevo);
  } catch {
    // Sin storage disponible, el tema sigue cambiado para esta sesión,
    // solo no se recuerda la próxima vez.
  }
});

/* ---------- Configuración (todavía sin preferencias reales) ---------- */

// El botón de engranaje y el círculo de perfil abren el mismo modal por
// ahora: cuando haya preferencias de verdad (foto de perfil, datos del
// negocio), cada uno puede llevar directo a su sección correspondiente.
const modalConfiguracion = document.getElementById("modalConfiguracion");
document.getElementById("btnConfiguracion").addEventListener("click", () => {
  modalConfiguracion.hidden = false;
});
document.getElementById("btnPerfil").addEventListener("click", () => {
  modalConfiguracion.hidden = false;
});
document.getElementById("modalConfiguracionClose").addEventListener("click", () => {
  modalConfiguracion.hidden = true;
});
modalConfiguracion.addEventListener("click", (e) => {
  if (e.target === modalConfiguracion) modalConfiguracion.hidden = true;
});

/* ---------- Colapsar sidebar (pantalla completa en desktop) ---------- */

document.getElementById("btnColapsar").addEventListener("click", () => {
  document.documentElement.setAttribute("data-sidebar", "colapsada");
  try {
    localStorage.setItem("nexo.sidebar", "colapsada");
  } catch {
    // Sin storage disponible, se oculta igual para esta sesión, solo no
    // se recuerda la próxima vez (mismo criterio que el tema, arriba).
  }
});

/* ---------- Menú mobile y navegación entre vistas ---------- */

document.getElementById("navToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("is-open");
  // En desktop este mismo botón reaparece cuando la sidebar está
  // colapsada (ver CSS) y su única función ahí es volver a mostrarla.
  if (document.documentElement.getAttribute("data-sidebar") === "colapsada") {
    document.documentElement.removeAttribute("data-sidebar");
    try {
      localStorage.removeItem("nexo.sidebar");
    } catch {}
  }
});

// Un título y un dominio por vista, para que la topbar diga siempre
// dónde está el usuario (antes su <h1> era la fecha de hoy en las 14
// pantallas). El dominio es el mismo agrupamiento por el que ya está
// ordenado el <nav>: Resumen -> Maestros -> embudo de venta -> embudo de
// compra -> Stock -> Finanzas -> Papelera.
//
// Las vistas de ficha (no están en el nav, se abren desde una fila de
// tabla) llevan además "nav" — qué ítem del menú se marca activo — y
// "esFicha", que le dice a mostrarVista() que no actualice el hash: el
// nombre de la vista solo no alcanza para reconstruir cuál registro
// mostrar, así que no tiene sentido ofrecerla como deep-link. Su título
// genérico ("Venta") lo reemplaza abrirFicha*() por el real ("Venta #37")
// apenas sabe qué registro es.
const VISTAS_CONSTRUIDAS = {
  dashboard: { titulo: "Resumen", dominio: "Resumen" },
  productos: { titulo: "Productos", dominio: "Maestros" },
  "reportes-ventas": { titulo: "Qué se vende", dominio: "Resumen" },
  clientes: { titulo: "Clientes", dominio: "Maestros" },
  proveedores: { titulo: "Proveedores", dominio: "Maestros" },
  presupuestos: { titulo: "Presupuestos", dominio: "Embudo de venta" },
  ventas: { titulo: "Ventas", dominio: "Embudo de venta" },
  devoluciones: { titulo: "Devoluciones", dominio: "Embudo de venta" },
  facturas: { titulo: "Facturas", dominio: "Embudo de venta" },
  compras: { titulo: "Compras", dominio: "Embudo de compra" },
  "devoluciones-proveedor": { titulo: "Devoluciones a proveedor", dominio: "Embudo de compra" },
  stock: { titulo: "Stock", dominio: "Stock" },
  "reportes-stock": { titulo: "Reportes de stock", dominio: "Stock" },
  caja: { titulo: "Caja", dominio: "Finanzas" },
  "cuentas-corrientes": { titulo: "Cuentas corrientes", dominio: "Finanzas" },
  gastos: { titulo: "Gastos", dominio: "Finanzas" },
  papelera: { titulo: "Papelera", dominio: "Papelera" },

  "venta-detalle": { titulo: "Venta", dominio: "Embudo de venta", nav: "ventas", esFicha: true },
  "presupuesto-detalle": { titulo: "Presupuesto", dominio: "Embudo de venta", nav: "presupuestos", esFicha: true },
  "devolucion-detalle": { titulo: "Devolución", dominio: "Embudo de venta", nav: "devoluciones", esFicha: true },
  "factura-detalle": { titulo: "Factura", dominio: "Embudo de venta", nav: "facturas", esFicha: true },
  "compra-detalle": { titulo: "Compra", dominio: "Embudo de compra", nav: "compras", esFicha: true },
  "devolucion-proveedor-detalle": {
    titulo: "Devolución a proveedor",
    dominio: "Embudo de compra",
    nav: "devoluciones-proveedor",
    esFicha: true
  },
  "producto-detalle": { titulo: "Producto", dominio: "Maestros", nav: "productos", esFicha: true },
  "cliente-detalle": { titulo: "Cliente", dominio: "Maestros", nav: "clientes", esFicha: true },
  "proveedor-detalle": { titulo: "Proveedor", dominio: "Maestros", nav: "proveedores", esFicha: true },

  placeholder: { titulo: "Próximamente", dominio: "Nexo", esFicha: true }
};

function mostrarVista(viewId, { titulo, actualizarHash = true } = {}) {
  document.querySelectorAll(".view").forEach((sec) => {
    sec.hidden = sec.dataset.view !== viewId;
  });

  const info = VISTAS_CONSTRUIDAS[viewId];
  const tituloFinal = titulo ?? info?.titulo;
  if (info) document.getElementById("vistaEyebrow").textContent = info.dominio;
  if (tituloFinal) {
    document.getElementById("vistaTitulo").textContent = tituloFinal;
    document.title = `${tituloFinal} · Nexo`;
  }

  // El nav marca activo el ítem de la vista, o el de la lista de la que
  // salió una ficha (ver "nav" en VISTAS_CONSTRUIDAS): mirando la ficha
  // de una venta, "Ventas" se mantiene resaltado en vez de apagarse.
  const navObjetivo = info?.nav ?? viewId;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const activo = item.dataset.view === navObjetivo;
    item.classList.toggle("is-active", activo);
    if (activo) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  // Deep-link: F5 o el botón Atrás vuelven a esta misma pantalla. Las
  // fichas quedan afuera (ver "esFicha" arriba); actualizarHash en false
  // lo pasa quien ya está respondiendo a un cambio de hash, para no
  // generar un loop de escritura.
  if (actualizarHash && info && !info.esFicha) {
    const hash = `#/${viewId}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
}

// Vuelve del hash a una vista válida (no de ficha, que no alcanza para
// reconstruir cuál registro mostrar), o null si no hay nada aprovechable.
function vistaDesdeHash() {
  const id = (location.hash || "").replace(/^#\/?/, "");
  return VISTAS_CONSTRUIDAS[id] && !VISTAS_CONSTRUIDAS[id].esFicha ? id : null;
}

// Botón Atrás/Adelante del navegador entre vistas del nav.
window.addEventListener("hashchange", () => {
  const view = vistaDesdeHash();
  if (view) mostrarVista(view, { actualizarHash: false });
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("sidebar").classList.remove("is-open");
    const view = item.dataset.view;
    mostrarVista(VISTAS_CONSTRUIDAS[view] ? view : "placeholder");
  });
});

// Al entrar: si la URL ya trae una vista puesta (F5, o volver con el
// botón Atrás), arrancar ahí en vez de siempre en Resumen.
mostrarVista(vistaDesdeHash() ?? "dashboard", { actualizarHash: false });
