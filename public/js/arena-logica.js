// Funzioni "pure" dell'arena sul computer: nessuna grafica 3D, nessun DOM. Si possono collaudare da sole.

export const COLORI_GIOCATORI = Object.freeze(['#e4572e', '#2e86ab', '#76b041', '#f2c14e']);
export const NOMI_COLORI = Object.freeze(['rosso', 'azzurro', 'verde', 'giallo']);

/**
 * Divide lo schermo per i giocatori (in pixel, origine in alto a sinistra):
 *   1 giocatore:  tutto lo schermo          2: metà e metà
 *   3: tre quarti (+ un quarto libero per la mappa)      4: quattro quarti
 * Le metà sono calcolate senza lasciare righe vuote tra un riquadro e l'altro.
 */
export function calcolaRiquadri(giocatori, larghezza, altezza) {
  const L = Math.max(1, Math.floor(larghezza));
  const A = Math.max(1, Math.floor(altezza));
  const mezzaL = Math.floor(L / 2);
  const mezzaA = Math.floor(A / 2);
  const q = (x, y, w, h) => ({ x, y, w, h });

  if (giocatori <= 1) return { giocatori: [q(0, 0, L, A)], extra: null };
  if (giocatori === 2) return { giocatori: [q(0, 0, mezzaL, A), q(mezzaL, 0, L - mezzaL, A)], extra: null };

  const quarti = [q(0, 0, mezzaL, mezzaA), q(mezzaL, 0, L - mezzaL, mezzaA), q(0, mezzaA, mezzaL, A - mezzaA), q(mezzaL, mezzaA, L - mezzaL, A - mezzaA)];
  return giocatori === 3 ? { giocatori: quarti.slice(0, 3), extra: quarti[3] } : { giocatori: quarti.slice(0, 4), extra: null };
}

/** Avvicina `attuale` a `bersaglio` in modo morbido, indipendente dai fotogrammi al secondo. */
export function smorza(attuale, bersaglio, dt, velocita) {
  return attuale + (bersaglio - attuale) * (1 - Math.exp(-velocita * dt));
}

const GIRO = Math.PI * 2;

/** Differenza tra due angoli, sempre nel tratto più corto (da -π a π). */
export function differenzaAngolo(a, b) {
  let d = (a - b) % GIRO;
  if (d > Math.PI) d -= GIRO;
  else if (d < -Math.PI) d += GIRO;
  return d;
}

/** Come `smorza`, ma per gli angoli: gira dalla parte più corta. */
export function smorzaAngolo(attuale, bersaglio, dt, velocita) {
  return attuale + differenzaAngolo(bersaglio, attuale) * (1 - Math.exp(-velocita * dt));
}

/** Il grande messaggio al centro dello schermo (null = si sta combattendo, niente da dire). */
export function testoMessaggio({ vista, snap, giocatori = [] }) {
  if (!vista || vista.tipo !== 'combattimento') return null;
  switch (vista.fase) {
    case 'attesa': {
      const nomi = (vista.chiManca ?? []).map((i) => giocatori[i]?.nome ?? `Giocatore ${i + 1}`);
      return {
        titolo: 'Girate i telefoni in orizzontale',
        sotto: nomi.length > 0 ? `Aspettiamo: ${nomi.join(', ')}` : 'Un momento...',
      };
    }
    case 'conto':
      return { titolo: snap?.c ? String(snap.c) : 'Pronti', sotto: vista.titolo ?? '', grande: true };
    case 'vittoria':
      return { titolo: 'VITTORIA!', sotto: 'Premi Spazio o clicca per continuare' };
    case 'sconfitta':
      return { titolo: 'SCONFITTI', sotto: `Si riparte da capo (tentativo ${(vista.tentativo ?? 1) + 1})` };
    default:
      return null;
  }
}

/** Percentuale 0-1 di una barra, sempre dentro i limiti. */
export function frazione(valore, massimo) {
  return massimo > 0 ? Math.max(0, Math.min(1, valore / massimo)) : 0;
}

/**
 * Parametri di un settore a terra (zona di attacco di un nemico), in "metri" del gioco.
 * Il cono usa l'ampiezza e la portata dell'attacco; lo schianto è un cerchio intero.
 */
export function zonaAttacco(attacco, raggioGiocatore = 0.4) {
  if (attacco.tipo === 'area') return { raggio: attacco.raggio + raggioGiocatore, angolo: Math.PI };
  return { raggio: attacco.portata + raggioGiocatore, angolo: attacco.angolo };
}

/**
 * Punti (x, z) di un settore a terra, nel sistema locale del nemico: il centro è l'origine,
 * "avanti" è -z e "destra" è +x. Con `angolo` = π esce un cerchio intero.
 * Il primo punto è il centro; gli altri vanno lungo l'arco, da sinistra a destra.
 */
export function puntiSettore(raggio, angolo, passi = 24) {
  const punti = [[0, 0]];
  for (let k = 0; k <= passi; k += 1) {
    const a = -angolo + (2 * angolo * k) / passi;
    punti.push([raggio * Math.sin(a), -raggio * Math.cos(a)]);
  }
  return punti;
}

/**
 * Dove sta la spada vista in prima persona (rispetto alla telecamera) e come è inclinata.
 *   stato: libero | colpo | colpoForte | schivata | ferito | ko    p: avanzamento 0-1 dell'azione
 *   frazioneForte: a che punto del colpo forte cade il fendente (prima la spada si alza)
 */
export function posaSpada(stato, p, tempo = 0, frazioneForte = 0.42) {
  const posa = { x: 0.34, y: -0.3 + Math.sin(tempo * 2) * 0.008, z: -0.55, rx: -0.35, ry: 0.15, rz: -0.2 };
  const prog = Math.max(0, Math.min(1, p));

  switch (stato) {
    case 'colpo': {
      const s = Math.sin(prog * Math.PI);
      posa.x -= 0.45 * s;
      posa.z -= 0.15 * s;
      posa.rz -= 1.5 * s;
      posa.rx -= 0.25 * s;
      break;
    }
    case 'colpoForte': {
      if (prog < frazioneForte) {
        const a = prog / frazioneForte; // la spada si alza
        posa.rx -= 1.2 * a;
        posa.y += 0.25 * a;
        posa.z -= 0.1 * a;
      } else {
        const b = (prog - frazioneForte) / (1 - frazioneForte);
        if (b < 0.4) {
          const t = b / 0.4; // il fendente
          posa.rx += -1.2 + 2.1 * t;
          posa.y += 0.25 * (1 - t) - 0.1 * t;
          posa.z -= 0.1 + 0.2 * t;
        } else {
          const u = (b - 0.4) / 0.6; // torna in posizione
          posa.rx += 0.9 * (1 - u);
          posa.z -= 0.3 * (1 - u);
        }
      }
      break;
    }
    case 'schivata':
      posa.y -= 0.1;
      posa.rz -= 0.25;
      break;
    case 'ferito':
      posa.rx += 0.3;
      posa.y -= 0.05;
      break;
    default:
      break;
  }
  return posa;
}
