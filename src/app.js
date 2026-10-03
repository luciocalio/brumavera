import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { registraSocket } from './socket.js';
import { CLASSI, STATISTICHE, VALORI_INIZIALI } from './dati/classi.js';

const cartellaPubblica = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Regole di sicurezza del browser: le pagine possono caricare solo risorse del proprio sito.
const POLITICA_CONTENUTI = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function intestazioniDiSicurezza(req, res, next) {
  res.setHeader('Content-Security-Policy', POLITICA_CONTENUTI);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

export function creaServer({ gestore, config, ipLan }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(intestazioniDiSicurezza);

  // Controllo "il server è vivo?" (lo usano anche i servizi di hosting)
  app.get('/healthz', (req, res) => res.json({ ok: true, stanze: gestore.quante }));

  // Dati delle classi: la fonte è un solo file (src/dati/classi.js)
  app.get('/api/classi', (req, res) => res.json({ classi: CLASSI, statistiche: STATISTICHE, valoriIniziali: VALORI_INIZIALI }));

  // Con "root" funziona anche se il progetto sta dentro una cartella che inizia con un punto.
  app.get('/', (req, res) => res.sendFile('schermo.html', { root: cartellaPubblica }));
  app.get('/p', (req, res) => res.sendFile('telefono.html', { root: cartellaPubblica }));

  app.use(
    express.static(cartellaPubblica, {
      index: false,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    }),
  );

  app.use((req, res) => res.status(404).type('text/plain; charset=utf-8').send('Pagina non trovata'));

  const server = createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 10_000 });
  registraSocket(io, { gestore, config, ipLan });

  return { app, server, io };
}
