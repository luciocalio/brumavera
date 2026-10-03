// La "Stanza" è una partita. Qui c'è TUTTA la logica del gioco, senza nulla che riguardi la rete:
// così si può testare facilmente e il server (socket.js) resta sottile.
//
// Fasi di una stanza:
//   lobby      -> i telefoni stanno entrando
//   creazione  -> tutti sono entrati, ognuno sceglie il personaggio
//   pronto     -> tutti hanno confermato, il computer può premere "PRONTO"
//   storia     -> la storia va avanti (pagine, scelte, combattimenti)
//   fine       -> storia conclusa
//
// Il SERVER è l'unica fonte di verità: computer e telefoni si limitano a mostrare lo "snapshot".

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Combattimento, FASI_COMBATTIMENTO } from './combattimento.js';
import { NUMERO_MAX_GIOCATORI } from './dati/regoleCombattimento.js';
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
  #contoSecondi;
  #rng;
  #firmaCombattimento = '';

  constructor({ codice, maxGiocatori, storia, classi, ora = Date.now, contoSecondi, rng, prova = false }) {
    this.codice = codice;
    this.maxGiocatori = maxGiocatori;
    this.#storia = storia;
    this.#classi = classi;
    this.#ora = ora;
    this.prova = prova; // true = storia di prova (solo combattimenti)
    this.#contoSecondi = contoSecondi;
    this.#rng = rng;
    this.#ultimaAttivita = ora();
    if (maxGiocatori > NUMERO_MAX_GIOCATORI) throw new Error('Troppi giocatori per il combattimento.');

    this.fase = FASI.LOBBY;
    this.giocatori = []; // l'ordine di arrivo = l'ordine dei turni
    this.cursor = -1; // posizione nella storia
    this.risposte = []; // risposte della scelta corrente, nell'ordine dei giocatori
    this.risultatoIdx = 0; // quale risultato si sta mostrando dopo una scelta
    this.combattimento = null; // lo scontro in corso (solo nei momenti di tipo "combattimento")
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
    this.combattimento?.impostaPresente(giocatore.indice, true);
    this.#tocca();
    return ok({ giocatore });
  }

  disconnettiGiocatore(token, socketId) {
    const giocatore = this.#trovaPerToken(token);
    // Se nel frattempo è arrivato un collegamento più recente, questo vecchio si ignora.
    if (giocatore && giocatore.socketId === socketId) {
      giocatore.connesso = false;
      giocatore.socketId = null;
      this.combattimento?.impostaPresente(giocatore.indice, false);
      this.combattimento?.impostaOrizzontale(giocatore.indice, false);
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
    if (momento.tipo === 'combattimento' && this.combattimento?.fase !== FASI_COMBATTIMENTO.VITTORIA) {
      return errore('Prima bisogna vincere il combattimento.');
    }
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
    this.combattimento = null;
    this.#firmaCombattimento = '';
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
    if (momento.tipo === 'combattimento') this.#iniziaCombattimento(momento);
  }

  #iniziaCombattimento(momento) {
    this.combattimento = new Combattimento({
      numeroGiocatori: this.giocatori.length,
      incontro: momento.incontro,
      ...(this.#contoSecondi !== undefined && { contoSecondi: this.#contoSecondi }),
      ...(this.#rng && { rng: this.#rng }),
    });
    for (const g of this.giocatori) this.combattimento.impostaPresente(g.indice, g.connesso);
    this.#firmaCombattimento = this.#calcolaFirmaCombattimento();
  }

  // ---------------------------------------------------------------- combattimento

  #calcolaFirmaCombattimento() {
    const c = this.combattimento;
    return c ? `${c.fase}|${c.tentativi}|${c.chiManca().join(',')}` : '';
  }

  /** Il combattimento è in corso e ha bisogno di essere fatto avanzare nel tempo? */
  get combattimentoAttivo() {
    return this.fase === FASI.STORIA && this.combattimento !== null;
  }

  /**
   * Fa avanzare il combattimento di `dt` secondi.
   * Restituisce true se è cambiato qualcosa che va comunicato a tutti (fase, chi deve girare il telefono...).
   */
  passo(dt) {
    if (!this.combattimentoAttivo) return false;
    this.combattimento.passo(dt);
    const firma = this.#calcolaFirmaCombattimento();
    const cambiata = firma !== this.#firmaCombattimento;
    this.#firmaCombattimento = firma;
    return cambiata;
  }

  #giocatoreInCombattimento(token) {
    const giocatore = this.#trovaPerToken(token);
    if (!giocatore || !this.combattimentoAttivo) return null;
    return giocatore;
  }

  /** La leva del telefono (valori da -1 a 1). Restituisce true se è stata accettata. */
  impostaInput(token, x, z) {
    const giocatore = this.#giocatoreInCombattimento(token);
    if (!giocatore || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.combattimento.impostaInput(giocatore.indice, x, z);
    this.#tocca();
    return true;
  }

  /** Un pulsante del telefono (colpo, colpoForte, schivata, bersaglio). */
  azioneCombattimento(token, tipo) {
    const giocatore = this.#giocatoreInCombattimento(token);
    if (!giocatore) return errore('Adesso non si sta combattendo.');
    this.#tocca();
    return this.combattimento.azione(giocatore.indice, tipo) ? ok() : errore('Azione non possibile ora.');
  }

  /** Il telefono dice se è in orizzontale. Nel combattimento si parte solo quando lo sono tutti. */
  impostaOrizzontale(token, orizzontale) {
    const giocatore = this.#giocatoreInCombattimento(token);
    if (!giocatore) return errore('Adesso non si sta combattendo.');
    this.combattimento.impostaOrizzontale(giocatore.indice, orizzontale === true);
    this.#tocca();
    return ok();
  }

  /** Per provare la storia senza combattere: il combattimento si considera vinto. */
  saltaCombattimento() {
    if (!this.combattimentoAttivo) return errore('Non c\'è nessun combattimento da saltare.');
    this.combattimento.vinciSubito();
    return ok();
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

      case 'combattimento': {
        const c = this.combattimento;
        return {
          tipo: 'combattimento',
          titolo: momento.titolo,
          fase: c?.fase ?? null,
          tentativo: c?.tentativi ?? 1,
          chiManca: c ? c.chiManca() : [],
        };
      }

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
      prova: this.prova,
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
