// Copia de los respaldos fuera del servidor (CLAUDE.md §35; decidido el 1 de
// noviembre de 2026, ver handoff.md "Servidor y respaldos").
//
// db/respaldo.js deja las copias en el mismo disco que la base: si se pierde
// la VM, se pierden las dos. Este módulo sube la última a un almacenamiento
// compatible con S3 de otro proveedor (Backblaze B2), para que un problema con
// Oracle no se lleve también los respaldos.
//
// La copia sale comprimida y cifrada con AES-256-GCM, con una clave que vive
// solo en el servidor y en el gestor de contraseñas del dueño: el proveedor
// guarda bytes que no puede leer, y GCM detecta cualquier archivo alterado o
// cortado al descifrarlo. Sin esa clave los respaldos de la nube no sirven.
//
// Sin dependencias: la firma de los pedidos (AWS Signature V4, la que usa S3 y
// acepta B2) se arma con node:crypto, y los pedidos van con fetch.
//
// La nube no se rota desde acá: la regla de ciclo de vida del bucket oculta y
// borra los archivos viejos (docs/publicar.md, "Respaldos"). Así este código
// nunca borra nada de la nube.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MAGICO = Buffer.from('NXR1');
const LARGO_IV = 12;
const LARGO_TAG = 16;
const SUFIJO = '.gz.enc';
const VARIABLES = ['NEXO_B2_KEY_ID', 'NEXO_B2_APP_KEY', 'NEXO_B2_BUCKET', 'NEXO_B2_ENDPOINT', 'NEXO_RESPALDO_CLAVE'];

export class NubeError extends Error {}

// null si no hay nada configurado (la nube es opcional, como el mail). Si hay
// algo pero falta otra parte, es un error: una configuración a medias no puede
// pasar por "sin nube" y dejar al negocio creyendo que tiene copia afuera.
export function configNube(env = process.env) {
  const valores = Object.fromEntries(VARIABLES.map((v) => [v, (env[v] ?? '').trim()]));
  const faltan = VARIABLES.filter((v) => !valores[v]);
  if (faltan.length === VARIABLES.length) return null;
  if (faltan.length) throw new NubeError(`Falta configurar ${faltan.join(', ')} para el respaldo en la nube.`);

  const clave = Buffer.from(valores.NEXO_RESPALDO_CLAVE, 'base64');
  if (clave.length !== 32) {
    throw new NubeError('NEXO_RESPALDO_CLAVE tiene que ser 32 bytes en base64 (se genera con `openssl rand -base64 32`).');
  }

  // El endpoint va sin protocolo (como lo muestra Backblaze) y sale por HTTPS.
  // Con http:// explícito es un servidor de prueba local (los tests).
  const endpoint = valores.NEXO_B2_ENDPOINT.replace(/\/+$/, '');
  const base = /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;
  // La región de la firma es la del endpoint: s3.<región>.backblazeb2.com.
  const region = /^s3\.([^.]+)\./.exec(new URL(base).hostname)?.[1] ?? 'us-east-1';

  return {
    keyId: valores.NEXO_B2_KEY_ID,
    secreto: valores.NEXO_B2_APP_KEY,
    bucket: valores.NEXO_B2_BUCKET,
    base,
    region,
    clave
  };
}

// Formato: "NXR1" + IV (12) + tag de GCM (16) + datos comprimidos y cifrados.
// El encabezado entra como dato autenticado: cambiarlo también se detecta.
export function cifrarRespaldo(datos, clave) {
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv('aes-256-gcm', clave, iv);
  cifrador.setAAD(MAGICO);
  const cifrado = Buffer.concat([cifrador.update(gzipSync(datos)), cifrador.final()]);
  return Buffer.concat([MAGICO, iv, cifrador.getAuthTag(), cifrado]);
}

export function descifrarRespaldo(archivo, clave) {
  if (archivo.length < MAGICO.length + LARGO_IV + LARGO_TAG || !archivo.subarray(0, MAGICO.length).equals(MAGICO)) {
    throw new NubeError('El archivo no es un respaldo cifrado de Nexo.');
  }
  const iv = archivo.subarray(MAGICO.length, MAGICO.length + LARGO_IV);
  const tag = archivo.subarray(MAGICO.length + LARGO_IV, MAGICO.length + LARGO_IV + LARGO_TAG);
  const descifrador = createDecipheriv('aes-256-gcm', clave, iv);
  descifrador.setAAD(MAGICO);
  descifrador.setAuthTag(tag);
  try {
    const comprimido = Buffer.concat([descifrador.update(archivo.subarray(MAGICO.length + LARGO_IV + LARGO_TAG)), descifrador.final()]);
    return gunzipSync(comprimido);
  } catch {
    throw new NubeError('No se pudo descifrar el respaldo: la clave no es la misma con la que se cifró, o el archivo está dañado.');
  }
}

const sha256 = (datos) => createHash('sha256').update(datos).digest('hex');
const hmac = (clave, texto) => createHmac('sha256', clave).update(texto).digest();
const fechaAmz = (fecha) => fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// encodeURIComponent deja sin codificar !'()*, que SigV4 sí codifica.
const codificar = (texto) => encodeURIComponent(texto).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const rutaCodificada = (ruta) => ruta.split('/').map(codificar).join('/');
const queryCodificada = (query) => Object.keys(query).sort().map((k) => `${codificar(k)}=${codificar(query[k])}`).join('&');

// AWS Signature V4. `headers` son los que se firman (en minúscula, host
// incluido); devuelve el valor del header Authorization. Se exporta para
// probarlo contra el ejemplo publicado por AWS.
export function firmarPedido({ metodo, ruta, query = {}, headers, hashCuerpo, region, keyId, secreto, fecha }) {
  const amzFecha = fechaAmz(fecha);
  const dia = amzFecha.slice(0, 8);
  const nombres = Object.keys(headers).sort();
  const canonico = [
    metodo,
    rutaCodificada(ruta),
    queryCodificada(query),
    nombres.map((n) => `${n}:${String(headers[n]).trim()}\n`).join(''),
    nombres.join(';'),
    hashCuerpo
  ].join('\n');
  const alcance = `${dia}/${region}/s3/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', amzFecha, alcance, sha256(canonico)].join('\n');
  const claveFirma = hmac(hmac(hmac(hmac(`AWS4${secreto}`, dia), region), 's3'), 'aws4_request');
  const firma = createHmac('sha256', claveFirma).update(aFirmar).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${keyId}/${alcance}, SignedHeaders=${nombres.join(';')}, Signature=${firma}`;
}

// Un pedido al bucket, en estilo de ruta (endpoint/bucket/objeto), que B2
// acepta y no depende de DNS por bucket.
async function pedido(config, { metodo, objeto = '', query = {}, cuerpo }) {
  const url = new URL(config.base);
  const ruta = `/${config.bucket}${objeto ? `/${objeto}` : ''}`;
  const fecha = new Date();
  const hashCuerpo = sha256(cuerpo ?? '');
  const headers = { host: url.host, 'x-amz-content-sha256': hashCuerpo, 'x-amz-date': fechaAmz(fecha) };
  const authorization = firmarPedido({ metodo, ruta, query, headers, hashCuerpo, region: config.region, keyId: config.keyId, secreto: config.secreto, fecha });
  const qs = queryCodificada(query);
  try {
    // host no se manda: fetch pone el mismo valor que se firmó.
    return await fetch(`${url.origin}${rutaCodificada(ruta)}${qs ? `?${qs}` : ''}`, {
      method: metodo,
      headers: { 'x-amz-content-sha256': headers['x-amz-content-sha256'], 'x-amz-date': headers['x-amz-date'], authorization },
      body: cuerpo,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (err) {
    throw new NubeError(`No se pudo conectar con ${url.host}: ${err.cause?.message ?? err.message}`);
  }
}

async function fallo(respuesta, que) {
  const texto = await respuesta.text().catch(() => '');
  const codigo = /<Code>([^<]+)<\/Code>/.exec(texto)?.[1];
  const mensaje = /<Message>([^<]+)<\/Message>/.exec(texto)?.[1];
  return new NubeError(`${que}: HTTP ${respuesta.status}${codigo ? ` ${codigo}` : ''}${mensaje ? ` (${mensaje})` : ''}`);
}

export const nombreEnNube = (archivoLocal) => `${path.basename(archivoLocal)}${SUFIJO}`;

export async function existeEnNube(config, nombre) {
  const r = await pedido(config, { metodo: 'HEAD', objeto: nombre });
  if (r.status === 404) return false;
  if (!r.ok) throw await fallo(r, `No se pudo consultar ${nombre}`);
  return true;
}

// Sube un respaldo local, si todavía no está. Idempotente: correrlo de nuevo
// (el timer de mañana sin cambios en la base) no sube otra copia, y un intento
// que falló se reintenta solo en la próxima corrida.
export async function subirRespaldo(config, archivoLocal) {
  const nombre = nombreEnNube(archivoLocal);
  if (await existeEnNube(config, nombre)) return { subido: false, nombre };
  const cuerpo = cifrarRespaldo(readFileSync(archivoLocal), config.clave);
  const r = await pedido(config, { metodo: 'PUT', objeto: nombre, cuerpo });
  if (!r.ok) throw await fallo(r, `No se pudo subir ${nombre}`);
  return { subido: true, nombre, bytes: cuerpo.length };
}

// Los respaldos que hay en la nube, del más viejo al más nuevo (el nombre
// lleva la fecha en UTC, así que ordenar por nombre es ordenar por fecha).
export async function listarEnNube(config) {
  const lista = [];
  let token;
  do {
    const query = { 'list-type': '2', prefix: 'nexo-' };
    if (token) query['continuation-token'] = token;
    const r = await pedido(config, { metodo: 'GET', query });
    if (!r.ok) throw await fallo(r, 'No se pudo listar el bucket');
    const xml = await r.text();
    for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const nombre = /<Key>([^<]+)<\/Key>/.exec(item)?.[1];
      if (!nombre?.endsWith(SUFIJO)) continue;
      lista.push({
        nombre,
        bytes: Number(/<Size>(\d+)<\/Size>/.exec(item)?.[1] ?? 0),
        fecha: /<LastModified>([^<]+)<\/LastModified>/.exec(item)?.[1]
      });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] : undefined;
  } while (token);
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Baja un respaldo y lo devuelve descifrado: los bytes de la base SQLite.
export async function bajarRespaldo(config, nombre) {
  const r = await pedido(config, { metodo: 'GET', objeto: nombre });
  if (!r.ok) throw await fallo(r, `No se pudo bajar ${nombre}`);
  return descifrarRespaldo(Buffer.from(await r.arrayBuffer()), config.clave);
}
