/**
 * core/arrastrar.js
 * Reordenar una lista arrastrando cada fila desde su ícono de tres rayas
 * (pedido del usuario, hist. §209): lo usan el Personalizar del Resumen
 * (dominios/tablero.js) y el del menú (dominios/menu.js).
 *
 * Va con eventos de puntero, que andan igual con el mouse y con el dedo (el
 * arrastre nativo de HTML no anda en el celular); con el foco en el ícono, las
 * flechas del teclado suben y bajan la fila. El ícono es cualquier elemento
 * con [data-arrastrar] adentro de una fila; la fila, lo que diga `fila`.
 * alCambiar() corre cada vez que la lista quedó en otro orden.
 */

// Lo que tiene el scroll de la lista: el modal en la compu, la pantalla en el
// celular. Para llevar una fila de abajo hasta arriba la lista se desplaza sola
// mientras el dedo está cerca del borde.
function conScroll(el) {
  for (let nodo = el.parentElement; nodo; nodo = nodo.parentElement) {
    const { overflowY } = getComputedStyle(nodo);
    if ((overflowY === "auto" || overflowY === "scroll") && nodo.scrollHeight > nodo.clientHeight) return nodo;
  }
  return document.scrollingElement;
}

const BORDE_SCROLL = 56;

export function ordenarArrastrando(lista, { fila: selector, alCambiar }) {
  let arrastre = null;

  // La fila sigue al dedo y, al pasar la mitad de otra, cambia de lugar con ella.
  function moverA(y) {
    const { fila } = arrastre;
    const otras = [...lista.querySelectorAll(selector)].filter((li) => li !== fila);
    const antes = otras.find((li) => {
      const caja = li.getBoundingClientRect();
      return y < caja.top + caja.height / 2;
    });
    if (antes ? fila.nextElementSibling !== antes : lista.lastElementChild !== fila) {
      const arriba = fila.getBoundingClientRect().top;
      lista.insertBefore(fila, antes ?? null);
      // La fila cambió de lugar en la lista: el desplazamiento sigue al dedo.
      arrastre.y += fila.getBoundingClientRect().top - arriba;
    }
    fila.style.transform = `translateY(${y - arrastre.y}px)`;
  }

  function desplazarSola() {
    if (!arrastre) return;
    const { scroll, ultimaY } = arrastre;
    const caja = scroll === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroll.getBoundingClientRect();
    const paso = ultimaY < caja.top + BORDE_SCROLL ? -10 : ultimaY > caja.bottom - BORDE_SCROLL ? 10 : 0;
    const antes = scroll.scrollTop;
    if (paso) scroll.scrollTop += paso;
    const corrido = scroll.scrollTop - antes;
    if (corrido) {
      // La lista subió o bajó debajo del dedo: la fila no.
      arrastre.y -= corrido;
      moverA(ultimaY);
    }
    arrastre.cuadro = requestAnimationFrame(desplazarSola);
  }

  lista.addEventListener("pointerdown", (e) => {
    const asa = e.target.closest("[data-arrastrar]");
    if (!asa || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    const fila = asa.closest(selector);
    asa.setPointerCapture(e.pointerId);
    arrastre = { fila, y: e.clientY, ultimaY: e.clientY, scroll: conScroll(lista) };
    fila.classList.add("is-arrastrando");
    arrastre.cuadro = requestAnimationFrame(desplazarSola);
  });

  lista.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    arrastre.ultimaY = e.clientY;
    moverA(e.clientY);
  });

  function soltar() {
    if (!arrastre) return;
    cancelAnimationFrame(arrastre.cuadro);
    arrastre.fila.classList.remove("is-arrastrando");
    arrastre.fila.style.transform = "";
    arrastre = null;
    alCambiar();
  }
  lista.addEventListener("pointerup", soltar);
  lista.addEventListener("pointercancel", soltar);

  // Con el teclado: el foco en el ícono y las flechas.
  lista.addEventListener("keydown", (e) => {
    const asa = e.target.closest("[data-arrastrar]");
    if (!asa || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const fila = asa.closest(selector);
    const vecina = e.key === "ArrowUp" ? fila.previousElementSibling : fila.nextElementSibling;
    if (!vecina) return;
    lista.insertBefore(fila, e.key === "ArrowUp" ? vecina : vecina.nextElementSibling);
    asa.focus();
    alCambiar();
  });
}
