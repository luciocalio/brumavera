// Il "regista" dell'arena sul computer: unisce la scena 3D (arena3d.js) e le scritte (arena-hud.js).
// La grafica 3D si carica solo quando serve (al primo combattimento), così le altre schermate partono subito.

import { el } from './comune.js';
import { creaHud } from './arena-hud.js';

export function creaArena({ contenitore, socket }) {
  const hud = creaHud(contenitore.querySelector('#arena-hud'));
  const zonaCanvas = contenitore.querySelector('#arena-canvas-zona');

  let regole = null; // regole del combattimento (dal server)
  let scena3d = null;
  let numeroGiocatori = 0;
  let canvas = null;
  let attiva = false;
  let ultimoSnap = null;
  let ultimoStato = null;
  let prova = false;
  let caricamento = 0; // per ignorare caricamenti vecchi se nel frattempo si è usciti

  async function caricaRegole() {
    if (regole) return regole;
    const risposta = await fetch('/api/combattimento');
    if (!risposta.ok) throw new Error('Impossibile caricare le regole del combattimento.');
    regole = await risposta.json();
    return regole;
  }

  function misura() {
    const larghezza = Math.max(1, window.innerWidth);
    const altezza = Math.max(1, window.innerHeight);
    const riquadri = hud.posiziona(larghezza, altezza, numeroGiocatori);
    scena3d?.ridimensiona(larghezza, altezza, riquadri.giocatori);
  }

  async function avvia3d(n) {
    const id = (caricamento += 1);
    try {
      const [dati, modulo] = await Promise.all([caricaRegole(), import('./arena3d.js')]);
      if (id !== caricamento || !attiva) return;

      canvas = el('canvas', { classe: 'arena-canvas', 'aria-hidden': 'true' });
      zonaCanvas.replaceChildren(canvas);
      scena3d = modulo.creaArena3d({ canvas, regole: dati, numeroGiocatori: n });
      misura();
      if (ultimoSnap) scena3d.aggiorna(ultimoSnap);
      scena3d.avvia();
      hud.mostraAvviso('');
    } catch (errore) {
      console.warn('[arena] grafica 3D non disponibile:', errore?.message ?? errore);
      hud.mostraAvviso('La grafica 3D non parte su questo browser (serve WebGL). Prova con Chrome o Edge aggiornati.');
    }
  }

  function ferma3d() {
    caricamento += 1;
    scena3d?.distruggi();
    scena3d = null;
    zonaCanvas.replaceChildren();
    canvas = null;
  }

  window.addEventListener('resize', () => {
    if (attiva) misura();
  });

  // Fotografie del mondo, 30 volte al secondo.
  socket.on('combattimento:stato', (snap) => {
    ultimoSnap = snap;
    if (!attiva) return;
    scena3d?.aggiorna(snap);
    const nomiNemici = Object.fromEntries(Object.entries(regole?.nemici ?? {}).map(([id, def]) => [id, def.nome]));
    hud.aggiornaSnapshot(snap, regole?.arena ?? { lato: 24 }, nomiNemici);
    // Il conto alla rovescia (3, 2, 1) arriva dalla fotografia: aggiorno il messaggio quando cambia.
    if (ultimoStato?.vista?.fase === 'conto') hud.aggiornaVista(ultimoStato, snap, { prova });
  });

  return {
    /** Chiamato a ogni nuovo stato della partita mentre c'è un combattimento. */
    mostra(stato) {
      ultimoStato = stato;
      prova = Boolean(stato.prova);
      const n = stato.giocatori.length;
      if (!attiva || n !== numeroGiocatori) {
        if (attiva) ferma3d();
        attiva = true;
        numeroGiocatori = n;
        ultimoSnap = null;
        misura();
        avvia3d(n);
      }
      hud.aggiornaVista(stato, ultimoSnap, { prova });
    },

    /** Si esce dal combattimento (pagina successiva, fine, ecc.). */
    nascondi() {
      if (!attiva) return;
      attiva = false;
      numeroGiocatori = 0;
      ultimoSnap = null;
      ferma3d();
      hud.pulisci();
    },

    get attiva() {
      return attiva;
    },
  };
}
