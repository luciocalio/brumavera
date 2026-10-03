// Strumenti per i test delle pagine web: un "finto browser" (jsdom) collegato al server vero.
// (Questo file non contiene test: serve solo agli altri file.)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { io as creaClient } from 'socket.io-client';

const clientAperti = new Set();

/** Chiude ogni collegamento aperto dai test (altrimenti il processo non termina). */
export function chiudiTuttiIClient() {
  clientAperti.forEach((c) => c.close());
  clientAperti.clear();
}

const nuovaFinestraConsole = () => {
  const console = new VirtualConsole();
  // Qualsiasi errore JavaScript nella pagina deve far fallire il test.
  console.on('jsdomError', (errore) => assert.fail(`Errore nella pagina: ${errore.stack ?? errore.message}`));
  console.on('error', (...argomenti) => assert.fail(`console.error nella pagina: ${argomenti.join(' ')}`));
  return console;
};

/** Apre una pagina del gioco in un finto browser e prepara le variabili globali che la pagina si aspetta. */
export function apriPagina({ urlServer, percorso, fileHtml }) {
  const html = readFileSync(new URL(`../public/${fileHtml}`, import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: `${urlServer}${percorso}`,
    pretendToBeVisual: true,
    virtualConsole: nuovaFinestraConsole(),
  });
  const { window } = dom;

  const definisci = (nome, valore) => Object.defineProperty(globalThis, nome, { value: valore, configurable: true, writable: true });
  definisci('window', window);
  definisci('document', window.document);
  definisci('localStorage', window.localStorage);
  definisci('navigator', window.navigator);
  definisci('HTMLButtonElement', window.HTMLButtonElement);

  // Nel browser vero gli indirizzi come "/api/classi" sono relativi al sito: qui li completo.
  const fetchVero = globalThis.fetch;
  definisci('fetch', (indirizzo, opzioni) => fetchVero(new URL(indirizzo, urlServer), opzioni));

  // La pagina chiama window.io(): le do un client Socket.IO collegato al server.
  const clientDellaPagina = [];
  window.io = () => {
    const client = creaClient(urlServer, { transports: ['websocket'], forceNew: true });
    clientDellaPagina.push(client);
    clientAperti.add(client);
    return client;
  };

  return {
    window,
    document: window.document,
    clientDellaPagina,
    chiudi: () => clientDellaPagina.forEach((c) => c.close()),
  };
}

/** Un client Socket.IO "senza pagina": serve a simulare gli altri giocatori o il computer. */
export function nuovoClient(urlServer) {
  const client = creaClient(urlServer, { transports: ['websocket'], forceNew: true });
  clientAperti.add(client);
  client.ultimoStato = null;
  client.on('stato', (stato) => {
    client.ultimoStato = stato;
  });
  return new Promise((risolvi, rifiuta) => {
    client.once('connect', () => risolvi(client));
    client.once('connect_error', rifiuta);
  });
}

export const chiedi = (client, evento, dati) =>
  new Promise((risolvi) => {
    if (dati === undefined) client.emit(evento, risolvi);
    else client.emit(evento, dati, risolvi);
  });

export async function aspetta(condizione, descrizione, ms = 4000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (condizione()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  assert.fail(`Timeout in attesa di: ${descrizione}`);
}

export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
