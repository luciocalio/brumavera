import { randomInt } from 'node:crypto';
import { Stanza } from './stanza.js';
import { LIMITI, numeroGiocatoriValido } from './validazione.js';

// Niente I, L, O: si confondono facilmente con 1 e 0 quando si scrive il codice a mano sul telefono.
const ALFABETO_CODICE = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/** Tiene l'elenco delle stanze aperte e ripulisce quelle abbandonate. */
export class GestoreStanze {
  #stanze = new Map();
  #storia;
  #classi;
  #maxStanze;
  #inattivitaMassimaMs;
  #ora;

  constructor({ storia, classi, maxStanze, inattivitaMassimaMs, ora = Date.now }) {
    this.#storia = storia;
    this.#classi = classi;
    this.#maxStanze = maxStanze;
    this.#inattivitaMassimaMs = inattivitaMassimaMs;
    this.#ora = ora;
  }

  get quante() {
    return this.#stanze.size;
  }

  #generaCodice() {
    for (let tentativo = 0; tentativo < 100; tentativo += 1) {
      let codice = '';
      for (let i = 0; i < LIMITI.codiceLunghezza; i += 1) {
        codice += ALFABETO_CODICE[randomInt(ALFABETO_CODICE.length)];
      }
      if (!this.#stanze.has(codice)) return codice;
    }
    throw new Error('Impossibile generare un codice stanza libero.');
  }

  crea(maxGiocatori) {
    if (!numeroGiocatoriValido(maxGiocatori)) {
      return { ok: false, errore: `Il numero di giocatori deve essere da ${LIMITI.giocatoriMin} a ${LIMITI.giocatoriMax}.` };
    }
    this.pulisciInattive();
    if (this.#stanze.size >= this.#maxStanze) {
      return { ok: false, errore: 'Il server è pieno, riprova tra qualche minuto.' };
    }

    const stanza = new Stanza({
      codice: this.#generaCodice(),
      maxGiocatori,
      storia: this.#storia,
      classi: this.#classi,
      ora: this.#ora,
    });
    this.#stanze.set(stanza.codice, stanza);
    return { ok: true, stanza };
  }

  trova(codice) {
    return this.#stanze.get(codice) ?? null;
  }

  chiudi(codice) {
    return this.#stanze.delete(codice);
  }

  /** Elimina le stanze senza attività da troppo tempo. Restituisce i codici eliminati. */
  pulisciInattive() {
    const eliminate = [];
    const adesso = this.#ora();
    for (const [codice, stanza] of this.#stanze) {
      if (adesso - stanza.ultimaAttivita > this.#inattivitaMassimaMs) {
        this.#stanze.delete(codice);
        eliminate.push(codice);
      }
    }
    return eliminate;
  }
}
