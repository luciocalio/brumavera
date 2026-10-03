// La "Stanza" è una partita. Qui c'è TUTTA la logica del gioco, senza nulla che riguardi la rete:
// così si può testare facilmente e il server (socket.js) resta sottile.
//
// Fasi di una stanza:
//   lobby      -> i telefoni stanno entrando
//   creazione  -> tutti sono entrati, ognuno sceglie il personaggio
//   pronto     -> tutti hanno confermato, il computer può premere "PRONTO"
//   storia     -> la storia va avanti (pagine, scelte, combattimenti-segnaposto)
//   fine       -> storia conclusa
//
// Il SERVER è l'unica fonte di verità: computer e telefoni si limitano a mostrare lo "snapshot".

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pulisciNome, pulisciScelta } from './validazione.js';

export const FASI = Object.freeze({
  LOBBY: 'lobby',
  CREAZIONE: 'creazione',
  PRONTO: 'pronto',
  STORIA: 'storia',
  FINE: 'fine',
});

const ok = (extra = {}) => ({ ok: true, ...extra });
const errore = (messaggio) => ({ ok: false, errore: messaggio });

const nuovoToken = () => randomBytes(16).toString('hex');

function tokenUguali(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export class Stanza {
  #storia;
  #classi;
  #ora;
  #tokenSchermo = nuovoToken();
  #schermoSocketId = null;
  #ultimaAttivita;

  constructor({ codice, maxGiocatori, storia, classi, ora = Date.now }) {
    this.codice = codice;
    this.maxGiocatori = maxGiocatori;
    this.#storia = storia;
    this.#classi = classi;
    this.#ora = ora;
    this.#ultimaAttivita = ora();

    this.fase = FASI.LOBBY;
    this.giocatori = []; // l'ordine di arrivo = l'ordine dei turni
    this.cursor = -1; // posizione nella storia
    this.risposte = []; // risposte della scelta corrente, nell'ordine dei giocatori
    this.risultatoIdx = 0; // quale risultato si sta mostrando dopo una scelta
  }

  get ultimaAttivita() {
    return this.#ultimaAttivita;
  }

  get tokenSchermo() {
    return this.#tokenSchermo;
  }

  #tocca() {
    this.#ultimaAttivita = this.#ora();
  }

  // ---------------------------------------------------------------- schermo (computer)

  verificaSchermo(token) {
    return tokenUguali(token, this.#tokenSchermo);
  }

  collegaSchermo(socketId) {
    this.#schermoSocketId = socketId;
    this.#tocca();
  }

  disconnettiSchermo(socketId) {
    if (this.#schermoSocketId === socketId) this.#schermoSocketId = null;
  }

  get schermoConnesso() {
    return this.#schermoSocketId !== null;
  }

  // ---------------------------------------------------------------- giocatori (telefoni)

  aggiungiGiocatore(socketId) {
    if (this.giocatori.length >= this.maxGiocatori) return errore('La stanza è al completo.');
    if (this.fase !== FASI.LOBBY) return errore('La partita è già iniziata.');

    const indice = this.giocatori.length;
    const giocatore = {
      indice,
      token: nuovoToken(),
      nome: `Giocatore ${indice + 1}`,
      classe: null,
      confermato: false,
      connesso: true,
      socketId,
    };
    this.giocatori.push(giocatore);

    if (this.giocatori.length === this.maxGiocatori) this.fase = FASI.CREAZIONE;
    this.#tocca();
    return ok({ giocatore });
  }

  /** Un telefono che aveva già un posto lo riprende (es. dopo aver ricaricato la pagina). */
  riprendiGiocatore(token, socketId) {
    const giocatore = this.#trovaPerToken(token);
    if (!giocatore) return errore('Posto non trovato in questa stanza.');
    giocatore.connesso = true;
    giocatore.socketId = socketId;
    this.#tocca();
    return ok({ giocatore });
  }

  disconnettiGiocatore(token, socketId) {
    const giocatore = this.#trovaPerToken(token);
    // Se nel frattempo è arrivato un collegamento più recente, questo vecchio si ignora.
    if (giocatore && giocatore.socketId === socketId) {
      giocatore.connesso = false;
      giocatore.socketId = null;
    }
  }

  #trovaPerToken(token) {
    return this.giocatori.find((g) => tokenUguali(g.token, token)) ?? null;
  }

  // ---------------------------------------------------------------- creazione del personaggio

  #puoCreare(giocatore) {
    if (!giocatore) return errore('Giocatore non riconosciuto.');
    if (this.fase !== FASI.LOBBY && this.fase !== FASI.CREAZIONE) return errore('Il personaggio non si può più cambiare.');
    if (giocatore.confermato) return errore('Hai già confermato il personaggio.');
    return null;
  }

  scegliClasse(token, idClasse) {
    const giocatore = this.#trovaPerToken(token);
    const problema = this.#puoCreare(giocatore);
    if (problema) return problema;
    if (!Object.hasOwn(this.#classi, idClasse)) return errore('Classe non valida.');

    giocatore.classe = idClasse;
    this.#tocca();
    return ok();
  }

  confermaPersonaggio(token, { classe, nome }) {
    const giocatore = this.#trovaPerToken(token);
    const problema = this.#puoCreare(giocatore);
    if (problema) return problema;
    if (!Object.hasOwn(this.#classi, classe)) return errore('Scegli una classe prima di confermare.');

    giocatore.classe = classe;
    giocatore.nome = pulisciNome(nome) || `Giocatore ${giocatore.indice + 1}`;
    giocatore.confermato = true;

    if (this.fase === FASI.CREAZIONE && this.giocatori.every((g) => g.confermato)) {
      this.fase = FASI.PRONTO;
    }
    this.#tocca();
    return ok();
  }

  // ---------------------------------------------------------------- avanzamento della storia

  /** Chiamato dal computer (click / Spazio / Invio / pulsante PRONTO). */
  avanti() {
    this.#tocca();

    if (this.fase === FASI.PRONTO) {
      this.#entraNelMomento(0);
      return ok();
    }

    if (this.fase !== FASI.STORIA) return errore('Non c\'è niente da far avanzare ora.');

    const momento = this.#storia[this.cursor];
    if (momento.tipo === 'scelta') {
      if (!this.#tuttiHannoRisposto()) return errore('Aspettate che tutti i giocatori rispondano.');
      this.risultatoIdx += 1;
      if (this.risultatoIdx >= this.giocatori.length) this.#entraNelMomento(this.cursor + 1);
      return ok();
    }

    this.#entraNelMomento(this.cursor + 1);
    return ok();
  }

  #entraNelMomento(indice) {
    this.cursor = indice;
    const momento = this.#storia[indice];

    if (!momento || momento.tipo === 'fine') {
      this.fase = FASI.FINE;
      return;
    }

    this.fase = FASI.STORIA;
    if (momento.tipo === 'scelta') {
      this.risposte = [];
      this.risultatoIdx = 0;
    }
  }

  #tuttiHannoRisposto() {
    return this.risposte.length >= this.giocatori.length;
  }

  /** Un giocatore invia la sua scelta. Si può solo al proprio turno. */
  inviaScelta(token, testo) {
    const giocatore = this.#trovaPerToken(token);
    if (!giocatore) return errore('Giocatore non riconosciuto.');
    if (this.fase !== FASI.STORIA || this.#storia[this.cursor]?.tipo !== 'scelta') {
      return errore('Adesso non c\'è nessuna scelta da fare.');
    }
    if (this.#tuttiHannoRisposto()) return errore('Tutti hanno già risposto.');
    if (giocatore.indice !== this.risposte.length) return errore('Non è il tuo turno.');

    const pulito = pulisciScelta(testo);
    if (!pulito) return errore('Scrivi qualcosa prima di inviare.');

    this.risposte.push(pulito);
    this.#tocca();
    return ok();
  }

  // ---------------------------------------------------------------- cosa mostrare

  #vista() {
    if (this.fase !== FASI.STORIA) return null;
    const momento = this.#storia[this.cursor];

    switch (momento.tipo) {
      case 'pagina':
        return { tipo: 'pagina', testo: momento.testo };

      case 'combattimento':
        return { tipo: 'combattimento', titolo: momento.titolo };

      case 'scelta': {
        if (!this.#tuttiHannoRisposto()) {
          const precedente = this.#storia[this.cursor - 1];
          return {
            tipo: 'scelta',
            domanda: momento.domanda,
            contesto: precedente?.tipo === 'pagina' ? precedente.testo : null,
            turnoIndice: this.risposte.length,
          };
        }
        const giocatore = this.giocatori[this.risultatoIdx];
        return {
          tipo: 'risultato',
          indiceGiocatore: giocatore.indice,
          nome: giocatore.nome,
          testoScritto: this.risposte[this.risultatoIdx],
          risultato: momento.risultati[giocatore.classe],
        };
      }

      default:
        return null;
    }
  }

  #inAttesaDi() {
    if (this.fase !== FASI.STORIA) return null;
    const vista = this.#vista();
    if (vista?.tipo !== 'scelta') return null;
    const chiDeveRispondere = this.giocatori[vista.turnoIndice];
    return chiDeveRispondere && !chiDeveRispondere.connesso ? chiDeveRispondere.nome : null;
  }

  /** Quello che tutti (computer e telefoni) possono vedere. Non contiene mai token né id di rete. */
  snapshot() {
    return {
      codice: this.codice,
      fase: this.fase,
      maxGiocatori: this.maxGiocatori,
      schermoConnesso: this.schermoConnesso,
      giocatori: this.giocatori.map((g) => ({
        indice: g.indice,
        nome: g.nome,
        classe: g.classe,
        confermato: g.confermato,
        connesso: g.connesso,
      })),
      vista: this.#vista(),
      inAttesaDi: this.#inAttesaDi(),
    };
  }
}
