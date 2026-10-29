// IVA de la etapa C (CLAUDE.md §16, §33): las reglas que no tocan la base,
// para que server.js y los tests lean las mismas.
//
// El precio de venta es el final, con IVA incluido (hist. §112): el IVA de un
// renglón se saca de adentro del importe, nunca se suma encima.

// Alícuotas de IVA de un producto: las de ARCA, más exento y no gravado. Se
// guarda la clave en texto: '10.5' no es un número exacto.
export const ALICUOTAS_IVA = ['21', '10.5', '27', '5', '2.5', '0', 'exento', 'no_gravado'];

const redondear2 = (n) => Math.round(n * 100) / 100;

// El IVA contenido en un importe final: importe − importe / (1 + alícuota).
// Exento, no gravado y 0 % no llevan IVA.
export function ivaIncluido(importe, alicuota) {
  const tasa = Number(alicuota);
  if (!Number.isFinite(tasa) || tasa <= 0) return 0;
  return redondear2(importe - importe / (1 + tasa / 100));
}

// Solo el responsable inscripto discrimina IVA. El monotributista y el exento
// facturan C, sin IVA; un negocio que no cargó su condición, tampoco.
export const discriminaIva = (condicionNegocio) => condicionNegocio === 'responsable_inscripto';

// La alícuota y el IVA que guarda un renglón. Si el negocio no discrimina, la
// alícuota queda NULL: no se calculó, no es que sea 0 %.
export function ivaDelRenglon({ cantidad, precio_unitario, alicuota }, condicionNegocio) {
  if (!discriminaIva(condicionNegocio)) return { alicuota_iva: null, iva: 0 };
  const clave = alicuota ?? '21';
  return { alicuota_iva: clave, iva: ivaIncluido(Number(cantidad) * Number(precio_unitario), clave) };
}

// La letra que corresponde según quién emite y quién recibe:
// - el monotributista y el exento emiten C;
// - el inscripto emite A a otro inscripto y a un monotributista (RG 5003 de
//   2021), y B a cualquier otro (consumidor final, exento).
// null si el negocio no cargó su condición: no hay de dónde sacarla, y se
// usa la que se elija a mano.
export function letraQueCorresponde(condicionNegocio, condicionCliente) {
  if (condicionNegocio === 'monotributo' || condicionNegocio === 'exento') return 'C';
  if (condicionNegocio !== 'responsable_inscripto') return null;
  return condicionCliente === 'responsable_inscripto' || condicionCliente === 'monotributo' ? 'A' : 'B';
}

// Las compras (hist. §114). Solo la factura A a un negocio inscripto
// discrimina el IVA de lo comprado: ese IVA es crédito fiscal y sale del
// costo. Con B o C, o si el negocio no es inscripto, el IVA es parte del
// costo, como siempre. La letra que corresponde es la de letraQueCorresponde
// con los papeles al revés: emite el proveedor y recibe el negocio.
export const compraDiscriminaIva = (condicionNegocio, letra) => discriminaIva(condicionNegocio) && letra === 'A';
