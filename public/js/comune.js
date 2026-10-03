// Piccoli strumenti usati sia dalla pagina del computer sia da quella del telefono.

/**
 * Crea un elemento HTML in modo sicuro (il testo non viene mai interpretato come HTML,
 * quindi nessuno può "iniettare" codice scrivendo cose strane nel nome o nelle scelte).
 *
 *   el('p', { classe: 'x', testo: 'ciao' })
 *   el('button', { suClick: () => ..., 'aria-pressed': 'true' }, 'Testo', altroElemento)
 */
export function el(tag, proprieta = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [chiave, valore] of Object.entries(proprieta)) {
    if (valore === undefined || valore === null || valore === false) continue;
    if (chiave === 'classe') nodo.className = valore;
    else if (chiave === 'testo') nodo.textContent = valore;
    else if (chiave.startsWith('su') && typeof valore === 'function') {
      nodo.addEventListener(chiave.slice(2).toLowerCase(), valore);
    } else nodo.setAttribute(chiave, valore === true ? '' : String(valore));
  }
  for (const figlio of figli.flat()) {
    if (figlio === undefined || figlio === null || figlio === false) continue;
    nodo.append(figlio.nodeType ? figlio : document.createTextNode(String(figlio)));
  }
  return nodo;
}

/** Svuota un contenitore e ci mette dentro i nuovi elementi. */
export function riempi(contenitore, ...figli) {
  contenitore.replaceChildren(...figli.flat().filter(Boolean));
}

/** Memoria del browser (sopravvive al ricaricamento della pagina). Non esplode se è bloccata. */
export const memoria = {
  leggi(chiave) {
    try {
      return JSON.parse(localStorage.getItem(chiave));
    } catch {
      return null;
    }
  },
  salva(chiave, valore) {
    try {
      localStorage.setItem(chiave, JSON.stringify(valore));
    } catch {
      /* se il browser blocca la memoria, si gioca lo stesso: si perde solo la ripresa dopo il ricaricamento */
    }
  },
  cancella(chiave) {
    try {
      localStorage.removeItem(chiave);
    } catch {
      /* vedi sopra */
    }
  },
};

/**
 * Manda un messaggio al server e aspetta la risposta.
 * Non resta mai appeso: dopo 8 secondi restituisce un errore chiaro.
 */
export function chiedi(socket, evento, dati) {
  return new Promise((risolvi) => {
    const timer = setTimeout(() => risolvi({ ok: false, timeout: true, errore: 'Il server non risponde. Riprova.' }), 8000);
    const alRisposta = (risposta) => {
      clearTimeout(timer);
      risolvi(risposta ?? { ok: false, errore: 'Risposta vuota dal server.' });
    };
    if (dati === undefined) socket.emit(evento, alRisposta);
    else socket.emit(evento, dati, alRisposta);
  });
}

/** Mostra una sola "schermata" tra quelle indicate. */
export function mostraSolo(idDaMostrare, tutteLeSchermate) {
  for (const id of tutteLeSchermate) {
    const sezione = document.getElementById(id);
    if (sezione) sezione.hidden = id !== idDaMostrare;
  }
}

/** Carica i dati delle classi dal server (la fonte è un solo file: src/dati/classi.js). */
export async function caricaClassi() {
  const risposta = await fetch('/api/classi');
  if (!risposta.ok) throw new Error('Impossibile caricare le classi.');
  return risposta.json();
}
