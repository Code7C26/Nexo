/**
 * core/descarga-datos.js
 * "Descargar los datos del negocio" (hist. §109): baja el JSON de
 * GET /api/negocio/exportar con el nombre que manda el servidor. Lo usan la
 * página de Configuración (dominios/baja.js) y la pantalla de un negocio en
 * baja (sesion.js, que lo baja con import()): no usa nada de la app.
 */

// Devuelve el error para mostrar, o null si bajó.
export async function descargarDatosDelNegocio() {
  let res;
  try {
    res = await fetch("/api/negocio/exportar");
  } catch {
    return "Sin conexión con el servidor. Revisá la red y volvé a intentar.";
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => ({}));
    return datos.error || "No se pudieron descargar los datos.";
  }
  const nombre = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "nexo-datos.json";
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
