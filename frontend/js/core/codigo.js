/**
 * core/codigo.js
 * El código de 6 números que llega por mail para confirmar que el mail es de
 * quien lo escribió (hist. §108): en el alta, en "Sumá tu mail" y al cambiar
 * el mail en Mi cuenta. No usa nada de la app: lo baja también sesion.js,
 * antes de que haya sesión.
 */

// Solo números, y al completar los 6 se manda solo: el que pega el código del
// mail, o el celular que lo propone sobre el teclado, no tiene que tocar
// Confirmar. Sin maxlength en el input: "123 456" pegado del mail tiene 7
// caracteres, y el navegador lo cortaría antes de limpiarlo.
export function prepararCampoCodigo(input, alCompletar) {
  input.addEventListener("input", () => {
    const limpio = input.value.replace(/\D/g, "").slice(0, 6);
    if (limpio !== input.value) input.value = limpio;
    if (limpio.length === 6) alCompletar();
  });
}

export const codigoCompleto = (input) => /^\d{6}$/.test(input.value);

// "Mandar otro código" espera unos segundos entre envío y envío, con la
// cuenta regresiva en el propio botón: el mail tarda, y el backend tiene un
// tope de 5 por hora. Devuelve la función que corta la espera.
export function esperarParaReenviar(boton, segundos = 30) {
  const texto = boton.dataset.texto ?? (boton.dataset.texto = boton.textContent);
  let quedan = segundos;
  boton.disabled = true;
  const pintar = () => (boton.textContent = `${texto} (${quedan} s)`);
  pintar();
  const reloj = setInterval(() => {
    quedan -= 1;
    if (quedan > 0) return pintar();
    terminar();
  }, 1000);
  function terminar() {
    clearInterval(reloj);
    boton.disabled = false;
    boton.textContent = texto;
  }
  return terminar;
}
