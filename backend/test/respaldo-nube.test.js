// Respaldo en la nube (db/respaldo-nube.js) sin salir a internet: la firma se
// prueba contra el ejemplo publicado por AWS, y la subida y la bajada contra un
// S3 falso local que guarda los objetos en memoria.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  bajarRespaldo, cifrarRespaldo, configNube, descifrarRespaldo, firmarPedido, listarEnNube, NubeError, subirRespaldo
} from '../db/respaldo-nube.js';

const CLAVE = randomBytes(32);

// "Example: GET Object" de la documentación de AWS Signature V4 para S3.
test('la firma coincide con el ejemplo publicado por AWS', () => {
  const hashCuerpo = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const auth = firmarPedido({
    metodo: 'GET',
    ruta: '/test.txt',
    headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': hashCuerpo, 'x-amz-date': '20130524T000000Z' },
    hashCuerpo,
    region: 'us-east-1',
    keyId: 'AKIAIOSFODNN7EXAMPLE',
    secreto: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    fecha: new Date('2013-05-24T00:00:00Z')
  });
  assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
    + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
    + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('cifrar y descifrar devuelve los mismos bytes, y no se lee el original', () => {
  const datos = Buffer.from('SQLite format 3\0'.repeat(500));
  const cifrado = cifrarRespaldo(datos, CLAVE);
  assert.equal(cifrado.includes(Buffer.from('SQLite')), false);
  assert.ok(cifrado.length < datos.length, 'comprime antes de cifrar');
  assert.deepEqual(descifrarRespaldo(cifrado, CLAVE), datos);
});

test('con otra clave o un byte cambiado no descifra', () => {
  const cifrado = cifrarRespaldo(Buffer.from('datos del negocio'), CLAVE);
  assert.throws(() => descifrarRespaldo(cifrado, randomBytes(32)), NubeError);
  const alterado = Buffer.from(cifrado);
  alterado[alterado.length - 1] ^= 1;
  assert.throws(() => descifrarRespaldo(alterado, CLAVE), NubeError);
  assert.throws(() => descifrarRespaldo(Buffer.from('cualquier cosa, no un respaldo'), CLAVE), NubeError);
});

test('sin variables no hay nube; con algunas sola es un error; la región sale del endpoint', () => {
  assert.equal(configNube({}), null);
  assert.throws(() => configNube({ NEXO_B2_BUCKET: 'b' }), /NEXO_B2_KEY_ID/);
  const completo = {
    NEXO_B2_KEY_ID: 'id', NEXO_B2_APP_KEY: 'secreto', NEXO_B2_BUCKET: 'b',
    NEXO_B2_ENDPOINT: 's3.eu-central-003.backblazeb2.com', NEXO_RESPALDO_CLAVE: CLAVE.toString('base64')
  };
  const c = configNube(completo);
  assert.equal(c.region, 'eu-central-003');
  assert.equal(c.base, 'https://s3.eu-central-003.backblazeb2.com');
  assert.throws(() => configNube({ ...completo, NEXO_RESPALDO_CLAVE: 'corta' }), /32 bytes/);
});

// S3 falso: guarda por ruta, contesta HEAD/PUT/GET y la lista en XML. Rechaza
// todo pedido sin firma, como B2.
const objetos = new Map();
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!/^AWS4-HMAC-SHA256 Credential=id\//.test(req.headers.authorization ?? '')) {
    res.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>');
    return;
  }
  const partes = [];
  req.on('data', (p) => partes.push(p));
  req.on('end', () => {
    if (req.method === 'PUT') {
      objetos.set(url.pathname, Buffer.concat(partes));
      res.writeHead(200).end();
    } else if (url.searchParams.get('list-type') === '2') {
      const prefijo = `${url.pathname}/`;
      const items = [...objetos].filter(([k]) => k.startsWith(prefijo))
        .map(([k, v]) => `<Contents><Key>${k.slice(prefijo.length)}</Key><Size>${v.length}</Size><LastModified>2026-11-02T06:30:00.000Z</LastModified></Contents>`);
      res.writeHead(200, { 'content-type': 'application/xml' }).end(`<ListBucketResult><IsTruncated>false</IsTruncated>${items.join('')}</ListBucketResult>`);
    } else if (objetos.has(url.pathname)) {
      res.writeHead(200).end(req.method === 'HEAD' ? undefined : objetos.get(url.pathname));
    } else {
      res.writeHead(404).end();
    }
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
after(() => servidor.close());

const config = configNube({
  NEXO_B2_KEY_ID: 'id', NEXO_B2_APP_KEY: 'secreto', NEXO_B2_BUCKET: 'nexo-prueba',
  NEXO_B2_ENDPOINT: `http://127.0.0.1:${servidor.address().port}`, NEXO_RESPALDO_CLAVE: CLAVE.toString('base64')
});

test('sube un respaldo cifrado una sola vez, lo lista y lo baja igual', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexo-nube-'));
  try {
    const archivo = path.join(dir, 'nexo-20261102-063000.db');
    const datos = randomBytes(5000);
    writeFileSync(archivo, datos);

    const primera = await subirRespaldo(config, archivo);
    assert.equal(primera.subido, true);
    assert.equal(primera.nombre, 'nexo-20261102-063000.db.gz.enc');
    const guardado = objetos.get('/nexo-prueba/nexo-20261102-063000.db.gz.enc');
    assert.equal(guardado.includes(datos.subarray(0, 64)), false, 'en la nube no queda el contenido en claro');

    const segunda = await subirRespaldo(config, archivo);
    assert.equal(segunda.subido, false, 'la misma copia no se sube dos veces');

    const lista = await listarEnNube(config);
    assert.deepEqual(lista.map((r) => r.nombre), ['nexo-20261102-063000.db.gz.enc']);
    assert.deepEqual(await bajarRespaldo(config, lista[0].nombre), datos);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un rechazo del proveedor llega como error con su código', async () => {
  const sinFirma = { ...config, keyId: 'otra' };
  await assert.rejects(listarEnNube(sinFirma), /HTTP 403 AccessDenied/);
});
