// Simula una partita vera: 1 computer + 2 telefoni collegati al server tramite Socket.IO.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io as creaClient } from 'socket.io-client';
import { creaServer } from '../src/app.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { GestoreStanze } from '../src/gestoreStanze.js';

// Il test manda messaggi molto più in fretta di una persona: alzo il freno anti-spam.
const config = Object.freeze({ porta: 0, urlPubblico: '', maxStanze: 5, maxEventiAlSecondo: 100_000 });

let server;
let io;
let url;
const clientAperti = [];

/** Crea un client che ricorda sempre l'ultimo "stato" ricevuto. */
function nuovoClient() {
  const client = creaClient(url, { transports: ['websocket'], forceNew: true });
  client.ultimoStato = null;
  client.chiusa = false;
  client.on('stato', (stato) => {
    client.ultimoStato = stato;
  });
  client.on('stanza:chiusa', () => {
    client.chiusa = true;
  });
  clientAperti.push(client);
  return new Promise((risolvi, rifiuta) => {
    client.once('connect', () => risolvi(client));
    client.once('connect_error', rifiuta);
  });
}

const chiedi = (client, evento, dati) =>
  new Promise((risolvi) => {
    if (dati === undefined) client.emit(evento, risolvi);
    else client.emit(evento, dati, risolvi);
  });

async function aspetta(condizione, descrizione, ms = 2000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (condizione()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`Timeout in attesa di: ${descrizione}`);
}

before(async () => {
  const gestore = new GestoreStanze({
    storia,
    classi: CLASSI,
    maxStanze: config.maxStanze,
    inattivitaMassimaMs: 60_000,
  });
  ({ server, io } = creaServer({ gestore, config, ipLan: '192.168.1.20' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  clientAperti.forEach((c) => c.close());
  await new Promise((r) => io.close(r));
});

describe('pagine e API', () => {
  it('serve le pagine e i dati delle classi con le intestazioni di sicurezza', async () => {
    const home = await fetch(`${url}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');

    assert.equal((await fetch(`${url}/p`)).status, 200);
    assert.equal((await fetch(`${url}/healthz`)).status, 200);
    assert.equal((await fetch(`${url}/non-esiste`)).status, 404);

    const { classi } = await (await fetch(`${url}/api/classi`)).json();
    assert.deepEqual(Object.keys(classi), ['guerriero', 'scudiere', 'mago', 'arciere']);
  });
});

describe('una partita intera', () => {
  it('gioca dall\'inizio alla fine con un computer e due telefoni', async () => {
    // --- Il computer crea la stanza
    const schermo = await nuovoClient();
    const stanzaCreata = await chiedi(schermo, 'schermo:crea', { maxGiocatori: 2 });
    assert.equal(stanzaCreata.ok, true);
    assert.match(stanzaCreata.codice, /^[A-Z]{4}$/);
    assert.match(stanzaCreata.qr, /^data:image\/png;base64,/);
    assert.match(stanzaCreata.urlGiocatore, new RegExp(`^http://192\\.168\\.1\\.20:\\d+/p\\?stanza=${stanzaCreata.codice}$`));
    const { codice } = stanzaCreata;

    // --- Numero di giocatori non valido
    assert.equal((await chiedi(await nuovoClient(), 'schermo:crea', { maxGiocatori: 9 })).ok, false);

    // --- Codice sbagliato e codice giusto (scritto in minuscolo, con spazi)
    const telefono1 = await nuovoClient();
    assert.equal((await chiedi(telefono1, 'giocatore:entra', { codice: 'ZZZZ' })).ok, false);
    assert.equal((await chiedi(telefono1, 'giocatore:entra', { codice: 'a' })).ok, false);
    const ingresso1 = await chiedi(telefono1, 'giocatore:entra', { codice: ` ${codice.toLowerCase()} ` });
    assert.equal(ingresso1.ok, true);
    assert.equal(ingresso1.indice, 0);

    // Un doppio tocco su "Entra" non crea un secondo giocatore
    const doppio = await chiedi(telefono1, 'giocatore:entra', { codice });
    assert.equal(doppio.indice, 0);
    assert.equal(doppio.tokenGiocatore, ingresso1.tokenGiocatore);

    const telefono2 = await nuovoClient();
    const ingresso2 = await chiedi(telefono2, 'giocatore:entra', { codice });
    assert.equal(ingresso2.indice, 1);

    // Un terzo telefono trova la stanza piena
    const intruso = await nuovoClient();
    const rifiuto = await chiedi(intruso, 'giocatore:entra', { codice });
    assert.equal(rifiuto.ok, false);
    assert.match(rifiuto.errore, /completo/);

    await aspetta(() => schermo.ultimoStato?.fase === 'creazione', 'fase creazione sul computer');

    // --- Creazione dei personaggi
    assert.equal((await chiedi(telefono1, 'giocatore:conferma', { classe: 'nonesiste', nome: 'X' })).ok, false);
    assert.equal((await chiedi(telefono1, 'giocatore:scegliClasse', { classe: 'mago' })).ok, true);
    await aspetta(() => schermo.ultimoStato.giocatori[0].classe === 'mago', 'il computer vede la classe scelta');

    assert.equal((await chiedi(telefono1, 'giocatore:conferma', { classe: 'mago', nome: 'Luca' })).ok, true);
    assert.equal(schermo.ultimoStato.fase === 'pronto', false);
    assert.equal((await chiedi(telefono2, 'giocatore:conferma', { classe: 'arciere', nome: 'Sara' })).ok, true);
    await aspetta(() => schermo.ultimoStato.fase === 'pronto', 'fase pronto');

    // --- Un telefono NON può far avanzare la storia
    assert.equal((await chiedi(telefono1, 'schermo:avanti')).ok, false);

    // --- Un telefono si ricarica a metà e ritrova il suo posto
    telefono2.close();
    await aspetta(() => schermo.ultimoStato.giocatori[1].connesso === false, 'telefono 2 disconnesso');
    const telefono2Nuovo = await nuovoClient();
    const ripresa = await chiedi(telefono2Nuovo, 'giocatore:entra', { codice, tokenGiocatore: ingresso2.tokenGiocatore });
    assert.equal(ripresa.ok, true);
    assert.equal(ripresa.indice, 1);
    assert.equal(ripresa.stato.giocatori[1].nome, 'Sara');
    await aspetta(() => schermo.ultimoStato.giocatori[1].connesso === true, 'telefono 2 riconnesso');

    // --- Si parte
    assert.equal((await chiedi(schermo, 'schermo:avanti')).ok, true);
    assert.equal(schermo.ultimoStato.fase, 'storia');

    // --- Si percorre tutta la storia
    const telefoni = [telefono1, telefono2Nuovo];
    let scelteFatte = 0;
    for (let passo = 0; passo < 300 && schermo.ultimoStato.fase === 'storia'; passo += 1) {
      const vista = schermo.ultimoStato.vista;

      if (vista.tipo === 'scelta') {
        const fuoriTurno = telefoni[1 - vista.turnoIndice];
        assert.equal((await chiedi(fuoriTurno, 'giocatore:scelta', { testo: 'fuori turno' })).ok, false);
        assert.equal((await chiedi(schermo, 'schermo:avanti')).ok, false);

        const attesi = scelteFatte + 1;
        assert.equal((await chiedi(telefoni[vista.turnoIndice], 'giocatore:scelta', { testo: `<b>risposta</b> ${attesi}` })).ok, true);
        if (vista.turnoIndice === 1) scelteFatte += 1;
        await aspetta(
          () => schermo.ultimoStato.vista.tipo !== 'scelta' || schermo.ultimoStato.vista.turnoIndice !== vista.turnoIndice,
          'avanzamento del turno',
        );
      } else {
        const precedente = JSON.stringify(schermo.ultimoStato.vista);
        const esito = await chiedi(schermo, 'schermo:avanti');
        assert.equal(esito.ok, true, `avanti rifiutato: ${JSON.stringify({ esito, fase: schermo.ultimoStato.fase, vista })}`);
        await aspetta(
          () => schermo.ultimoStato.fase !== 'storia' || JSON.stringify(schermo.ultimoStato.vista) !== precedente,
          'cambio di pagina',
        );
      }
    }

    assert.equal(schermo.ultimoStato.fase, 'fine');
    assert.equal(scelteFatte, storia.filter((m) => m.tipo === 'scelta').length);

    // --- Il computer chiude la stanza, i telefoni vengono avvisati
    assert.equal((await chiedi(schermo, 'schermo:chiudi')).ok, true);
    await aspetta(() => telefono1.chiusa && telefono2Nuovo.chiusa, 'avviso di stanza chiusa');
    assert.equal((await chiedi(await nuovoClient(), 'giocatore:entra', { codice })).ok, false);
  });

  it('il computer ricaricato riprende la partita col suo token, uno falso no', async () => {
    const schermo = await nuovoClient();
    const { codice, tokenSchermo } = await chiedi(schermo, 'schermo:crea', { maxGiocatori: 1 });
    schermo.close();

    const falso = await chiedi(await nuovoClient(), 'schermo:riprendi', { codice, tokenSchermo: 'finto' });
    assert.equal(falso.ok, false);
    assert.equal(falso.sessioneScaduta, true);

    const nuovo = await nuovoClient();
    const ripreso = await chiedi(nuovo, 'schermo:riprendi', { codice, tokenSchermo });
    assert.equal(ripreso.ok, true);
    assert.equal(ripreso.stato.codice, codice);
    assert.match(ripreso.qr, /^data:image\/png/);
  });

  it('eventi senza risposta o con dati strani non fanno crollare il server', async () => {
    const client = await nuovoClient();
    client.emit('giocatore:scelta'); // niente dati, niente risposta
    client.emit('schermo:crea', 'testo-strano', () => {});
    client.emit('giocatore:entra', null, () => {});
    const esito = await chiedi(client, 'schermo:crea', { maxGiocatori: '2' }); // numero come testo
    assert.equal(esito.ok, false);
    const ancoraVivo = await fetch(`${url}/healthz`);
    assert.equal(ancoraVivo.status, 200);
  });
});
