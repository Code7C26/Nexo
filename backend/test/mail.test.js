// El mail de Nexo (backend/mail.js) sin salir a internet: la charla SMTP se
// prueba contra un servidor falso sin TLS, y el modo stub contra una carpeta
// temporal.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';

import { armarMensaje, conversarSmtp, esMailValido, mandarMail, plantillaMail, MailError } from '../mail.js';

// Servidor SMTP falso: contesta cada comando y guarda lo que recibe, separando
// los comandos de las líneas del cuerpo de DATA.
function servidorFalso({ authCodigo = 235 } = {}) {
  const recibido = [];
  const servidor = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 falso.test ESMTP\r\n');
    let buffer = '';
    let enDatos = false;
    socket.on('data', (trozo) => {
      buffer += trozo;
      let fin;
      while ((fin = buffer.indexOf('\r\n')) !== -1) {
        const linea = buffer.slice(0, fin);
        buffer = buffer.slice(fin + 2);
        if (enDatos) {
          if (linea === '.') {
            enDatos = false;
            socket.write('250 2.0.0 OK\r\n');
          } else {
            recibido.push({ datos: linea });
          }
          continue;
        }
        recibido.push({ comando: linea });
        if (linea.startsWith('EHLO')) socket.write('250-falso.test\r\n250-AUTH PLAIN\r\n250 SIZE 1000\r\n');
        else if (linea.startsWith('AUTH')) {
          socket.write(authCodigo === 235 ? '235 OK\r\n' : '535 5.7.8 Username and Password not accepted\r\n');
        } else if (linea.startsWith('MAIL') || linea.startsWith('RCPT')) socket.write('250 OK\r\n');
        else if (linea === 'DATA') {
          enDatos = true;
          socket.write('354 Go ahead\r\n');
        } else if (linea === 'QUIT') socket.end('221 Bye\r\n');
      }
    });
  });
  return new Promise((resolver) =>
    servidor.listen(0, '127.0.0.1', () => resolver({ servidor, puerto: servidor.address().port, recibido }))
  );
}

const conectar = (puerto) =>
  new Promise((resolver) => {
    const socket = net.connect(puerto, '127.0.0.1', () => resolver(socket));
  });

test('la charla SMTP se autentica, manda el mensaje y duplica los puntos al principio de línea', async () => {
  const { servidor, puerto, recibido } = await servidorFalso();
  try {
    const socket = await conectar(puerto);
    await conversarSmtp(socket, {
      usuario: 'nexo@ejemplo.com',
      clave: 'clave-de-prueba',
      de: 'nexo@ejemplo.com',
      para: 'ana@ejemplo.com',
      mensaje: 'Subject: hola\r\n\r\n.una línea con punto'
    });
    const comandos = recibido.filter((r) => r.comando).map((r) => r.comando);
    const auth = comandos.find((c) => c.startsWith('AUTH PLAIN '));
    assert.equal(Buffer.from(auth.slice(11), 'base64').toString(), '\0nexo@ejemplo.com\0clave-de-prueba');
    assert.ok(comandos.includes('MAIL FROM:<nexo@ejemplo.com>'));
    assert.ok(comandos.includes('RCPT TO:<ana@ejemplo.com>'));
    assert.ok(recibido.some((r) => r.datos === '..una línea con punto'), JSON.stringify(recibido));
  } finally {
    servidor.close();
  }
});

test('una clave rechazada da un error claro que no muestra la clave', async () => {
  const { servidor, puerto } = await servidorFalso({ authCodigo: 535 });
  try {
    const socket = await conectar(puerto);
    await assert.rejects(
      conversarSmtp(socket, {
        usuario: 'nexo@ejemplo.com',
        clave: 'secreta-123',
        de: 'nexo@ejemplo.com',
        para: 'a@b.com',
        mensaje: 'x'
      }),
      (err) =>
        err instanceof MailError && /rechazó el usuario o la clave/.test(err.message) && !err.message.includes('secreta-123')
    );
  } finally {
    servidor.close();
  }
});

test('el mensaje lleva el asunto con acentos y los dos cuerpos en base64', () => {
  const { texto, html } = plantillaMail({
    titulo: 'Verificá tu mail',
    parrafos: ['Hola <Ana>'],
    boton: { texto: 'Verificar', url: 'https://nexo.test/v?t=1&x=2' }
  });
  assert.ok(html.includes('Hola &lt;Ana&gt;'), 'el HTML escapa el texto');
  assert.ok(html.includes('https://nexo.test/v?t=1&amp;x=2'));
  assert.ok(texto.includes('Verificar: https://nexo.test/v?t=1&x=2'));

  const mensaje = armarMensaje({ de: 'nexo@ejemplo.com', para: 'ana@ejemplo.com', asunto: 'Verificá tu mail', texto, html });
  const asunto = mensaje.match(/^Subject: (.+)$/m)[1];
  const decodificado = [...asunto.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)]
    .map((m) => Buffer.from(m[1], 'base64').toString())
    .join('');
  assert.equal(decodificado, 'Verificá tu mail');
  assert.ok(mensaje.split('\r\n').every((linea) => linea.length <= 998));
  assert.ok(mensaje.includes('Content-Type: multipart/alternative'));
  assert.ok(mensaje.includes(Buffer.from(texto).toString('base64').slice(0, 60)));
});

test('un destinatario con saltos de línea o sin forma de mail se rechaza', () => {
  assert.ok(esMailValido('ana.perez+nexo@ejemplo.com.ar'));
  assert.ok(!esMailValido('ana@ejemplo.com\r\nBcc: otro@ejemplo.com'));
  assert.ok(!esMailValido('Ana <ana@ejemplo.com>'));
  assert.ok(!esMailValido('ana@ejemplo'));
  assert.ok(!esMailValido(''));
});

const carpeta = mkdtempSync(path.join(os.tmpdir(), 'nexo-mail-test-'));
after(() => rmSync(carpeta, { recursive: true, force: true }));

test('con NEXO_MAIL=stub el mail queda en la carpeta y no sale a la red', async () => {
  const antes = { modo: process.env.NEXO_MAIL, dir: process.env.NEXO_MAIL_DIR };
  process.env.NEXO_MAIL = 'stub';
  process.env.NEXO_MAIL_DIR = carpeta;
  try {
    await mandarMail({ para: 'ana@ejemplo.com', asunto: 'Hola', texto: 'Cuerpo' });
    const archivos = readdirSync(carpeta);
    assert.equal(archivos.length, 1);
    const guardado = JSON.parse(readFileSync(path.join(carpeta, archivos[0]), 'utf8'));
    assert.equal(guardado.para, 'ana@ejemplo.com');
    assert.equal(guardado.texto, 'Cuerpo');
    await assert.rejects(mandarMail({ para: 'ana@ejemplo.com', asunto: 'a\r\nBcc: x@y.com', texto: 'x' }), MailError);
  } finally {
    for (const [clave, valor] of [
      ['NEXO_MAIL', antes.modo],
      ['NEXO_MAIL_DIR', antes.dir]
    ]) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  }
});
