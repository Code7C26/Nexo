// Los mensajes de WhatsApp armados (hist. §219, punto 6 de
// docs/investigaciones/investigacion-praxia.md): uno por situación, con
// marcadores que se llenan con los datos del cliente. El negocio los cambia en
// Configuración → Mensajes de WhatsApp; los que no cambió son los de acá. Los
// manda una persona, desde su WhatsApp, con un enlace wa.me: Nexo no manda
// nada solo (eso pide la API de WhatsApp Business, para más adelante).
//
// Como las guías de cobranza (Wati, Alegra): uno antes de que venza y otro
// después, cada uno con quién escribe, cuánto y desde cuándo, y una salida si
// ya pagó.
//
// Puro, sin DOM: lo usan Configuración, Cuentas corrientes y Cuotas para
// armarlos, y server.js, para validar lo que se guarda (guardarMensajes).

export const MAX_MENSAJE = 1000;

export const MARCADORES = {
  nombre: "el nombre del cliente",
  negocio: "el nombre de tu negocio",
  deuda: "lo que debe",
  vencimiento: "la fecha en que vence o venció",
  dias: "los días de atraso",
  plan: "el plan de la cuota",
  // Los de los puntos (hist. §223).
  total: "el total de la compra",
  ganados: "los puntos que sumó con la compra",
  puntos: "los puntos que tiene para canjear",
  vencen: "cuándo vencen sus próximos puntos"
};

export const MENSAJES = {
  por_vencer: {
    titulo: "Antes de que venza",
    cuando: "Para un cliente con un saldo que todavía no venció.",
    marcadores: ["nombre", "negocio", "deuda", "vencimiento"],
    de_partida:
      "Hola, {nombre}. Te escribimos de {negocio} para recordarte que el {vencimiento} vence tu saldo de {deuda}. Si ya lo pagaste, avisanos y lo anotamos. ¡Gracias!"
  },
  vencida: {
    titulo: "Ya venció",
    cuando: "Para un cliente con un saldo vencido.",
    marcadores: ["nombre", "negocio", "deuda", "vencimiento", "dias"],
    de_partida:
      "Hola, {nombre}. Te escribimos de {negocio}: tenés un saldo de {deuda} que venció el {vencimiento}. Cuando puedas, avisanos cómo lo pagás. Si ya lo pagaste, avisanos y lo anotamos. ¡Gracias!"
  },
  cuota: {
    titulo: "Cuota vencida de un socio",
    cuando: "Para un socio con la cuota vencida.",
    modulo: "socios",
    marcadores: ["nombre", "negocio", "plan", "deuda", "vencimiento"],
    de_partida:
      "Hola, {nombre}. Te escribimos de {negocio}: tu cuota de {plan} venció el {vencimiento} y quedan {deuda} por pagar. Podés pagarla en la recepción, o avisanos si ya la pagaste. ¡Gracias!"
  },
  // Los de Praxia para que el cliente vuelva (hist. §223): el de la compra sale
  // del mostrador al cobrar, y el de los puntos, de la ficha del cliente.
  compra: {
    titulo: "Después de una compra",
    cuando: "Para mandarle al cliente, desde el mostrador, lo que sumó con su compra.",
    modulo: "puntos",
    marcadores: ["nombre", "negocio", "total", "ganados", "puntos"],
    de_partida:
      "¡Gracias por tu compra, {nombre}! Con los {total} de hoy sumaste {ganados} en {negocio}, y ya tenés {puntos} para canjear por premios. ¡Te esperamos!"
  },
  puntos: {
    titulo: "Tus puntos",
    cuando: "Para contarle a un cliente cuántos puntos tiene para canjear.",
    modulo: "puntos",
    marcadores: ["nombre", "negocio", "puntos", "vencen"],
    de_partida: "Hola, {nombre}. En {negocio} tenés {puntos} para canjear por premios. Pasá cuando quieras y elegí el tuyo. ¡Te esperamos!"
  }
};

export const TIPOS_MENSAJE = Object.keys(MENSAJES);

// El texto de una situación: el que guardó el negocio o el de partida.
export const textoDe = (tipo, guardados) => guardados?.[tipo] || MENSAJES[tipo].de_partida;

// Llena los marcadores. Uno que no tiene dato queda escrito tal cual, para que
// quien lo manda lo vea antes de mandarlo.
export const llenarMensaje = (texto, datos) =>
  texto.replace(/\{(\w+)\}/g, (marca, clave) => (datos[clave] == null || datos[clave] === "" ? marca : String(datos[clave])));

// Un enlace de WhatsApp con el mensaje escrito. Con un celular argentino
// cargado como se escribe (351 555-0101, 0351…) va directo a ese chat; si no
// se puede armar con seguridad, WhatsApp pide elegir a quién.
export function enlaceWhatsApp(telefono, texto = "") {
  let digitos = String(telefono ?? "").replace(/\D/g, "");
  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  const numero = digitos.startsWith("54") ? (digitos.length >= 12 ? digitos : "") : digitos.length === 10 ? `549${digitos}` : "";
  const consulta = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return numero ? `https://wa.me/${numero}${consulta}` : texto ? `https://wa.me/${consulta}` : null;
}
