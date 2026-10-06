/**
 * core/seleccion.js
 * Selección múltiple de tablas y barra de acciones en lote.
 * Movido tal cual desde app.js (CLAUDE.md §31, Etapa B / F2).
 */

/* ---------- Selección múltiple ---------- */

// A partir de esta cantidad de seleccionados, las acciones en lote que
// tardan (imprimir varias páginas, generar varios PDF) piden confirmación
// antes de arrancar: no para bloquear, sino para avisar que puede demorar
// (y, para descargas, que el navegador va a pedir permiso para bajar varios
// archivos — Chrome bloquea descargas múltiples automáticas por defecto).
export const CONFIRMAR_LOTE_DESDE = 25;

// Tope duro, no una regla de negocio: guardarraíl contra un "seleccionar
// todo" accidental sobre una tabla con miles de filas, no un límite que
// alguien vaya a pedir subir. Ninguna acción en lote de esta etapa debería
// necesitar más.
export const LIMITE_LOTE = 500;

// Utilitario transversal de tablas, hermano de crearFiltros: agrega una
// columna de checkbox a una tabla y lleva el set de ids tildados. idBody
// es el id del <tbody> (la única marca que ya llevan las tablas, sin
// agregar un id nuevo a la <table>). idDe saca el id de una fila de la
// lista (default (x) => x.id; hace falta pasarlo distinto en tablas donde
// la fila no es la entidad en sí, como Stock, que es producto×depósito).
//
// La columna del <th> se inyecta acá por JS (insertAdjacentHTML), así la
// columna existe SI Y SOLO SI la selección está montada, y colspan(n) puede
// resolver solo el ancho de la fila vacía sin tocar cada vista a mano.
//
// El binding de los checkboxes de fila es la ÚNICA delegación real del
// archivo (el resto re-bindea en cada render): los checkboxes se destruyen
// en cada innerHTML =, y re-bindear un listener por fila en cada render
// sería el único costo evitable de esta función.
export function crearSeleccion(idBody, { idDe = (x) => x.id } = {}) {
  const body = document.getElementById(idBody);
  const tabla = body.closest("table");
  const filaHead = tabla.querySelector("thead tr");

  const seleccionados = new Set();
  let visibles = []; // ids de la lista visible en el último sincronizar()
  // Quien quiera enterarse de cada cambio de selección (típicamente
  // montarBarraSeleccion) se suscribe con sel.escuchar(fn) en vez de pasar
  // un único callback por el constructor — así crearSeleccion() no necesita
  // saber nada de la barra ni del orden en que se arma cada vista.
  const escuchas = [];

  filaHead.insertAdjacentHTML(
    "afterbegin",
    `<th class="col-sel"><input type="checkbox" class="sel-todo" aria-label="Seleccionar todo"></th>`
  );
  const checkTodo = filaHead.querySelector(".sel-todo");

  // En mobile el <thead> completo pasa a display:none (las filas se vuelven
  // cards apiladas), así que checkTodo deja de ser alcanzable — no hay forma
  // de seleccionar todo salvo tildar card por card. Se inyecta un botón de
  // texto, visible SOLO en ese breakpoint (.btn-sel-todo-mobile en CSS),
  // antes de .tabla-scroll. Va acá y no a mano en cada vista de index.html
  // por el mismo motivo que el <th>: nace y muere con la selección montada.
  const scrollWrap = tabla.closest(".tabla-scroll") ?? tabla;
  scrollWrap.insertAdjacentHTML(
    "beforebegin",
    `<button type="button" class="btn-link btn-sel-todo-mobile">Seleccionar todo</button>`
  );
  const btnTodoMobile = scrollWrap.previousElementSibling;

  function notificar() {
    for (const fn of escuchas) fn(seleccionados.size);
  }

  function actualizarCheckTodo() {
    const totalVisibles = visibles.length;
    const marcados = visibles.filter((id) => seleccionados.has(id)).length;
    checkTodo.checked = totalVisibles > 0 && marcados === totalVisibles;
    checkTodo.indeterminate = marcados > 0 && marcados < totalVisibles;
    // El botón de mobile hace las veces de checkTodo ahí: mismo texto que
    // comunica el estado, alternando entre marcar y desmarcar.
    btnTodoMobile.textContent = checkTodo.checked ? "Ninguno" : "Seleccionar todo";
  }

  // Comparte lógica entre el checkbox del header (desktop) y el botón de
  // texto de mobile (el thead con checkTodo queda oculto en ese breakpoint).
  function marcarTodosVisibles(marcar) {
    for (const id of visibles) {
      if (marcar) seleccionados.add(id);
      else seleccionados.delete(id);
    }
    body.querySelectorAll(".sel-fila").forEach((cb) => {
      cb.checked = seleccionados.has(Number(cb.dataset.selId));
    });
    actualizarCheckTodo();
    notificar();
  }

  checkTodo.addEventListener("change", () => marcarTodosVisibles(checkTodo.checked));
  btnTodoMobile.addEventListener("click", () => marcarTodosVisibles(!checkTodo.checked));

  // Delegado una sola vez: sobrevive a que el tbody se reescriba entero en
  // cada render.
  body.addEventListener("change", (e) => {
    const cb = e.target.closest(".sel-fila");
    if (!cb) return;
    const id = Number(cb.dataset.selId);
    if (cb.checked) seleccionados.add(id);
    else seleccionados.delete(id);
    actualizarCheckTodo();
    notificar();
  });

  // El checkbox nativo mide 13px: un click en el resto de la celda (que la
  // guarda de la fila ya excluye vía .col-sel, así que nunca abre la ficha)
  // no debería quedar "sin efecto" — clickear la celda entera tildaría o
  // destildaría igual, en vez de exigirle al usuario acertarle al cuadrito.
  body.addEventListener("click", (e) => {
    const celda = e.target.closest("td.col-sel");
    if (!celda || e.target.closest(".sel-fila")) return; // el click directo en el input ya dispara su propio change
    celda.querySelector(".sel-fila")?.click();
  });

  return {
    get ids() {
      // En el orden de la lista visible, no el orden de inserción del Set.
      return visibles.filter((id) => seleccionados.has(id));
    },
    get cantidad() {
      return seleccionados.size;
    },
    tiene(id) {
      return seleccionados.has(id);
    },
    // fn(cantidad) se llama con cada cambio de selección. Usado por
    // montarBarraSeleccion para mantener la barra sincronizada sin que
    // crearSeleccion necesite conocerla.
    escuchar(fn) {
      escuchas.push(fn);
    },
    limpiar() {
      seleccionados.clear();
      body.querySelectorAll(".sel-fila").forEach((cb) => (cb.checked = false));
      actualizarCheckTodo();
      notificar();
    },
    // Se llama desde render*(), con la lista YA filtrada/ordenada, ANTES de
    // pintar el tbody. Poda del set lo que ya no está visible: "todo" solo
    // puede significar "todo lo que se está viendo", igual que ya significa
    // para los botones de Exportar CSV (ver comentario de descargarCSV más
    // abajo). Si no se podara, el contador de la barra podría no coincidir
    // con lo que hay tildado en pantalla.
    sincronizar(lista) {
      visibles = lista.map(idDe);
      const visiblesSet = new Set(visibles);
      for (const id of [...seleccionados]) {
        if (!visiblesSet.has(id)) seleccionados.delete(id);
      }
      actualizarCheckTodo();
      notificar();
    },
    // n = cantidad de columnas de datos reales de la tabla (lo que ya se le
    // pasaba a filaVacia/filaVaciaFiltrada/tablaCargando antes de esta
    // función existir). +1 por la columna de checkbox.
    colspan(n) {
      return n + 1;
    },
    // Celda de checkbox para anteponer al template de la fila. Sirve para
    // los dos estilos de render del archivo (innerHTML+.map().join("") y
    // createElement("tr")+tr.innerHTML=...): los dos arman la fila con un
    // template string, así que un solo helper que devuelva string alcanza.
    celda(id) {
      return `<td class="col-sel" data-label=""><input type="checkbox" class="sel-fila" data-sel-id="${id}" ${
        seleccionados.has(id) ? "checked" : ""
      } aria-label="Seleccionar fila"></td>`;
    }
  };
}

// Conecta un crearSeleccion() con la barra flotante #barraSeleccion (única,
// compartida por todas las tablas — ver el comentario en index.html). Se
// suscribe a sel.escuchar(...), así que no hace falta pasarle nada al
// construir crearSeleccion(): se llama después, una vez por tabla.
//
// acciones: [{ etiqueta, onClick(ids, btn) }] — los botones que aparecen
// para ESTA tabla en particular. onClick recibe también el propio <button>
// por si la acción necesita deshabilitarlo / cambiarle el texto mientras
// corre (ver "Descargar PDF" en la sub-etapa 4, que tarda varios segundos).
//
// Solo puede haber una vista visible a la vez, así que un único juego de
// elementos alcanza: cada vista que se activa vuelve a llenar la barra con
// sus propios botones apenas cambia su propia selección, sobreescribiendo
// los que hubiera dejado la tabla anterior.
export function montarBarraSeleccion(sel, acciones) {
  const barra = document.getElementById("barraSeleccion");
  const conteo = document.getElementById("barraSeleccionConteo");
  const contenedorAcciones = document.getElementById("barraSeleccionAcciones");
  const btnLimpiar = document.getElementById("barraSeleccionLimpiar");

  sel.escuchar((cantidad) => {
    if (cantidad === 0) {
      barra.hidden = true;
      return;
    }
    barra.hidden = false;
    conteo.textContent = `${cantidad} ${cantidad === 1 ? "seleccionada" : "seleccionadas"}`;
    contenedorAcciones.innerHTML = "";
    for (const accion of acciones) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-secundario";
      btn.textContent = accion.etiqueta;
      btn.addEventListener("click", () => accion.onClick(sel.ids, btn));
      contenedorAcciones.appendChild(btn);
    }
    btnLimpiar.onclick = () => sel.limpiar();
    // Registra cuál sel es "la de la barra" en este momento: Escape (bindeado
    // una sola vez, más abajo) necesita saber a cuál de las 8 selecciones
    // limpiarle sin que cada montarBarraSeleccion() agregue su propio
    // listener global (serían 8 handlers de keydown apilados en el documento
    // para siempre, uno por tabla ya visitada en la sesión).
    seleccionActivaEnBarra = sel;
  });
}

// Sale del "modo selección" con Escape, sin importar en qué tabla se esté:
// limpia la selección que tiene la barra abierta ahora mismo. Un solo
// listener global (no uno por tabla) porque solo puede haber una barra
// visible a la vez.
let seleccionActivaEnBarra = null;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!seleccionActivaEnBarra || seleccionActivaEnBarra.cantidad === 0) return;
  seleccionActivaEnBarra.limpiar();
});

// Corre fn(id) para cada id de la lista, con como máximo `limite` en vuelo a
// la vez (Chrome ya limita a ~6 conexiones por host, esto lo hace explícito
// y evita 200 promesas coleccionándose de una si el usuario seleccionó
// medio libro mayor). Devuelve los resultados EN EL MISMO ORDEN que ids,
// no en el orden en que terminaron — necesario para que "Imprimir en lote"
// pagine en el orden que el usuario ve en la tabla, no en el orden de
// respuesta de la red.
export async function traerConcurrencia(ids, fn, limite = 6) {
  const resultados = new Array(ids.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < ids.length) {
      const i = siguiente++;
      resultados[i] = await fn(ids[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, ids.length) }, trabajador));
  return resultados;
}
