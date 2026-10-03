// Funzioni pure dell'arena sul computer (riquadri, animazioni, messaggi, zone d'attacco).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calcolaRiquadri, differenzaAngolo, frazione, posaSpada, puntiSettore, smorza, smorzaAngolo, testoMessaggio, zonaAttacco,
} from '../public/js/arena-logica.js';
import { NEMICI } from '../src/dati/nemici.js';

const area = (r) => r.w * r.h;
const sovrapposti = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('schermo diviso', () => {
  for (const [n, L, A] of [[1, 1280, 720], [2, 1280, 720], [3, 1921, 1081], [4, 1001, 601], [4, 1920, 1080]]) {
    it(`${n} giocatori su ${L}x${A}: i riquadri coprono lo schermo senza buchi né sovrapposizioni`, () => {
      const { giocatori, extra } = calcolaRiquadri(n, L, A);
      assert.equal(giocatori.length, n);
      const tutti = extra ? [...giocatori, extra] : giocatori;
      assert.equal(tutti.reduce((somma, r) => somma + area(r), 0), L * A);
      for (let i = 0; i < tutti.length; i += 1) {
        for (let j = i + 1; j < tutti.length; j += 1) assert.equal(sovrapposti(tutti[i], tutti[j]), false);
        const r = tutti[i];
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= L && r.y + r.h <= A);
      }
    });
  }

  it('con 3 giocatori il quarto riquadro è libero per la mappa; negli altri casi no', () => {
    assert.ok(calcolaRiquadri(3, 800, 600).extra);
    assert.equal(calcolaRiquadri(1, 800, 600).extra, null);
    assert.equal(calcolaRiquadri(2, 800, 600).extra, null);
    assert.equal(calcolaRiquadri(4, 800, 600).extra, null);
  });

  it('con 2 giocatori lo schermo è diviso in due metà affiancate', () => {
    const { giocatori } = calcolaRiquadri(2, 1000, 500);
    assert.deepEqual(giocatori, [{ x: 0, y: 0, w: 500, h: 500 }, { x: 500, y: 0, w: 500, h: 500 }]);
  });

  it('dimensioni assurde non rompono nulla', () => {
    const { giocatori } = calcolaRiquadri(4, 0, -5);
    assert.ok(giocatori.every((r) => Number.isFinite(r.w) && r.w >= 0 && r.h >= 0));
  });
});

describe('movimento morbido', () => {
  it('smorza si avvicina al bersaglio senza superarlo, anche con dt enorme', () => {
    let v = 0;
    for (let k = 0; k < 10; k += 1) {
      const nuovo = smorza(v, 10, 0.016, 20);
      assert.ok(nuovo > v && nuovo < 10);
      v = nuovo;
    }
    assert.ok(Math.abs(smorza(0, 10, 100, 20) - 10) < 1e-6);
    assert.equal(smorza(5, 5, 0.016, 20), 5);
  });

  it('gli angoli girano dalla parte più corta (nessun giro completo al passaggio di ±π)', () => {
    assert.ok(Math.abs(differenzaAngolo(0.1, 2 * Math.PI - 0.1) - 0.2) < 1e-9);
    assert.ok(Math.abs(differenzaAngolo(-3.1, 3.1) - (2 * Math.PI - 6.2)) < 1e-9);
    const dopo = smorzaAngolo(3.0, -3.0, 0.016, 10);
    assert.ok(dopo > 3.0, 'da 3.0 a -3.0 si passa per π, cioè si cresce');
  });

  it('frazione resta tra 0 e 1', () => {
    assert.equal(frazione(5, 10), 0.5);
    assert.equal(frazione(-3, 10), 0);
    assert.equal(frazione(30, 10), 1);
    assert.equal(frazione(1, 0), 0);
  });
});

describe('messaggi al centro dello schermo', () => {
  const giocatori = [{ nome: 'Luca' }, { nome: 'Sara' }];
  it('attesa: dice chi deve ancora girare il telefono', () => {
    const t = testoMessaggio({ vista: { tipo: 'combattimento', fase: 'attesa', chiManca: [1] }, giocatori });
    assert.match(t.titolo, /orizzontale/);
    assert.match(t.sotto, /Sara/);
    assert.doesNotMatch(t.sotto, /Luca/);
  });
  it('conto: mostra il numero grande', () => {
    const t = testoMessaggio({ vista: { tipo: 'combattimento', fase: 'conto', titolo: 'Lupi' }, snap: { c: 2 }, giocatori });
    assert.equal(t.titolo, '2');
    assert.equal(t.grande, true);
  });
  it('si combatte: nessun messaggio; vittoria e sconfitta sì', () => {
    assert.equal(testoMessaggio({ vista: { tipo: 'combattimento', fase: 'in_corso' }, giocatori }), null);
    assert.match(testoMessaggio({ vista: { tipo: 'combattimento', fase: 'vittoria' }, giocatori }).titolo, /VITTORIA/);
    assert.match(testoMessaggio({ vista: { tipo: 'combattimento', fase: 'sconfitta', tentativo: 1 }, giocatori }).sotto, /tentativo 2/);
  });
  it('fuori dal combattimento non c\'è nessun messaggio', () => {
    assert.equal(testoMessaggio({ vista: { tipo: 'pagina' } }), null);
    assert.equal(testoMessaggio({ vista: null }), null);
  });
});

describe('zone d\'attacco dei nemici a terra', () => {
  it('il cono usa portata e ampiezza dell\'attacco; lo schianto è un cerchio intero', () => {
    const morso = NEMICI.lupo.attacchi[0];
    assert.deepEqual(zonaAttacco(morso, 0.4), { raggio: morso.portata + 0.4, angolo: morso.angolo });
    const schianto = NEMICI.guardiano.attacchi.find((a) => a.tipo === 'area');
    assert.deepEqual(zonaAttacco(schianto, 0.4), { raggio: schianto.raggio + 0.4, angolo: Math.PI });
  });

  it('puntiSettore: il centro è l\'origine, il settore è centrato verso "avanti" (-z) e simmetrico', () => {
    const punti = puntiSettore(3, 0.8, 24);
    assert.deepEqual(punti[0], [0, 0]);
    const arco = punti.slice(1);
    assert.equal(arco.length, 25);
    const [xm, zm] = arco[12]; // il punto centrale dell'arco
    assert.ok(Math.abs(xm) < 1e-9 && Math.abs(zm + 3) < 1e-9, 'il centro dell\'arco sta davanti (z = -raggio)');
    for (const [x, z] of arco) assert.ok(Math.abs(Math.hypot(x, z) - 3) < 1e-9);
    assert.ok(arco[0][0] < 0 && arco.at(-1)[0] > 0, 'si va da sinistra a destra');
    assert.ok(Math.abs(arco[0][0] + arco.at(-1)[0]) < 1e-9);
  });

  it('con angolo π il settore è un cerchio completo', () => {
    const arco = puntiSettore(2, Math.PI, 8).slice(1);
    assert.ok(Math.abs(arco[0][0]) < 1e-9 && Math.abs(arco[0][1] - 2) < 1e-9, 'parte da dietro (+z)');
    assert.ok(Math.abs(arco.at(-1)[1] - 2) < 1e-9, 'e ci torna');
  });
});

describe('spada in prima persona', () => {
  it('a riposo la spada sta in basso a destra e ondeggia piano', () => {
    const a = posaSpada('libero', 0, 0);
    const b = posaSpada('libero', 0, 1);
    assert.ok(a.x > 0 && a.y < 0 && a.z < 0);
    assert.ok(Math.abs(a.y - b.y) < 0.02);
  });

  it('ogni mossa dà numeri validi in tutti i punti dell\'azione', () => {
    for (const stato of ['libero', 'colpo', 'colpoForte', 'schivata', 'ferito', 'ko', 'sconosciuto']) {
      for (let p = -0.5; p <= 1.5; p += 0.05) {
        const posa = posaSpada(stato, p, 0.3);
        for (const v of Object.values(posa)) assert.ok(Number.isFinite(v), `${stato} p=${p}`);
      }
    }
  });

  it('il colpo muove la spada, il colpo forte prima la alza e poi la abbassa', () => {
    const riposo = posaSpada('libero', 0, 0);
    assert.notEqual(posaSpada('colpo', 0.5, 0).rz, riposo.rz);
    const alzata = posaSpada('colpoForte', 0.4, 0);
    const fendente = posaSpada('colpoForte', 0.7, 0);
    assert.ok(alzata.rx < riposo.rx, 'si alza (rx diminuisce)');
    assert.ok(fendente.rx > alzata.rx, 'poi cala');
  });
});
