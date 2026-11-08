/**
 * traductor.js
 * Nexo en inglés (Configuración → Apariencia → Idioma).
 *
 * La interfaz está escrita en castellano y no tiene claves de traducción: el
 * texto en castellano es la clave, y idioma/en.js dice cómo va en inglés.
 * Este script traduce lo que aparece en pantalla, venga del HTML, de un
 * módulo o de un mensaje del servidor: el texto de cada nodo y los atributos
 * que se leen (placeholder, title, aria-label, alt, data-label).
 *   - Un texto igual a una clave se cambia por su traducción.
 *   - Una clave con huecos ("Venta #{0} anulada") es un patrón: el hueco
 *     toma lo que haya, y lo que tomó se traduce a su vez si es una clave
 *     ("Todavía no hay {0} cargados" con "productos").
 *   - Lo que no está en el diccionario queda como está: un nombre de
 *     producto, un cliente o un texto nuevo todavía sin traducir.
 *   - No se toca lo que está dentro de [translate="no"] (los comprobantes,
 *     que son documentos fiscales argentinos), ni campos de formulario.
 * El idioma se guarda en este dispositivo, como el tema. Cambiarlo recarga
 * la página: así todo se vuelve a pintar ya traducido.
 *
 * Es un script clásico en el <head>, antes que sesion.js: el observer tiene
 * que estar mirando antes de que se pinte nada. Expone window.nexoIdioma, que
 * los módulos leen con core/idioma.js. `npm run i18n` lista lo que falta
 * traducir (scripts/i18n.mjs).
 */
(() => {
  const CLAVE = "nexo.idioma";
  let idioma = "es";
  try {
    if (localStorage.getItem(CLAVE) === "en") idioma = "en";
  } catch {
    // Sin storage, castellano.
  }
  document.documentElement.lang = idioma;

  const ATRIBUTOS = ["placeholder", "title", "aria-label", "alt", "data-label"];
  const SIN_TRADUCIR = 'script, style, textarea, input, [translate="no"], [contenteditable="true"]';

  const exactos = new Map();
  const patrones = [];
  // Todas las claves con huecos, aunque no sirvan de patrón: core/idioma.js
  // las arma con formatear() cuando el texto es demasiado corto para
  // reconocerlo en pantalla ("{0}: {1} en {2}").
  const plantillas = new Map();
  const memo = new Map();
  // Lo que ya está en inglés (lo puso este script): no se vuelve a buscar.
  const yaTraducidos = new Set();

  const normalizar = (s) => s.replace(/\s+/g, " ").trim();
  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const letras = (s) => s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "").length;

  function preparar(diccionario) {
    for (const [es, en] of Object.entries(diccionario)) {
      // null: queda igual (un nombre técnico o de marca).
      if (en === null) continue;
      if (!/\{\d+\}/.test(es)) {
        exactos.set(es, en);
        continue;
      }
      // "Estado: {0}" con el hueco al final: si lo que va en el hueco es otro
      // elemento (un badge), el nodo de texto es solo "Estado:".
      const finalEs = es.match(/^([^{}]*\S)\s*\{(\d+)\}$/);
      const finalEn = en.match(/^([^{}]*\S)\s*\{(\d+)\}$/);
      if (finalEs && finalEn && finalEs[2] === finalEn[2] && !exactos.has(finalEs[1])) exactos.set(finalEs[1], finalEn[1]);
      const inicioEs = es.match(/^\{(\d+)\}\s*(\S[^{}]*)$/);
      const inicioEn = en.match(/^\{(\d+)\}\s*(\S[^{}]*)$/);
      if (inicioEs && inicioEn && inicioEs[1] === inicioEn[1] && !exactos.has(inicioEs[2])) exactos.set(inicioEs[2], inicioEn[2]);
      // Un patrón sin una palabra fija de verdad ("{0} de {1}", "{0} y {1}
      // más") agarraría cualquier cosa, hasta un nombre de producto: no se
      // usa como patrón. Hace falta al menos una palabra de 4 letras.
      // Un texto fijo al principio ("Del {0} al {1}") también lo ancla.
      plantillas.set(es, en);
      const fijo = es.replace(/\{\d+\}/g, "\u0000");
      if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{4,}/.test(fijo) && !/^[A-ZÁÉÍÓÚÑ¿¡][a-záéíóúñ]{2,} /.test(es)) continue;
      const orden = [];
      const partes = es.split(/(\{\d+\})/).filter((p) => p !== "");
      const fuente = partes.map((parte, i) => {
        const hueco = parte.match(/^\{(\d+)\}$/);
        if (!hueco) return escapar(parte);
        orden.push(Number(hueco[1]));
        // Dos huecos pegados ("plan {2}{3}"): el primero es una palabra y el
        // segundo lo que sigue, que puede venir vacío.
        if (/^\{\d+\}$/.test(partes[i - 1] ?? "")) return "(.*?)";
        if (/^\{\d+\}$/.test(partes[i + 1] ?? "")) return "([^\\s,;:()]+)";
        // Puede venir vacío: "{0}consultó {1}" sin nada adelante.
        return "(.*?)";
      });
      // La parte fija más larga: filtro barato antes de probar la expresión.
      const pista = fijo.split("\u0000").reduce((a, b) => (b.length > a.length ? b : a), "");
      patrones.push({ re: new RegExp(`^${fuente.join("")}$`, "s"), orden, en, pista, fijo: fijo.length });
    }
    // Los patrones más específicos (más texto fijo) primero: "Consulta #{0}
    // de {1} perdida: {2}" antes que "Consulta #{0} de {1}".
    patrones.sort((a, b) => b.fijo - a.fijo);
  }

  // Lo que tomó un hueco, sin los signos de los bordes (", de prueba hasta el
  // 22" es "de prueba hasta el 22" con una coma adelante).
  function traducirHueco(capturado, profundidad) {
    const [, antes, centro, despues] = capturado.match(/^([\s,.;:·(¡¿"«]*)(.*?)([\s,.;:)!?"»]*)$/s);
    const traducido = centro && traducir(centro, profundidad);
    return traducido ? antes + traducido + despues : capturado;
  }

  // Lo que no es una clave entera, por partes: "6 ventas" o "en total 8" (el
  // número queda), dos frases seguidas, "A · B", "Estado: Pagado" y, al
  // final, "5 ventas, 95 %". Solo si alguna parte tiene traducción.
  function traducirPorPartes(n, profundidad) {
    const numeroAntes = n.match(/^([\d.,]+)\s+(\S.*)$/s);
    if (numeroAntes) {
      const resto = traducir(numeroAntes[2], profundidad);
      if (resto) return `${numeroAntes[1]} ${resto}`;
    }
    const numeroDespues = n.match(/^(\S.*?)\s+([\d.,]+)$/s);
    if (numeroDespues) {
      const resto = traducir(numeroDespues[1], profundidad);
      if (resto) return `${resto} ${numeroDespues[2]}`;
    }
    const cortes = [
      [n.split(/(?<=[.!?])\s+(?=\S)/), " "],
      [n.split(" · "), " · "],
      [n.includes(": ") ? [n.slice(0, n.indexOf(": ")), n.slice(n.indexOf(": ") + 2)] : [n], ": "],
      [n.split(", "), ", "]
    ];
    for (const [partes, union] of cortes) {
      if (partes.length < 2) continue;
      let alguna = false;
      const traducidas = partes.map((parte) => {
        const r = traducir(parte, profundidad);
        if (r) alguna = true;
        return r ?? parte;
      });
      if (alguna) return traducidas.join(union);
    }
    return null;
  }

  function traducir(texto, profundidad = 0) {
    const n = normalizar(texto);
    if (!n || yaTraducidos.has(n)) return null;
    if (memo.has(n)) return memo.get(n);
    let resultado = exactos.get(n) ?? null;
    if (resultado === null && profundidad < 3 && letras(n) >= 2) {
      for (const p of patrones) {
        if (!n.includes(p.pista)) continue;
        const m = n.match(p.re);
        if (!m) continue;
        resultado = p.en.replace(/\{(\d+)\}/g, (_, i) => traducirHueco(m[p.orden.indexOf(Number(i)) + 1] ?? "", profundidad + 1));
        break;
      }
      resultado ??= traducirPorPartes(n, profundidad + 1);
    }
    if (profundidad === 0) {
      memo.set(n, resultado);
      if (resultado) yaTraducidos.add(normalizar(resultado));
    }
    return resultado;
  }

  const sinTraducir = (el) => !el || el.closest(SIN_TRADUCIR) !== null;

  function traducirNodoDeTexto(nodo) {
    if (sinTraducir(nodo.parentElement)) return;
    const texto = nodo.data;
    const traducido = traducir(texto);
    if (traducido === null) return;
    const antes = texto.match(/^\s*/)[0];
    const despues = texto.match(/\s*$/)[0];
    nodo.data = antes + traducido + despues;
  }

  function traducirAtributo(el, nombre) {
    const valor = el.getAttribute(nombre);
    if (!valor || el.closest('[translate="no"]')) return;
    const traducido = traducir(valor);
    if (traducido !== null) el.setAttribute(nombre, traducido);
  }

  const SELECTOR_ATRIBUTOS = ATRIBUTOS.map((a) => `[${a}]`).join(",");

  function traducirArbol(raiz) {
    if (raiz.nodeType === Node.TEXT_NODE) return traducirNodoDeTexto(raiz);
    if (raiz.nodeType !== Node.ELEMENT_NODE) return;
    if (raiz.closest('[translate="no"]')) return;
    const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) traducirNodoDeTexto(nodo);
    for (const el of [raiz, ...raiz.querySelectorAll(SELECTOR_ATRIBUTOS)]) {
      for (const a of ATRIBUTOS) if (el.hasAttribute(a)) traducirAtributo(el, a);
    }
  }

  const observador = new MutationObserver((registros) => {
    for (const r of registros) {
      if (r.type === "childList") r.addedNodes.forEach(traducirArbol);
      else if (r.type === "characterData") traducirNodoDeTexto(r.target);
      else if (r.type === "attributes") traducirAtributo(r.target, r.attributeName);
    }
    // Lo que acaba de cambiar este mismo callback no se vuelve a mirar.
    observador.takeRecords();
  });

  const mostrar = () => document.documentElement.removeAttribute("data-traduciendo");

  const listo =
    idioma === "en"
      ? import("/js/idioma/en.js")
          .then(({ default: diccionario }) => {
            preparar(diccionario);
            traducirArbol(document.documentElement);
            observador.observe(document.documentElement, {
              childList: true,
              subtree: true,
              characterData: true,
              attributes: true,
              attributeFilter: ATRIBUTOS
            });
          })
          .catch((err) => console.error("No se pudo cargar la traducción al inglés.", err))
          .finally(mostrar)
      : Promise.resolve().then(mostrar);

  window.nexoIdioma = {
    idioma,
    // Para las fechas y los números (toLocaleString): el formato de cada idioma.
    locale: idioma === "en" ? "en-US" : "es-AR",
    listo,
    // Para lo que no pasa por la pantalla (un prompt(), un nombre de archivo).
    t: (texto) => (idioma === "en" ? (traducir(texto) ?? texto) : texto),
    plantilla: (es) => (idioma === "en" ? (plantillas.get(es) ?? es) : es),
    cambiar(nuevo) {
      try {
        if (nuevo === "en") localStorage.setItem(CLAVE, "en");
        else localStorage.removeItem(CLAVE);
      } catch {
        return;
      }
      location.reload();
    }
  };
})();
