// Il combattimento dentro la stanza e attraverso la rete: computer + telefono + server veri.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io as creaClient } from 'socket.io-client';
import { creaServer } from '../src/app.js';
import { CLASSI } from '../src/dati/classi.js';
import { storia } from '../src/dati/storia.js';
import { GestoreStanze } from '../src/gestoreStanze.js';
import { Stanza, FASI } from '../src/stanza.js';
import { validaStoria } from '../src/validazione.js';
import { ARENA } from '../src/dati/regoleCombattimento.js';

const DT = 1 / 30;

/** Porta una stanza dentro al primo combattimento (storia di prova: solo combattimenti). */
function stanzaInCombattimento({ giocatori = 1, contoSecondi = 0 } = {}) {
  const prova = [...storia.filter((m) => m.tipo === 'combattimento'), { tipo: 'fine' }];
  const stanza = new Stanza({ codice: 'ABCD', maxGiocatori: giocatori, storia: prova, classi: CLASSI, contoSecondi });
  const tutti = Array.from({ length: giocatori }, (_, i) => {
    const { giocatore } = stanza.aggiungiGiocatore(`s${i}`);
    stanza.confermaPersonaggio(giocatore.token, { classe: 'guerriero', nome: `G${i}` });
    return giocatore;
  });
  assert.ok(stanza.avanti().ok);
  return { stanza, giocatori: tutti };
}

describe('combattimento nella stanza', () => {
  it('all\'ingresso nel momento "combattimento" nasce lo scontro e la vista lo descrive', () => {
    const { stanza } = stanzaInCombattimento({ giocatori: 2 });
    assert.ok(stanza.combattimento);
    assert.equal(stanza.combattimento.nemici.length, 3); // tre lupi
    const vista = stanza.snapshot().vista;
    assert.equal(vista.tipo, 'combattimento');
    assert.equal(vista.fase, 'attesa');
    assert.deepEqual(vista.chiManca, [0, 1]);
    assert.match(vista.titolo, /lupi/);
  });

  it('lo snapshot della stanza non contiene token né dati di rete anche in combattimento', () => {
    const { stanza, giocatori } = stanzaInCombattimento();
    const testo = JSON.stringify(stanza.snapshot()) + JSON.stringify(stanza.combattimento.snapshot());
    assert.equal(testo.includes(giocatori[0].token), false);
    assert.equal(testo.includes('s0'), false);
  });

  it('input, azioni e orientamento funzionano solo con il token giusto', () => {
    const { stanza, giocatori } = stanzaInCombattimento();
    const { token } = giocatori[0];
    assert.equal(stanza.impostaInput('finto', 1, 0), false);
    assert.equal(stanza.impostaInput(token, NaN, 0), false);
    assert.equal(stanza.impostaInput(token, 1, 0), true);
    assert.equal(stanza.azioneCombattimento('finto', 'colpo').ok, false);
    assert.equal(stanza.azioneCombattimento(token, 'colpo').ok, false); // ancora in attesa: nessuno ha girato il telefono
    assert.equal(stanza.impostaOrizzontale('finto', true).ok, false);
    assert.equal(stanza.impostaOrizzontale(token, true).ok, true);
  });

  it('passo() segnala quando cambia qualcosa da comunicare a tutti', () => {
    const { stanza, giocatori } = stanzaInCombattimento();
    assert.equal(stanza.passo(DT), false);
    stanza.impostaOrizzontale(giocatori[0].token, true);
    assert.equal(stanza.passo(DT), true); // attesa -> in_corso (conto a 0)
    assert.equal(stanza.snapshot().vista.fase, 'in_corso');
    assert.equal(stanza.passo(DT), false);
    assert.equal(stanza.azioneCombattimento(giocatori[0].token, 'colpo').ok, true);
  });

  it('un telefono che si disconnette non blocca lo scontro e al ritorno rientra', () => {
    const { stanza, giocatori } = stanzaInCombattimento({ giocatori: 2 });
    stanza.impostaOrizzontale(giocatori[0].token, true);
    stanza.disconnettiGiocatore(giocatori[1].token, 's1');
    assert.equal(stanza.passo(DT), true);
    assert.equal(stanza.combattimento.fase, 'in_corso');
    assert.equal(stanza.combattimento.avatar[1].presente, false);
    stanza.riprendiGiocatore(giocatori[1].token, 'nuovo');
    assert.equal(stanza.combattimento.avatar[1].presente, true);
  });

  it('avanti() è rifiutato finché non si vince e poi si passa al combattimento successivo', () => {
    const { stanza, giocatori } = stanzaInCombattimento();
    stanza.impostaOrizzontale(giocatori[0].token, true);
    stanza.passo(DT);
    assert.equal(stanza.avanti().ok, false);
    assert.ok(stanza.saltaCombattimento().ok);
    assert.equal(stanza.snapshot().vista.fase, 'vittoria');
    assert.ok(stanza.avanti().ok);
    assert.match(stanza.snapshot().vista.titolo, /Guardiano/);
    assert.equal(stanza.combattimento.nemici.length, 1);
    assert.ok(stanza.saltaCombattimento().ok);
    assert.ok(stanza.avanti().ok);
    assert.equal(stanza.fase, FASI.FINE);
    assert.equal(stanza.combattimento, null);
    assert.equal(stanza.saltaCombattimento().ok, false);
  });

  it('fuori dal combattimento input e azioni sono rifiutati', () => {
    const stanza = new Stanza({ codice: 'ABCD', maxGiocatori: 1, storia, classi: CLASSI });
    const { giocatore } = stanza.aggiungiGiocatore('s');
    assert.equal(stanza.impostaInput(giocatore.token, 1, 1), false);
    assert.equal(stanza.azioneCombattimento(giocatore.token, 'colpo').ok, false);
    assert.equal(stanza.impostaOrizzontale(giocatore.token, true).ok, false);
    assert.equal(stanza.passo(DT), false);
  });
});

describe('validazione della storia con i combattimenti', () => {
  it('la storia vera è valida', () => {
    assert.doesNotThrow(() => validaStoria(storia, CLASSI));
  });

  it('un combattimento senza nemici o con nemici sconosciuti è rifiutato', () => {
    const base = [{ tipo: 'fine' }];
    assert.throws(() => validaStoria([{ tipo: 'combattimento', titolo: 'X' }, ...base], CLASSI), /manca l'elenco/);
    assert.throws(
      () => validaStoria([{ tipo: 'combattimento', titolo: 'X', incontro: [{ nemico: 'drago', quanti: 1 }] }, ...base], CLASSI),
      /sconosciuto/,
    );
  });
});

describe('combattimento attraverso la rete', () => {
  let server;
  let url;
  const aperti = [];

  before(async () => {
    const config = Object.freeze({ porta: 0, urlPubblico: '', maxStanze: 5, maxEventiAlSecondo: 100_000, maxInputAlSecondo: 100_000 });
    const gestore = new GestoreStanze({
      storia,
      classi: CLASSI,
      maxStanze: 5,
      inattivitaMassimaMs: 60_000,
      opzioniStanza: { contoSecondi: 0 },
    });
    ({ server } = creaServer({ gestore, config, ipLan: '127.0.0.1' }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    aperti.forEach((c) => c.close());
    await new Promise((r) => server.close(r));
  });

  const collega = () =>
    new Promise((risolvi, rifiuta) => {
      const c = creaClient(url, { transports: ['websocket'], forceNew: true });
      c.ultimoStato = null;
      c.combattimento = null;
      c.statoIo = null;
      c.eventi = [];
      c.on('stato', (s) => { c.ultimoStato = s; });
      c.on('combattimento:stato', (s) => { c.combattimento = s; c.eventi.push(...s.e); });
      c.on('combattimento:io', (s) => { c.statoIo = s; });
      aperti.push(c);
      c.once('connect', () => risolvi(c));
      c.once('connect_error', rifiuta);
    });

  const chiedi = (c, evento, dati) =>
    new Promise((risolvi) => (dati === undefined ? c.emit(evento, risolvi) : c.emit(evento, dati, risolvi)));

  async function aspetta(condizione, descrizione, ms = 3000) {
    const fine = Date.now() + ms;
    while (Date.now() < fine) {
      if (condizione()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail(`Timeout in attesa di: ${descrizione}`);
  }

  it('/api/combattimento dà le regole al computer', async () => {
    const r = await fetch(`${url}/api/combattimento`);
    assert.equal(r.status, 200);
    const dati = await r.json();
    assert.equal(dati.arena.lato, ARENA.lato);
    assert.ok(dati.nemici.lupo && dati.nemici.guardiano);
    assert.ok(dati.guerriero.colpo.portata > 0);
  });

  it('modalità prova: solo i combattimenti; leva, pulsanti e stato in tempo reale funzionano', async () => {
    const schermo = await collega();
    const { codice } = await chiedi(schermo, 'schermo:crea', { maxGiocatori: 1, prova: true });
    const telefono = await collega();
    const { tokenGiocatore } = await chiedi(telefono, 'giocatore:entra', { codice });
    assert.equal((await chiedi(telefono, 'giocatore:conferma', { classe: 'guerriero', nome: 'Lucio' })).ok, true);
    await aspetta(() => schermo.ultimoStato.fase === 'pronto', 'pronto');
    assert.equal((await chiedi(schermo, 'schermo:avanti')).ok, true);

    // Subito in combattimento (la storia di prova non ha pagine) e il telefono deve ancora girarsi
    await aspetta(() => schermo.ultimoStato.vista?.tipo === 'combattimento', 'vista combattimento');
    assert.equal(schermo.ultimoStato.vista.fase, 'attesa');
    assert.deepEqual(schermo.ultimoStato.vista.chiManca, [0]);

    // Un pulsante prima di girare il telefono non viene accettato
    assert.equal((await chiedi(telefono, 'giocatore:azione', { tipo: 'colpo' })).ok, false);
    // Un'azione inventata nemmeno
    assert.equal((await chiedi(telefono, 'giocatore:azione', { tipo: 'palladifuoco' })).ok, false);
    // Il telefono ruota: lo scontro parte
    assert.equal((await chiedi(telefono, 'giocatore:orizzontale', { orizzontale: true })).ok, true);
    await aspetta(() => schermo.ultimoStato.vista.fase === 'in_corso', 'fase in_corso');

    // Il computer riceve il mondo; il telefono solo vita e ricariche
    await aspetta(() => schermo.combattimento?.f === 'in_corso', 'mondo sul computer');
    await aspetta(() => telefono.statoIo?.f === 'in_corso', 'stato sul telefono');
    assert.equal(telefono.statoIo.v, 10);
    assert.equal(telefono.statoIo.g, undefined);
    assert.equal(telefono.combattimento, null); // il telefono non riceve il mondo intero
    assert.equal(schermo.combattimento.n.length, 3);

    // La leva muove il personaggio (verso nord = z che diminuisce)
    const z0 = schermo.combattimento.g[0].z;
    for (let k = 0; k < 6; k += 1) {
      telefono.emit('giocatore:input', { x: 0, z: 1 });
      await new Promise((r) => setTimeout(r, 40));
    }
    await aspetta(() => schermo.combattimento.g[0].z < z0 - 0.3, 'il personaggio si muove');

    // Input non validi vengono ignorati senza far cadere nulla
    telefono.emit('giocatore:input', { x: 'ciao', z: null });
    telefono.emit('giocatore:input', 'testo');
    telefono.emit('giocatore:input');

    // Un colpo produce un evento per gli effetti
    assert.equal((await chiedi(telefono, 'giocatore:azione', { tipo: 'colpo' })).ok, true);
    await aspetta(() => schermo.eventi.some((e) => e.e === 'colpo'), 'evento colpo');

    // Un altro telefono (anche con token) non può comandare il personaggio altrui: non ha un posto
    const estraneo = await collega();
    assert.equal((await chiedi(estraneo, 'giocatore:azione', { tipo: 'colpo' })).ok, false);
    estraneo.emit('giocatore:input', { x: 1, z: 1 });

    // Il telefono ricaricato riprende il suo posto in pieno scontro
    telefono.close();
    await aspetta(() => schermo.ultimoStato.giocatori[0].connesso === false, 'disconnesso');
    const nuovo = await collega();
    const ripresa = await chiedi(nuovo, 'giocatore:entra', { codice, tokenGiocatore });
    assert.equal(ripresa.ok, true);
    assert.equal(ripresa.stato.vista.tipo, 'combattimento');
    await aspetta(() => nuovo.statoIo?.f === 'in_corso', 'stato dopo la ripresa');

    // Il computer salta il combattimento: si passa al secondo, poi alla fine
    assert.equal((await chiedi(schermo, 'schermo:salta')).ok, true);
    await aspetta(() => schermo.ultimoStato.vista?.fase === 'vittoria', 'vittoria');
    assert.equal((await chiedi(schermo, 'schermo:avanti')).ok, true);
    await aspetta(() => /Guardiano/.test(schermo.ultimoStato.vista?.titolo ?? ''), 'secondo combattimento');
    assert.equal((await chiedi(schermo, 'schermo:salta')).ok, true);
    assert.equal((await chiedi(schermo, 'schermo:avanti')).ok, true);
    await aspetta(() => schermo.ultimoStato.fase === 'fine', 'fine');
  });

  it('la storia normale non è alterata: la modalità prova è solo su richiesta', async () => {
    const schermo = await collega();
    const { codice } = await chiedi(schermo, 'schermo:crea', { maxGiocatori: 1 });
    const telefono = await collega();
    await chiedi(telefono, 'giocatore:entra', { codice });
    await chiedi(telefono, 'giocatore:conferma', { classe: 'mago', nome: 'A' });
    await aspetta(() => schermo.ultimoStato.fase === 'pronto', 'pronto');
    await chiedi(schermo, 'schermo:avanti');
    assert.equal(schermo.ultimoStato.vista.tipo, 'pagina');
    // Un valore truthy ma non "true" non attiva la prova
    const altro = await collega();
    const { codice: c2 } = await chiedi(altro, 'schermo:crea', { maxGiocatori: 1, prova: 'si' });
    const t2 = await collega();
    await chiedi(t2, 'giocatore:entra', { codice: c2 });
    await chiedi(t2, 'giocatore:conferma', { classe: 'mago', nome: 'B' });
    await aspetta(() => altro.ultimoStato.fase === 'pronto', 'pronto 2');
    await chiedi(altro, 'schermo:avanti');
    assert.equal(altro.ultimoStato.vista.tipo, 'pagina');
  });
});

describe('ciclo del combattimento (30 volte al secondo)', () => {
  /** Finto Socket.IO: registra a chi viene mandato cosa. */
  function finto() {
    const invii = [];
    const emetti = (volatile) => ({
      to: (destinatario) => ({ emit: (evento, dati) => invii.push({ volatile, destinatario, evento, dati }) }),
    });
    return { invii, io: { to: emetti(false).to, volatile: emetti(true) } };
  }

  async function creaCicloDiProva() {
    const { creaCiclo } = await import('../src/ciclo.js');
    const gestore = new GestoreStanze({ storia, classi: CLASSI, maxStanze: 3, inattivitaMassimaMs: 60_000, opzioniStanza: { contoSecondi: 0 } });
    const { stanza } = gestore.crea(2, { prova: true });
    const giocatori = [0, 1].map((i) => stanza.aggiungiGiocatore(`sock${i}`).giocatore);
    giocatori.forEach((g, i) => stanza.confermaPersonaggio(g.token, { classe: 'guerriero', nome: `G${i}` }));
    const { io, invii } = finto();
    return { ciclo: creaCiclo({ io, gestore }), stanza, giocatori, invii };
  }

  it('non manda nulla finché nessuno sta combattendo', async () => {
    const { ciclo, invii } = await creaCicloDiProva();
    ciclo.tick(DT);
    assert.equal(invii.length, 0);
  });

  it('il mondo va ai computer 30 volte al secondo; ai telefoni solo vita e ricarica, più di rado', async () => {
    const { ciclo, stanza, giocatori, invii } = await creaCicloDiProva();
    stanza.avanti();
    giocatori.forEach((g) => stanza.impostaOrizzontale(g.token, true));
    invii.length = 0;

    for (let k = 0; k < 6; k += 1) ciclo.tick(DT);

    const alloSchermo = invii.filter((i) => i.evento === 'combattimento:stato');
    assert.equal(alloSchermo.length, 6);
    assert.ok(alloSchermo.every((i) => i.volatile && i.destinatario === `${stanza.codice}:schermo`));
    assert.ok(Array.isArray(alloSchermo[0].dati.e), 'ogni pacchetto porta gli eventi del momento');
    assert.equal(alloSchermo[0].dati.g.length, 2);

    const aiTelefoni = invii.filter((i) => i.evento === 'combattimento:io');
    assert.ok(aiTelefoni.length >= 4 && aiTelefoni.length <= 8, `telefoni: ${aiTelefoni.length}`);
    assert.deepEqual([...new Set(aiTelefoni.map((i) => i.destinatario))].sort(), ['sock0', 'sock1']);
    assert.equal(aiTelefoni[0].dati.g, undefined, 'il telefono non riceve il mondo intero');
    assert.equal(aiTelefoni[0].dati.vm, 10);
  });

  it('a ogni cambio di fase manda lo stato normale a tutti', async () => {
    const { ciclo, stanza, giocatori, invii } = await creaCicloDiProva();
    stanza.avanti();
    invii.length = 0;
    giocatori.forEach((g) => stanza.impostaOrizzontale(g.token, true));
    ciclo.tick(DT); // attesa -> in_corso
    const stati = invii.filter((i) => i.evento === 'stato');
    assert.equal(stati.length, 1);
    assert.equal(stati[0].destinatario, stanza.codice);
    assert.equal(stati[0].dati.vista.fase, 'in_corso');
    assert.equal(stati[0].volatile, false, 'i cambi di fase non si possono perdere');
    ciclo.tick(DT);
    assert.equal(invii.filter((i) => i.evento === 'stato').length, 1, 'e non si ripete a ogni passo');
  });

  it('un telefono scollegato non riceve nulla ma lo scontro va avanti', async () => {
    const { ciclo, stanza, giocatori, invii } = await creaCicloDiProva();
    stanza.avanti();
    giocatori.forEach((g) => stanza.impostaOrizzontale(g.token, true));
    stanza.disconnettiGiocatore(giocatori[1].token, 'sock1');
    invii.length = 0;
    for (let k = 0; k < 6; k += 1) ciclo.tick(DT);
    assert.equal(invii.some((i) => i.destinatario === 'sock1'), false);
    assert.ok(invii.some((i) => i.destinatario === 'sock0'));
  });

  it('un errore in una stanza non ferma le altre', async () => {
    const { creaCiclo } = await import('../src/ciclo.js');
    const { io, invii } = finto();
    const rotta = { codice: 'ROTT', combattimentoAttivo: true, passo: () => { throw new Error('guasto di prova'); } };
    const buona = { codice: 'BUON', combattimentoAttivo: true, giocatori: [], passo: () => false, combattimento: { prendiEventi: () => [], snapshot: () => ({ g: [], n: [] }) } };
    const ciclo = creaCiclo({ io, gestore: { tutte: () => [rotta, buona] } });
    const erroriVisti = [];
    const consoleErrorOriginale = console.error;
    console.error = (...a) => erroriVisti.push(a.join(' '));
    try {
      ciclo.tick(DT);
    } finally {
      console.error = consoleErrorOriginale;
    }
    assert.equal(erroriVisti.length, 1);
    assert.ok(invii.some((i) => i.destinatario === 'BUON:schermo'));
  });

  it('avvia() due volte non crea due timer e ferma() si può chiamare più volte', async () => {
    const { creaCiclo } = await import('../src/ciclo.js');
    const { io } = finto();
    const ciclo = creaCiclo({ io, gestore: { tutte: () => [] } });
    ciclo.avvia();
    ciclo.avvia();
    ciclo.ferma();
    ciclo.ferma();
  });
});
