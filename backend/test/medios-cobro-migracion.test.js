// La migración de arranque del medio "Mercado Pago" (hist. §172). Mercado Pago
// no es una forma de cobrar sino adónde cae la plata, así que el medio que
// nacía de esa cuenta (hist. §171) deja de existir: pasa a ser la Transferencia
// si el negocio no tenía una, se borra si la tenía, y se deja como está si el
// negocio lo tocó. Se prueba reabriendo una base ya armada, como un arranque
// del servidor con datos de antes. Va aparte porque levanta dos servidores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { levantarServidor, registrarEmpresa } from './servidor-de-prueba.js';

test('el medio "Mercado Pago" de antes pasa a Transferencia, se borra o se respeta según el negocio', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-mig-'));
  const dbPath = path.join(dir, 'nexo.db');
  try {
    const primero = await levantarServidor({ dbPath });
    await registrarEmpresa(primero, { empresa: 'Sin Transferencia', usuario: 'sintransf' });
    await registrarEmpresa(primero, { empresa: 'Con Transferencia', usuario: 'context' });
    await registrarEmpresa(primero, { empresa: 'Lo Tocó', usuario: 'lotoco' });
    await primero.cerrar();

    // Se arma lo que había antes: cada negocio con su medio "Mercado Pago", uno
    // sin Transferencia y otro con una comisión cargada, y la base sin marcar.
    const base = new DatabaseSync(dbPath);
    const org = (nombre) => base.prepare('SELECT id FROM organizaciones WHERE nombre = ?').get(nombre).id;
    const sinTransferencia = org('Sin Transferencia');
    const conTransferencia = org('Con Transferencia');
    const loToco = org('Lo Tocó');
    const cuentaMp = (orgId) => base.prepare("SELECT id FROM cuentas_tesoreria WHERE organizacion_id = ? AND tipo = 'mercadopago'").get(orgId).id;
    const legado = (orgId, comision) =>
      base
        .prepare("INSERT INTO medios_cobro (nombre, tipo, cuenta_tesoreria_id, comision_pct, orden, organizacion_id) VALUES ('Mercado Pago', 'billetera', ?, ?, 99, ?)")
        .run(cuentaMp(orgId), comision, orgId);
    base.prepare("DELETE FROM medios_cobro WHERE organizacion_id = ? AND tipo = 'transferencia'").run(sinTransferencia);
    legado(sinTransferencia, 0);
    legado(conTransferencia, 0);
    legado(loToco, 2);
    const mpDelNegocioSin = cuentaMp(sinTransferencia);
    base.exec('PRAGMA user_version = 0');
    base.close();

    const segundo = await levantarServidor({ dbPath });
    await segundo.cerrar();

    const despues = new DatabaseSync(dbPath);
    const medios = (orgId) => despues.prepare('SELECT nombre, tipo, cuenta_tesoreria_id FROM medios_cobro WHERE organizacion_id = ? ORDER BY orden').all(orgId);
    // Sin Transferencia: ese medio pasa a serlo, y sigue cayendo en Mercado Pago.
    const a = medios(sinTransferencia).find((m) => m.tipo === 'transferencia');
    assert.equal(a.nombre, 'Transferencia');
    assert.equal(a.cuenta_tesoreria_id, mpDelNegocioSin);
    assert.ok(!medios(sinTransferencia).some((m) => m.nombre === 'Mercado Pago'));
    // Con Transferencia: el de Mercado Pago sobra y se borra, sin duplicar nada.
    assert.ok(!medios(conTransferencia).some((m) => m.nombre === 'Mercado Pago'));
    assert.equal(medios(conTransferencia).filter((m) => m.tipo === 'transferencia').length, 1);
    // El que el negocio tocó se respeta.
    assert.ok(medios(loToco).some((m) => m.nombre === 'Mercado Pago' && m.tipo === 'billetera'));
    // Una sola vez: queda marcada, y un segundo arranque no vuelve a tocar nada.
    assert.equal(despues.prepare('PRAGMA user_version').get().user_version, 1);
    despues.close();
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
