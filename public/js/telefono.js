// Pagina del TELEFONO: scelta del personaggio, scheda e risposta nei momenti di scelta.
// Come per il computer, non decide nulla: mostra quello che dice il server.

import { caricaClassi, chiedi, el, memoria, riempi } from './comune.js';
import { creaController } from './controller.js';

const CHIAVE_SESSIONE = 'brumavera:giocatore';
const LUNGHEZZA_CODICE = 4;
const LUNGHEZZA_MAX_NOME = 20;
const LUNGHEZZA_MAX_SCELTA = 200;

const app = document.getElementById('app');
const banner = document.getElementById('banner');
const socket = window.io();
const parametri = new URLSearchParams(window.location.search);

let dati = null; // classi, statistiche, valori iniziali (dal server)
let stato = null; // ultimo stato della partita
let mio = null; // { codice, token, indice }: il mio posto nella partita
let bozza = { classe: null, nome: '' }; // quello che sto scegliendo prima di confermare
let testoScelta = ''; // quello che sto scrivendo nel momento di scelta
let chiaveMostrata = ''; // serve a non ridisegnare la pagina (e perdere il testo) per nulla
let controller = null; // la leva e i pulsanti, attivi solo durante i combattimenti
let ultimoIo = null; // ultimo stato in tempo reale del combattimento (vita, ricarica schivata)

const normalizzaCodice = (testo) =>
  String(testo ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, LUNGHEZZA_CODICE);

// ------------------------------------------------------------------ pezzi di schermata

function schedaPersonaggio(idClasse, { nome, modificabile }) {
  const classe = dati.classi[idClasse];

  const campoNome = el('input', {
    type: 'text',
    maxlength: String(LUNGHEZZA_MAX_NOME),
    placeholder: `Giocatore ${mio.indice + 1}`,
    autocomplete: 'off',
    'aria-label': 'Il tuo nome',
    suInput: (evento) => {
      bozza.nome = evento.target.value;
    },
  });
  campoNome.value = bozza.nome;

  const statistiche = Object.entries(dati.statistiche).map(([chiave, etichetta]) => {
    const valore = classe.statistiche[chiave];
    const riempimento = el('span');
    riempimento.style.setProperty('--valore', String(valore));
    return el(
      'div',
      { classe: 'stat' },
      el('dt', { testo: etichetta }),
      el('dd', {}, el('span', { classe: 'barra', 'aria-hidden': 'true' }, riempimento), el('b', { testo: String(valore) })),
    );
  });

  return el(
    'article',
    { classe: 'scheda' },
    el(
      'div',
      { classe: 'scheda-testa' },
      el('div', { classe: 'emblema', 'aria-hidden': 'true', testo: classe.emoji }),
      modificabile ? campoNome : el('p', { classe: 'nome-giocatore', testo: nome }),
    ),
    el('h2', { classe: 'classe-nome', testo: classe.nome }),
    el('p', { classe: 'spenta', testo: classe.descrizione }),
    el('dl', { classe: 'statistiche' }, statistiche),
    el('p', { classe: 'equipaggiamento' }, el('strong', { testo: 'Equipaggiamento' }), classe.equipaggiamento),
    el(
      'p',
      { classe: 'tesoro' },
      el('span', { testo: `Monete: ${dati.valoriIniziali.monete}` }),
      el('span', { testo: `Punti abilità: ${dati.valoriIniziali.puntiAbilita}` }),
    ),
  );
}

// ------------------------------------------------------------------ schermate

function disegnaIngresso(codice = '', messaggioErrore = '') {
  app.classList.remove('con-barra-azione');
  chiaveMostrata = '';

  const campo = el('input', {
    classe: 'codice-stanza',
    type: 'text',
    inputmode: 'text',
    autocapitalize: 'characters',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: String(LUNGHEZZA_CODICE),
    placeholder: 'ABCD',
    'aria-label': 'Codice stanza',
  });
  campo.value = codice;

  const errore = el('p', { classe: 'errore', role: 'alert', testo: messaggioErrore });
  const pulsante = el('button', { type: 'button', classe: 'primario' }, 'Entra');

  const provaAdEntrare = async () => {
    const codiceScritto = normalizzaCodice(campo.value);
    if (codiceScritto.length !== LUNGHEZZA_CODICE) {
      errore.textContent = `Il codice è di ${LUNGHEZZA_CODICE} lettere. Lo trovi sul computer.`;
      return;
    }
    pulsante.disabled = true;
    errore.textContent = '';
    const salvata = memoria.leggi(CHIAVE_SESSIONE);
    const token = salvata?.codice === codiceScritto ? salvata.tokenGiocatore : undefined;
    await entra(codiceScritto, token);
    pulsante.disabled = false; // se è andata bene, la schermata è già stata sostituita
  };

  pulsante.addEventListener('click', provaAdEntrare);
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') provaAdEntrare();
  });

  riempi(
    app,
    el('h1', { testo: 'La Valle di Brumavera' }),
    el('p', { classe: 'spenta', testo: 'Scrivi il codice che vedi sul computer.' }),
    campo,
    errore,
    pulsante,
  );
}

function disegnaCreazione(messaggioErrore = '') {
  app.classList.add('con-barra-azione');

  const carte = Object.values(dati.classi).map((classe) =>
    el(
      'button',
      {
        type: 'button',
        classe: 'carta-classe',
        'aria-pressed': String(bozza.classe === classe.id),
        suClick: () => scegliClasse(classe.id),
      },
      el('span', { classe: 'simbolo', 'aria-hidden': 'true', testo: classe.emoji }),
      el('span', { testo: classe.nome }),
    ),
  );

  const errore = el('p', { classe: 'errore', role: 'alert', testo: messaggioErrore });
  const conferma = el('button', { type: 'button', classe: 'primario' }, 'Conferma personaggio');
  conferma.disabled = !bozza.classe;
  conferma.addEventListener('click', async () => {
    conferma.disabled = true;
    const risposta = await chiedi(socket, 'giocatore:conferma', { classe: bozza.classe, nome: bozza.nome });
    // Se è andata bene arriva da solo il nuovo stato dal server e la schermata cambia.
    if (!risposta.ok) {
      conferma.disabled = false;
      errore.textContent = risposta.errore;
    }
  });

  riempi(
    app,
    el('h1', { testo: 'Scegli il tuo personaggio' }),
    el('div', { classe: 'classi', role: 'group', 'aria-label': 'Classi' }, carte),
    bozza.classe
      ? schedaPersonaggio(bozza.classe, { nome: bozza.nome, modificabile: true })
      : el('p', { classe: 'spenta', testo: 'Tocca una classe per vedere la scheda del tuo personaggio.' }),
    errore,
    el('div', { classe: 'barra-azione' }, conferma),
  );
}

async function scegliClasse(idClasse) {
  bozza.classe = idClasse;
  disegnaCreazione();
  // Il computer vede subito la scelta. Se fallisce non è grave: conta la conferma.
  await chiedi(socket, 'giocatore:scegliClasse', { classe: idClasse });
}

function messaggiAggiuntivi() {
  const note = [];
  if (stato.inAttesaDi) note.push(`Si aspetta che ${stato.inAttesaDi} si ricolleghi.`);
  if (!stato.schermoConnesso) note.push('Lo schermo del computer è scollegato.');
  return note.map((nota) => el('p', { classe: 'messaggio attenzione', testo: nota }));
}

function boxMioTurno(domanda) {
  const area = el('textarea', {
    maxlength: String(LUNGHEZZA_MAX_SCELTA),
    rows: '4',
    placeholder: 'Scrivi cosa fai...',
    'aria-label': 'La tua risposta',
  });
  area.value = testoScelta;

  const contatore = el('p', { classe: 'contatore', testo: `${testoScelta.length}/${LUNGHEZZA_MAX_SCELTA}` });
  const errore = el('p', { classe: 'errore', role: 'alert' });
  const invia = el('button', { type: 'button', classe: 'primario' }, 'Invia');
  invia.disabled = !testoScelta.trim();

  area.addEventListener('input', () => {
    testoScelta = area.value;
    contatore.textContent = `${testoScelta.length}/${LUNGHEZZA_MAX_SCELTA}`;
    invia.disabled = !testoScelta.trim();
  });

  invia.addEventListener('click', async () => {
    invia.disabled = true;
    errore.textContent = '';
    const risposta = await chiedi(socket, 'giocatore:scelta', { testo: testoScelta });
    if (risposta.ok) {
      testoScelta = '';
    } else {
      errore.textContent = risposta.errore;
      invia.disabled = !testoScelta.trim();
    }
  });

  return el(
    'div',
    { classe: 'turno-tuo' },
    el('h2', { testo: 'Tocca a te' }),
    el('p', { classe: 'domanda', testo: domanda }),
    area,
    contatore,
    errore,
    invia,
  );
}

/** Cosa dire al giocatore (sopra la scheda) in base a come va la partita. */
function messaggioDiStato() {
  const vista = stato.vista;

  if (stato.fase === 'fine') return el('p', { classe: 'messaggio', role: 'status', testo: 'La storia è finita. Guarda lo schermo.' });
  if (stato.fase === 'pronto') return el('p', { classe: 'messaggio', role: 'status', testo: 'Tutti pronti. Guarda lo schermo.' });
  if (stato.fase !== 'storia') {
    return el('p', { classe: 'messaggio', role: 'status', testo: 'Personaggio confermato. Aspetta gli altri giocatori.' });
  }

  if (vista?.tipo === 'scelta') {
    if (vista.turnoIndice === mio.indice) return boxMioTurno(vista.domanda);
    if (vista.turnoIndice > mio.indice) {
      return el('p', { classe: 'messaggio', role: 'status', testo: 'Risposta inviata. Aspetta gli altri.' });
    }
    const chi = stato.giocatori[vista.turnoIndice]?.nome ?? 'un altro giocatore';
    return el('p', { classe: 'messaggio', role: 'status', testo: `Tocca a ${chi}, aspetta.` });
  }

  return el('p', { classe: 'messaggio', role: 'status', testo: 'Guarda lo schermo.' });
}

function disegnaPartita() {
  app.classList.remove('con-barra-azione');
  const io = stato.giocatori[mio.indice];
  riempi(app, messaggioDiStato(), messaggiAggiuntivi(), schedaPersonaggio(io.classe, { nome: io.nome, modificabile: false }));
}

function chiudiController() {
  if (!controller) return;
  controller.distruggi();
  controller = null;
  ultimoIo = null;
  chiaveMostrata = ''; // la schermata normale va ridisegnata da capo
}

/** Durante un combattimento il telefono diventa un controller. */
function disegnaCombattimento(io) {
  if (!controller) {
    controller = creaController({ socket, radice: app, nomeGiocatore: io.nome, indice: mio.indice });
    app.classList.remove('con-barra-azione');
    if (ultimoIo) controller.aggiornaIo(ultimoIo);
  }
  controller.aggiornaVista(stato.vista);
}

function disegna() {
  if (!stato || !mio) return;
  const io = stato.giocatori[mio.indice];
  if (!io) return;

  if (stato.fase === 'storia' && stato.vista?.tipo === 'combattimento') return disegnaCombattimento(io);
  chiudiController();

  const primaDellaPartita = stato.fase === 'lobby' || stato.fase === 'creazione';
  const eMioTurno = stato.vista?.tipo === 'scelta' && stato.vista.turnoIndice === mio.indice;

  // Ridisegno solo se è cambiato qualcosa che riguarda ME: così non perdo il testo che sto scrivendo.
  const chiave = JSON.stringify([
    primaDellaPartita ? 'prima' : stato.fase,
    io.confermato,
    stato.vista?.tipo,
    stato.vista?.turnoIndice,
    stato.vista?.domanda,
    stato.inAttesaDi,
    stato.schermoConnesso,
  ]);
  if (chiave === chiaveMostrata) return;
  chiaveMostrata = chiave;

  if (primaDellaPartita && !io.confermato) disegnaCreazione();
  else disegnaPartita();

  if (eMioTurno) navigator.vibrate?.(200); // un piccolo "tocca a te"
  return undefined;
}

// ------------------------------------------------------------------ collegamento al server

async function entra(codice, token) {
  const risposta = await chiedi(socket, 'giocatore:entra', { codice, tokenGiocatore: token });

  if (risposta.ok) {
    mio = { codice, token: risposta.tokenGiocatore, indice: risposta.indice };
    memoria.salva(CHIAVE_SESSIONE, { codice, tokenGiocatore: risposta.tokenGiocatore });
    stato = risposta.stato;
    chiaveMostrata = '';
    // Se ricarico la pagina a metà scelta, recupero la classe che il server aveva già visto.
    const io = stato.giocatori[mio.indice];
    if (io?.classe && !bozza.classe) bozza.classe = io.classe;
    disegna();
    controller?.inviaOrientamento(); // dopo una riconnessione il server non sa più com'è girato il telefono
    return;
  }

  // Un errore "vero" (stanza chiusa, piena...) rende inutile il posto salvato. Un timeout no: si può riprovare.
  if (token && !risposta.timeout) memoria.cancella(CHIAVE_SESSIONE);
  mio = null;
  stato = null;
  disegnaIngresso(codice, risposta.errore);
}

const datiPronti = caricaClassi().then((risposta) => {
  dati = risposta;
});

socket.on('connect', async () => {
  banner.hidden = true;

  try {
    await datiPronti;
  } catch {
    riempi(app, el('p', { classe: 'errore', testo: 'Non riesco a caricare il gioco. Ricarica la pagina.' }));
    return;
  }

  const salvata = memoria.leggi(CHIAVE_SESSIONE);
  const codiceDalLink = normalizzaCodice(parametri.get('stanza'));

  // Ricaricamento o riconnessione: riprendo il mio posto.
  if (salvata?.codice && (!codiceDalLink || salvata.codice === codiceDalLink)) {
    await entra(salvata.codice, salvata.tokenGiocatore);
    return;
  }
  // Arrivo dal QR: entro direttamente.
  if (codiceDalLink.length === LUNGHEZZA_CODICE) {
    await entra(codiceDalLink, undefined);
    return;
  }
  disegnaIngresso();
});

socket.on('disconnect', () => {
  banner.hidden = false;
});

socket.on('connect_error', () => {
  banner.hidden = false;
});

socket.on('stato', (nuovoStato) => {
  if (!mio) return;
  stato = nuovoStato;
  disegna();
});

socket.on('combattimento:io', (nuovo) => {
  ultimoIo = nuovo;
  controller?.aggiornaIo(nuovo);
});

socket.on('stanza:chiusa', () => {
  chiudiController();
  memoria.cancella(CHIAVE_SESSIONE);
  mio = null;
  stato = null;
  bozza = { classe: null, nome: '' };
  testoScelta = '';
  disegnaIngresso('', 'La partita è finita: il computer l\'ha chiusa.');
});

// ------------------------------------------------------------------ schermo del telefono sempre acceso

async function tieniSchermoAcceso() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    /* non disponibile (serve https) o negato: pazienza */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tieniSchermoAcceso();
});
tieniSchermoAcceso();
