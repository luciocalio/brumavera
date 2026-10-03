// La leva e i pulsanti del telefono (senza server: un finto socket registra cosa verrebbe mandato).
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { apriPagina } from './aiuti-browser.js';
import { ZONA_MORTA, PULSANTI, calcolaLeva, creaController, testoVelo } from '../public/js/controller.js';

describe('calcolaLeva', () => {
  it('dito fermo o dentro la zona morta: il personaggio sta fermo', () => {
    assert.deepEqual(calcolaLeva(0, 0, 60).x, 0);
    const piccolo = calcolaLeva(3, -2, 60);
    assert.equal(piccolo.x, 0);
    assert.equal(piccolo.z, 0);
    assert.equal(Object.is(piccolo.z, -0), false);
  });

  it('su = avanti (z positivo), destra = x positivo; giù e sinistra al contrario', () => {
    const su = calcolaLeva(0, -60, 60);
    assert.equal(su.z, 1);
    assert.equal(su.x, 0);
    assert.equal(calcolaLeva(60, 0, 60).x, 1);
    assert.equal(calcolaLeva(-60, 0, 60).x, -1);
    assert.equal(calcolaLeva(0, 60, 60).z, -1);
  });

  it('oltre il bordo la forza resta 1 e il pomello non esce dalla leva', () => {
    const r = calcolaLeva(300, -400, 60);
    assert.ok(Math.hypot(r.x, r.z) <= 1.0001);
    assert.ok(Math.abs(Math.hypot(r.pomello.x, r.pomello.y) - 60) < 1e-9);
  });

  it('dopo la zona morta la spinta riparte da zero (nessuno scatto)', () => {
    const appena = calcolaLeva(0, -(ZONA_MORTA * 60 + 0.5), 60);
    assert.ok(appena.z > 0 && appena.z < 0.05);
    const meta = calcolaLeva(0, -30, 60);
    assert.ok(meta.z > 0.3 && meta.z < 0.5);
  });

  it('valori assurdi non producono NaN', () => {
    for (const r of [calcolaLeva(NaN, 1, 60), calcolaLeva(1, 1, 0), calcolaLeva(Infinity, 0, 60)]) {
      assert.ok(Number.isFinite(r.x) && Number.isFinite(r.z));
    }
  });
});

describe('pulsanti a rombo', () => {
  it('ci sono quattro pulsanti nelle quattro posizioni del rombo, con le azioni giuste', () => {
    assert.deepEqual(PULSANTI.map((p) => p.posizione).sort(), ['destra', 'giu', 'sinistra', 'su']);
    assert.deepEqual(PULSANTI.map((p) => p.tipo).sort(), ['bersaglio', 'colpo', 'colpoForte', 'schivata']);
  });
});

describe('testoVelo', () => {
  it('in verticale chiede di girare il telefono, qualunque sia lo stato', () => {
    for (const fase of ['attesa', 'conto', 'in_corso', 'vittoria']) {
      assert.match(testoVelo({ orizzontale: false, vista: { fase }, io: null }).titolo, /Gira/);
    }
  });
  it('si combatte senza veli, ma a terra o a fine scontro sì', () => {
    assert.equal(testoVelo({ orizzontale: true, vista: { fase: 'in_corso' }, io: { s: 'libero' } }), null);
    assert.match(testoVelo({ orizzontale: true, vista: { fase: 'in_corso' }, io: { s: 'ko' } }).titolo, /terra/);
    assert.match(testoVelo({ orizzontale: true, vista: { fase: 'vittoria' } }).titolo, /Vittoria/);
    assert.match(testoVelo({ orizzontale: true, vista: { fase: 'sconfitta' } }).titolo, /Sconfitti/);
    assert.match(testoVelo({ orizzontale: true, vista: { fase: 'attesa' } }).titolo, /Aspettiamo/);
  });
  it('durante il conto mostra il numero', () => {
    assert.equal(testoVelo({ orizzontale: true, vista: { fase: 'conto' }, io: { c: 3 } }).titolo, '3');
  });
});

// ---------------------------------------------------------------- il controller vero, in un finto browser

function finto() {
  const chiamate = [];
  const socket = {
    emit: (...a) => { chiamate.push(['emit', ...a]); a.at(-1)?.call?.(null, { ok: true }); },
    volatile: { emit: (...a) => chiamate.push(['volatile', ...a]) },
  };
  return { socket, chiamate };
}

function pagina() {
  const browser = apriPagina({ urlServer: 'http://127.0.0.1:1', percorso: '/p', fileHtml: 'telefono.html' });
  browser.window.innerWidth = 844;
  browser.window.innerHeight = 390;
  return browser;
}

function puntatore(window, tipo, bersaglio, { id = 1, x = 0, y = 0 } = {}) {
  const evento = new window.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(evento, 'pointerId', { value: id });
  bersaglio.dispatchEvent(evento);
  return evento;
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

describe('controller del telefono', () => {
  let attivo = null;
  afterEach(() => {
    attivo?.distruggi();
    attivo = null;
  });

  function monta(opzioni = {}) {
    const browser = pagina();
    const { socket, chiamate } = finto();
    const radice = browser.document.getElementById('app');
    attivo = creaController({ socket, radice, nomeGiocatore: 'Luca', indice: 0, ...opzioni });
    return { ...browser, socket, chiamate, radice, controller: attivo };
  }

  it('si costruisce con leva a sinistra e 4 pulsanti e dice subito che il telefono è in orizzontale', () => {
    const { document, chiamate } = monta();
    assert.ok(document.querySelector('.zona-leva'));
    assert.equal(document.querySelectorAll('.pulsante-azione').length, 4);
    assert.equal(document.body.classList.contains('in-combattimento'), true);
    assert.deepEqual(chiamate.find((c) => c[1] === 'giocatore:orizzontale').slice(1, 3), ['giocatore:orizzontale', { orizzontale: true }]);
    assert.equal(document.querySelector('.chi-sono').textContent, 'Luca');
  });

  it('la leva manda il comando mentre il dito è appoggiato e lo azzera appena lo si solleva', async () => {
    const { window, document, chiamate } = monta();
    const leva = document.querySelector('.zona-leva');
    puntatore(window, 'pointerdown', leva, { x: 100, y: 200 });
    puntatore(window, 'pointermove', leva, { x: 100, y: 130 }); // 70 px in su (oltre il raggio della leva) = tutto avanti
    const input = () => chiamate.filter((c) => c[0] === 'volatile' && c[1] === 'giocatore:input').map((c) => c[2]);
    await pausa(70); // la leva si manda 20 volte al secondo
    assert.deepEqual(input().at(-1), { x: 0, z: 1 });
    assert.ok(leva.classList.contains('attiva'));

    // Mentre il dito resta fermo il comando viene ripetuto (serve al server come "sono ancora qui")
    const prima = input().length;
    await new Promise((r) => setTimeout(r, 160));
    assert.ok(input().length >= prima + 2);

    puntatore(window, 'pointerup', leva, { x: 100, y: 130 });
    assert.deepEqual(input().at(-1), { x: 0, z: 0 });
    assert.equal(leva.classList.contains('attiva'), false);

    // Poi smette di mandare messaggi inutili
    const dopo = input().length;
    await new Promise((r) => setTimeout(r, 160));
    assert.ok(input().length <= dopo + 1);
  });

  it('un secondo dito sulla leva non la disturba; un altro puntatore che si solleva nemmeno', async () => {
    const { window, document, chiamate } = monta();
    const leva = document.querySelector('.zona-leva');
    puntatore(window, 'pointerdown', leva, { id: 1, x: 100, y: 200 });
    puntatore(window, 'pointerdown', leva, { id: 2, x: 300, y: 100 });
    puntatore(window, 'pointermove', leva, { id: 2, x: 300, y: 0 });
    puntatore(window, 'pointermove', leva, { id: 1, x: 170, y: 200 });
    puntatore(window, 'pointerup', leva, { id: 2 });
    assert.ok(leva.classList.contains('attiva'));
    await pausa(70);
    const ultimo = chiamate.filter((c) => c[1] === 'giocatore:input').at(-1)[2];
    assert.deepEqual(ultimo, { x: 1, z: 0 });
  });

  it('ogni pulsante manda la sua azione al server', () => {
    const { window, document, chiamate } = monta();
    for (const { tipo } of PULSANTI) {
      const bottone = document.querySelector(`[data-azione="${tipo}"]`);
      puntatore(window, 'pointerdown', bottone);
      assert.ok(bottone.classList.contains('premuto'));
      puntatore(window, 'pointerup', bottone);
      assert.equal(bottone.classList.contains('premuto'), false);
    }
    const azioni = chiamate.filter((c) => c[0] === 'emit' && c[1] === 'giocatore:azione').map((c) => c[2].tipo);
    assert.deepEqual(azioni, ['colpoForte', 'schivata', 'colpo', 'bersaglio']);
  });

  it('girando il telefono avvisa il server e mostra "Gira il telefono"', () => {
    const { window, document, chiamate, controller } = monta();
    controller.aggiornaVista({ fase: 'in_corso' });
    assert.equal(document.querySelector('.velo').hidden, true);
    window.innerWidth = 390;
    window.innerHeight = 844;
    window.dispatchEvent(new window.Event('resize'));
    const orientamenti = chiamate.filter((c) => c[1] === 'giocatore:orizzontale').map((c) => c[2].orizzontale);
    assert.deepEqual(orientamenti, [true, false]);
    assert.equal(document.querySelector('.velo').hidden, false);
    assert.match(document.querySelector('.velo-titolo').textContent, /Gira/);
    window.innerWidth = 844;
    window.innerHeight = 390;
    window.dispatchEvent(new window.Event('resize'));
    assert.equal(document.querySelector('.velo').hidden, true);
  });

  it('se il server aspetta ancora me (nuovo combattimento) rimanda l\'orientamento, una volta sola', () => {
    const { chiamate, controller } = monta({ indice: 1 });
    const conta = () => chiamate.filter((c) => c[1] === 'giocatore:orizzontale').length;
    const iniziali = conta();
    controller.aggiornaVista({ fase: 'attesa', chiManca: [0] }); // non riguarda me
    assert.equal(conta(), iniziali);
    controller.aggiornaVista({ fase: 'attesa', chiManca: [1] });
    controller.aggiornaVista({ fase: 'attesa', chiManca: [1] });
    assert.equal(conta(), iniziali + 1, 'non deve ripetere a raffica');
  });

  it('vita, ricarica della schivata e messaggi seguono lo stato in tempo reale', () => {
    const { document, controller } = monta();
    controller.aggiornaVista({ fase: 'in_corso' });
    controller.aggiornaIo({ f: 'in_corso', c: 0, v: 7, vm: 10, s: 'libero', d: 0.5, h: 0 });
    assert.equal(document.querySelector('.vita-testo').textContent, '7/10');
    assert.equal(document.querySelector('.vita-riempimento').style.getPropertyValue('--vita'), '0.7');
    assert.equal(document.querySelector('.ricarica').style.getPropertyValue('--ricarica'), '0.5');
    assert.equal(document.querySelector('.vita').classList.contains('bassa'), false);

    controller.aggiornaIo({ f: 'in_corso', c: 0, v: 2, vm: 10, s: 'ferito', d: 0, h: 1 });
    assert.equal(document.querySelector('.vita').classList.contains('bassa'), true);

    controller.aggiornaIo({ f: 'in_corso', c: 0, v: 0, vm: 10, s: 'ko', d: 0, h: 2 });
    assert.equal(document.querySelector('.velo').hidden, false);
    assert.match(document.querySelector('.velo-titolo').textContent, /terra/);

    // dati strani dal server non rompono il telefono
    assert.doesNotThrow(() => controller.aggiornaIo(null));
    assert.doesNotThrow(() => controller.aggiornaIo('x'));
  });

  it('ogni colpo preso fa vibrare il telefono (ma non la prima fotografia)', () => {
    const { window, controller } = monta();
    const vibrazioni = [];
    window.navigator.vibrate = (v) => vibrazioni.push(v);
    Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
    controller.aggiornaIo({ f: 'in_corso', c: 0, v: 10, vm: 10, s: 'libero', d: 0, h: 3 });
    assert.equal(vibrazioni.length, 0);
    controller.aggiornaIo({ f: 'in_corso', c: 0, v: 9, vm: 10, s: 'ferito', d: 0, h: 4 });
    assert.equal(vibrazioni.length, 1);
  });

  it('distruggi() ripulisce tutto e ferma l\'invio della leva', async () => {
    const { window, document, chiamate, controller, radice } = monta();
    const leva = document.querySelector('.zona-leva');
    puntatore(window, 'pointerdown', leva, { x: 100, y: 200 });
    controller.distruggi();
    attivo = null;
    assert.equal(radice.children.length, 0);
    assert.equal(document.body.classList.contains('in-combattimento'), false);
    const n = chiamate.length;
    await new Promise((r) => setTimeout(r, 160));
    assert.equal(chiamate.length, n);
    // l'ultimo messaggio prima di sparire è "fermo"
    assert.deepEqual(chiamate.filter((c) => c[1] === 'giocatore:input').at(-1)[2], { x: 0, z: 0 });
  });

  it('il nome del giocatore non diventa HTML', () => {
    const { document } = monta({ nomeGiocatore: '<img src=x onerror=alert(1)>' });
    assert.equal(document.querySelectorAll('.controller img').length, 0);
  });
});
