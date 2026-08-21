/**
 * data.js
 * -----------------------------------------------------------
 * Datos de EJEMPLO para poder ver la interfaz funcionando
 * mientras no existe el backend. La forma de estos objetos
 * está pensada para calzar directo con lo que después va a
 * devolver la API de Express (mismos nombres de campo), así
 * el día que conectemos fetch('/api/facturas') no hay que
 * tocar nada de app.js más que la fuente de los datos.
 *
 * IMPORTANTE: la alícuota de IVA (21%) es la general vigente
 * en Argentina, pero la retención de Mercado Pago varía según
 * el impuesto (IIBB, Ganancias) y la jurisdicción del negocio.
 * El valor de acá es un EJEMPLO ilustrativo, no un dato fiscal
 * verificado — cuando armemos el módulo real de IVA/retenciones
 * hay que confirmar las alícuotas con la fuente oficial (AFIP/
 * ARCA e ingresos brutos de la provincia correspondiente).
 */

const IVA_ALICUOTA = 0.21;
const RETENCION_MP_EJEMPLO = 0.005; // placeholder, NO usar como dato fiscal real

const NEGOCIO = {
  nombre: "Tu Pyme"
};

const FACTURAS = [
  {
    id: "0001",
    cliente: "Almacén Don Beto",
    concepto: "Venta de mercadería",
    neto: 45000,
    condicion: "mercadopago",
    estado: "cobrado"
  },
  {
    id: "0002",
    cliente: "Kiosco La Esquina",
    concepto: "Reposición de stock",
    neto: 18500,
    condicion: "efectivo",
    estado: "cobrado"
  },
  {
    id: "0003",
    cliente: "Ferretería Sur",
    concepto: "Servicio técnico",
    neto: 62000,
    condicion: "mercadopago",
    estado: "pendiente"
  },
  {
    id: "0004",
    cliente: "Panadería Trigo",
    concepto: "Venta mayorista",
    neto: 27300,
    condicion: "transferencia",
    estado: "vencido"
  }
];

/** Calcula IVA y retención MP a partir del neto y la condición de venta. */
function calcularFactura(f) {
  const iva = f.neto * IVA_ALICUOTA;
  const retencionMp = f.condicion === "mercadopago" ? f.neto * RETENCION_MP_EJEMPLO : 0;
  const total = f.neto + iva - retencionMp;
  return { ...f, iva, retencionMp, total };
}
