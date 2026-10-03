// Prova la pagina del TELEFONO in un finto browser, con un server vero e un altro giocatore simulato.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { creaServer } from '../src/app.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { GestoreStanze } from '../src/gestoreStanze.js';
import { apriPagina, aspetta, chiedi, chiudiTuttiIClient, nuovoClient } from './aiuti-browser.js';

const config = Object.freeze({ porta: 0, urlPubblico: '', maxStanze: 5, maxEventiAlSecondo: 100_000 });
let server;
let io;
let urlServer;
let browser;

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

describe('pagina del telefono', () => {
  it('guida un giocatore dalla scelta del personaggio alla fine della storia', async () => {
    // Il "computer" e un secondo giocatore sono simulati senza pagina.
    const schermo = await nuovoClient(urlServer);
    const { codice } = await chiedi(schermo, 'schermo:crea', { maxGiocatori: 2 });

    // Il mio telefono entra dal QR (link con il codice)
    browser = apriPagina({ urlServer, percorso: `/p?stanza=${codice}`, fileHtml: 'telefono.html' });
    const { document, window } = browser;
    await import('../public/js/telefono.js');

    const testo = () => document.body.textContent;

    await aspetta(() => testo().includes('Scegli il tuo personaggio'), 'schermata di creazione');
    assert.equal(document.querySelectorAll('.carta-classe').length, 4);
    assert.equal(document.querySelector('.scheda'), null, 'prima di scegliere non c\'è la scheda');
    assert.equal(document.querySelector('.barra-azione button').disabled, true);

    // Entra il secondo giocatore: ora la stanza è al completo
    const altro = await nuovoClient(urlServer);
    const ingressoAltro = await chiedi(altro, 'giocatore:entra', { codice });
    assert.equal(ingressoAltro.indice, 1);

    // Scelgo il Mago: compare la scheda con le statistiche
    const cartaMago = [...document.querySelectorAll('.carta-classe')].find((c) => c.textContent.includes('Mago'));
    cartaMago.click();
    await aspetta(() => document.querySelector('.scheda .classe-nome')?.textContent === 'Mago', 'scheda del mago');
    assert.equal(document.querySelector('.scheda .emblema').textContent, '🧙');
    assert.equal(document.querySelectorAll('.scheda .stat').length, 4);
    assert.match(document.querySelector('.scheda .equipaggiamento').textContent, /Bastone con pietra opaca/);
    assert.equal(document.querySelector('.barra-azione button').disabled, false);
    await aspetta(() => schermo.ultimoStato?.giocatori[0]?.classe === 'mago', 'il computer vede la classe scelta');

    // Scrivo un nome "cattivo": deve restare testo, mai diventare HTML
    const nome = '<img src=x onerror=alert(1)>Luca';
    const campoNome = document.querySelector('.scheda input');
    campoNome.value = nome;
    campoNome.dispatchEvent(new window.Event('input', { bubbles: true }));

    document.querySelector('.barra-azione button').click();
    await aspetta(() => testo().includes('Personaggio confermato'), 'conferma del personaggio');
    assert.equal(document.querySelector('.nome-giocatore').textContent, nome.slice(0, 20));
    assert.equal(document.querySelectorAll('img').length, 0, 'nessun elemento img creato dal nome');

    // Anche l'altro giocatore conferma: tutti pronti
    await chiedi(altro, 'giocatore:conferma', { classe: 'arciere', nome: 'Sara' });
    await aspetta(() => testo().includes('Tutti pronti'), 'tutti pronti');

    // Parte la storia
    await chiedi(schermo, 'schermo:avanti');
    await aspetta(() => testo().includes('Guarda lo schermo'), 'storia avviata');

    // Si arriva alla prima scelta: tocca a me (sono il primo)
    for (let i = 0; i < 20 && schermo.ultimoStato.vista?.tipo !== 'scelta'; i += 1) {
      await chiedi(schermo, 'schermo:avanti');
    }
    await aspetta(() => document.querySelector('.turno-tuo'), 'il mio turno');
    assert.match(document.querySelector('.turno-tuo .domanda').textContent, /Marta/);

    // "Invia" è spento finché non scrivo, e il testo non va perso se la pagina si aggiorna
    const bottoneInvia = document.querySelector('.turno-tuo .primario');
    const area = document.querySelector('.turno-tuo textarea');
    assert.equal(bottoneInvia.disabled, true);
    area.value = 'Vi aiuteremo volentieri';
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(bottoneInvia.disabled, false);
    assert.equal(document.querySelector('.turno-tuo .contatore').textContent, '23/200');

    bottoneInvia.click();
    await aspetta(() => testo().includes('Risposta inviata'), 'risposta inviata');
    assert.equal(schermo.ultimoStato.vista.turnoIndice, 1, 'ora tocca al secondo giocatore');

    // Risponde l'altro giocatore: si passa ai risultati
    await chiedi(altro, 'giocatore:scelta', { testo: 'Anche io' });
    await aspetta(() => schermo.ultimoStato.vista.tipo === 'risultato', 'risultati');
    assert.equal(schermo.ultimoStato.vista.testoScritto, 'Vi aiuteremo volentieri');
    await aspetta(() => testo().includes('Guarda lo schermo'), 'messaggio durante i risultati');

    // Si arriva alla seconda scelta: stavolta rispondere spetta a me, ma prima tocca a me (indice 0)
    for (let i = 0; i < 40 && !(schermo.ultimoStato.vista?.tipo === 'scelta'); i += 1) {
      await chiedi(schermo, 'schermo:avanti');
    }
    await aspetta(() => document.querySelector('.turno-tuo'), 'secondo turno mio');
    assert.equal(document.querySelector('.turno-tuo textarea').value, '', 'il campo riparte vuoto');

    // Finisco la storia
    for (let i = 0; i < 400 && schermo.ultimoStato.fase === 'storia'; i += 1) {
      const vista = schermo.ultimoStato.vista;
      if (vista.tipo === 'scelta') {
        if (vista.turnoIndice === 0) {
          await aspetta(() => document.querySelector('.turno-tuo textarea'), 'il campo di risposta');
          const area2 = document.querySelector('.turno-tuo textarea');
          area2.value = `risposta ${i}`;
          area2.dispatchEvent(new window.Event('input', { bubbles: true }));
          document.querySelector('.turno-tuo .primario').click();
          await aspetta(() => schermo.ultimoStato.vista.tipo !== 'scelta' || schermo.ultimoStato.vista.turnoIndice !== 0, 'turno passato');
        } else {
          await chiedi(altro, 'giocatore:scelta', { testo: 'ok' });
          await aspetta(() => schermo.ultimoStato.vista.tipo !== 'scelta', 'scelta chiusa');
        }
      } else {
        if (vista.tipo === 'combattimento') {
          // Nel combattimento il telefono diventa un controller (leva + 4 pulsanti); poi il computer salta lo scontro
          await aspetta(() => document.querySelector('.controller'), 'il controller del combattimento');
          assert.equal(document.querySelectorAll('.pulsante-azione').length, 4);
          assert.equal(document.querySelector('.zona-leva') !== null, true);
          await chiedi(schermo, 'schermo:salta');
          await aspetta(() => schermo.ultimoStato.vista.fase === 'vittoria', 'vittoria');
          await aspetta(() => /Vittoria/.test(document.querySelector('.velo')?.textContent ?? ''), 'messaggio di vittoria sul telefono');
        }
        await chiedi(schermo, 'schermo:avanti');
        if (vista.tipo === 'combattimento') {
          // Finito lo scontro il telefono torna alla schermata normale
          await aspetta(() => !document.querySelector('.controller') || schermo.ultimoStato.vista?.tipo === 'combattimento', 'uscita dal controller');
        }
      }
    }
    await aspetta(() => testo().includes('La storia è finita'), 'fine della storia');
    assert.equal(document.querySelector('.controller'), null);
    assert.equal(document.body.classList.contains('in-combattimento'), false);

    // Il computer chiude la partita: il telefono torna alla schermata del codice
    await chiedi(schermo, 'schermo:chiudi');
    await aspetta(() => testo().includes('il computer l\'ha chiusa'), 'avviso di partita chiusa');
    assert.ok(document.querySelector('input.codice-stanza'));

    altro.close();
    schermo.close();
  });
});
