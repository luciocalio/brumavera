// Collega i messaggi in tempo reale (Socket.IO) alla logica della stanza.
// Qui non c'è logica di gioco: ogni evento controlla chi lo manda, chiama la Stanza e poi
// manda a tutti lo "stato" aggiornato.
//
// Eventi dal COMPUTER:  schermo:crea, schermo:riprendi, schermo:avanti, schermo:chiudi
// Eventi dal TELEFONO:  giocatore:entra, giocatore:scegliClasse, giocatore:conferma, giocatore:scelta,
//                       giocatore:input (la leva), giocatore:azione (i pulsanti), giocatore:orizzontale
// Eventi verso tutti:   stato (lo stato della partita), stanza:chiusa
// Eventi del combattimento (mandati dal ciclo, vedi ciclo.js): combattimento:stato (computer), combattimento:io (telefono)

import QRCode from 'qrcode';
import { risolviUrlBase } from './rete.js';
import { LIMITI, normalizzaCodice } from './validazione.js';

const errore = (messaggio, extra = {}) => ({ ok: false, errore: messaggio, ...extra });

export function registraSocket(io, { gestore, config, ipLan }) {
  const trasmetti = (stanza) => io.to(stanza.codice).emit('stato', stanza.snapshot());
  // Stato in tempo reale del combattimento: arriva solo ai computer, non ai telefoni.
  const stanzaSchermi = (codice) => `${codice}:schermo`;

  /** Indirizzo e QR code che il computer mostra ai giocatori. */
  async function datiDiIngresso(socket, stanza) {
    const urlBase = risolviUrlBase({
      urlPubblico: config.urlPubblico,
      hostRichiesta: socket.handshake.headers.host,
      protocolloRichiesto: socket.handshake.headers['x-forwarded-proto'],
      porta: config.porta,
      ipLan,
    });
    if (!urlBase) return { urlGiocatore: null, indirizzoBreve: null, qr: null };

    const urlGiocatore = `${urlBase}/p?stanza=${stanza.codice}`;
    const qr = await QRCode.toDataURL(urlGiocatore, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
    });
    return { urlGiocatore, indirizzoBreve: `${urlBase.replace(/^https?:\/\//, '')}/p`, qr };
  }

  /** Piccolo freno: un collegamento che manda troppi messaggi al secondo viene ignorato. */
  function dentroIlLimite(socket) {
    const adesso = Date.now();
    const limite = socket.data.limite ?? { inizio: adesso, conteggio: 0 };
    if (adesso - limite.inizio >= 1000) {
      limite.inizio = adesso;
      limite.conteggio = 0;
    }
    limite.conteggio += 1;
    socket.data.limite = limite;
    return limite.conteggio <= config.maxEventiAlSecondo;
  }

  /** Registra un evento con controlli comuni: risposta sempre presente, errori mai fatali. */
  function su(socket, evento, funzione) {
    socket.on(evento, async (primo, secondo) => {
      // Se l'evento non porta dati, il primo argomento è già la funzione di risposta.
      const rispondi = typeof primo === 'function' ? primo : typeof secondo === 'function' ? secondo : () => {};
      const dati = primo && typeof primo === 'object' ? primo : {};

      if (!dentroIlLimite(socket)) return rispondi(errore('Troppe richieste, rallenta un attimo.'));
      try {
        rispondi(await funzione(dati));
      } catch (e) {
        console.error(`[errore] evento ${evento}:`, e);
        rispondi(errore('Errore del server. Riprova.'));
      }
    });
  }

  const stanzaDelloSchermo = (socket) =>
    socket.data.ruolo === 'schermo' ? gestore.trova(socket.data.codice) : null;

  const stanzaDelGiocatore = (socket) =>
    socket.data.ruolo === 'giocatore' ? gestore.trova(socket.data.codice) : null;

  io.on('connection', (socket) => {
    // ------------------------------------------------------------ COMPUTER

    su(socket, 'schermo:crea', async ({ maxGiocatori, prova }) => {
      const esito = gestore.crea(maxGiocatori, { prova: prova === true });
      if (!esito.ok) return esito;

      const { stanza } = esito;
      stanza.collegaSchermo(socket.id);
      socket.data.ruolo = 'schermo';
      socket.data.codice = stanza.codice;
      socket.join(stanza.codice);
      socket.join(stanzaSchermi(stanza.codice));

      return {
        ok: true,
        codice: stanza.codice,
        tokenSchermo: stanza.tokenSchermo,
        ...(await datiDiIngresso(socket, stanza)),
        stato: stanza.snapshot(),
      };
    });

    su(socket, 'schermo:riprendi', async ({ codice, tokenSchermo }) => {
      const stanza = gestore.trova(normalizzaCodice(codice));
      if (!stanza || !stanza.verificaSchermo(tokenSchermo)) {
        return errore('Questa partita non esiste più.', { sessioneScaduta: true });
      }

      stanza.collegaSchermo(socket.id);
      socket.data.ruolo = 'schermo';
      socket.data.codice = stanza.codice;
      socket.join(stanza.codice);
      socket.join(stanzaSchermi(stanza.codice));
      trasmetti(stanza);

      return { ok: true, codice: stanza.codice, ...(await datiDiIngresso(socket, stanza)), stato: stanza.snapshot() };
    });

    su(socket, 'schermo:avanti', () => {
      const stanza = stanzaDelloSchermo(socket);
      if (!stanza) return errore('Schermo non collegato a una partita.');
      const esito = stanza.avanti();
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    su(socket, 'schermo:salta', () => {
      const stanza = stanzaDelloSchermo(socket);
      if (!stanza) return errore('Schermo non collegato a una partita.');
      const esito = stanza.saltaCombattimento();
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    su(socket, 'schermo:chiudi', () => {
      const stanza = stanzaDelloSchermo(socket);
      if (!stanza) return errore('Schermo non collegato a una partita.');
      const { codice } = stanza;
      gestore.chiudi(codice);
      io.to(codice).emit('stanza:chiusa');
      io.in(codice).socketsLeave(codice);
      io.in(stanzaSchermi(codice)).socketsLeave(stanzaSchermi(codice));
      socket.data.ruolo = null;
      socket.data.codice = null;
      return { ok: true };
    });

    // ------------------------------------------------------------ TELEFONO

    su(socket, 'giocatore:entra', ({ codice, tokenGiocatore }) => {
      const codicePulito = normalizzaCodice(codice);
      if (codicePulito.length !== LIMITI.codiceLunghezza) {
        return errore(`Il codice è di ${LIMITI.codiceLunghezza} lettere.`);
      }
      const stanza = gestore.trova(codicePulito);
      if (!stanza) return errore('Non trovo nessuna stanza con questo codice.');

      // Se questo stesso collegamento è già dentro (doppio tocco), riprende lo stesso posto.
      const tokenNoto =
        socket.data.ruolo === 'giocatore' && socket.data.codice === codicePulito ? socket.data.token : tokenGiocatore;

      let giocatore = null;
      if (typeof tokenNoto === 'string' && tokenNoto) {
        const ripresa = stanza.riprendiGiocatore(tokenNoto, socket.id);
        if (ripresa.ok) giocatore = ripresa.giocatore;
      }
      if (!giocatore) {
        const aggiunta = stanza.aggiungiGiocatore(socket.id);
        if (!aggiunta.ok) return aggiunta;
        giocatore = aggiunta.giocatore;
      }

      socket.data.ruolo = 'giocatore';
      socket.data.codice = codicePulito;
      socket.data.token = giocatore.token;
      socket.join(codicePulito);
      trasmetti(stanza);

      return { ok: true, tokenGiocatore: giocatore.token, indice: giocatore.indice, stato: stanza.snapshot() };
    });

    su(socket, 'giocatore:scegliClasse', ({ classe }) => {
      const stanza = stanzaDelGiocatore(socket);
      if (!stanza) return errore('Non sei in nessuna stanza.');
      const esito = stanza.scegliClasse(socket.data.token, classe);
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    su(socket, 'giocatore:conferma', ({ classe, nome }) => {
      const stanza = stanzaDelGiocatore(socket);
      if (!stanza) return errore('Non sei in nessuna stanza.');
      const esito = stanza.confermaPersonaggio(socket.data.token, { classe, nome });
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    su(socket, 'giocatore:scelta', ({ testo }) => {
      const stanza = stanzaDelGiocatore(socket);
      if (!stanza) return errore('Non sei in nessuna stanza.');
      const esito = stanza.inviaScelta(socket.data.token, testo);
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    su(socket, 'giocatore:azione', ({ tipo }) => {
      const stanza = stanzaDelGiocatore(socket);
      if (!stanza) return errore('Non sei in nessuna stanza.');
      return stanza.azioneCombattimento(socket.data.token, tipo);
    });

    su(socket, 'giocatore:orizzontale', ({ orizzontale }) => {
      const stanza = stanzaDelGiocatore(socket);
      if (!stanza) return errore('Non sei in nessuna stanza.');
      const esito = stanza.impostaOrizzontale(socket.data.token, orizzontale);
      if (esito.ok) trasmetti(stanza);
      return esito;
    });

    // La leva manda molti messaggi al secondo: niente risposta e un freno separato dagli altri eventi.
    socket.on('giocatore:input', (dati) => {
      const adesso = Date.now();
      const l = socket.data.limiteInput ?? { inizio: adesso, conteggio: 0 };
      if (adesso - l.inizio >= 1000) {
        l.inizio = adesso;
        l.conteggio = 0;
      }
      l.conteggio += 1;
      socket.data.limiteInput = l;
      if (l.conteggio > (config.maxInputAlSecondo ?? 60)) return;

      const stanza = stanzaDelGiocatore(socket);
      if (!stanza || typeof dati?.x !== 'number' || typeof dati?.z !== 'number') return;
      stanza.impostaInput(socket.data.token, dati.x, dati.z);
    });

    // ------------------------------------------------------------ DISCONNESSIONE

    socket.on('disconnect', () => {
      const stanza = gestore.trova(socket.data.codice);
      if (!stanza) return;
      if (socket.data.ruolo === 'schermo') stanza.disconnettiSchermo(socket.id);
      if (socket.data.ruolo === 'giocatore') stanza.disconnettiGiocatore(socket.data.token, socket.id);
      trasmetti(stanza);
    });
  });
}
