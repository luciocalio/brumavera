// Prova la pagina del COMPUTER in un finto browser, con un server vero e due telefoni simulati.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { creaServer } from '../src/app.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { GestoreStanze } from '../src/gestoreStanze.js';
import { apriPagina, aspetta, chiedi, chiudiTuttiIClient, nuovoClient, pausa } from './aiuti-browser.js';

const config = Object.freeze({ porta: 0, urlPubblico: '', maxStanze: 5, maxEventiAlSecondo: 100_000 });
const PAUSA_TRA_CLICK_MS = 330; // la pagina ignora due "avanti" troppo ravvicinati (giustamente)

let server;
let io;
let urlServer;

before(async () => {
  const gestore = new GestoreStanze({ storia, classi: CLASSI, maxStanze: 5, inattivitaMassimaMs: 60_000 });
  ({ server, io } = creaServer({ gestore, config, ipLan: '192.168.1.20' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  urlServer = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  chiudiTuttiIClient();
  await new Promise((r) => io.close(r));
});

describe('pagina del computer', () => {
  it('conduce una partita intera: giocatori, QR, personaggi, storia, scelte e fine', async () => {
    const browser = apriPagina({ urlServer, percorso: '/', fileHtml: 'schermo.html' });
    const { document, window } = browser;
    await import('../public/js/schermo.js');

    const visibile = (id) => !document.getElementById(id).hidden;
    const testoStoria = () => document.getElementById('contenuto-storia').textContent;
    const clickStoria = async () => {
      document.getElementById('sc-storia').click();
      await pausa(PAUSA_TRA_CLICK_MS);
    };

    // A. Scelta del numero di giocatori
    await aspetta(() => visibile('sc-giocatori'), 'schermata di scelta giocatori');
    assert.equal(document.querySelectorAll('[data-n]').length, 4);
    document.querySelector('[data-n="2"]').click();

    // B. Sala d'attesa con QR e codice
    await aspetta(() => visibile('sc-lobby'), 'sala d\'attesa');
    const codice = document.getElementById('codice').textContent;
    assert.match(codice, /^[A-Z]{4}$/);
    assert.match(document.getElementById('qr').src, /^data:image\/png;base64,/);
    assert.match(document.getElementById('indirizzo').textContent, /^192\.168\.1\.20:\d+\/p$/);
    assert.equal(document.querySelectorAll('#slot-lobby li').length, 2);
    assert.match(document.getElementById('slot-lobby').textContent, /in attesa/);

    // Entrano due telefoni (simulati)
    const telefoni = [await nuovoClient(urlServer), await nuovoClient(urlServer)];
    for (const telefono of telefoni) {
      assert.equal((await chiedi(telefono, 'giocatore:entra', { codice })).ok, true);
    }

    // C. Creazione personaggi
    await aspetta(() => visibile('sc-creazione'), 'schermata di creazione');
    assert.equal(document.getElementById('pronto').hidden, true, 'PRONTO non deve vedersi ancora');
    assert.match(document.getElementById('slot-creazione').textContent, /sta scegliendo/);

    await chiedi(telefoni[0], 'giocatore:scegliClasse', { classe: 'mago' });
    await aspetta(() => document.getElementById('slot-creazione').textContent.includes('Mago (sta decidendo)'), 'classe scelta visibile');

    await chiedi(telefoni[0], 'giocatore:conferma', { classe: 'mago', nome: '<b>Luca</b>' });
    assert.equal(document.getElementById('pronto').hidden, true, 'PRONTO aspetta anche il secondo giocatore');
    await chiedi(telefoni[1], 'giocatore:conferma', { classe: 'scudiere', nome: 'Sara' });

    // D. PRONTO
    await aspetta(() => !document.getElementById('pronto').hidden, 'pulsante PRONTO');
    assert.equal(document.querySelectorAll('#slot-creazione b').length, 0, 'il nome non diventa HTML');
    assert.match(document.getElementById('slot-creazione').textContent, /<b>Luca<\/b>/);
    assert.match(document.getElementById('slot-creazione').textContent, /Scudiere ✓/);
    document.getElementById('pronto').click();

    // E. Prima pagina di sottotitoli
    await aspetta(() => visibile('sc-storia'), 'inizio della storia');
    await aspetta(() => testoStoria() === storia[0].testo, 'prima pagina');
    assert.equal(document.getElementById('barra-scelta').hidden, true);
    assert.equal(document.getElementById('suggerimento').hidden, false);

    // Il tasto Spazio fa avanzare; il tasto tenuto premuto (repeat) no
    await pausa(PAUSA_TRA_CLICK_MS);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    await pausa(100);
    assert.equal(testoStoria(), storia[0].testo, 'il tasto ripetuto è ignorato');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    await aspetta(() => testoStoria() === storia[1].testo, 'avanzamento con Spazio');

    // Click fino alla prima scelta
    for (let i = 0; i < 20 && document.getElementById('barra-scelta').hidden; i += 1) await clickStoria();

    // F. Scelta: barra in basso, turno del primo collegato, e il click non salta la scelta
    assert.equal(document.getElementById('barra-scelta').hidden, false);
    assert.match(document.getElementById('barra-scelta').textContent, /Fate la vostra scelta/);
    assert.equal(document.getElementById('turno').textContent, 'Tocca a: <b>Luca</b>');
    assert.match(testoStoria(), /Cosa rispondete a Marta\?/);
    assert.equal(document.getElementById('suggerimento').hidden, true);
    await clickStoria();
    assert.equal(document.getElementById('barra-scelta').hidden, false, 'durante la scelta il click non avanza');

    await chiedi(telefoni[0], 'giocatore:scelta', { testo: '<img src=x onerror=alert(1)>aiutiamo' });
    await aspetta(() => document.getElementById('turno').textContent === 'Tocca a: Sara', 'turno del secondo giocatore');
    await chiedi(telefoni[1], 'giocatore:scelta', { testo: 'volentieri' });

    // Risultati: uno per giocatore, scelto in base alla classe
    await aspetta(() => document.getElementById('barra-scelta').hidden, 'fine della raccolta scelte');
    assert.match(testoStoria(), /scrive/);
    assert.match(testoStoria(), /<img src=x onerror=alert\(1\)>aiutiamo/);
    assert.equal(document.querySelectorAll('#contenuto-storia img').length, 0, 'la risposta non diventa HTML');
    assert.match(testoStoria(), /Marta ti porge un bastone/);
    await clickStoria();
    assert.match(testoStoria(), /Sara/);
    assert.match(testoStoria(), /Marta ti porge uno scudo/);
    await clickStoria();
    assert.equal(testoStoria(), storia[storia.findIndex((m) => m.tipo === 'scelta') + 1].testo);

    // Se il computer perde la connessione e la riprende, ritrova la stessa pagina
    const paginaPrima = testoStoria();
    const [clientSchermo] = browser.clientDellaPagina;
    clientSchermo.disconnect();
    await aspetta(() => !document.getElementById('banner').hidden, 'avviso di connessione persa');
    clientSchermo.connect();
    await aspetta(() => document.getElementById('banner').hidden, 'avviso sparito');
    await aspetta(() => visibile('sc-storia') && testoStoria() === paginaPrima, 'storia ripresa nello stesso punto');

    // G + resto della storia: i due combattimenti vanno vinti (qui il computer li salta) e poi si prosegue
    let combattimentiVisti = 0;
    for (let i = 0; i < 200 && !visibile('sc-fine'); i += 1) {
      const vista = telefoni[0].ultimoStato.vista;
      if (vista?.tipo === 'scelta') {
        await chiedi(telefoni[vista.turnoIndice], 'giocatore:scelta', { testo: 'ok' });
        await pausa(60);
      } else if (vista?.tipo === 'combattimento') {
        combattimentiVisti += 1;
        await aspetta(() => visibile('sc-arena'), 'arena');
        assert.equal(visibile('sc-storia'), false);
        assert.match(document.querySelector('.arena-msg-titolo').textContent, /Girate i telefoni/);
        assert.match(document.querySelector('.arena-msg-sotto').textContent, /Luca|<b>Luca<\/b>/);
        // Un click durante lo scontro non salta nulla
        document.getElementById('sc-arena').click();
        await pausa(PAUSA_TRA_CLICK_MS);
        assert.equal(telefoni[0].ultimoStato.vista.tipo, 'combattimento');
        assert.ok((await chiedi(clientSchermo, 'schermo:salta')).ok);
        await aspetta(() => /VITTORIA/.test(document.querySelector('.arena-msg-titolo').textContent), 'vittoria');
        document.getElementById('sc-arena').click();
        await pausa(PAUSA_TRA_CLICK_MS);
        await aspetta(() => !telefoni[0].ultimoStato.vista || telefoni[0].ultimoStato.vista.tipo !== 'combattimento' || telefoni[0].ultimoStato.vista.titolo !== vista.titolo, 'fine del combattimento');
      } else {
        await clickStoria();
      }
    }
    assert.equal(combattimentiVisti, 2);

    // H. Fine e "Gioca di nuovo"
    assert.equal(visibile('sc-fine'), true);
    assert.match(document.getElementById('sc-fine').textContent, /FINE/);
    document.getElementById('rigioca').click();
    await aspetta(() => visibile('sc-giocatori'), 'ritorno alla scelta giocatori');
    assert.equal(window.localStorage.getItem('brumavera:schermo'), null);
  });
});
