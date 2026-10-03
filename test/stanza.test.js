import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Stanza, FASI } from '../src/stanza.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { validaStoria, pulisciNome, pulisciScelta, normalizzaCodice } from '../src/validazione.js';
import { risolviUrlBase } from '../src/rete.js';

const nuovaStanza = (maxGiocatori = 2) =>
  new Stanza({ codice: 'ABCD', maxGiocatori, storia, classi: CLASSI });

/** Porta la stanza fino alla fase "pronto" con i giocatori e le classi indicate. */
function stanzaPronta(classi = ['guerriero', 'mago']) {
  const stanza = nuovaStanza(classi.length);
  const giocatori = classi.map((classe, i) => {
    const { giocatore } = stanza.aggiungiGiocatore(`socket-${i}`);
    stanza.confermaPersonaggio(giocatore.token, { classe, nome: `P${i + 1}` });
    return giocatore;
  });
  assert.equal(stanza.fase, FASI.PRONTO);
  return { stanza, giocatori };
}

/** Avanza finché la vista corrente è del tipo richiesto. */
function avanzaFinoA(stanza, tipoVista) {
  for (let i = 0; i < 200; i += 1) {
    if (stanza.snapshot().vista?.tipo === tipoVista) return;
    assert.ok(stanza.avanti().ok, 'avanti() non doveva fallire');
  }
  assert.fail(`Non si arriva mai a una vista "${tipoVista}"`);
}

describe('ingresso dei giocatori', () => {
  it('passa a "creazione" quando entra l\'ultimo giocatore', () => {
    const stanza = nuovaStanza(2);
    assert.equal(stanza.fase, FASI.LOBBY);
    stanza.aggiungiGiocatore('a');
    assert.equal(stanza.fase, FASI.LOBBY);
    stanza.aggiungiGiocatore('b');
    assert.equal(stanza.fase, FASI.CREAZIONE);
  });

  it('rifiuta un giocatore in più', () => {
    const stanza = nuovaStanza(1);
    stanza.aggiungiGiocatore('a');
    assert.equal(stanza.aggiungiGiocatore('b').ok, false);
  });

  it('assegna i nomi di default in ordine di arrivo', () => {
    const stanza = nuovaStanza(2);
    stanza.aggiungiGiocatore('a');
    stanza.aggiungiGiocatore('b');
    assert.deepEqual(
      stanza.snapshot().giocatori.map((g) => g.nome),
      ['Giocatore 1', 'Giocatore 2'],
    );
  });

  it('permette di riprendere il proprio posto col token, non con uno sbagliato', () => {
    const stanza = nuovaStanza(2);
    const { giocatore } = stanza.aggiungiGiocatore('a');
    stanza.disconnettiGiocatore(giocatore.token, 'a');
    assert.equal(stanza.snapshot().giocatori[0].connesso, false);

    assert.equal(stanza.riprendiGiocatore('token-finto', 'x').ok, false);
    assert.equal(stanza.riprendiGiocatore(giocatore.token, 'b').ok, true);
    assert.equal(stanza.snapshot().giocatori[0].connesso, true);
  });

  it('ignora la disconnessione di un vecchio collegamento già sostituito', () => {
    const stanza = nuovaStanza(1);
    const { giocatore } = stanza.aggiungiGiocatore('vecchio');
    stanza.riprendiGiocatore(giocatore.token, 'nuovo');
    stanza.disconnettiGiocatore(giocatore.token, 'vecchio');
    assert.equal(stanza.snapshot().giocatori[0].connesso, true);
  });

  it('non lascia entrare nuovi giocatori a partita iniziata', () => {
    const { stanza } = stanzaPronta(['guerriero']);
    stanza.avanti();
    assert.equal(stanza.aggiungiGiocatore('tardivo').ok, false);
  });
});

describe('creazione del personaggio', () => {
  it('accetta solo classi esistenti', () => {
    const stanza = nuovaStanza(1);
    const { giocatore } = stanza.aggiungiGiocatore('a');
    assert.equal(stanza.scegliClasse(giocatore.token, 'drago').ok, false);
    assert.equal(stanza.scegliClasse(giocatore.token, '__proto__').ok, false);
    assert.equal(stanza.scegliClasse(giocatore.token, 'arciere').ok, true);
  });

  it('non conferma senza classe e non permette modifiche dopo la conferma', () => {
    const stanza = nuovaStanza(1);
    const { giocatore } = stanza.aggiungiGiocatore('a');
    assert.equal(stanza.confermaPersonaggio(giocatore.token, { classe: null, nome: 'Luca' }).ok, false);
    assert.equal(stanza.confermaPersonaggio(giocatore.token, { classe: 'mago', nome: 'Luca' }).ok, true);
    assert.equal(stanza.scegliClasse(giocatore.token, 'arciere').ok, false);
    assert.equal(stanza.confermaPersonaggio(giocatore.token, { classe: 'arciere', nome: 'X' }).ok, false);
  });

  it('usa il nome di default se il nome è vuoto', () => {
    const stanza = nuovaStanza(1);
    const { giocatore } = stanza.aggiungiGiocatore('a');
    stanza.confermaPersonaggio(giocatore.token, { classe: 'mago', nome: '   ' });
    assert.equal(stanza.snapshot().giocatori[0].nome, 'Giocatore 1');
  });

  it('diventa "pronto" solo quando TUTTI hanno confermato', () => {
    const stanza = nuovaStanza(2);
    const a = stanza.aggiungiGiocatore('a').giocatore;
    const b = stanza.aggiungiGiocatore('b').giocatore;
    stanza.confermaPersonaggio(a.token, { classe: 'mago', nome: 'A' });
    assert.equal(stanza.fase, FASI.CREAZIONE);
    stanza.confermaPersonaggio(b.token, { classe: 'arciere', nome: 'B' });
    assert.equal(stanza.fase, FASI.PRONTO);
  });

  it('con un solo giocatore la conferma porta subito a "pronto"', () => {
    const { stanza } = stanzaPronta(['scudiere']);
    assert.equal(stanza.fase, FASI.PRONTO);
  });
});

describe('storia e turni', () => {
  it('parte dalla prima pagina quando si preme "avanti" da "pronto"', () => {
    const { stanza } = stanzaPronta();
    stanza.avanti();
    assert.equal(stanza.fase, FASI.STORIA);
    assert.equal(stanza.snapshot().vista.tipo, 'pagina');
  });

  it('"avanti" non funziona prima di "pronto"', () => {
    const stanza = nuovaStanza(1);
    stanza.aggiungiGiocatore('a');
    assert.equal(stanza.avanti().ok, false);
  });

  it('i turni di scelta seguono l\'ordine di arrivo e solo chi è di turno può rispondere', () => {
    const { stanza, giocatori } = stanzaPronta(['guerriero', 'mago', 'arciere']);
    stanza.avanti();
    avanzaFinoA(stanza, 'scelta');
    assert.equal(stanza.snapshot().vista.turnoIndice, 0);

    // Fuori turno
    assert.equal(stanza.inviaScelta(giocatori[1].token, 'ciao').ok, false);
    // Vuota
    assert.equal(stanza.inviaScelta(giocatori[0].token, '   ').ok, false);
    // Giusta
    assert.equal(stanza.inviaScelta(giocatori[0].token, 'Aiutiamo Marta').ok, true);
    // Non può rispondere due volte
    assert.equal(stanza.inviaScelta(giocatori[0].token, 'di nuovo').ok, false);
    assert.equal(stanza.snapshot().vista.turnoIndice, 1);
  });

  it('durante la raccolta delle scelte "avanti" non salta nessuno', () => {
    const { stanza } = stanzaPronta();
    stanza.avanti();
    avanzaFinoA(stanza, 'scelta');
    assert.equal(stanza.avanti().ok, false);
    assert.equal(stanza.snapshot().vista.tipo, 'scelta');
  });

  it('dopo tutte le risposte mostra un risultato per giocatore, scelto in base alla CLASSE', () => {
    const { stanza, giocatori } = stanzaPronta(['guerriero', 'mago']);
    stanza.avanti();
    avanzaFinoA(stanza, 'scelta');
    const momento = storia.find((m) => m.tipo === 'scelta');

    stanza.inviaScelta(giocatori[0].token, 'Risposta uno');
    stanza.inviaScelta(giocatori[1].token, 'Risposta due');

    let vista = stanza.snapshot().vista;
    assert.equal(vista.tipo, 'risultato');
    assert.equal(vista.nome, 'P1');
    assert.equal(vista.testoScritto, 'Risposta uno');
    assert.equal(vista.risultato, momento.risultati.guerriero);

    stanza.avanti();
    vista = stanza.snapshot().vista;
    assert.equal(vista.tipo, 'risultato');
    assert.equal(vista.nome, 'P2');
    assert.equal(vista.risultato, momento.risultati.mago);

    stanza.avanti();
    assert.equal(stanza.snapshot().vista.tipo, 'pagina');
  });

  it('i combattimenti sono pagine segnaposto e la storia prosegue', () => {
    const { stanza, giocatori } = stanzaPronta(['guerriero']);
    stanza.avanti();
    // Percorre tutta la storia rispondendo alle scelte e contando i combattimenti
    let combattimenti = 0;
    for (let i = 0; i < 300 && stanza.fase === FASI.STORIA; i += 1) {
      const vista = stanza.snapshot().vista;
      if (vista.tipo === 'combattimento') combattimenti += 1;
      if (vista.tipo === 'scelta') stanza.inviaScelta(giocatori[0].token, 'ok');
      else assert.ok(stanza.avanti().ok);
    }
    assert.equal(combattimenti, 2);
  });

  it('percorre tutta la storia con 4 giocatori fino alla fine', () => {
    const { stanza, giocatori } = stanzaPronta(['guerriero', 'scudiere', 'mago', 'arciere']);
    stanza.avanti();
    for (let i = 0; i < 500 && stanza.fase === FASI.STORIA; i += 1) {
      const vista = stanza.snapshot().vista;
      if (vista.tipo === 'scelta') stanza.inviaScelta(giocatori[vista.turnoIndice].token, `risposta ${i}`);
      else assert.ok(stanza.avanti().ok);
    }
    assert.equal(stanza.fase, FASI.FINE);
    assert.equal(stanza.snapshot().vista, null);
    assert.equal(stanza.avanti().ok, false);
  });

  it('segnala quando si aspetta un giocatore disconnesso', () => {
    const { stanza, giocatori } = stanzaPronta(['guerriero', 'mago']);
    stanza.avanti();
    avanzaFinoA(stanza, 'scelta');
    stanza.disconnettiGiocatore(giocatori[0].token, 'socket-0');
    assert.equal(stanza.snapshot().inAttesaDi, 'P1');
    stanza.riprendiGiocatore(giocatori[0].token, 'nuovo');
    assert.equal(stanza.snapshot().inAttesaDi, null);
  });
});

describe('sicurezza dello snapshot e del computer', () => {
  it('lo snapshot non contiene mai token', () => {
    const { stanza, giocatori } = stanzaPronta();
    const testo = JSON.stringify(stanza.snapshot());
    assert.ok(!testo.includes(giocatori[0].token));
    assert.ok(!testo.includes(stanza.tokenSchermo));
  });

  it('solo il token giusto autorizza il computer', () => {
    const stanza = nuovaStanza();
    assert.equal(stanza.verificaSchermo(stanza.tokenSchermo), true);
    assert.equal(stanza.verificaSchermo('sbagliato'), false);
    assert.equal(stanza.verificaSchermo(undefined), false);
  });
});

describe('validazione', () => {
  it('pulisce nomi e scelte', () => {
    assert.equal(pulisciNome('  Luca\n\t  il   Grande '), 'Luca il Grande');
    assert.equal(pulisciNome('x'.repeat(100)).length, 20);
    assert.equal(pulisciScelta('a'.repeat(500)).length, 200);
    assert.equal(pulisciNome(42), '');
  });

  it('normalizza il codice stanza', () => {
    assert.equal(normalizzaCodice(' ab-cd '), 'ABCD');
    assert.equal(normalizzaCodice('abcdefg'), 'ABCD');
    assert.equal(normalizzaCodice(null), '');
  });

  it('la storia vera è valida e una storia rotta viene rifiutata', () => {
    assert.doesNotThrow(() => validaStoria(storia, CLASSI));
    assert.throws(() => validaStoria([{ tipo: 'pagina', testo: 'ciao' }], CLASSI), /fine/);
    assert.throws(
      () => validaStoria([{ tipo: 'scelta', domanda: '?', risultati: { mago: 'x' } }, { tipo: 'fine' }], CLASSI),
      /manca il risultato/,
    );
  });
});

describe('indirizzo per il QR', () => {
  const base = { urlPubblico: '', protocolloRichiesto: undefined, porta: 3000, ipLan: '192.168.1.20' };

  it('con localhost usa l\'IP della rete locale', () => {
    assert.equal(risolviUrlBase({ ...base, hostRichiesta: 'localhost:3000' }), 'http://192.168.1.20:3000');
  });

  it('se il computer usa già un indirizzo vero, lo riusa', () => {
    assert.equal(risolviUrlBase({ ...base, hostRichiesta: '192.168.1.20:3000' }), 'http://192.168.1.20:3000');
    assert.equal(
      risolviUrlBase({ ...base, hostRichiesta: 'brumavera.onrender.com', protocolloRichiesto: 'https' }),
      'https://brumavera.onrender.com',
    );
  });

  it('PUBLIC_URL ha la precedenza e un host strano viene scartato', () => {
    assert.equal(risolviUrlBase({ ...base, urlPubblico: 'https://gioco.it', hostRichiesta: 'localhost' }), 'https://gioco.it');
    assert.equal(risolviUrlBase({ ...base, hostRichiesta: 'evil.com/<script>' }), 'http://192.168.1.20:3000');
  });

  it('senza rete e con localhost non c\'è indirizzo', () => {
    assert.equal(risolviUrlBase({ ...base, ipLan: null, hostRichiesta: 'localhost:3000' }), null);
  });
});
