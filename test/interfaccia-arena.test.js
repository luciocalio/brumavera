// La pagina del COMPUTER durante i combattimenti, in modalità prova: scritte, vita, schede dei giocatori.
// (La grafica 3D vera si prova in un browser vero: qui il finto browser non ha WebGL e si vede l'avviso.)

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { creaServer } from '../src/app.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { GestoreStanze } from '../src/gestoreStanze.js';
import { apriPagina, aspetta, chiedi, chiudiTuttiIClient, nuovoClient, pausa } from './aiuti-browser.js';

const config = Object.freeze({ porta: 0, urlPubblico: '', maxStanze: 5, maxEventiAlSecondo: 100_000, maxInputAlSecondo: 100_000 });
let server;
let io;
let urlServer;

before(async () => {
  const gestore = new GestoreStanze({ storia, classi: CLASSI, maxStanze: 5, inattivitaMassimaMs: 60_000, opzioniStanza: { contoSecondi: 0 } });
  ({ server, io } = creaServer({ gestore, config, ipLan: '192.168.1.20' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  urlServer = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  chiudiTuttiIClient();
  await new Promise((r) => io.close(r));
});

describe('arena sul computer (modalità prova)', () => {
  it('mostra attesa, schede dei giocatori con la vita, vittoria, e il tasto S salta lo scontro', async () => {
    const browser = apriPagina({ urlServer, percorso: '/', fileHtml: 'schermo.html' });
    const { document, window } = browser;
    window.HTMLCanvasElement.prototype.getContext = () => null; // il finto browser non sa disegnare: la mappa si salta
    await import('../public/js/schermo.js');
    const visibile = (id) => !document.getElementById(id).hidden;

    await aspetta(() => visibile('sc-giocatori'), 'scelta giocatori');
    assert.equal(document.getElementById('modo-prova').checked, false, 'la prova è spenta di default');
    document.getElementById('modo-prova').checked = true;
    document.querySelector('[data-n="3"]').click();
    await aspetta(() => visibile('sc-lobby'), 'lobby');
    const codice = document.getElementById('codice').textContent;

    const telefoni = [];
    for (let i = 0; i < 3; i += 1) {
      const t = await nuovoClient(urlServer);
      const ingresso = await chiedi(t, 'giocatore:entra', { codice });
      assert.equal(ingresso.ok, true);
      await chiedi(t, 'giocatore:conferma', { classe: 'guerriero', nome: `Eroe${i + 1}` });
      telefoni.push(t);
    }
    await aspetta(() => !document.getElementById('pronto').hidden, 'PRONTO');
    document.getElementById('pronto').click();

    // Si entra direttamente nel primo combattimento
    await aspetta(() => visibile('sc-arena'), 'arena');
    assert.equal(visibile('sc-storia'), false);
    assert.match(document.querySelector('.arena-msg-titolo').textContent, /Girate i telefoni/);
    assert.match(document.querySelector('.arena-msg-sotto').textContent, /Eroe1, Eroe2, Eroe3/);
    assert.equal(document.querySelectorAll('.hud-casella').length, 3);
    assert.equal(document.querySelector('.arena-suggerimento').hidden, true, 'il suggerimento "S" appare solo quando si combatte');
    // Il 3D non è disponibile nel finto browser: si deve vedere un avviso chiaro, non un errore
    await aspetta(() => !document.querySelector('.arena-avviso').hidden, 'avviso sulla grafica 3D');
    assert.match(document.querySelector('.arena-avviso').textContent, /WebGL/);

    // Man mano che i telefoni si girano la scritta si accorcia
    await chiedi(telefoni[0], 'giocatore:orizzontale', { orizzontale: true });
    await aspetta(() => !document.querySelector('.arena-msg-sotto').textContent.includes('Eroe1'), 'Eroe1 pronto');
    assert.match(document.querySelector('.arena-msg-sotto').textContent, /Eroe2, Eroe3/);
    await chiedi(telefoni[1], 'giocatore:orizzontale', { orizzontale: true });
    await chiedi(telefoni[2], 'giocatore:orizzontale', { orizzontale: true });

    // Si combatte: niente messaggio, schede con la vita, mappa per il quarto riquadro libero (3 giocatori)
    await aspetta(() => document.querySelector('.arena-messaggio').hidden, 'inizio scontro');
    await aspetta(() => document.querySelector('.hud-vita-testo')?.textContent === '10/10', 'vita piena');
    assert.equal(document.querySelector('.arena-suggerimento').hidden, false);
    assert.equal(document.querySelector('.arena-mappa').hidden, false);
    const nomi = [...document.querySelectorAll('.hud-nome')].map((n) => n.textContent);
    assert.deepEqual(nomi, ['Eroe1', 'Eroe2', 'Eroe3']);
    // Il nemico puntato (un lupo) si vede nella scheda del giocatore
    await aspetta(() => document.querySelector('.hud-bersaglio:not([hidden])'), 'indicatore del bersaglio');
    assert.match(document.querySelector('.hud-bersaglio-nome').textContent, /Lupo grigio/);

    // Posizione dei riquadri: 2x2 con il quarto libero
    const prima = document.querySelectorAll('.hud-casella')[0];
    assert.equal(prima.style.left, '0px');
    assert.equal(prima.style.top, '0px');
    assert.equal(prima.style.width, `${Math.floor(window.innerWidth / 2)}px`);

    // Un telefono che si scollega: la sua scheda lo dice
    telefoni[2].close();
    await aspetta(() => document.querySelectorAll('.hud-casella')[2].classList.contains('assente'), 'scheda scollegata');
    assert.match(document.querySelectorAll('.hud-stato')[2].textContent, /scollegato/);

    // S salta lo scontro (solo in prova)
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true }));
    await aspetta(() => /VITTORIA/.test(document.querySelector('.arena-msg-titolo').textContent), 'vittoria');

    // Spazio: si passa al secondo combattimento (Guardiano), poi di nuovo, fino alla fine
    document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    await aspetta(() => document.querySelector('.arena-msg-titolo').textContent !== 'VITTORIA!', 'secondo combattimento');
    await chiedi(telefoni[0], 'giocatore:orizzontale', { orizzontale: true });
    await chiedi(telefoni[1], 'giocatore:orizzontale', { orizzontale: true });
    await aspetta(() => document.querySelector('.arena-messaggio').hidden, 'inizio secondo scontro');
    await aspetta(() => /Guardiano/.test(document.querySelector('.hud-bersaglio-nome')?.textContent ?? ''), 'il Guardiano è il bersaglio');
    await pausa(PAUSA);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'S', bubbles: true }));
    await aspetta(() => /VITTORIA/.test(document.querySelector('.arena-msg-titolo').textContent), 'seconda vittoria');
    await pausa(PAUSA);
    document.getElementById('sc-arena').click();
    await aspetta(() => visibile('sc-fine'), 'fine');
    assert.equal(visibile('sc-arena'), false);
  });

  it('senza la prova, il tasto S non salta nulla', async () => {
    const browser = apriPagina({ urlServer, percorso: '/', fileHtml: 'schermo.html' });
    const { document, window } = browser;
    window.HTMLCanvasElement.prototype.getContext = () => null;
    await import('../public/js/schermo.js?seconda');
    const visibile = (id) => !document.getElementById(id).hidden;
    await aspetta(() => visibile('sc-giocatori'), 'scelta giocatori');
    document.querySelector('[data-n="1"]').click();
    await aspetta(() => visibile('sc-lobby'), 'lobby');
    const t = await nuovoClient(urlServer);
    await chiedi(t, 'giocatore:entra', { codice: document.getElementById('codice').textContent });
    await chiedi(t, 'giocatore:conferma', { classe: 'arciere', nome: 'Solo' });
    await aspetta(() => !document.getElementById('pronto').hidden, 'PRONTO');
    document.getElementById('pronto').click();
    await aspetta(() => visibile('sc-storia'), 'la storia normale parte dalle pagine, non dal combattimento');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true }));
    await pausa(100);
    assert.equal(visibile('sc-storia'), true);
  });
});

const PAUSA = 330;
