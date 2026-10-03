// Il CONTROLLER del telefono durante i combattimenti.
//
//   ┌──────────────────────────────┬──────────────────────────────┐
//   │  ♥♥♥♥♥♥♥♥♥♥  (vita)          │              [FORTE]         │
//   │                              │                              │
//   │   metà SINISTRA: leva        │      [MIRA]        [SCHIVA]  │
//   │   (compare dove appoggi      │                              │
//   │    il pollice)               │              [COLPO]         │
//   └──────────────────────────────┴──────────────────────────────┘
//                       telefono in ORIZZONTALE
//
// Il telefono non decide nulla: manda al server "dove sto spingendo la leva" (20 volte al secondo)
// e "ho premuto questo pulsante". Tutto il resto lo calcola il server.

import { el, riempi } from './comune.js';

export const ZONA_MORTA = 0.14; // sotto questa spinta (14% della leva) il personaggio sta fermo
export const INTERVALLO_LEVA_MS = 50; // 20 invii al secondo
const RAGGIO_MAX_PX = 64;
const RAGGIO_MIN_PX = 38;

/** I quattro pulsanti, disposti a rombo (posizione = dove stanno nel rombo). */
export const PULSANTI = Object.freeze([
  { tipo: 'colpoForte', posizione: 'su', etichetta: 'FORTE', icona: '💥', aiuto: 'Colpo forte' },
  { tipo: 'schivata', posizione: 'destra', etichetta: 'SCHIVA', icona: '🌀', aiuto: 'Schivata' },
  { tipo: 'colpo', posizione: 'giu', etichetta: 'COLPO', icona: '⚔️', aiuto: 'Colpo' },
  { tipo: 'bersaglio', posizione: 'sinistra', etichetta: 'MIRA', icona: '🎯', aiuto: 'Cambia bersaglio' },
]);

/**
 * Trasforma lo spostamento del pollice (in pixel) in un comando per il personaggio.
 * x: destra(+)/sinistra(-), z: avanti(+)/indietro(-), da -1 a 1. Lo schermo ha la y verso il basso, quindi si inverte.
 * `pomello` è dove disegnare il pallino (mai oltre il bordo della leva).
 */
export function calcolaLeva(dx, dy, raggio, zonaMorta = ZONA_MORTA) {
  const lunghezza = Math.hypot(dx, dy);
  if (!(lunghezza > 0) || !(raggio > 0)) return { x: 0, z: 0, pomello: { x: 0, y: 0 } };

  const fissa = Math.min(lunghezza, raggio);
  const ux = dx / lunghezza;
  const uy = dy / lunghezza;
  const pomello = { x: ux * fissa, y: uy * fissa };

  const spinta = fissa / raggio;
  if (spinta < zonaMorta) return { x: 0, z: 0, pomello };

  const forza = (spinta - zonaMorta) / (1 - zonaMorta); // dopo la zona morta si riparte da zero, senza "scatti"
  return { x: round(ux * forza), z: round(-uy * forza), pomello };
}

const round = (v) => Math.round(v * 100) / 100 || 0; // "|| 0" evita il -0

/** Cosa scrivere sopra ai controlli (null = niente: si sta combattendo). */
export function testoVelo({ orizzontale, vista, io }) {
  if (!orizzontale) return { titolo: 'Gira il telefono', sotto: 'Tienilo in orizzontale per combattere', icona: '↻' };
  switch (vista?.fase) {
    case 'attesa':
      return { titolo: 'Aspettiamo gli altri', sotto: 'Appena tutti hanno girato il telefono si parte' };
    case 'conto':
      return { titolo: io?.c ? String(io.c) : 'Pronti', sotto: 'Preparati', grande: true };
    case 'in_corso':
      return io?.s === 'ko' ? { titolo: 'Sei a terra', sotto: 'Tieni duro: guarda lo schermo' } : null;
    case 'vittoria':
      return { titolo: 'Vittoria!', sotto: 'Guarda lo schermo' };
    case 'sconfitta':
      return { titolo: 'Sconfitti...', sotto: 'Si riparte tra poco' };
    default:
      return { titolo: 'Un momento', sotto: '' };
  }
}

const eOrizzontale = () => window.innerWidth > window.innerHeight;

/**
 * Costruisce il controller dentro `radice` e comincia a mandare i comandi.
 * Restituisce { aggiornaVista, aggiornaIo, inviaOrientamento, distruggi }.
 */
export function creaController({ socket, radice, nomeGiocatore = '', indice = 0 }) {
  let vista = null;
  let io = null;
  let orizzontale = eOrizzontale();
  let colpiVisti = null;
  let schermoInteroTentato = false;
  let ultimoReinvio = 0;

  // ----- struttura
  const riempimentoVita = el('span', { classe: 'vita-riempimento' });
  const testoVita = el('span', { classe: 'vita-testo', testo: '' });
  const barraVita = el(
    'div',
    { classe: 'vita', role: 'progressbar', 'aria-label': 'Vita', 'aria-valuemin': '0' },
    el('span', { classe: 'vita-barra', 'aria-hidden': 'true' }, riempimentoVita),
    testoVita,
  );

  const base = el('span', { classe: 'leva-base', 'aria-hidden': 'true' });
  const pomello = el('span', { classe: 'leva-pomello', 'aria-hidden': 'true' });
  const guida = el('span', { classe: 'leva-guida', 'aria-hidden': 'true' }, el('span', { testo: 'muovi' }));
  const zonaLeva = el('div', { classe: 'zona-leva', role: 'application', 'aria-label': 'Leva di movimento' }, guida, base, pomello);

  const ricarica = el('span', { classe: 'ricarica', 'aria-hidden': 'true' });
  const pulsanti = PULSANTI.map((p) =>
    el(
      'button',
      { type: 'button', classe: `pulsante-azione ${p.posizione}`, 'data-azione': p.tipo, 'aria-label': p.aiuto },
      p.tipo === 'schivata' && ricarica,
      el('span', { classe: 'icona', 'aria-hidden': 'true', testo: p.icona }),
      el('span', { classe: 'etichetta', testo: p.etichetta }),
    ),
  );
  const zonaPulsanti = el('div', { classe: 'zona-pulsanti' }, el('div', { classe: 'rombo' }, pulsanti));

  const veloTitolo = el('p', { classe: 'velo-titolo' });
  const veloSotto = el('p', { classe: 'velo-sotto' });
  const veloIcona = el('p', { classe: 'velo-icona', 'aria-hidden': 'true' });
  const velo = el('div', { classe: 'velo', role: 'status', 'aria-live': 'polite' }, veloIcona, veloTitolo, veloSotto);

  const controller = el(
    'div',
    { classe: 'controller' },
    el('div', { classe: 'controller-alto' }, el('span', { classe: 'chi-sono', testo: nomeGiocatore }), barraVita),
    zonaLeva,
    zonaPulsanti,
    velo,
  );

  document.body.classList.add('in-combattimento');
  riempi(radice, controller);

  // ----- leva
  let puntatoreLeva = null; // quale dito sta usando la leva
  let origine = { x: 0, y: 0 }; // dove ha toccato (coordinate della pagina)
  let areaLeva = { left: 0, top: 0 };
  let raggio = RAGGIO_MAX_PX;
  let comando = { x: 0, z: 0 };
  let ultimoInviato = { x: 0, z: 0 };

  // Si disegna in coordinate della zona (non della pagina).
  const posiziona = (nodo, x, y) => {
    nodo.style.setProperty('--x', `${x}px`);
    nodo.style.setProperty('--y', `${y}px`);
  };

  function inviaComando(forza = false) {
    const fermoDaSempre = comando.x === 0 && comando.z === 0 && ultimoInviato.x === 0 && ultimoInviato.z === 0;
    if (!forza && puntatoreLeva === null && fermoDaSempre) return;
    // Mentre il dito è appoggiato si rimanda sempre: serve anche da "sono ancora qui" per il server.
    socket.volatile.emit('giocatore:input', comando);
    ultimoInviato = comando;
  }

  const timerLeva = setInterval(() => inviaComando(), INTERVALLO_LEVA_MS);

  function muoviLeva(evento) {
    const r = calcolaLeva(evento.clientX - origine.x, evento.clientY - origine.y, raggio);
    comando = { x: r.x, z: r.z };
    posiziona(pomello, origine.x - areaLeva.left + r.pomello.x, origine.y - areaLeva.top + r.pomello.y);
  }

  function lasciaLeva() {
    puntatoreLeva = null;
    comando = { x: 0, z: 0 };
    zonaLeva.classList.remove('attiva');
    inviaComando(true); // il personaggio si ferma subito, senza aspettare il prossimo giro
  }

  zonaLeva.addEventListener('pointerdown', (evento) => {
    evento.preventDefault();
    tentaSchermoIntero();
    if (puntatoreLeva !== null) return; // un solo dito alla volta sulla leva
    puntatoreLeva = evento.pointerId;
    try {
      zonaLeva.setPointerCapture?.(evento.pointerId);
    } catch {
      /* alcuni browser rifiutano: non è grave */
    }
    const area = zonaLeva.getBoundingClientRect();
    areaLeva = { left: area.left, top: area.top };
    origine = { x: evento.clientX, y: evento.clientY };
    raggio = Math.max(RAGGIO_MIN_PX, Math.min(RAGGIO_MAX_PX, Math.min(area.width || 999, area.height || 999) * 0.22));
    base.style.setProperty('--raggio', `${raggio}px`);
    posiziona(base, origine.x - areaLeva.left, origine.y - areaLeva.top);
    zonaLeva.classList.add('attiva');
    muoviLeva(evento);
    inviaComando(true);
  });

  zonaLeva.addEventListener('pointermove', (evento) => {
    if (evento.pointerId !== puntatoreLeva) return;
    evento.preventDefault();
    muoviLeva(evento);
  });

  for (const tipo of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zonaLeva.addEventListener(tipo, (evento) => {
      if (evento.pointerId === puntatoreLeva) lasciaLeva();
    });
  }

  // ----- pulsanti
  for (const bottone of pulsanti) {
    bottone.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      tentaSchermoIntero();
      bottone.classList.add('premuto');
      navigator.vibrate?.(12);
      socket.emit('giocatore:azione', { tipo: bottone.dataset.azione }, () => {});
    });
    for (const tipo of ['pointerup', 'pointercancel', 'pointerleave']) {
      bottone.addEventListener(tipo, () => bottone.classList.remove('premuto'));
    }
    // Un dito che scivola fuori non deve far scattare nulla di strano: non c'è "click", si usa solo pointerdown.
    bottone.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  controller.addEventListener('contextmenu', (e) => e.preventDefault());

  // ----- schermo intero e blocco in orizzontale (dove il browser lo permette, es. Android)
  function tentaSchermoIntero() {
    if (schermoInteroTentato) return;
    schermoInteroTentato = true;
    const radiceDoc = document.documentElement;
    Promise.resolve(radiceDoc.requestFullscreen?.({ navigationUI: 'hide' }))
      .then(() => window.screen?.orientation?.lock?.('landscape'))
      .catch(() => {
        /* iPhone e altri non lo permettono: basta girare il telefono a mano */
      });
  }

  // ----- orientamento
  function inviaOrientamento() {
    socket.emit('giocatore:orizzontale', { orizzontale }, () => {});
  }

  function allaRotazione() {
    const adesso = eOrizzontale();
    if (adesso === orizzontale) return;
    orizzontale = adesso;
    inviaOrientamento();
    ridisegnaVelo();
  }
  window.addEventListener('resize', allaRotazione);
  window.addEventListener('orientationchange', allaRotazione);

  // ----- cosa si vede
  function ridisegnaVelo() {
    const t = testoVelo({ orizzontale, vista, io });
    velo.hidden = !t;
    velo.classList.toggle('grande', Boolean(t?.grande));
    if (!t) return;
    veloIcona.textContent = t.icona ?? '';
    veloTitolo.textContent = t.titolo;
    veloSotto.textContent = t.sotto;
  }

  function ridisegnaVita() {
    if (!io) return;
    const frazione = io.vm > 0 ? Math.max(0, Math.min(1, io.v / io.vm)) : 0;
    riempimentoVita.style.setProperty('--vita', String(frazione));
    testoVita.textContent = `${io.v}/${io.vm}`;
    barraVita.setAttribute('aria-valuenow', String(io.v));
    barraVita.setAttribute('aria-valuemax', String(io.vm));
    barraVita.classList.toggle('bassa', frazione <= 0.3);
    ricarica.style.setProperty('--ricarica', String(Math.max(0, Math.min(1, io.d ?? 0))));
  }

  ridisegnaVelo();
  inviaOrientamento();

  return {
    aggiornaVista(nuovaVista) {
      vista = nuovaVista;
      ridisegnaVelo();
      // Un nuovo combattimento parte sempre con "nessuno ha girato il telefono": se io sono già in orizzontale lo ridico.
      const adesso = Date.now();
      if (vista?.fase === 'attesa' && orizzontale && vista.chiManca?.includes(indice) && adesso - ultimoReinvio > 500) {
        ultimoReinvio = adesso;
        inviaOrientamento();
      }
    },
    aggiornaIo(nuovoIo) {
      if (!nuovoIo || typeof nuovoIo !== 'object') return;
      io = nuovoIo;
      // Ogni colpo preso fa vibrare il telefono (il contatore h cresce).
      if (colpiVisti !== null && io.h > colpiVisti) navigator.vibrate?.(io.s === 'ko' ? [200, 80, 200] : 140);
      colpiVisti = io.h;
      ridisegnaVita();
      ridisegnaVelo();
    },
    inviaOrientamento,
    /** Per i collaudi: stato attuale della leva. */
    get comando() {
      return comando;
    },
    distruggi() {
      clearInterval(timerLeva);
      window.removeEventListener('resize', allaRotazione);
      window.removeEventListener('orientationchange', allaRotazione);
      if (puntatoreLeva !== null) lasciaLeva();
      document.body.classList.remove('in-combattimento');
      riempi(radice);
    },
  };
}
