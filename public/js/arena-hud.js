// Gli elementi "di carta" sopra la scena 3D del computer: nome e vita di ogni giocatore,
// messaggi grandi (conto alla rovescia, vittoria...), mappa e lampi quando si prende un colpo.
// Sono normali elementi HTML, così restano nitidi e si possono collaudare senza grafica 3D.

import { el, riempi } from './comune.js';
import { COLORI_GIOCATORI, calcolaRiquadri, frazione, testoMessaggio } from './arena-logica.js';

export function creaHud(radice) {
  const messaggioTitolo = el('p', { classe: 'arena-msg-titolo' });
  const messaggioSotto = el('p', { classe: 'arena-msg-sotto' });
  const messaggio = el('div', { classe: 'arena-messaggio', role: 'status', 'aria-live': 'polite' }, messaggioTitolo, messaggioSotto);
  const suggerimento = el('p', { classe: 'arena-suggerimento', hidden: true, testo: 'Prova: premi S per saltare il combattimento' });
  const mappaCanvas = el('canvas', { classe: 'arena-mappa', width: '240', height: '240', 'aria-label': 'Mappa dell\'arena', hidden: true });
  const avviso3d = el('p', { classe: 'arena-avviso', role: 'alert', hidden: true });
  const caselle = el('div', { classe: 'arena-caselle' });
  riempi(radice, caselle, messaggio, mappaCanvas, avviso3d, suggerimento);

  let riquadri = { giocatori: [], extra: null };
  let schede = []; // una per giocatore
  let numeroSchede = 0;

  function creaScheda(i) {
    const nome = el('span', { classe: 'hud-nome' });
    const riempimentoVita = el('span', { classe: 'hud-vita-riempimento' });
    const testoVita = el('span', { classe: 'hud-vita-testo' });
    const vita = el('span', { classe: 'hud-vita', role: 'progressbar', 'aria-valuemin': '0' }, riempimentoVita, testoVita);
    const schivata = el('span', { classe: 'hud-schivata', 'aria-hidden': 'true' }, el('span', { classe: 'hud-schivata-carica' }));
    const lampo = el('span', { classe: 'hud-lampo', 'aria-hidden': 'true' });
    const stato = el('p', { classe: 'hud-stato' });
    const nomeBersaglio = el('span', { classe: 'hud-bersaglio-nome' });
    const vitaBersaglio = el('span', { classe: 'hud-bersaglio-riempimento' });
    const bersaglio = el('div', { classe: 'hud-bersaglio', hidden: true }, nomeBersaglio, el('span', { classe: 'hud-bersaglio-barra', 'aria-hidden': 'true' }, vitaBersaglio));
    const casella = el('div', { classe: 'hud-casella' }, el('div', { classe: 'hud-testa' }, nome, vita, schivata), bersaglio, lampo, stato);
    casella.style.setProperty('--colore', COLORI_GIOCATORI[i % COLORI_GIOCATORI.length]);
    caselle.append(casella);
    return { casella, nome, vita, riempimentoVita, testoVita, schivata, lampo, stato, bersaglio, nomeBersaglio, vitaBersaglio };
  }

  function assicuraSchede(n) {
    if (n === numeroSchede) return;
    caselle.replaceChildren();
    schede = Array.from({ length: n }, (_, i) => creaScheda(i));
    numeroSchede = n;
  }

  function posiziona(larghezza, altezza, giocatori) {
    assicuraSchede(giocatori);
    riquadri = calcolaRiquadri(giocatori, larghezza, altezza);
    riquadri.giocatori.forEach((r, i) => {
      const s = schede[i].casella.style;
      s.left = `${r.x}px`;
      s.top = `${r.y}px`;
      s.width = `${r.w}px`;
      s.height = `${r.h}px`;
    });
    const mappa = mappaCanvas.style;
    mappaCanvas.hidden = !riquadri.extra;
    if (riquadri.extra) {
      const lato = Math.min(riquadri.extra.w, riquadri.extra.h) * 0.8;
      mappa.left = `${riquadri.extra.x + (riquadri.extra.w - lato) / 2}px`;
      mappa.top = `${riquadri.extra.y + (riquadri.extra.h - lato) / 2}px`;
      mappa.width = `${lato}px`;
      mappa.height = `${lato}px`;
    }
    return riquadri;
  }

  function lampeggia(indice, classe) {
    const lampo = schede[indice]?.lampo;
    if (!lampo) return;
    lampo.classList.remove('ferito', 'schivata');
    void lampo.offsetWidth; // fa ripartire l'animazione
    lampo.classList.add(classe);
  }

  function disegnaMappa(snap, arena) {
    if (mappaCanvas.hidden || !mappaCanvas.getContext) return;
    const ctx = mappaCanvas.getContext('2d');
    if (!ctx) return;
    const lato = mappaCanvas.width;
    const scala = lato / arena.lato;
    const px = (v) => (v + arena.lato / 2) * scala;
    ctx.clearRect(0, 0, lato, lato);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, lato, lato);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, lato - 2, lato - 2);
    for (const n of snap.n) {
      if (n.s === 'morto') continue;
      ctx.fillStyle = n.s === 'avviso' ? '#ff5a4d' : '#c9c9c9';
      const m = n.t === 'guardiano' ? 16 : 9;
      ctx.fillRect(px(n.x) - m / 2, px(n.z) - m / 2, m, m);
    }
    for (const g of snap.g) {
      if (!g.pr || g.s === 'ko') continue;
      ctx.fillStyle = COLORI_GIOCATORI[g.i % COLORI_GIOCATORI.length];
      ctx.beginPath();
      ctx.arc(px(g.x), px(g.z), 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    posiziona,
    get riquadri() {
      return riquadri;
    },

    /** Aggiorna tutto ciò che dipende dallo stato della partita (cambia di rado). */
    aggiornaVista(stato, snap, { prova = false } = {}) {
      const vista = stato?.vista;
      const testo = testoMessaggio({ vista, snap, giocatori: stato?.giocatori });
      messaggio.hidden = !testo;
      messaggio.classList.toggle('grande', Boolean(testo?.grande));
      if (testo) {
        messaggioTitolo.textContent = testo.titolo;
        messaggioSotto.textContent = testo.sotto;
      }
      suggerimento.hidden = !(prova && vista?.fase === 'in_corso');
      (stato?.giocatori ?? []).forEach((g, i) => {
        if (schede[i]) schede[i].nome.textContent = g.nome;
      });
    },

    /** Aggiorna vita, ricarica e scritte (a ogni fotografia del server). */
    aggiornaSnapshot(snap, arena, nomiNemici = {}) {
      assicuraSchede(snap.g.length);
      for (const g of snap.g) {
        const s = schede[g.i];
        if (!s) continue;
        s.riempimentoVita.style.setProperty('--vita', String(frazione(g.v, g.vm)));
        s.testoVita.textContent = `${g.v}/${g.vm}`;
        s.vita.setAttribute('aria-valuenow', String(g.v));
        s.vita.setAttribute('aria-valuemax', String(g.vm));
        s.vita.classList.toggle('bassa', frazione(g.v, g.vm) <= 0.3);
        s.schivata.style.setProperty('--carica', String(1 - Math.max(0, Math.min(1, g.d))));
        s.schivata.classList.toggle('pronta', g.d <= 0);
        s.casella.classList.toggle('assente', !g.pr);
        s.casella.classList.toggle('ko', g.s === 'ko');
        s.stato.textContent = !g.pr ? 'telefono scollegato' : g.s === 'ko' ? 'A TERRA' : '';

        // Il nemico puntato: nome e vita sempre leggibili, anche quando è troppo vicino per vedere la sua barra.
        const puntato = g.b && g.s !== 'ko' ? snap.n.find((n) => n.id === g.b && n.s !== 'morto') : null;
        s.bersaglio.hidden = !puntato;
        if (puntato) {
          s.nomeBersaglio.textContent = nomiNemici[puntato.t] ?? puntato.t;
          s.vitaBersaglio.style.setProperty('--vita', String(frazione(puntato.v, puntato.vm)));
        }
      }
      if (arena) disegnaMappa(snap, arena);
      // Gli eventi del server (colpi presi, schivate riuscite) fanno lampeggiare il riquadro giusto.
      for (const e of snap.e ?? []) {
        if (e.e === 'ferito') lampeggia(e.i, 'ferito');
        else if (e.e === 'schivata_riuscita') lampeggia(e.i, 'schivata');
      }
    },

    mostraAvviso(testo) {
      avviso3d.textContent = testo;
      avviso3d.hidden = !testo;
    },

    pulisci() {
      caselle.replaceChildren();
      schede = [];
      numeroSchede = 0;
      messaggio.hidden = true;
      suggerimento.hidden = true;
      mappaCanvas.hidden = true;
    },
  };
}
