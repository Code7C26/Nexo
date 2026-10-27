// Mail de Nexo (docs/investigacion-login-legal.md, sección 4): verificar la
// cuenta, recuperar la contraseña y avisos de seguridad.
//
// SMTP propio sobre node:tls en vez de una librería: son unos pocos comandos
// (EHLO, AUTH, MAIL, RCPT, DATA) y el proyecto evita sumar dependencias
// (CLAUDE.md, stack técnico). Solo TLS directo (puerto 465), que es lo que
// ofrecen Gmail, Brevo y Resend; no hay STARTTLS. Pasar a un servicio con
// dominio propio es cambiar las variables NEXO_SMTP_*, no este archivo.
//
// NEXO_MAIL=stub no manda nada: guarda cada mail como JSON en NEXO_MAIL_DIR
// (por defecto, una carpeta del temporal del sistema). Es lo que usan los
// tests, igual que NEXO_INTERPRETE=stub con el asistente.
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

export class MailError extends Error {}

const ESPERA_MS = 20_000;

// Las variables se leen en cada envío y no al importar: los tests las cambian
// en el mismo proceso.
function configuracion() {
  const usuario = process.env.NEXO_SMTP_USUARIO?.trim();
  // Google muestra la contraseña de aplicación en cuatro grupos: pegada con
  // los espacios, igual tiene que andar.
  const clave = process.env.NEXO_SMTP_CLAVE?.replace(/\s+/g, '');
  if (!usuario || !clave) return null;
  return {
    usuario,
    clave,
    servidor: process.env.NEXO_SMTP_SERVIDOR?.trim() || 'smtp.gmail.com',
    puerto: Number(process.env.NEXO_SMTP_PUERTO) || 465
  };
}

export function mailConfigurado() {
  return process.env.NEXO_MAIL === 'stub' || configuracion() !== null;
}

// Sin espacios ni caracteres que cierren un encabezado o una dirección: un
// "\r\nBcc:" metido en el mail sería mandar copias a cualquiera.
const MAIL_VALIDO = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\].]+$/;

export function esMailValido(mail) {
  return typeof mail === 'string' && mail.length <= 254 && MAIL_VALIDO.test(mail);
}

// Un encabezado con acentos va como "encoded-word" (RFC 2047), partido en
// trozos de caracteres enteros para no cortar una letra de UTF-8 al medio.
function encabezado(texto) {
  if (/^[\x20-\x7e]*$/.test(texto)) return texto;
  const trozos = [];
  let actual = '';
  for (const caracter of texto) {
    if (Buffer.byteLength(actual + caracter) > 45) {
      trozos.push(actual);
      actual = '';
    }
    actual += caracter;
  }
  trozos.push(actual);
  return trozos.map((t) => `=?UTF-8?B?${Buffer.from(t).toString('base64')}?=`).join('\r\n ');
}

// En base64 el cuerpo no tiene líneas largas ni empieza nunca con un punto.
function base64EnLineas(texto) {
  return Buffer.from(texto, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}

export function armarMensaje({ de, para, asunto, texto, html, fecha = new Date() }) {
  const encabezados = [
    `From: Nexo <${de}>`,
    `To: <${para}>`,
    `Subject: ${encabezado(asunto)}`,
    `Date: ${fecha.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${de.split('@')[1]}>`,
    'MIME-Version: 1.0'
  ];
  if (!html) {
    return [
      ...encabezados,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64EnLineas(texto)
    ].join('\r\n');
  }
  const limite = `nexo-${randomBytes(12).toString('hex')}`;
  const parte = (tipo, contenido) =>
    [`--${limite}`, `Content-Type: ${tipo}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64EnLineas(contenido)].join(
      '\r\n'
    );
  return [
    ...encabezados,
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    parte('text/plain', texto),
    parte('text/html', html),
    `--${limite}--`
  ].join('\r\n');
}

const escaparHtml = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// El cuerpo de todos los mails de Nexo: el texto plano y el HTML salen de los
// mismos datos. Estilos en línea (los clientes de mail ignoran los <style>) y
// sin imágenes, que muchos bloquean hasta que se las deja ver. `boton` es
// { texto, url }.
export function plantillaMail({ titulo, parrafos, boton, pie }) {
  const pieTexto = pie ?? 'Si no fuiste vos, podés ignorar este mail.';
  const texto = [
    titulo,
    '',
    ...parrafos.flatMap((p) => [p, '']),
    ...(boton ? [`${boton.texto}: ${boton.url}`, ''] : []),
    pieTexto,
    '',
    'Nexo'
  ].join('\n');
  const html = `<!DOCTYPE html><html lang="es-AR"><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
<div style="background:#000;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold;letter-spacing:.5px">Nexo</div>
<div style="padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escaparHtml(titulo)}</h1>
${parrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escaparHtml(p)}</p>`).join('\n')}
${
  boton
    ? `<p style="margin:20px 0"><a href="${escaparHtml(boton.url)}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${escaparHtml(boton.texto)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#555;word-break:break-all">Si el botón no anda, copiá este enlace: ${escaparHtml(boton.url)}</p>`
    : ''
}
<p style="margin:20px 0 0;font-size:13px;color:#555">${escaparHtml(pieTexto)}</p>
</div></div></body></html>`;
  return { texto, html };
}

// Lee las respuestas del servidor. Una respuesta puede ocupar varias líneas
// ("250-…") y termina en la que lleva un espacio después del código ("250 …").
function lectorSmtp(socket) {
  let buffer = '';
  let lineas = [];
  const listas = [];
  let esperando = null;
  let fallo = null;

  const entregar = () => {
    if (!esperando) return;
    if (listas.length) {
      esperando.resolver(listas.shift());
      esperando = null;
    } else if (fallo) {
      esperando.rechazar(fallo);
      esperando = null;
    }
  };

  socket.setEncoding('utf8');
  socket.on('data', (trozo) => {
    buffer += trozo;
    let fin;
    while ((fin = buffer.indexOf('\r\n')) !== -1) {
      const linea = buffer.slice(0, fin);
      buffer = buffer.slice(fin + 2);
      lineas.push(linea.slice(4));
      if (linea[3] !== '-') {
        listas.push({ codigo: Number(linea.slice(0, 3)), texto: lineas.join(' ') });
        lineas = [];
      }
    }
    entregar();
  });
  const cortar = (err) => {
    fallo ??=
      err instanceof MailError
        ? err
        : new MailError(`No se pudo hablar con el servidor de mail: ${err?.message ?? 'se cortó la conexión'}.`);
    entregar();
  };
  socket.on('error', cortar);
  socket.on('close', () => cortar(new MailError('El servidor de mail cortó la conexión.')));

  return () =>
    new Promise((resolver, rechazar) => {
      esperando = { resolver, rechazar };
      entregar();
    });
}

// La charla SMTP sobre un socket ya abierto. Separada de la conexión para que
// los tests la prueben contra un servidor falso sin TLS.
export async function conversarSmtp(socket, { usuario, clave, de, para, mensaje }) {
  socket.setTimeout(ESPERA_MS, () => socket.destroy(new MailError('El servidor de mail no respondió a tiempo.')));
  const leer = lectorSmtp(socket);

  const esperar = async (esperados, paso) => {
    const { codigo, texto } = await leer();
    if (!esperados.includes(codigo)) {
      // El texto del servidor nunca trae la clave: AUTH la manda en base64 y
      // la respuesta solo dice si la aceptó.
      if (paso === 'AUTH' && codigo === 535) {
        throw new MailError('El servidor de mail rechazó el usuario o la clave (NEXO_SMTP_USUARIO / NEXO_SMTP_CLAVE).');
      }
      throw new MailError(`El servidor de mail respondió ${codigo} en ${paso}: ${texto}`);
    }
  };
  const comando = async (linea, esperados, paso) => {
    socket.write(`${linea}\r\n`);
    await esperar(esperados, paso);
  };

  try {
    await esperar([220], 'el saludo');
    await comando(`EHLO ${os.hostname().replace(/[^a-zA-Z0-9.-]/g, '') || 'nexo'}`, [250], 'EHLO');
    await comando(`AUTH PLAIN ${Buffer.from(`\0${usuario}\0${clave}`).toString('base64')}`, [235], 'AUTH');
    await comando(`MAIL FROM:<${de}>`, [250], 'MAIL FROM');
    await comando(`RCPT TO:<${para}>`, [250, 251], 'RCPT TO');
    await comando('DATA', [354], 'DATA');
    // Una línea que empieza con punto se duplica (RFC 5321, 4.5.2): si no, el
    // servidor la tomaría como el fin del mensaje.
    await comando(`${mensaje.replace(/^\./gm, '..')}\r\n.`, [250], 'el envío');
    socket.end('QUIT\r\n');
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

function guardarStub({ para, asunto, texto, html }) {
  const carpeta = process.env.NEXO_MAIL_DIR || path.join(os.tmpdir(), 'nexo-mails');
  mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${Date.now()}-${randomBytes(4).toString('hex')}.json`);
  writeFileSync(
    archivo,
    JSON.stringify({ para, asunto, texto, html: html ?? null, fecha: new Date().toISOString() }, null, 2)
  );
  return archivo;
}

export async function mandarMail({ para, asunto, texto, html }) {
  if (!esMailValido(para)) throw new MailError('El mail del destinatario no es válido.');
  if (typeof asunto !== 'string' || /[\r\n]/.test(asunto)) throw new MailError('El asunto no es válido.');

  if (process.env.NEXO_MAIL === 'stub') {
    guardarStub({ para, asunto, texto, html });
    return;
  }
  const config = configuracion();
  if (!config) {
    throw new MailError('El mail de Nexo no está configurado: faltan NEXO_SMTP_USUARIO y NEXO_SMTP_CLAVE en .env.');
  }

  const mensaje = armarMensaje({ de: config.usuario, para, asunto, texto, html });
  const socket = tls.connect({ host: config.servidor, port: config.puerto, servername: config.servidor });
  await conversarSmtp(socket, { usuario: config.usuario, clave: config.clave, de: config.usuario, para, mensaje });
}
