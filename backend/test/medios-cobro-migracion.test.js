// La migración de arranque del medio "Mercado Pago" (hist. §172). Mercado Pago
// no es una forma de cobrar sino adónde cae la plata, así que el medio que
// nacía de esa cuenta (hist. §171) deja de ofrecerse en el mostrador: pasa a ser
// la Transferencia si el negocio no tenía una, se borra si estaba intacto y sin
// cobros, y en cualquier otro caso se pausa (sin perder su historial). Se
// prueba reabriendo una base ya armada, marcada como la de producción (versión
// 1 de la migración), como un arranque del servidor con datos de antes. Va
// aparte porque levanta dos servidores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

test('el medio "Mercado Pago" de antes deja de ofrecerse: pasa a Transferencia, se borra o se pausa', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-mig-'));
  const dbPath = path.join(dir, 'nexo.db');
  try {
    const primero = await levantarServidor({ dbPath });
    await registrarEmpresa(primero, { empresa: 'Sin Transferencia', usuario: 'sintransf' });
    await registrarEmpresa(primero, { empresa: 'Con Transferencia', usuario: 'context' });
    await registrarEmpresa(primero, { empresa: 'Lo Tocó', usuario: 'lotoco' });
    await registrarEmpresa(primero, { empresa: 'Cuenta Renombrada', usuario: 'renombrada' });
    // El negocio que ya cobró con el medio: lo crea y vende con él por la API,
    // como pasó en producción al probar el mostrador.
    const conCobros = await registrarEmpresa(primero, { empresa: 'Con Cobros', usuario: 'concobros' });
    const cuentas = (await conCobros.get('/api/cuentas-tesoreria')).json;
    const caja = cuentas.find((c) => c.tipo === 'efectivo');
    const mp = cuentas.find((c) => c.tipo === 'mercadopago');
    const medio = await conCobros.post('/api/medios-cobro', { nombre: 'Mercado Pago', tipo: 'billetera', cuenta_tesoreria_id: mp.id });
    assert.equal(medio.status, 201, medio.texto);
    const servicio = (await conCobros.post('/api/productos', { nombre: 'Corte', precio_venta: 1000, tipo: 'servicio' })).json.id;
    const turno = (await conCobros.post('/api/turnos-caja', { cuenta_tesoreria_id: caja.id, contado: 0 })).json.id;
    const venta = await conCobros.post('/api/pos/ventas', {
      turno_caja_id: turno,
      items: [{ producto_id: servicio, cantidad: 1, precio_unitario: 1000 }],
      cobros: [{ medio_cobro_id: medio.json.id, importe: 1000 }],
      consumos: []
    });
    assert.equal(venta.status, 201, venta.texto);
    await primero.cerrar();

    // Se arma lo que había antes: cada negocio con su medio "Mercado Pago" (el
    // de Con Cobros ya está), uno sin Transferencia, otro con una comisión
    // cargada y otro con la cuenta renombrada, y la base con la marca de la
    // primera versión.
    const base = new DatabaseSync(dbPath);
    const org = (nombre) => base.prepare('SELECT id FROM organizaciones WHERE nombre = ?').get(nombre).id;
    const sinTransferencia = org('Sin Transferencia');
    const conTransferencia = org('Con Transferencia');
    const loToco = org('Lo Tocó');
    const renombrada = org('Cuenta Renombrada');
    const conCobrosId = org('Con Cobros');
    const cuentaMp = (orgId) => base.prepare("SELECT id FROM cuentas_tesoreria WHERE organizacion_id = ? AND tipo = 'mercadopago'").get(orgId).id;
    const legado = (orgId, comision) =>
      base
        .prepare("INSERT INTO medios_cobro (nombre, tipo, cuenta_tesoreria_id, comision_pct, orden, organizacion_id) VALUES ('Mercado Pago', 'billetera', ?, ?, 99, ?)")
        .run(cuentaMp(orgId), comision, orgId);
    base.prepare("DELETE FROM medios_cobro WHERE organizacion_id = ? AND tipo = 'transferencia'").run(sinTransferencia);
    legado(sinTransferencia, 0);
    legado(conTransferencia, 0);
    legado(loToco, 2);
    legado(renombrada, 0);
    base.prepare('UPDATE cuentas_tesoreria SET nombre = ? WHERE id = ?').run('MP del local', cuentaMp(renombrada));
    const mpDelNegocioSin = cuentaMp(sinTransferencia);
    base.exec('PRAGMA user_version = 1');
    base.close();

    const segundo = await levantarServidor({ dbPath });
    await segundo.cerrar();

    const despues = new DatabaseSync(dbPath);
    const medios = (orgId) => despues.prepare('SELECT nombre, tipo, activo, cuenta_tesoreria_id FROM medios_cobro WHERE organizacion_id = ? ORDER BY orden').all(orgId);
    const ofrecidos = (orgId) => medios(orgId).filter((m) => m.activo && m.nombre === 'Mercado Pago');
    // Sin Transferencia: ese medio pasa a serlo, y sigue cayendo en Mercado Pago.
    const a = medios(sinTransferencia).find((m) => m.tipo === 'transferencia');
    assert.equal(a.nombre, 'Transferencia');
    assert.equal(a.cuenta_tesoreria_id, mpDelNegocioSin);
    assert.ok(!medios(sinTransferencia).some((m) => m.nombre === 'Mercado Pago'));
    // Con Transferencia, intacto y sin cobros: sobra y se borra, sin duplicar nada.
    assert.ok(!medios(conTransferencia).some((m) => m.nombre === 'Mercado Pago'));
    assert.equal(medios(conTransferencia).filter((m) => m.tipo === 'transferencia').length, 1);
    // El que el negocio tocó no se ofrece más, pero se conserva con lo que cargó.
    const tocado = medios(loToco).find((m) => m.nombre === 'Mercado Pago');
    assert.equal(tocado.activo, 0);
    assert.equal(ofrecidos(loToco).length, 0);
    // Con la cuenta renombrada igual se encuentra, y se borra.
    assert.ok(!medios(renombrada).some((m) => m.nombre === 'Mercado Pago'));
    // El que ya cobró algo se pausa: el historial de esa venta sigue entero.
    assert.equal(medios(conCobrosId).find((m) => m.nombre === 'Mercado Pago').activo, 0);
    assert.equal(ofrecidos(conCobrosId).length, 0);
    assert.equal(despues.prepare('SELECT COUNT(*) AS n FROM cobros WHERE medio_cobro_id IS NOT NULL').get().n >= 1, true);
    // Una sola vez: queda marcada con la versión 2 (o una posterior).
    assert.ok(despues.prepare('PRAGMA user_version').get().user_version >= 2);
    despues.close();
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
