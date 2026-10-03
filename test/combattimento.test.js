// Collaudo del simulatore di combattimento (codice puro: nessuna rete, nessuna grafica).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Combattimento, FASI_COMBATTIMENTO as F, avanti, destra, yawVerso, differenzaAngolo,
} from '../src/combattimento.js';
import { GUERRIERO as G, ARENA } from '../src/dati/regoleCombattimento.js';
import { NEMICI, validaIncontro } from '../src/dati/nemici.js';

const DT = 1 / 30;

/** Fa passare `secondi` di tempo di gioco a passi fissi. */
function avanza(c, secondi) {
  const passi = Math.round(secondi / DT);
  for (let k = 0; k < passi; k += 1) c.passo(DT);
}

/** Crea uno scontro già in corso (tutti in orizzontale, conto saltato). */
function scontro({ giocatori = 1, incontro = [{ nemico: 'lupo', quanti: 1 }], rng = () => 0.5 } = {}) {
  const c = new Combattimento({ numeroGiocatori: giocatori, incontro, rng, contoSecondi: 0 });
  for (let i = 0; i < giocatori; i += 1) c.impostaOrizzontale(i, true);
  c.passo(DT);
  assert.equal(c.fase, F.IN_CORSO);
  return c;
}

/** Mette il nemico n e il giocatore 0 a una distanza precisa (nemico a nord del giocatore). */
function posiziona(c, distanza, { nemico = 0 } = {}) {
  const av = c.avatar[0];
  av.x = 0; av.z = 0; av.yaw = 0;
  const n = c.nemici[nemico];
  n.x = 0; n.z = -distanza; n.yaw = Math.PI; // il nemico guarda verso il giocatore
}

test('geometria: avanti, destra e angoli sono coerenti', () => {
  const [fx, fz] = avanti(0);
  assert.ok(Math.abs(fx) < 1e-9 && Math.abs(fz + 1) < 1e-9);
  const [rx, rz] = destra(0);
  assert.ok(Math.abs(rx - 1) < 1e-9 && Math.abs(rz) < 1e-9);
  assert.ok(Math.abs(yawVerso(0, -5)) < 1e-9);
  assert.ok(Math.abs(differenzaAngolo(3.5 * Math.PI, 0.5 * Math.PI) - Math.PI) < 1e-9 || Math.abs(differenzaAngolo(3.5 * Math.PI, 0.5 * Math.PI) + Math.PI) < 1e-9);
  assert.ok(Math.abs(differenzaAngolo(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
});

test('validaIncontro accetta incontri sensati e rifiuta il resto', () => {
  assert.equal(validaIncontro([{ nemico: 'lupo', quanti: 3 }]), null);
  assert.match(validaIncontro([]), /manca/);
  assert.match(validaIncontro([{ nemico: 'drago', quanti: 1 }]), /sconosciuto/);
  assert.match(validaIncontro([{ nemico: 'lupo', quanti: 0 }]), /non valido/);
  assert.match(validaIncontro([{ nemico: 'lupo', quanti: 8 }, { nemico: 'lupo', quanti: 3 }]), /troppi/);
});

test('fasi: attesa finché tutti i telefoni non sono in orizzontale, poi conto, poi scontro', () => {
  const c = new Combattimento({ numeroGiocatori: 2, incontro: [{ nemico: 'lupo', quanti: 1 }], contoSecondi: 3 });
  c.passo(DT);
  assert.equal(c.fase, F.ATTESA);
  assert.deepEqual(c.chiManca(), [0, 1]);

  c.impostaOrizzontale(0, true);
  c.passo(DT);
  assert.equal(c.fase, F.ATTESA);
  assert.deepEqual(c.chiManca(), [1]);

  c.impostaOrizzontale(1, true);
  c.passo(DT);
  assert.equal(c.fase, F.CONTO);
  assert.equal(c.conto, 3);

  avanza(c, 1.1);
  assert.equal(c.conto, 2);

  // Se qualcuno rigira il telefono il conto si ferma.
  c.impostaOrizzontale(1, false);
  c.passo(DT);
  assert.equal(c.fase, F.ATTESA);
  assert.equal(c.conto, 0);

  c.impostaOrizzontale(1, true);
  c.passo(DT);
  assert.equal(c.fase, F.CONTO);
  avanza(c, 3.2);
  assert.equal(c.fase, F.IN_CORSO);
  assert.ok(c.prendiEventi().some((e) => e.e === 'inizio'));
});

test('un giocatore disconnesso non blocca l\'attesa', () => {
  const c = new Combattimento({ numeroGiocatori: 2, incontro: [{ nemico: 'lupo', quanti: 1 }], contoSecondi: 0 });
  c.impostaOrizzontale(0, true);
  c.impostaPresente(1, false);
  c.passo(DT);
  assert.equal(c.fase, F.IN_CORSO);
});

test('le azioni non vengono accettate fuori dallo scontro o con dati sbagliati', () => {
  const c = new Combattimento({ numeroGiocatori: 1, incontro: [{ nemico: 'lupo', quanti: 1 }], contoSecondi: 0 });
  assert.equal(c.azione(0, 'colpo'), false); // ancora in attesa
  c.impostaOrizzontale(0, true);
  c.passo(DT);
  assert.equal(c.azione(0, 'fulmine'), false);
  assert.equal(c.azione(7, 'colpo'), false);
  assert.equal(c.azione(0, 'colpo'), true);
});

test('movimento: la leva muove il personaggio e non si esce dall\'arena', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  const av = c.avatar[0];
  const z0 = av.z;
  c.impostaInput(0, 0, 1); // avanti, cioè verso il nemico (nord)
  c.passo(DT);
  assert.ok(av.z < z0);

  // Leva spenta: si ferma.
  c.impostaInput(0, 0, 0);
  const z1 = av.z;
  c.passo(DT);
  assert.equal(av.z, z1);

  // Contro il muro non si esce mai.
  av.x = 0; av.z = 0;
  c.nemici[0].x = 0; c.nemici[0].z = -11; // lontano dalla traiettoria laterale
  for (let k = 0; k < 600; k += 1) {
    c.impostaInput(0, 1, 0);
    c.passo(DT);
  }
  assert.ok(Math.abs(av.x) <= ARENA.lato / 2 - G.raggio + 1e-9);
  assert.ok(Math.abs(av.z) <= ARENA.lato / 2 - G.raggio + 1e-9);
});

test('la velocità non aumenta andando in diagonale e valori non validi sono ignorati', () => {
  const c = scontro();
  c.impostaInput(0, 5, 5);
  assert.ok(Math.hypot(c.avatar[0].mx, c.avatar[0].mz) <= 1 + 1e-9);
  c.impostaInput(0, 0.3, 0.2);
  c.impostaInput(0, NaN, 1);
  c.impostaInput(0, Infinity, 1);
  assert.equal(c.avatar[0].mx, 0.3);
});

test('se il telefono smette di mandare la leva il personaggio si ferma', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  c.impostaInput(0, 0, 1);
  avanza(c, 0.3);
  const z = c.avatar[0].z;
  avanza(c, 1); // oltre inputScadutoDopo
  const zDopo = c.avatar[0].z;
  avanza(c, 1);
  assert.equal(c.avatar[0].z, zDopo);
  assert.ok(zDopo <= z);
});

test('il personaggio si gira da solo verso il nemico puntato', () => {
  const c = scontro();
  const av = c.avatar[0];
  av.x = 0; av.z = 0; av.yaw = Math.PI; // guarda a sud
  c.nemici[0].x = 0; c.nemici[0].z = -8;
  avanza(c, 1);
  assert.ok(Math.abs(differenzaAngolo(av.yaw, 0)) < 0.05);
});

test('bersaglio: sceglie il più vicino e il pulsante fa passare al successivo', () => {
  const c = scontro({ incontro: [{ nemico: 'lupo', quanti: 3 }] });
  const av = c.avatar[0];
  av.x = 0; av.z = 0;
  c.nemici[0].x = -6; c.nemici[0].z = -3;
  c.nemici[1].x = 0; c.nemici[1].z = -4; // il più vicino
  c.nemici[2].x = 6; c.nemici[2].z = -3;
  c.nemici.forEach((n) => { n.fase = 'stordito'; n.t = -100; }); // fermi, non disturbano
  c.passo(DT);
  assert.equal(av.bersaglio, c.nemici[1].id);

  c.azione(0, 'bersaglio');
  const secondo = av.bersaglio;
  assert.notEqual(secondo, c.nemici[1].id);
  c.azione(0, 'bersaglio');
  c.azione(0, 'bersaglio');
  assert.equal(av.bersaglio, c.nemici[1].id); // giro completo
});

test('colpo: toglie 1 di vita, respinge e può stordire il lupo', () => {
  const c = scontro();
  posiziona(c, 2.9); // abbastanza lontano da non essere ancora in fase di attacco
  const lupo = c.nemici[0];
  c.azione(0, 'colpo');
  avanza(c, G.colpo.avvio);
  assert.equal(lupo.vita, lupo.vitaMax - G.colpo.danno);
  assert.ok(c.prendiEventi().some((e) => e.e === 'danno' && e.forte === false));
  assert.equal(lupo.fase, 'stordito');
  assert.ok(lupo.vz < 0); // respinto all'indietro (verso nord)
});

test('colpo a vuoto: nemico fuori portata o alle spalle', () => {
  const c = scontro();
  posiziona(c, 8);
  c.azione(0, 'colpo');
  avanza(c, 0.2);
  assert.equal(c.nemici[0].vita, c.nemici[0].vitaMax);
  assert.ok(c.prendiEventi().some((e) => e.e === 'mancato'));

  // Alle spalle: il personaggio guarda a nord ma il nemico è a sud e il bersaglio è bloccato altrove
  const d = scontro({ incontro: [{ nemico: 'lupo', quanti: 2 }] });
  const av = d.avatar[0];
  av.x = 0; av.z = 0; av.yaw = 0;
  d.nemici[0].x = 0; d.nemici[0].z = -9; // quello puntato
  d.nemici[1].x = 0; d.nemici[1].z = 1.5; // alle spalle, ma più lontano da "0.7 volte"
  d.nemici.forEach((n) => { n.fase = 'stordito'; n.t = -100; });
  av.bersaglio = d.nemici[0].id;
  av.bloccoManuale = true;
  d.azione(0, 'colpo');
  d.passo(DT);
  avanza(d, 0.2);
  assert.equal(d.nemici[1].vita, d.nemici[1].vitaMax);
});

test('colpo forte: più lento, 3 di danno, e ferma anche il guardiano', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  posiziona(c, 3);
  const g = c.nemici[0];
  // Il guardiano sta recuperando dopo un attacco: un colpo forte lo ferma, uno normale no.
  g.fase = 'recupero'; g.attacco = NEMICI.guardiano.attacchi[0]; g.t = 0;
  c.azione(0, 'colpoForte');
  avanza(c, G.colpo.avvio + 0.05);
  assert.equal(g.vita, g.vitaMax); // ancora non è arrivato
  avanza(c, G.colpoForte.avvio);
  assert.equal(g.vita, g.vitaMax - G.colpoForte.danno);
  assert.equal(g.fase, 'stordito');
});

test('un colpo normale non ferma il guardiano', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  posiziona(c, 3);
  c.azione(0, 'colpo');
  avanza(c, 0.2);
  assert.equal(c.nemici[0].vita, c.nemici[0].vitaMax - 1);
  assert.notEqual(c.nemici[0].fase, 'stordito');
});

test('input buffer: un pulsante premuto troppo presto parte appena si è liberi', () => {
  const c = scontro();
  posiziona(c, 8);
  c.azione(0, 'colpo');
  avanza(c, 0.2); // mancano meno di bufferAzioni secondi alla fine del colpo
  assert.equal(c.azione(0, 'colpo'), true); // in coda
  assert.ok(c.avatar[0].coda);
  avanza(c, 0.4);
  const colpi = c.prendiEventi().filter((e) => e.e === 'colpo');
  assert.equal(colpi.length, 2);

  // La coda scade se non si libera in tempo.
  const d = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  d.azione(0, 'colpoForte');
  avanza(d, 0.05);
  d.azione(0, 'colpo');
  avanza(d, G.bufferAzioni + 0.1);
  assert.equal(d.avatar[0].coda, null);
});

test('schivata: scatto, invulnerabilità, ricarica', () => {
  const c = scontro();
  const av = c.avatar[0];
  av.x = 0; av.z = 5; av.yaw = 0;
  c.nemici[0].x = 0; c.nemici[0].z = -9;
  c.impostaInput(0, 1, 0); // verso destra
  c.passo(DT);
  c.azione(0, 'schivata');
  assert.equal(av.stato, 'schivata');
  const x0 = av.x;
  avanza(c, 0.15);
  assert.ok(av.x - x0 > 1);
  avanza(c, 0.2);
  assert.equal(av.stato, 'libero');

  // Non si può rischivare subito
  assert.ok(av.attesaSchivata > 0);
  c.azione(0, 'schivata');
  assert.notEqual(av.stato, 'schivata');
  avanza(c, G.schivata.attesa + 0.1);
  c.azione(0, 'schivata');
  assert.equal(av.stato, 'schivata');
});

test('schivata con leva ferma: salto all\'indietro', () => {
  const c = scontro();
  const av = c.avatar[0];
  av.x = 0; av.z = 0; av.yaw = 0;
  c.nemici[0].x = 0; c.nemici[0].z = -9;
  c.azione(0, 'schivata');
  avanza(c, 0.2);
  assert.ok(av.z > 1);
});

test('il lupo si carica prima di mordere e la schivata lo evita', () => {
  const c = scontro();
  posiziona(c, 1.7);
  const lupo = c.nemici[0];
  c.passo(DT);
  assert.equal(lupo.fase, 'avviso');
  assert.ok(c.prendiEventi().some((e) => e.e === 'avviso' && e.a === 'morso'));

  // Il giocatore schiva di lato appena il lupo si carica.
  c.impostaInput(0, 1, 0);
  c.azione(0, 'schivata');
  avanza(c, 0.7);
  const eventi = c.prendiEventi();
  assert.ok(eventi.some((e) => e.e === 'attacco'));
  assert.equal(c.avatar[0].vita, G.vita);
});

test('schivata nel momento giusto: l\'attacco ad area non fa danno (invulnerabilità)', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }], rng: () => 0.99 });
  const g = c.nemici[0];
  g.x = 0; g.z = 0; g.yaw = 0;
  c.avatar[0].x = 0; c.avatar[0].z = 2.5;
  c.passo(DT);
  assert.equal(g.attacco.nome, 'schianto');
  while (g.t < 1.1) c.passo(DT);
  c.prendiEventi();
  c.azione(0, 'schivata');
  avanza(c, 0.4);
  const eventi = c.prendiEventi();
  assert.ok(eventi.some((e) => e.e === 'attacco' && e.a === 'schianto'));
  assert.ok(eventi.some((e) => e.e === 'schivata_riuscita'));
  assert.equal(c.avatar[0].vita, G.vita);
});

test('se il giocatore non reagisce il morso fa danno e dà un attimo di tregua', () => {
  const c = scontro();
  posiziona(c, 1.7);
  avanza(c, 0.75);
  const av = c.avatar[0];
  assert.equal(av.vita, G.vita - NEMICI.lupo.attacchi[0].danno);
  assert.ok(c.prendiEventi().some((e) => e.e === 'ferito'));
  assert.ok(av.invul > 0);
  assert.equal(c.statoPerGiocatore(0).h, 1);
});

test('il guardiano: l\'attacco ad area colpisce chi è vicino, non chi è lontano', () => {
  const c = scontro({ giocatori: 2, incontro: [{ nemico: 'guardiano', quanti: 1 }], rng: () => 0.99 });
  const g = c.nemici[0];
  g.x = 0; g.z = 0; g.yaw = 0;
  c.avatar[0].x = 2.5; c.avatar[0].z = 0;
  c.avatar[1].x = 9; c.avatar[1].z = 9;
  avanza(c, 1.4); // rng alto → sceglie lo schianto (ultimo attacco)
  const eventi = c.prendiEventi();
  assert.ok(eventi.some((e) => e.e === 'avviso' && e.a === 'schianto'));
  assert.equal(c.avatar[0].vita, G.vita - 3);
  assert.equal(c.avatar[1].vita, G.vita);
});

test('vittoria quando cadono tutti i nemici, e il nemico morto sparisce dallo snapshot dopo l\'animazione', () => {
  const c = scontro();
  posiziona(c, 1.8);
  c.nemici[0].vita = 1;
  c.azione(0, 'colpo');
  avanza(c, 0.2);
  assert.equal(c.fase, F.VITTORIA);
  const eventi = c.prendiEventi();
  assert.ok(eventi.some((e) => e.e === 'morto'));
  assert.ok(eventi.some((e) => e.e === 'vittoria'));
  assert.equal(c.snapshot().n.length, 1);
  avanza(c, 1);
  assert.equal(c.snapshot().n.length, 0);
  // Dopo la vittoria le azioni non fanno più nulla.
  assert.equal(c.azione(0, 'colpo'), false);
});

test('sconfitta: tutti a terra, poi si riparte da capo', () => {
  const c = scontro();
  posiziona(c, 1.7);
  c.avatar[0].vita = 1;
  avanza(c, 0.75);
  assert.equal(c.fase, F.SCONFITTA);
  assert.equal(c.avatar[0].stato, 'ko');
  assert.ok(c.prendiEventi().some((e) => e.e === 'sconfitta'));

  avanza(c, 4.2);
  assert.equal(c.tentativi, 2);
  assert.equal(c.avatar[0].vita, G.vita);
  assert.equal(c.nemici[0].vita, c.nemici[0].vitaMax);
  // I telefoni sono ancora in orizzontale: riparte il conto da solo
  assert.ok([F.CONTO, F.IN_CORSO].includes(c.fase));
});

test('con più giocatori la sconfitta arriva solo quando cadono tutti', () => {
  const c = scontro({ giocatori: 2 });
  c.avatar[0].vita = 1;
  const lupo = c.nemici[0];
  lupo.x = c.avatar[0].x; lupo.z = c.avatar[0].z - 1.7; lupo.yaw = Math.PI;
  c.avatar[1].x = 11; c.avatar[1].z = 11;
  avanza(c, 0.8);
  assert.equal(c.avatar[0].stato, 'ko');
  assert.equal(c.fase, F.IN_CORSO);
  // Un giocatore a terra non può agire
  assert.equal(c.azione(0, 'colpo'), false);
});

test('un giocatore che si disconnette durante lo scontro non viene più colpito né conta per la sconfitta', () => {
  const c = scontro({ giocatori: 2 });
  c.impostaPresente(1, false);
  c.avatar[0].stato = 'ko';
  c.passo(DT);
  assert.equal(c.fase, F.SCONFITTA);
});

test('i giocatori non attraversano i nemici e i nemici non si sovrappongono', () => {
  const c = scontro({ incontro: [{ nemico: 'guardiano', quanti: 1 }] });
  const av = c.avatar[0];
  av.x = 0; av.z = 0;
  c.nemici[0].x = 0; c.nemici[0].z = -1;
  c.passo(DT);
  const distanza = Math.hypot(av.x - c.nemici[0].x, av.z - c.nemici[0].z);
  assert.ok(distanza >= G.raggio + NEMICI.guardiano.raggio - 1e-6);

  const d = scontro({ incontro: [{ nemico: 'lupo', quanti: 2 }] });
  d.nemici[0].x = 0; d.nemici[0].z = -5;
  d.nemici[1].x = 0.1; d.nemici[1].z = -5;
  d.passo(DT);
  const dd = Math.hypot(d.nemici[0].x - d.nemici[1].x, d.nemici[0].z - d.nemici[1].z);
  assert.ok(dd >= 1 - 1e-6);
});

test('snapshot e stato per il telefono hanno la forma attesa', () => {
  const c = scontro({ giocatori: 2, incontro: [{ nemico: 'lupo', quanti: 2 }, { nemico: 'guardiano', quanti: 1 }] });
  const s = c.snapshot();
  assert.equal(s.f, F.IN_CORSO);
  assert.equal(s.g.length, 2);
  assert.equal(s.n.length, 3);
  assert.deepEqual(Object.keys(s.g[0]).sort(), ['b', 'd', 'i', 'k', 'o', 'p', 'pr', 's', 'v', 'vm', 'x', 'y', 'z'].sort());
  assert.deepEqual(Object.keys(s.n[0]).sort(), ['a', 'id', 'p', 's', 't', 'v', 'vm', 'x', 'y', 'z'].sort());
  assert.doesNotThrow(() => JSON.stringify(s));
  assert.equal(c.statoPerGiocatore(5), null);
  assert.deepEqual(Object.keys(c.statoPerGiocatore(0)).sort(), ['c', 'd', 'f', 'h', 's', 'v', 'vm'].sort());
});

test('passo ignora salti di tempo enormi o negativi', () => {
  const c = scontro();
  const z = c.avatar[0].z;
  c.impostaInput(0, 0, 1);
  c.passo(1000);
  assert.ok(z - c.avatar[0].z <= G.velocita * 0.1 + 1e-9);
  c.passo(-5);
  assert.ok(Number.isFinite(c.avatar[0].z));
});

test('partita simulata a caso: il mondo resta sempre coerente', () => {
  let seme = 12345;
  const rng = () => { seme = (seme * 1664525 + 1013904223) % 4294967296; return seme / 4294967296; };
  const c = scontro({ giocatori: 3, incontro: [{ nemico: 'lupo', quanti: 3 }, { nemico: 'guardiano', quanti: 1 }], rng });
  const azioni = ['colpo', 'colpoForte', 'schivata', 'bersaglio'];
  for (let k = 0; k < 6000; k += 1) {
    for (let i = 0; i < 3; i += 1) {
      if (rng() < 0.1) c.impostaInput(i, rng() * 2 - 1, rng() * 2 - 1);
      if (rng() < 0.05) c.azione(i, azioni[Math.floor(rng() * 4)]);
    }
    c.passo(DT);
    c.prendiEventi();
    for (const a of c.avatar) {
      assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.yaw));
      assert.ok(Math.abs(a.x) <= 12 && Math.abs(a.z) <= 12);
      assert.ok(a.vita >= 0 && a.vita <= a.vitaMax);
    }
    for (const n of c.nemici) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.z));
      assert.ok(Math.abs(n.x) <= 12 && Math.abs(n.z) <= 12);
      assert.ok(n.vita >= 0);
    }
  }
});
