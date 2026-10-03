// Il simulatore del combattimento. Nessuna rete e nessuna grafica: solo regole.
// Il server lo fa avanzare 30 volte al secondo; computer e telefoni mostrano soltanto il risultato.
//
// Come si combatte (per ora solo con il GUERRIERO):
//   - il personaggio si gira da solo verso il nemico "puntato" (come il blocco bersaglio dei giochi stile Dark Souls)
//   - la leva sul telefono muove il personaggio: su = verso il nemico, destra/sinistra = gira intorno, giù = indietro
//   - colpo: veloce, poco danno. colpo forte: lento ma colpisce duro. schivata: scatto con qualche istante di invulnerabilità
//   - ogni nemico si "carica" prima di colpire (avviso): chi si sposta o schiva in tempo non si fa male
//
// Fasi: attesa (si aspetta che tutti girino il telefono) -> conto (3, 2, 1) -> in_corso -> vittoria | sconfitta
// Dopo una sconfitta si riparte da capo; dopo la vittoria la storia può continuare.

import { ARENA, GUERRIERO as G, TEMPI } from './dati/regoleCombattimento.js';
import { NEMICI } from './dati/nemici.js';

export const FASI_COMBATTIMENTO = Object.freeze({
  ATTESA: 'attesa',
  CONTO: 'conto',
  IN_CORSO: 'in_corso',
  VITTORIA: 'vittoria',
  SCONFITTA: 'sconfitta',
});
const F = FASI_COMBATTIMENTO;

export const AZIONI = Object.freeze(['colpo', 'colpoForte', 'schivata', 'bersaglio']);

const MEZZO_LATO = ARENA.lato / 2;
const PI = Math.PI;
const TAU = PI * 2;
const MAX_EVENTI_IN_CODA = 200;
const DURATA_STORDIMENTO_NEMICO = 0.35;
const ATTRITO_SPINTA = 8; // quanto in fretta si ferma un nemico respinto

// ---------------------------------------------------------------- piccola geometria
// Convenzione: con angolo `yaw` si guarda nella direzione (-sin yaw, -cos yaw); yaw = 0 guarda a nord (z negativo).

export const avanti = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
export const destra = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
export const yawVerso = (dx, dz) => Math.atan2(-dx, -dz);

export function differenzaAngolo(a, b) {
  let d = (a - b) % TAU;
  if (d > PI) d -= TAU;
  else if (d < -PI) d += TAU;
  return d;
}

const limita = (v, min, max) => Math.min(max, Math.max(min, v));
const arrotonda = (v, cifre = 2) => {
  const f = 10 ** cifre;
  return Math.round(v * f) / f;
};

function giraVerso(yawAttuale, yawDesiderato, passoMax) {
  return yawAttuale + limita(differenzaAngolo(yawDesiderato, yawAttuale), -passoMax, passoMax);
}

// ---------------------------------------------------------------- il combattimento

export class Combattimento {
  #rng;
  #contoSecondi;
  #attesaSconfitta;
  #timer = 0;

  /**
   * @param numeroGiocatori quanti giocatori ci sono nella stanza (indici da 0)
   * @param incontro        elenco dei nemici, es. [{ nemico: 'lupo', quanti: 3 }]
   * @param rng             funzione che dà numeri a caso tra 0 e 1 (nei test è prevedibile)
   */
  constructor({ numeroGiocatori, incontro, rng = Math.random, contoSecondi = TEMPI.conto, attesaSconfittaSecondi = TEMPI.attesaDopoSconfitta }) {
    this.numeroGiocatori = numeroGiocatori;
    this.incontro = incontro;
    this.#rng = rng;
    this.#contoSecondi = contoSecondi;
    this.#attesaSconfitta = attesaSconfittaSecondi;

    this.fase = F.ATTESA;
    this.tentativi = 1; // quante volte si è ricominciato
    this.eventi = [];
    this.#preparaMondo();
  }

  // ------------------------------------------------------------ preparazione

  #preparaMondo() {
    this.avatar = Array.from({ length: this.numeroGiocatori }, (_, i) => this.#nuovoAvatar(i, this.avatar?.[i]));
    this.nemici = this.#creaNemici();
    this.#timer = 0;
  }

  #nuovoAvatar(indice, precedente) {
    return {
      indice,
      presente: precedente ? precedente.presente : true,
      orizzontale: precedente ? precedente.orizzontale : false,
      x: (indice - (this.numeroGiocatori - 1) / 2) * 3,
      z: ARENA.zonaPartenzaGiocatori,
      yaw: 0,
      vita: G.vita,
      vitaMax: G.vita,
      stato: 'libero', // libero | colpo | colpoForte | schivata | ferito | ko
      t: 0,
      durata: 0,
      mossa: null,
      colpito: false,
      mx: 0,
      mz: 0,
      etaInput: 0,
      attesaSchivata: 0,
      dirSch: [0, 0],
      invul: 0,
      bersaglio: 0,
      bloccoManuale: false,
      coda: null,
      colpiSubiti: 0,
    };
  }

  #creaNemici() {
    const elenco = [];
    for (const voce of this.incontro) {
      for (let k = 0; k < voce.quanti; k += 1) elenco.push(NEMICI[voce.nemico]);
    }
    const n = elenco.length;
    const distanza = n > 1 ? Math.min(4.5, 20 / (n - 1)) : 0;
    return elenco.map((def, k) => ({
      id: k + 1,
      def,
      x: (k - (n - 1) / 2) * distanza,
      z: ARENA.zonaPartenzaNemici - (k % 2) * 1.5,
      yaw: PI, // guardano verso sud, verso i giocatori
      vita: def.vita,
      vitaMax: def.vita,
      fase: 'inseguire', // inseguire | avviso | recupero | stordito | morto
      t: 0,
      attacco: null,
      vx: 0,
      vz: 0,
    }));
  }

  // ------------------------------------------------------------ cosa arriva dai telefoni

  impostaPresente(indice, presente) {
    const av = this.avatar[indice];
    if (av) av.presente = Boolean(presente);
  }

  impostaOrizzontale(indice, orizzontale) {
    const av = this.avatar[indice];
    if (av) av.orizzontale = Boolean(orizzontale);
  }

  /** La leva del telefono: mx = destra/sinistra, mz = avanti/indietro, da -1 a 1. */
  impostaInput(indice, mx, mz) {
    const av = this.avatar[indice];
    if (!av || !Number.isFinite(mx) || !Number.isFinite(mz)) return;
    const lunghezza = Math.hypot(mx, mz);
    const scala = lunghezza > 1 ? 1 / lunghezza : 1;
    av.mx = mx * scala;
    av.mz = mz * scala;
    av.etaInput = 0;
  }

  /** Un pulsante premuto. Restituisce true se l'azione è stata accettata (anche in coda). */
  azione(indice, tipo) {
    const av = this.avatar[indice];
    if (!av || !AZIONI.includes(tipo)) return false;
    if (this.fase !== F.IN_CORSO || !av.presente || av.stato === 'ko') return false;

    if (tipo === 'bersaglio') {
      this.#cambiaBersaglio(av);
      return true;
    }
    if (this.#puoAgire(av, tipo)) this.#avviaAzione(av, tipo);
    else av.coda = { tipo, scade: G.bufferAzioni }; // premuto troppo presto: parte appena si può
    return true;
  }

  #puoAgire(av, tipo) {
    if (tipo === 'schivata') {
      if (av.attesaSchivata > 0) return false;
      if (av.stato === 'libero') return true;
      // si può schivare per annullare la fase di recupero di un colpo
      return (av.stato === 'colpo' || av.stato === 'colpoForte') && av.t >= av.mossa.avvio;
    }
    return av.stato === 'libero';
  }

  #avviaAzione(av, tipo) {
    av.coda = null;
    av.t = 0;

    if (tipo === 'schivata') {
      const [fx, fz] = avanti(av.yaw);
      const [rx, rz] = destra(av.yaw);
      let dx = fx * av.mz + rx * av.mx;
      let dz = fz * av.mz + rz * av.mx;
      const lunghezza = Math.hypot(dx, dz);
      if (lunghezza < 0.25) {
        [dx, dz] = [-fx, -fz]; // leva ferma: si salta all'indietro
      } else {
        dx /= lunghezza;
        dz /= lunghezza;
      }
      av.dirSch = [dx, dz];
      av.stato = 'schivata';
      av.mossa = null;
      av.durata = G.schivata.durata;
      av.attesaSchivata = G.schivata.attesa;
      this.#evento({ e: 'schivata', i: av.indice });
      return;
    }

    const forte = tipo === 'colpoForte';
    av.mossa = forte ? G.colpoForte : G.colpo;
    av.stato = tipo;
    av.durata = av.mossa.avvio + av.mossa.recupero;
    av.colpito = false;
    this.#evento({ e: 'colpo', i: av.indice, forte });
  }

  /** Solo per provare la storia: tutti i nemici cadono e lo scontro è vinto. */
  vinciSubito() {
    if (this.fase === F.VITTORIA) return;
    for (const n of this.nemici) {
      n.vita = 0;
      n.fase = 'morto';
      n.t = 0;
      n.attacco = null;
    }
    this.fase = F.VITTORIA;
    this.#evento({ e: 'vittoria' });
  }

  // ------------------------------------------------------------ bersaglio automatico

  #nemiciVivi() {
    return this.nemici.filter((n) => n.vita > 0);
  }

  #aggiornaBersaglio(av) {
    const vivi = this.#nemiciVivi();
    if (vivi.length === 0) {
      av.bersaglio = 0;
      av.bloccoManuale = false;
      return;
    }
    const distanza = (n) => Math.hypot(n.x - av.x, n.z - av.z);
    const piuVicino = vivi.reduce((a, b) => (distanza(a) <= distanza(b) ? a : b));
    const corrente = vivi.find((n) => n.id === av.bersaglio);

    if (!corrente) {
      av.bloccoManuale = false;
      av.bersaglio = piuVicino.id;
    } else if (!av.bloccoManuale && piuVicino.id !== corrente.id && distanza(piuVicino) < distanza(corrente) * 0.7) {
      av.bersaglio = piuVicino.id; // cambio automatico solo se un altro è molto più vicino
    }
  }

  #cambiaBersaglio(av) {
    const distanza = (n) => Math.hypot(n.x - av.x, n.z - av.z);
    const vivi = this.#nemiciVivi().sort((a, b) => distanza(a) - distanza(b));
    if (vivi.length === 0) return;
    const posizione = vivi.findIndex((n) => n.id === av.bersaglio);
    av.bersaglio = vivi[(posizione + 1) % vivi.length].id;
    av.bloccoManuale = true;
  }

  // ------------------------------------------------------------ eventi (per effetti e suoni)

  #evento(evento) {
    this.eventi.push(evento);
    if (this.eventi.length > MAX_EVENTI_IN_CODA) this.eventi.shift();
  }

  /** Restituisce gli eventi accaduti dall'ultima volta e li svuota. */
  prendiEventi() {
    const eventi = this.eventi;
    this.eventi = [];
    return eventi;
  }

  // ------------------------------------------------------------ avanzamento del tempo

  passo(dtGrezzo) {
    const dt = limita(dtGrezzo, 0, 0.1);

    switch (this.fase) {
      case F.ATTESA:
        this.#controllaAttesa();
        break;

      case F.CONTO:
        if (!this.#tuttiOrizzontali()) {
          this.fase = F.ATTESA; // qualcuno ha rigirato il telefono: si aspetta di nuovo
          break;
        }
        this.#timer -= dt;
        if (this.#timer <= 0) this.#iniziaScontro();
        break;

      case F.IN_CORSO:
        this.#passoDiGioco(dt);
        break;

      case F.VITTORIA:
        for (const n of this.nemici) this.#aggiornaNemico(n, dt);
        break;

      case F.SCONFITTA:
        for (const n of this.nemici) this.#aggiornaNemico(n, dt);
        this.#timer -= dt;
        if (this.#timer <= 0) this.#ricomincia();
        break;

      default:
        break;
    }
  }

  #presenti() {
    return this.avatar.filter((a) => a.presente);
  }

  #tuttiOrizzontali() {
    const presenti = this.#presenti();
    return presenti.length > 0 && presenti.every((a) => a.orizzontale);
  }

  /** Indici dei giocatori presenti che non hanno ancora girato il telefono. */
  chiManca() {
    return this.#presenti().filter((a) => !a.orizzontale).map((a) => a.indice);
  }

  #controllaAttesa() {
    if (!this.#tuttiOrizzontali()) return;
    this.fase = F.CONTO;
    this.#timer = this.#contoSecondi;
    if (this.#timer <= 0) this.#iniziaScontro();
  }

  #iniziaScontro() {
    this.fase = F.IN_CORSO;
    this.#evento({ e: 'inizio' });
  }

  #ricomincia() {
    this.tentativi += 1;
    this.#preparaMondo();
    this.fase = F.ATTESA; // se i telefoni sono già in orizzontale parte subito il conto
    this.#evento({ e: 'riparti' });
    this.#controllaAttesa();
  }

  #passoDiGioco(dt) {
    for (const av of this.avatar) this.#aggiornaAvatar(av, dt);
    for (const n of this.nemici) this.#aggiornaNemico(n, dt);
    this.#risolviCollisioni();

    if (this.nemici.every((n) => n.vita <= 0)) {
      this.fase = F.VITTORIA;
      this.#evento({ e: 'vittoria' });
      return;
    }
    const presenti = this.#presenti();
    if (presenti.length > 0 && presenti.every((a) => a.stato === 'ko')) {
      this.fase = F.SCONFITTA;
      this.#timer = this.#attesaSconfitta;
      this.#evento({ e: 'sconfitta' });
    }
  }

  // ------------------------------------------------------------ il giocatore

  #aggiornaAvatar(av, dt) {
    av.etaInput += dt;
    av.attesaSchivata = Math.max(0, av.attesaSchivata - dt);
    av.invul = Math.max(0, av.invul - dt);
    if (av.coda) {
      av.coda.scade -= dt;
      if (av.coda.scade <= 0) av.coda = null;
    }
    if (!av.presente || av.stato === 'ko') return;

    // Se il telefono smette di mandare la leva (connessione persa) il personaggio si ferma.
    const mx = av.etaInput > G.inputScadutoDopo ? 0 : av.mx;
    const mz = av.etaInput > G.inputScadutoDopo ? 0 : av.mz;

    this.#aggiornaBersaglio(av);
    const bersaglio = this.nemici.find((n) => n.id === av.bersaglio);
    if (bersaglio && av.stato !== 'schivata' && av.stato !== 'ferito') {
      av.yaw = giraVerso(av.yaw, yawVerso(bersaglio.x - av.x, bersaglio.z - av.z), G.rotazioneMax * dt);
    }

    const [fx, fz] = avanti(av.yaw);
    const [rx, rz] = destra(av.yaw);
    const leva = [fx * mz + rx * mx, fz * mz + rz * mx];

    switch (av.stato) {
      case 'libero': {
        this.#muovi(av, leva[0] * G.velocita * dt, leva[1] * G.velocita * dt, G.raggio);
        this.#eseguiCoda(av);
        break;
      }

      case 'colpo':
      case 'colpoForte': {
        av.t += dt;
        const m = av.mossa;
        const lento = G.velocitaDuranteColpo * G.velocita * dt;
        let dx = leva[0] * lento;
        let dz = leva[1] * lento;
        if (av.t <= m.avvio + dt) {
          dx += fx * (m.scatto / m.avvio) * dt; // piccolo balzo in avanti mentre si prepara il colpo
          dz += fz * (m.scatto / m.avvio) * dt;
        }
        this.#muovi(av, dx, dz, G.raggio);
        if (!av.colpito && av.t >= m.avvio) {
          av.colpito = true;
          this.#risolviColpo(av, av.stato === 'colpoForte');
        }
        if (av.t >= av.durata) {
          av.stato = 'libero';
          av.t = 0;
          av.mossa = null;
          this.#eseguiCoda(av); // il pulsante premuto poco prima parte senza perdere un istante
        }
        break;
      }

      case 'schivata': {
        av.t += dt;
        this.#muovi(av, av.dirSch[0] * G.schivata.velocita * dt, av.dirSch[1] * G.schivata.velocita * dt, G.raggio);
        if (av.t >= av.durata) {
          av.stato = 'libero';
          av.t = 0;
          this.#eseguiCoda(av);
        }
        break;
      }

      case 'ferito': {
        av.t += dt;
        if (av.t >= G.stordimentoDopoDanno) {
          av.stato = 'libero';
          av.t = 0;
        }
        break;
      }

      default:
        break;
    }
  }

  #eseguiCoda(av) {
    if (av.coda && this.#puoAgire(av, av.coda.tipo)) this.#avviaAzione(av, av.coda.tipo);
  }

  #risolviColpo(av, forte) {
    const m = av.mossa;
    let colpiti = 0;
    for (const n of this.nemici) {
      if (n.vita <= 0) continue;
      const dx = n.x - av.x;
      const dz = n.z - av.z;
      const distanza = Math.hypot(dx, dz);
      if (distanza > m.portata + n.def.raggio) continue;
      // Un nemico grande si colpisce anche se il centro è un po' fuori dal ventaglio.
      const tolleranza = m.angolo + Math.atan2(n.def.raggio, Math.max(distanza, 0.1));
      if (Math.abs(differenzaAngolo(yawVerso(dx, dz), av.yaw)) > tolleranza) continue;
      this.#danneggiaNemico(n, av, m, forte);
      colpiti += 1;
    }
    if (colpiti === 0) this.#evento({ e: 'mancato', i: av.indice });
  }

  #danneggiaNemico(n, av, mossa, forte) {
    n.vita = Math.max(0, n.vita - mossa.danno);
    this.#evento({ e: 'danno', id: n.id, i: av.indice, d: mossa.danno, forte });

    const dx = n.x - av.x;
    const dz = n.z - av.z;
    const lunghezza = Math.hypot(dx, dz) || 1;
    const impulso = mossa.spinta / n.def.resistenzaSpinta;
    n.vx += (dx / lunghezza) * impulso;
    n.vz += (dz / lunghezza) * impulso;

    if (n.vita <= 0) {
      n.fase = 'morto';
      n.t = 0;
      n.attacco = null;
      this.#evento({ e: 'morto', id: n.id });
      return;
    }
    // Un nemico che si sta caricando non si ferma; altrimenti basta un colpo (o il colpo forte per i più grossi).
    if ((n.fase === 'inseguire' || n.fase === 'recupero') && (n.def.stordibile || forte)) {
      n.fase = 'stordito';
      n.t = 0;
    }
  }

  #dannoGiocatore(av, danno, fonte) {
    if (av.stato === 'ko') return;
    if (av.stato === 'schivata' && av.t <= G.schivata.invulnerabile) {
      this.#evento({ e: 'schivata_riuscita', i: av.indice });
      return;
    }
    if (av.invul > 0) return;

    av.vita = Math.max(0, av.vita - danno);
    av.invul = G.invulnerabilitaDopoDanno;
    av.colpiSubiti += 1;
    av.coda = null;

    const dx = av.x - fonte.x;
    const dz = av.z - fonte.z;
    const lunghezza = Math.hypot(dx, dz) || 1;
    this.#muovi(av, (dx / lunghezza) * 0.8, (dz / lunghezza) * 0.8, G.raggio);

    this.#evento({ e: 'ferito', i: av.indice, d: danno, v: av.vita });
    av.t = 0;
    av.mossa = null;
    if (av.vita <= 0) {
      av.stato = 'ko';
      this.#evento({ e: 'ko', i: av.indice });
    } else {
      av.stato = 'ferito';
    }
  }

  // ------------------------------------------------------------ i nemici

  #avatarPiuVicino(n) {
    let migliore = null;
    let distanzaMigliore = Infinity;
    for (const av of this.avatar) {
      if (!av.presente || av.stato === 'ko') continue;
      const d = Math.hypot(av.x - n.x, av.z - n.z);
      if (d < distanzaMigliore) {
        distanzaMigliore = d;
        migliore = av;
      }
    }
    return migliore;
  }

  #aggiornaNemico(n, dt) {
    n.t += dt;

    // Spinta ricevuta: il nemico scivola e si ferma.
    this.#muovi(n, n.vx * dt, n.vz * dt, n.def.raggio);
    const attrito = Math.exp(-ATTRITO_SPINTA * dt);
    n.vx *= attrito;
    n.vz *= attrito;

    if (n.fase === 'morto') return;
    if (this.fase !== F.IN_CORSO) return; // a scontro finito i nemici ancora vivi (sconfitta) restano fermi

    const bersaglio = this.#avatarPiuVicino(n);

    switch (n.fase) {
      case 'inseguire': {
        if (!bersaglio) break;
        const dx = bersaglio.x - n.x;
        const dz = bersaglio.z - n.z;
        const distanza = Math.hypot(dx, dz) || 0.001;
        n.yaw = giraVerso(n.yaw, yawVerso(dx, dz), 6 * dt);

        const vuoto = distanza - n.def.raggio - G.raggio;
        if (vuoto > 0.15) {
          const passo = Math.min(n.def.velocita * dt, vuoto);
          this.#muovi(n, (dx / distanza) * passo, (dz / distanza) * passo, n.def.raggio);
        }

        const scelto = this.#scegliAttacco(n, distanza);
        if (scelto) {
          n.fase = 'avviso';
          n.t = 0;
          n.attacco = scelto;
          this.#evento({ e: 'avviso', id: n.id, a: scelto.nome, d: scelto.avviso });
        }
        break;
      }

      case 'avviso': {
        const att = n.attacco;
        // Per i primi istanti segue ancora il bersaglio; poi la direzione resta fissa, così si può schivare.
        if (bersaglio && n.t < att.avviso * 0.6) {
          n.yaw = giraVerso(n.yaw, yawVerso(bersaglio.x - n.x, bersaglio.z - n.z), 5 * dt);
        }
        if (n.t >= att.avviso) {
          this.#risolviAttacco(n, att);
          n.fase = 'recupero';
          n.t = 0;
        }
        break;
      }

      case 'recupero':
        if (n.t >= n.attacco.recupero) {
          n.fase = 'inseguire';
          n.t = 0;
        }
        break;

      case 'stordito':
        if (n.t >= DURATA_STORDIMENTO_NEMICO) {
          n.fase = 'inseguire';
          n.t = 0;
        }
        break;

      default:
        break;
    }
  }

  #scegliAttacco(n, distanza) {
    const possibili = n.def.attacchi.filter((a) => distanza <= a.innesco);
    if (possibili.length === 0) return null;
    const totale = possibili.reduce((somma, a) => somma + a.peso, 0);
    let estratto = this.#rng() * totale;
    for (const a of possibili) {
      estratto -= a.peso;
      if (estratto <= 0) return a;
    }
    return possibili.at(-1);
  }

  #risolviAttacco(n, att) {
    if (att.scatto) {
      const [fx, fz] = avanti(n.yaw);
      this.#muovi(n, fx * att.scatto, fz * att.scatto, n.def.raggio);
    }
    this.#evento({ e: 'attacco', id: n.id, a: att.nome });

    for (const av of this.avatar) {
      if (!av.presente || av.stato === 'ko') continue;
      const dx = av.x - n.x;
      const dz = av.z - n.z;
      const distanza = Math.hypot(dx, dz);
      let colpito;
      if (att.tipo === 'cono') {
        const tolleranza = att.angolo + Math.atan2(G.raggio, Math.max(distanza, 0.1));
        colpito = distanza <= att.portata + G.raggio && Math.abs(differenzaAngolo(yawVerso(dx, dz), n.yaw)) <= tolleranza;
      } else {
        colpito = distanza <= att.raggio + G.raggio;
      }
      if (colpito) this.#dannoGiocatore(av, att.danno, n);
    }
  }

  // ------------------------------------------------------------ movimento e collisioni

  #muovi(entita, dx, dz, raggio) {
    const limite = MEZZO_LATO - raggio;
    entita.x = limita(entita.x + dx, -limite, limite);
    entita.z = limita(entita.z + dz, -limite, limite);
  }

  #risolviCollisioni() {
    const vivi = this.nemici.filter((n) => n.fase !== 'morto');

    // I giocatori non attraversano i nemici: è il giocatore a essere spostato.
    for (const av of this.avatar) {
      if (!av.presente || av.stato === 'ko') continue;
      for (const n of vivi) {
        const dx = av.x - n.x;
        const dz = av.z - n.z;
        const minimo = G.raggio + n.def.raggio;
        const distanza = Math.hypot(dx, dz);
        if (distanza >= minimo) continue;
        const spinta = minimo - distanza;
        const [ux, uz] = distanza < 1e-6 ? [1, 0] : [dx / distanza, dz / distanza];
        this.#muovi(av, ux * spinta, uz * spinta, G.raggio);
      }
    }

    // I nemici non si sovrappongono tra loro.
    for (let a = 0; a < vivi.length; a += 1) {
      for (let b = a + 1; b < vivi.length; b += 1) {
        const n1 = vivi[a];
        const n2 = vivi[b];
        const dx = n2.x - n1.x;
        const dz = n2.z - n1.z;
        const minimo = n1.def.raggio + n2.def.raggio;
        const distanza = Math.hypot(dx, dz);
        if (distanza >= minimo) continue;
        const meta = (minimo - distanza) / 2;
        const [ux, uz] = distanza < 1e-6 ? [1, 0] : [dx / distanza, dz / distanza];
        this.#muovi(n1, -ux * meta, -uz * meta, n1.def.raggio);
        this.#muovi(n2, ux * meta, uz * meta, n2.def.raggio);
      }
    }
  }

  // ------------------------------------------------------------ cosa si mostra

  /** Il secondo del conto alla rovescia (3, 2, 1) oppure 0. */
  get conto() {
    return this.fase === F.CONTO ? Math.max(0, Math.ceil(this.#timer)) : 0;
  }

  /** Fotografia del mondo, in forma compatta, per il computer. */
  snapshot() {
    const progresso = (t, durata) => (durata > 0 ? arrotonda(limita(t / durata, 0, 1), 2) : 0);

    return {
      f: this.fase,
      c: this.conto,
      r: this.tentativi,
      g: this.avatar.map((a) => ({
        i: a.indice,
        x: arrotonda(a.x),
        z: arrotonda(a.z),
        y: arrotonda(a.yaw, 3),
        v: a.vita,
        vm: a.vitaMax,
        s: a.stato,
        p: a.stato === 'ferito' ? progresso(a.t, G.stordimentoDopoDanno) : progresso(a.t, a.durata),
        d: arrotonda(a.attesaSchivata / G.schivata.attesa, 2),
        b: a.bersaglio,
        pr: a.presente,
        o: a.orizzontale,
        k: a.invul > 0,
      })),
      n: this.nemici
        .filter((n) => n.fase !== 'morto' || n.t < TEMPI.durataMorteNemico)
        .map((n) => ({
          id: n.id,
          t: n.def.id,
          x: arrotonda(n.x),
          z: arrotonda(n.z),
          y: arrotonda(n.yaw, 3),
          v: n.vita,
          vm: n.vitaMax,
          s: n.fase,
          p: this.#progressoNemico(n),
          a: n.attacco && (n.fase === 'avviso' || n.fase === 'recupero') ? n.attacco.nome : null,
        })),
    };
  }

  #progressoNemico(n) {
    switch (n.fase) {
      case 'avviso':
        return arrotonda(limita(n.t / n.attacco.avviso, 0, 1), 2);
      case 'recupero':
        return arrotonda(limita(n.t / n.attacco.recupero, 0, 1), 2);
      case 'stordito':
        return arrotonda(limita(n.t / DURATA_STORDIMENTO_NEMICO, 0, 1), 2);
      case 'morto':
        return arrotonda(limita(n.t / TEMPI.durataMorteNemico, 0, 1), 2);
      default:
        return 0;
    }
  }

  /** Quello che serve al telefono: vita, ricarica della schivata, quanti colpi presi (per la vibrazione). */
  statoPerGiocatore(indice) {
    const a = this.avatar[indice];
    if (!a) return null;
    return {
      f: this.fase,
      c: this.conto,
      v: a.vita,
      vm: a.vitaMax,
      s: a.stato,
      d: arrotonda(a.attesaSchivata / G.schivata.attesa, 2),
      h: a.colpiSubiti,
    };
  }
}
