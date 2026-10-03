// Pagina del COMPUTER: mostra QR, giocatori e sottotitoli.
// Non decide nulla da sola: mostra quello che dice il server e gli manda i click ("avanti").

import { caricaClassi, chiedi, el, memoria, mostraSolo, riempi } from './comune.js';
import { creaArena } from './arena.js';

const SCHERMATE = ['sc-caricamento', 'sc-giocatori', 'sc-lobby', 'sc-creazione', 'sc-storia', 'sc-arena', 'sc-fine'];
const CHIAVE_SESSIONE = 'brumavera:schermo';
const PAUSA_TRA_DUE_AVANTI_MS = 300;

const $ = (id) => document.getElementById(id);
const socket = window.io();
const arena = creaArena({ contenitore: $('sc-arena'), socket });

let stato = null; // ultimo stato ricevuto dal server
let ingresso = null; // QR e indirizzo per i telefoni
let classi = {}; // dati delle classi (per mostrare i nomi)
let chiaveStoria = ''; // per non rifare la dissolvenza se la pagina non è cambiata
let ultimoAvanti = 0;

const nomeClasse = (id) => classi[id]?.nome ?? id;

// ------------------------------------------------------------------ schermate

function mostraSceltaGiocatori(messaggioErrore = '') {
  stato = null;
  ingresso = null;
  chiaveStoria = '';
  const errore = $('errore-creazione');
  errore.textContent = messaggioErrore;
  errore.hidden = !messaggioErrore;
  impostaPulsantiNumeri(true);
  mostraSolo('sc-giocatori', SCHERMATE);
}

function impostaPulsantiNumeri(attivi) {
  document.querySelectorAll('[data-n]').forEach((b) => {
    b.disabled = !attivi;
  });
}

function elencoLobby() {
  const righe = [];
  for (let i = 0; i < stato.maxGiocatori; i += 1) {
    const g = stato.giocatori[i];
    righe.push(
      g
        ? el('li', {}, el('span', { classe: 'nome', testo: g.nome }), el('span', { classe: g.connesso ? '' : 'scollegato', testo: g.connesso ? 'collegato' : 'scollegato' }))
        : el('li', { classe: 'sconosciuto' }, el('span', { testo: `Giocatore ${i + 1}` }), el('span', { testo: 'in attesa...' })),
    );
  }
  riempi($('slot-lobby'), righe);
}

function disegnaLobby() {
  $('codice').textContent = stato.codice;

  const conRete = Boolean(ingresso?.qr);
  const qr = $('qr');
  qr.hidden = !conRete;
  if (conRete) qr.src = ingresso.qr;

  $('indirizzo').textContent = conRete ? ingresso.indirizzoBreve : '';
  $('testo-indirizzo').hidden = !conRete;
  $('testo-ingresso').textContent = conRete
    ? 'Inquadra il QR con la fotocamera del telefono.'
    : 'Non trovo la rete. Collega il computer al Wi-Fi (o attiva un hotspot) e riavvia il gioco.';

  elencoLobby();
  mostraSolo('sc-lobby', SCHERMATE);
}

function disegnaCreazione() {
  const righe = stato.giocatori.map((g) => {
    let descrizione = 'sta scegliendo...';
    if (g.classe) descrizione = g.confermato ? `${nomeClasse(g.classe)} ✓` : `${nomeClasse(g.classe)} (sta decidendo)`;
    if (!g.connesso) descrizione = 'scollegato';
    return el('li', {}, el('span', { classe: 'nome', testo: g.nome }), el('span', { classe: g.connesso ? '' : 'scollegato', testo: descrizione }));
  });
  riempi($('slot-creazione'), righe);

  const pronto = $('pronto');
  const doveMostrarlo = stato.fase === 'pronto';
  const eraNascosto = pronto.hidden;
  pronto.hidden = !doveMostrarlo;
  if (!doveMostrarlo) pronto.disabled = false;

  mostraSolo('sc-creazione', SCHERMATE);
  // Appena compare, ha il focus: basta anche premere Invio o Spazio.
  if (doveMostrarlo && eraNascosto) pronto.focus();
}

function contenutoDellaVista(vista) {
  switch (vista.tipo) {
    case 'pagina':
      return [el('p', { classe: 'testo-storia', testo: vista.testo })];

    case 'scelta':
      return [
        vista.contesto && el('p', { classe: 'testo-contesto', testo: vista.contesto }),
        el('p', { classe: 'domanda', testo: vista.domanda }),
      ];

    case 'risultato':
      return [
        el('p', { classe: 'chi' }, el('strong', { testo: vista.nome }), ' scrive: «', vista.testoScritto, '»'),
        el('p', { classe: 'testo-storia', testo: vista.risultato }),
      ];

    default:
      return [];
  }
}

function disegnaStoria() {
  const vista = stato.vista;
  if (!vista) return;

  // La dissolvenza parte solo quando il contenuto cambia davvero (non a ogni aggiornamento di stato).
  const chiave = vista.tipo === 'scelta' ? `scelta|${vista.domanda}` : JSON.stringify(vista);
  const contenitore = $('contenuto-storia');
  if (chiave !== chiaveStoria) {
    chiaveStoria = chiave;
    riempi(contenitore, contenutoDellaVista(vista));
    contenitore.classList.remove('nuovo');
    void contenitore.offsetWidth; // fa ripartire l'animazione
    contenitore.classList.add('nuovo');
  }

  const inScelta = vista.tipo === 'scelta';
  $('barra-scelta').hidden = !inScelta;
  $('suggerimento').hidden = inScelta;
  if (inScelta) {
    $('turno').textContent = stato.inAttesaDi
      ? `In attesa che ${stato.inAttesaDi} si ricolleghi`
      : `Tocca a: ${stato.giocatori[vista.turnoIndice]?.nome ?? ''}`;
  }

  mostraSolo('sc-storia', SCHERMATE);
}

function disegna() {
  if (!stato) return;
  if (stato.fase !== 'storia') chiaveStoria = '';

  // Durante un combattimento si vede l'arena 3D; in ogni altro momento l'arena si spegne.
  if (stato.fase === 'storia' && stato.vista?.tipo === 'combattimento') {
    chiaveStoria = '';
    mostraSolo('sc-arena', SCHERMATE);
    arena.mostra(stato);
    return;
  }
  arena.nascondi();

  switch (stato.fase) {
    case 'lobby':
      return disegnaLobby();
    case 'creazione':
    case 'pronto':
      return disegnaCreazione();
    case 'storia':
      return disegnaStoria();
    case 'fine':
      return mostraSolo('sc-fine', SCHERMATE);
    default:
      return undefined;
  }
}

// ------------------------------------------------------------------ azioni

async function creaPartita(numero) {
  impostaPulsantiNumeri(false);
  $('errore-creazione').hidden = true;

  const prova = $('modo-prova').checked;
  const risposta = await chiedi(socket, 'schermo:crea', { maxGiocatori: numero, prova });
  if (!risposta.ok) return mostraSceltaGiocatori(risposta.errore);

  memoria.salva(CHIAVE_SESSIONE, { codice: risposta.codice, tokenSchermo: risposta.tokenSchermo });
  ingresso = risposta;
  stato = risposta.stato;
  return disegna();
}

async function avanti() {
  const nelCombattimento = stato?.vista?.tipo === 'combattimento';
  // Nel combattimento si va avanti solo dopo la vittoria (il server comunque non lascerebbe fare altro).
  const puoAvanzare =
    stato?.fase === 'storia' && stato.vista && stato.vista.tipo !== 'scelta' && (!nelCombattimento || stato.vista.fase === 'vittoria');
  if (!puoAvanzare) return;

  const adesso = performance.now();
  if (adesso - ultimoAvanti < PAUSA_TRA_DUE_AVANTI_MS) return; // evita doppi click involontari
  ultimoAvanti = adesso;

  await chiedi(socket, 'schermo:avanti');
}

async function premiPronto() {
  const pulsante = $('pronto');
  pulsante.disabled = true;
  const risposta = await chiedi(socket, 'schermo:avanti');
  if (!risposta.ok) pulsante.disabled = false;
}

async function giocaDiNuovo() {
  await chiedi(socket, 'schermo:chiudi');
  memoria.cancella(CHIAVE_SESSIONE);
  mostraSceltaGiocatori();
}

function schermoIntero() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ------------------------------------------------------------------ collegamento al server

/** Dopo un ricaricamento o una riconnessione, riprende la partita in corso (se esiste ancora). */
async function riprendiPartita(tentativo = 1) {
  const salvata = memoria.leggi(CHIAVE_SESSIONE);
  if (!salvata?.codice || !salvata?.tokenSchermo) return mostraSceltaGiocatori();

  const risposta = await chiedi(socket, 'schermo:riprendi', salvata);
  if (risposta.ok) {
    ingresso = risposta;
    stato = risposta.stato;
    return disegna();
  }
  if (risposta.sessioneScaduta) {
    memoria.cancella(CHIAVE_SESSIONE);
    return mostraSceltaGiocatori();
  }
  // Errore momentaneo (rete lenta): si riprova un paio di volte prima di arrendersi.
  if (tentativo < 3) {
    await new Promise((r) => setTimeout(r, 1500));
    return riprendiPartita(tentativo + 1);
  }
  return mostraSceltaGiocatori(risposta.errore);
}

socket.on('connect', () => {
  $('banner').hidden = true;
  riprendiPartita();
});

socket.on('disconnect', () => {
  $('banner').hidden = false;
});

socket.on('connect_error', () => {
  $('banner').hidden = false;
});

socket.on('stato', (nuovoStato) => {
  stato = nuovoStato;
  disegna();
});

socket.on('stanza:chiusa', () => {
  memoria.cancella(CHIAVE_SESSIONE);
  mostraSceltaGiocatori();
});

// ------------------------------------------------------------------ comandi dell'utente

document.querySelectorAll('[data-n]').forEach((pulsante) => {
  pulsante.addEventListener('click', () => creaPartita(Number(pulsante.dataset.n)));
});

$('pronto').addEventListener('click', premiPronto);
$('rigioca').addEventListener('click', giocaDiNuovo);
$('sc-storia').addEventListener('click', avanti);
$('sc-arena').addEventListener('click', avanti);

document.addEventListener('keydown', (evento) => {
  // Ignoro il tasto tenuto premuto (ripete decine di volte al secondo) e le combinazioni.
  if (evento.repeat || evento.ctrlKey || evento.metaKey || evento.altKey) return;

  if (evento.key === 'f' || evento.key === 'F') return schermoIntero();

  // Solo in modalità prova: S salta il combattimento (serve a provare la storia senza combattere).
  if ((evento.key === 's' || evento.key === 'S') && stato?.prova && stato.vista?.tipo === 'combattimento') {
    chiedi(socket, 'schermo:salta');
    return undefined;
  }

  if (evento.code === 'Space' || evento.key === 'Enter') {
    // Se è selezionato un pulsante (es. PRONTO), ci pensa lui.
    if (evento.target instanceof HTMLButtonElement) return;
    evento.preventDefault();
    avanti();
  }
});

caricaClassi()
  .then((dati) => {
    classi = dati.classi;
    disegna();
  })
  .catch(() => {
    /* senza i nomi delle classi si vedono gli identificativi: il gioco funziona lo stesso */
  });
