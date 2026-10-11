// Analizador de template literals del frontend, para el test de escape de
// frontend-modulos.test.js (auditoría de hist. §57, Fase 3).
//
// No es un parser de JavaScript: es un tokenizador chico que alcanza para el
// código de este repo. Separa cada template literal en su parte fija y sus
// `${…}`, sigue el anidamiento (un template adentro de un `${…}` de otro) y
// saltea strings, comentarios y regex para no confundirlos con código.
//
// La regla que aplica sinEscapar() es "denegar por defecto" para los campos
// de objetos: dentro de un template que arma HTML, todo `${x.campo}` que se
// imprime tal cual tiene que pasar por esc(). Quedan afuera los usos que no
// imprimen el valor (condición de un ternario, comparación, índice entre
// corchetes, argumento de otra función), los ids numéricos (`id`, `*_id`) y
// los campos de constantes del código en mayúsculas (`MARGEN.left`).
// Lo que no ve: un string armado en otra variable y después interpolado
// (`${etiqueta}`) y lo que devuelve una función propia; eso queda en manos
// de quien arma el string o la función.

// Separa `texto` en template literals: { pos, estatico, exprs: [{ texto, pos }], html }.
// `html` es true si el template (o alguno que lo contiene) tiene una etiqueta.
export function plantillas(texto) {
  const salida = [];
  const n = texto.length;
  let i = 0;

  const saltarString = (comilla) => {
    i++;
    while (i < n && texto[i] !== comilla) {
      if (texto[i] === '\\') i++;
      i++;
    }
    i++;
  };

  const leerPlantilla = (padre) => {
    const p = { pos: i, estatico: '', exprs: [], padre };
    salida.push(p);
    i++;
    while (i < n && texto[i] !== '`') {
      if (texto[i] === '\\') {
        p.estatico += texto.slice(i, i + 2);
        i += 2;
      } else if (texto[i] === '$' && texto[i + 1] === '{') {
        i += 2;
        const desde = i;
        leerCodigo('}', p);
        p.exprs.push({ texto: texto.slice(desde, i), pos: desde });
        i++;
      } else {
        p.estatico += texto[i];
        i++;
      }
    }
    i++;
  };

  // Avanza hasta el `cierre` sin pareja (o hasta el final si es null).
  const leerCodigo = (cierre, padre) => {
    let prof = 0;
    let previo = '';
    while (i < n) {
      const c = texto[i];
      if (c === '`') {
        leerPlantilla(padre);
        previo = '`';
      } else if (c === '"' || c === "'") {
        saltarString(c);
        previo = c;
      } else if (c === '/' && texto[i + 1] === '/') {
        while (i < n && texto[i] !== '\n') i++;
      } else if (c === '/' && texto[i + 1] === '*') {
        i = texto.indexOf('*/', i + 2) + 2;
      } else if (c === '/' && (previo === '' || '(,=:[!&|?{};'.includes(previo))) {
        // Regex literal: una barra donde no puede haber una división.
        i++;
        let enClase = false;
        while (i < n && (texto[i] !== '/' || enClase)) {
          if (texto[i] === '\\') i++;
          else if (texto[i] === '[') enClase = true;
          else if (texto[i] === ']') enClase = false;
          i++;
        }
        i++;
        while (i < n && /[a-z]/i.test(texto[i])) i++;
        previo = '/';
      } else {
        if (c === '{' || c === '(' || c === '[') prof++;
        if (c === '}' || c === ')' || c === ']') {
          if (prof === 0 && c === cierre) return;
          prof--;
        }
        if (!/\s/.test(c)) previo = c;
        i++;
      }
    }
  };

  leerCodigo(null, null);
  const esHtml = (p) => /<\/?[a-zA-Z]/.test(p.estatico) || (p.padre !== null && esHtml(p.padre));
  return salida.map((p) => ({ pos: p.pos, estatico: p.estatico, exprs: p.exprs, html: esHtml(p) }));
}

// Reemplaza por espacios el contenido de strings y templates anidados dentro
// de una expresión (los anidados se revisan como template propio), sin mover
// las posiciones.
function blanquear(expr) {
  let s = '';
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let prof = 0;
      while (j < expr.length) {
        if (expr[j] === '\\') {
          j += 2;
          continue;
        }
        if (c === '`' && expr[j] === '$' && expr[j + 1] === '{') prof++;
        else if (c === '`' && expr[j] === '}' && prof > 0) prof--;
        else if (expr[j] === c && prof === 0) break;
        j++;
      }
      s += c + ' '.repeat(Math.max(0, j - i - 1)) + c;
      i = j + 1;
    } else {
      s += c;
      i++;
    }
  }
  return s;
}

// Métodos que devuelven el mismo texto transformado: `${u.fecha.split(" ")[0]}`
// imprime un dato igual que `${u.fecha}`.
const METODOS_DE_TEXTO = new Set(['split', 'slice', 'trim', 'toUpperCase', 'toLowerCase', 'replace', 'replaceAll', 'substring', 'padStart', 'padEnd', 'at', 'toString', 'concat']);
const METODOS_DE_LISTA = /^\s*\.\s*(map|filter|forEach|find|some|every|reduce|flatMap|sort)\b/;
const esId = (campo) => campo === 'id' || campo.endsWith('_id');

// Devuelve los `x.campo` que una expresión imprime sin pasar por esc().
export function camposCrudos(expr) {
  const b = blanquear(expr);
  const crudos = [];
  for (const m of b.matchAll(/(?<![\w$.\]])[\w$]+(?:\s*\??\.\s*[\w$]+)+/g)) {
    const cadena = m[0].replace(/\s+/g, '');
    const ultimo = cadena.split(/\??\./).pop();
    const antes = b.slice(0, m.index);
    const despues = b.slice(m.index + m[0].length);

    // ¿Está adentro de una llamada o de un índice? Se busca el paréntesis o
    // corchete abierto más cercano que lo contiene.
    let prof = 0;
    let contenedor = null;
    for (let k = m.index - 1; k >= 0; k--) {
      const c = b[k];
      if (c === ')' || c === ']') prof++;
      else if (c === '(' || c === '[') {
        if (prof === 0) {
          contenedor = { tipo: c, pos: k, funcion: b.slice(0, k).match(/([\w$.]+)\s*$/)?.[1] ?? '' };
          break;
        }
        prof--;
      }
    }
    if (contenedor?.tipo === '[') continue; // índice: TIPO_LABEL[x.tipo]
    if (contenedor?.funcion) continue; // argumento: lo resuelve esa función (esc, money, propias)
    if (contenedor) {
      // Paréntesis sueltos: `(x.lista ?? []).map(...)` recorre, no imprime.
      let p = 0;
      let k = contenedor.pos;
      for (; k < b.length; k++) {
        if (b[k] === '(') p++;
        else if (b[k] === ')' && --p === 0) break;
      }
      if (METODOS_DE_LISTA.test(b.slice(k + 1))) continue;
    }

    if (/^\s*\(/.test(despues)) {
      // Es una llamada `x.metodo(...)`: solo imprime el dato si es un método
      // de texto, o un join sobre un campo (`data.problemas.join(" · ")`). Un
      // join sobre una variable suelta (`acciones.join("")`) es el armado
      // habitual de HTML ya escapado y no se marca.
      const segmentos = cadena.split(/\??\./).length;
      if (METODOS_DE_TEXTO.has(ultimo) || (ultimo === 'join' && segmentos >= 3)) crudos.push(cadena);
      continue;
    }
    if (esId(ultimo)) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(cadena.split(/\??\./)[0])) continue; // constante del código: MARGEN.left
    if (/^\s*\.\s*length\b/.test(despues)) continue;
    // Condición o comparación: el valor no se imprime.
    if (/^\s*(\?(?![.?])|===|!==|==|!=|>=|<=|>|<|&&)/.test(despues)) continue;
    if (/(===|!==|==|!=|>=|<=|>|<|!)\s*$/.test(antes)) continue;
    crudos.push(cadena);
  }
  return crudos;
}

// Recorre un archivo y devuelve [{ linea, campo }] de cada campo impreso sin
// esc() dentro de un template que arma HTML.
export function sinEscapar(texto) {
  const hallazgos = [];
  for (const p of plantillas(texto)) {
    if (!p.html) continue;
    for (const e of p.exprs) {
      for (const campo of camposCrudos(e.texto)) {
        hallazgos.push({ linea: texto.slice(0, e.pos).split('\n').length, campo });
      }
    }
  }
  return hallazgos;
}
