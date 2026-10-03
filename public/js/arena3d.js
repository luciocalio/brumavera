// La scena 3D dell'arena, sul computer: schermo diviso, una telecamera in prima persona per giocatore.
// Usa three.js (cartella public/vendor/three, funziona anche senza internet).
//
// Questo file DISEGNA soltanto: tutto ciò che accade lo decide il server (src/combattimento.js)
// e arriva qui come "fotografie" 30 volte al secondo. Tra una fotografia e l'altra le cose si muovono
// in modo morbido (interpolazione), così a 60 fotogrammi al secondo non si vedono scatti.
//
// Convenzioni (uguali al server): x = destra, z = verso il basso (sud), yaw 0 guarda a nord (-z).
// In three.js "ruotare di yaw attorno a Y" porta l'avanti locale (-z) proprio in (-sin yaw, -cos yaw).
//
// Livelli (layers) di visibilità: 0 = mondo per tutti; 1+i = spada in mano del giocatore i (solo lui la vede);
// 5+i = corpo del giocatore i (lui non lo vede: ha la telecamera dentro); 9+i = anello del bersaglio del giocatore i;
// 13+i = barre della vita dei nemici viste dal giocatore i (spariscono quando il nemico è troppo vicino).

import * as THREE from '/vendor/three/three.module.js';
import { COLORI_GIOCATORI, frazione, posaSpada, puntiSettore, smorza, smorzaAngolo, zonaAttacco } from './arena-logica.js';

const ALTEZZA_OCCHI = 1.6;
const MAX_PARTICELLE = 90;
const DISTANZA_MIN_BARRA = 3.6; // più vicino di così la barra sarebbe enorme: la vita si legge nell'indicatore del giocatore
const VELOCITA_POSIZIONE = 22; // quanto in fretta le cose raggiungono la posizione dell'ultima fotografia
const VELOCITA_ANGOLO = 16;

const ROSSO_AVVISO = new THREE.Color('#c01a0c');
const BIANCO = new THREE.Color('#ffffff');

export function creaArena3d({ canvas, regole, numeroGiocatori }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor('#05070d');

  const scena = new THREE.Scene();
  scena.background = new THREE.Color('#1a2644');
  scena.fog = new THREE.Fog('#1a2644', 16, 46);

  const { arena } = regole;
  const meta = arena.lato / 2;

  // ------------------------------------------------------------ luci
  scena.add(new THREE.HemisphereLight('#d6e0ff', '#3a3445', 2.6));
  const sole = new THREE.DirectionalLight('#ffe9c4', 2.0);
  sole.position.set(-6, 14, 8);
  scena.add(sole);

  // ------------------------------------------------------------ pavimento e muri
  function texturaPavimento() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    const g = c.getContext('2d');
    const celle = 12;
    const l = c.width / celle;
    for (let r = 0; r < celle; r += 1) {
      for (let q = 0; q < celle; q += 1) {
        const chiaro = (r + q) % 2 === 0;
        g.fillStyle = chiaro ? '#59616d' : '#4c5460';
        g.fillRect(q * l, r * l, l, l);
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(q * l + 3, r * l + l - 6, l - 6, 4);
      }
    }
    g.strokeStyle = 'rgba(15,18,25,0.7)';
    g.lineWidth = 3;
    for (let k = 0; k <= celle; k += 1) {
      g.beginPath();
      g.moveTo(k * l, 0);
      g.lineTo(k * l, c.height);
      g.moveTo(0, k * l);
      g.lineTo(c.width, k * l);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  const pavimento = new THREE.Mesh(new THREE.PlaneGeometry(arena.lato, arena.lato), new THREE.MeshLambertMaterial({ map: texturaPavimento() }));
  pavimento.rotation.x = -Math.PI / 2;
  scena.add(pavimento);

  const materialeMuro = new THREE.MeshLambertMaterial({ color: '#3a4250' });
  const materialeTorcia = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  const altezzaMuro = 3.2;
  const muri = [
    [0, -meta - 0.25, arena.lato + 1, 0.5],
    [0, meta + 0.25, arena.lato + 1, 0.5],
    [-meta - 0.25, 0, 0.5, arena.lato],
    [meta + 0.25, 0, 0.5, arena.lato],
  ];
  for (const [x, z, larghezza, profondita] of muri) {
    const muro = new THREE.Mesh(new THREE.BoxGeometry(larghezza, altezzaMuro, profondita), materialeMuro);
    muro.position.set(x, altezzaMuro / 2, z);
    scena.add(muro);
  }
  // Torce sui muri (solo da guardare) e colonne agli angoli
  for (const [x, z] of [[-meta, -meta], [meta, -meta], [-meta, meta], [meta, meta]]) {
    const colonna = new THREE.Mesh(new THREE.BoxGeometry(1.2, altezzaMuro + 1, 1.2), new THREE.MeshLambertMaterial({ color: '#2e3541' }));
    colonna.position.set(x, (altezzaMuro + 1) / 2, z);
    scena.add(colonna);
  }
  for (let k = -2; k <= 2; k += 2) {
    for (const [x, z] of [[k * 4, -meta + 0.1], [k * 4, meta - 0.1], [-meta + 0.1, k * 4], [meta - 0.1, k * 4]]) {
      const torcia = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), materialeTorcia);
      torcia.position.set(x, 2.1, z);
      scena.add(torcia);
    }
  }
  // Sagome in lontananza per dare profondità
  const materialeMonte = new THREE.MeshLambertMaterial({ color: '#141a2b' });
  for (let k = 0; k < 14; k += 1) {
    const a = (k / 14) * Math.PI * 2;
    const altezza = 6 + ((k * 37) % 7);
    const monte = new THREE.Mesh(new THREE.BoxGeometry(5 + (k % 3), altezza, 5 + ((k + 1) % 3)), materialeMonte);
    monte.position.set(Math.cos(a) * 24, altezza / 2 - 0.2, Math.sin(a) * 24);
    scena.add(monte);
  }

  // ------------------------------------------------------------ giocatori
  const geometriaCubo = new THREE.BoxGeometry(1, 1, 1);

  function costruisciSpada(colore) {
    const spada = new THREE.Group();
    const lama = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#d8dee6', emissive: '#222a33' }));
    lama.scale.set(0.07, 0.03, 0.8);
    lama.position.z = -0.45;
    const guardia = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: colore }));
    guardia.scale.set(0.24, 0.05, 0.06);
    guardia.position.z = -0.02;
    const impugnatura = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#5a3d22' }));
    impugnatura.scale.set(0.06, 0.06, 0.2);
    impugnatura.position.z = 0.1;
    spada.add(lama, guardia, impugnatura);
    return spada;
  }

  function impostaLivello(oggetto, livello) {
    oggetto.traverse((o) => o.layers.set(livello));
  }

  const giocatori = [];
  const telecamere = [];
  for (let i = 0; i < numeroGiocatori; i += 1) {
    const colore = COLORI_GIOCATORI[i % COLORI_GIOCATORI.length];

    // corpo visto dagli altri
    const gruppo = new THREE.Group();
    const materialeCorpo = new THREE.MeshLambertMaterial({ color: colore });
    const corpo = new THREE.Mesh(geometriaCubo, materialeCorpo);
    corpo.scale.set(0.75, 1.05, 0.5);
    corpo.position.y = 0.95;
    const testa = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#e8c9a0' }));
    testa.scale.set(0.42, 0.42, 0.42);
    testa.position.y = 1.72;
    const gambe = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#2b3340' }));
    gambe.scale.set(0.6, 0.45, 0.4);
    gambe.position.y = 0.22;
    const spadaMondo = buildSpadaMondo(colore);
    gruppo.add(corpo, testa, gambe, spadaMondo.perno);
    impostaLivello(gruppo, 5 + i);
    scena.add(gruppo);

    // la telecamera: dentro la testa; la spada è sua e la vede solo lei
    const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80);
    camera.rotation.order = 'YXZ';
    camera.layers.enable(1 + i);
    camera.layers.enable(9 + i);
    camera.layers.enable(13 + i);
    for (let j = 0; j < numeroGiocatori; j += 1) if (j !== i) camera.layers.enable(5 + j);
    const spadaMano = costruisciSpada(colore);
    impostaLivello(spadaMano, 1 + i);
    camera.add(spadaMano);
    scena.add(camera);
    telecamere.push(camera);

    // anello a terra sotto il bersaglio (lo vede solo il suo giocatore)
    const anello = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: colore, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }),
    );
    anello.rotation.x = -Math.PI / 2;
    anello.position.y = 0.05;
    anello.renderOrder = 5;
    anello.layers.set(9 + i);
    anello.visible = false;
    scena.add(anello);

    giocatori.push({
      i, colore, gruppo, materialeCorpo, perno: spadaMondo.perno, spadaMano, camera, anello,
      x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, ultimoX: 0, ultimoZ: 0, corsa: 0, pitch: 0,
      stato: 'libero', p: 0, k: false, pr: true, bersaglio: 0, lampo: 0, scossa: 0, fovExtra: 0, caduta: 0, nuovo: true,
    });
  }

  function buildSpadaMondo(colore) {
    const perno = new THREE.Group();
    perno.position.set(0.5, 1.15, -0.1);
    const lama = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#d8dee6', emissive: '#222a33' }));
    lama.scale.set(0.07, 0.05, 1.0);
    lama.position.z = -0.55;
    const guardia = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: colore }));
    guardia.scale.set(0.3, 0.06, 0.07);
    perno.add(lama, guardia);
    return { perno };
  }

  // ------------------------------------------------------------ nemici
  const nemici = new Map();
  const spriteFondo = new THREE.SpriteMaterial({ color: '#10131a', transparent: true, opacity: 0.85, depthTest: false });

  function creaNemico(dati) {
    const def = regole.nemici[dati.t];
    const gruppo = new THREE.Group();
    const dentro = new THREE.Group(); // la parte che si anima (si schiaccia, trema...)
    gruppo.add(dentro);

    const materiale = new THREE.MeshLambertMaterial({ color: def.colore, emissive: '#000000' });
    const lato = def.raggio * 2;
    const corpo = new THREE.Mesh(geometriaCubo, materiale);
    corpo.scale.set(lato, def.altezza, lato);
    corpo.position.y = def.altezza / 2;
    dentro.add(corpo);

    const occhi = new THREE.MeshBasicMaterial({ color: def.coloreOcchi });
    for (const lato2 of [-1, 1]) {
      const occhio = new THREE.Mesh(geometriaCubo, occhi);
      occhio.scale.set(def.raggio * 0.32, def.raggio * 0.22, def.raggio * 0.1);
      occhio.position.set(lato2 * def.raggio * 0.42, def.altezza * 0.72, -def.raggio - 0.01);
      dentro.add(occhio);
    }
    if (def.id === 'lupo') {
      // orecchie e muso a cubetti
      for (const lato2 of [-1, 1]) {
        const orecchio = new THREE.Mesh(geometriaCubo, materiale);
        orecchio.scale.set(0.16, 0.26, 0.16);
        orecchio.position.set(lato2 * def.raggio * 0.6, def.altezza + 0.1, -0.1);
        dentro.add(orecchio);
      }
      const muso = new THREE.Mesh(geometriaCubo, new THREE.MeshLambertMaterial({ color: '#5d6471' }));
      muso.scale.set(0.4, 0.3, 0.4);
      muso.position.set(0, def.altezza * 0.4, -def.raggio - 0.15);
      dentro.add(muso);
    } else {
      // il guardiano: spalle larghe e due pugni di pietra
      for (const lato2 of [-1, 1]) {
        const braccio = new THREE.Mesh(geometriaCubo, materiale);
        braccio.scale.set(0.7, 1.7, 0.7);
        braccio.position.set(lato2 * (def.raggio + 0.45), def.altezza * 0.55, 0);
        dentro.add(braccio);
      }
      const testa = new THREE.Mesh(geometriaCubo, materiale);
      testa.scale.set(1.1, 0.8, 1.1);
      testa.position.y = def.altezza + 0.4;
      dentro.add(testa);
    }

    // barre della vita: una per ogni giocatore (così ognuno la vede solo se il nemico non gli è addosso)
    const larghezzaBarra = Math.max(1.1, lato * 0.9);
    const altezzaBarra = def.altezza + (def.id === 'guardiano' ? 1.2 : 0.55);
    const barre = giocatori.map((gi) => {
      const fondo = new THREE.Sprite(spriteFondo);
      fondo.scale.set(larghezzaBarra + 0.06, 0.16, 1);
      const riempimento = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#e0463a', depthTest: false, transparent: true }));
      fondo.renderOrder = 20;
      riempimento.renderOrder = 21;
      const gruppoBarra = new THREE.Group();
      gruppoBarra.add(fondo, riempimento);
      gruppoBarra.position.y = altezzaBarra;
      impostaLivello(gruppoBarra, 13 + gi.i);
      gruppo.add(gruppoBarra);
      return { gruppoBarra, riempimento };
    });

    // la zona che sta per essere colpita, disegnata a terra
    const zona = new THREE.Group();
    zona.position.y = 0.03;
    zona.visible = false;
    scena.add(zona);

    scena.add(gruppo);
    const n = {
      id: dati.id, def, gruppo, dentro, materiale, barre, larghezzaBarra, zona, zonaAttacco: null,
      x: dati.x, z: dati.z, yaw: dati.y, tx: dati.x, tz: dati.z, tyaw: dati.y, s: 'inseguire', p: 0, v: dati.v, vm: dati.vm, lampo: 0, fase: Math.random() * 6,
    };
    nemici.set(dati.id, n);
    return n;
  }

  /** (Ri)costruisce il disegno della zona d'attacco per l'attacco indicato. */
  function preparaZona(n, nomeAttacco) {
    if (n.zonaAttacco === nomeAttacco) return;
    n.zonaAttacco = nomeAttacco;
    n.zona.clear();
    const attacco = n.def.attacchi.find((a) => a.nome === nomeAttacco);
    if (!attacco) return;
    const { raggio, angolo } = zonaAttacco(attacco, regole.guerriero.raggio);

    const costruisci = (opacita, colore) => {
      const punti = puntiSettore(raggio, angolo, 28);
      const posizioni = new Float32Array(punti.length * 3);
      punti.forEach(([x, z], k) => posizioni.set([x, 0, z], k * 3));
      const indici = [];
      for (let k = 1; k < punti.length - 1; k += 1) indici.push(0, k, k + 1);
      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute('position', new THREE.BufferAttribute(posizioni, 3));
      geometria.setIndex(indici);
      return new THREE.Mesh(
        geometria,
        new THREE.MeshBasicMaterial({ color: colore, transparent: true, opacity: opacita, side: THREE.DoubleSide, depthWrite: false }),
      );
    };
    const contorno = costruisci(0.22, '#ff4b3e');
    const riempimento = costruisci(0.5, '#ff2d1f');
    riempimento.position.y = 0.01;
    riempimento.name = 'riempimento';
    n.zona.add(contorno, riempimento);
  }

  // ------------------------------------------------------------ particelle (cubetti che schizzano)
  const particelle = [];
  const geometriaParticella = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  for (let k = 0; k < MAX_PARTICELLE; k += 1) {
    const mesh = new THREE.Mesh(geometriaParticella, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    mesh.visible = false;
    scena.add(mesh);
    particelle.push({ mesh, vx: 0, vy: 0, vz: 0, vita: 0, durata: 1 });
  }
  let prossimaParticella = 0;

  function schizza(x, y, z, colore, quante, forza = 4) {
    for (let k = 0; k < quante; k += 1) {
      const p = particelle[prossimaParticella];
      prossimaParticella = (prossimaParticella + 1) % particelle.length;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.material.color.set(colore);
      const a = Math.random() * Math.PI * 2;
      const v = forza * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v;
      p.vy = 2 + Math.random() * forza * 0.7;
      p.durata = 0.45 + Math.random() * 0.35;
      p.vita = p.durata;
    }
  }

  // ------------------------------------------------------------ aggiornamento dalle fotografie del server
  let riquadri = [];
  let tentativoVisto = null;
  let ultimoTempo = null;

  function applicaSnapshot(snap) {
    const riparte = tentativoVisto !== null && snap.r !== tentativoVisto;
    tentativoVisto = snap.r;

    for (const g of snap.g) {
      const gi = giocatori[g.i];
      if (!gi) continue;
      gi.tx = g.x;
      gi.tz = g.z;
      gi.tyaw = g.y;
      gi.stato = g.s;
      gi.p = g.p;
      gi.k = g.k;
      gi.pr = g.pr;
      gi.bersaglio = g.b;
      if (gi.nuovo || riparte) {
        Object.assign(gi, { x: g.x, z: g.z, yaw: g.y, ultimoX: g.x, ultimoZ: g.z, nuovo: false });
      }
    }

    const presenti = new Set();
    for (const dati of snap.n) {
      presenti.add(dati.id);
      const n = nemici.get(dati.id) ?? creaNemico(dati);
      n.tx = dati.x;
      n.tz = dati.z;
      n.tyaw = dati.y;
      n.s = dati.s;
      n.p = dati.p;
      n.v = dati.v;
      n.vm = dati.vm;
      if (dati.a) preparaZona(n, dati.a);
      if (riparte) Object.assign(n, { x: dati.x, z: dati.z, yaw: dati.y });
    }
    for (const [id, n] of nemici) {
      if (presenti.has(id)) continue;
      scena.remove(n.gruppo, n.zona);
      n.materiale.dispose();
      n.barre.forEach((b) => b.riempimento.material.dispose());
      nemici.delete(id);
    }

    for (const e of snap.e ?? []) gestisciEvento(e);
  }

  function gestisciEvento(e) {
    if (e.e === 'danno') {
      const n = nemici.get(e.id);
      if (!n) return;
      n.lampo = 1;
      schizza(n.x, n.def.altezza * 0.6, n.z, e.forte ? '#ffd166' : '#ffffff', e.forte ? 16 : 8, e.forte ? 6 : 4);
    } else if (e.e === 'morto') {
      const n = nemici.get(e.id);
      if (n) schizza(n.x, n.def.altezza * 0.5, n.z, n.def.colore, n.def.id === 'guardiano' ? 40 : 18, 6);
    } else if (e.e === 'ferito') {
      const g = giocatori[e.i];
      if (g) {
        g.lampo = 1;
        g.scossa = 1;
      }
    } else if (e.e === 'schivata') {
      const g = giocatori[e.i];
      if (g) g.fovExtra = 1;
    }
  }

  // ------------------------------------------------------------ animazione a ogni fotogramma
  function anima(dt, tempo) {
    for (const g of giocatori) {
      g.x = smorza(g.x, g.tx, dt, VELOCITA_POSIZIONE);
      g.z = smorza(g.z, g.tz, dt, VELOCITA_POSIZIONE);
      g.yaw = smorzaAngolo(g.yaw, g.tyaw, dt, VELOCITA_ANGOLO);
      g.lampo = Math.max(0, g.lampo - dt * 4);
      g.scossa = Math.max(0, g.scossa - dt * 3.5);
      g.fovExtra = Math.max(0, g.fovExtra - dt * 3.5);
      g.caduta = smorza(g.caduta, g.stato === 'ko' ? 1 : 0, dt, 6);

      // Corpo visibile agli altri
      const gr = g.gruppo;
      gr.visible = g.pr && !(g.k && Math.floor(tempo * 14) % 2 === 0);
      gr.position.set(g.x, 0, g.z);
      gr.rotation.set(g.caduta * -1.45, g.yaw, g.stato === 'schivata' ? 0.35 : 0, 'YXZ');
      gr.position.y = g.caduta * 0.4;
      g.materialeCorpo.emissive.copy(BIANCO).multiplyScalar(g.lampo * 0.8);
      const pa = g.stato === 'colpo' || g.stato === 'colpoForte' ? Math.sin(Math.min(1, g.p) * Math.PI) : 0;
      g.perno.rotation.x = g.stato === 'colpoForte' ? -1.2 + 2.2 * Math.min(1, g.p * 1.6) * (g.p < 0.9 ? 1 : 0) : -0.3 - pa * 1.3;

      // Telecamera in prima persona
      const velocita = Math.hypot(g.x - g.ultimoX, g.z - g.ultimoZ) / Math.max(dt, 0.001);
      g.ultimoX = g.x;
      g.ultimoZ = g.z;
      g.corsa = smorza(g.corsa, Math.min(1, velocita / 5), dt, 8);
      const rimbalzo = Math.sin(tempo * 11) * 0.035 * g.corsa;

      const cam = g.camera;
      const bersaglio = g.bersaglio ? nemici.get(g.bersaglio) : null;
      let pitchDesiderato = -0.04;
      if (bersaglio && g.stato !== 'ko') {
        const distanza = Math.max(1, Math.hypot(bersaglio.x - g.x, bersaglio.z - g.z));
        pitchDesiderato = Math.atan2(bersaglio.def.altezza * 0.55 - ALTEZZA_OCCHI, distanza);
      }
      g.pitch = smorza(g.pitch, g.stato === 'ko' ? -0.7 : pitchDesiderato, dt, 6);

      const scossaX = (Math.random() - 0.5) * 0.12 * g.scossa;
      const scossaY = (Math.random() - 0.5) * 0.12 * g.scossa;
      cam.position.set(g.x + scossaX, ALTEZZA_OCCHI * (1 - g.caduta) + 0.3 * g.caduta + rimbalzo + scossaY, g.z);
      cam.rotation.set(g.pitch, g.yaw, g.caduta * 0.5 + (g.stato === 'schivata' ? 0.06 : 0), 'YXZ');
      cam.fov = 72 + g.fovExtra * 10 + (g.stato === 'schivata' ? 4 : 0);

      // Spada in mano
      const posa = posaSpada(g.stato, g.p, tempo);
      g.spadaMano.position.set(posa.x, posa.y, posa.z);
      g.spadaMano.rotation.set(posa.rx, posa.ry, posa.rz);
      g.spadaMano.visible = g.stato !== 'ko';

      // Anello sotto il bersaglio
      const puntato = bersaglio && g.stato !== 'ko';
      g.anello.visible = Boolean(puntato);
      if (puntato) {
        g.anello.position.set(bersaglio.x, 0.05, bersaglio.z);
        const s = (bersaglio.def.raggio + 0.35) * (1 + Math.sin(tempo * 6) * 0.05);
        g.anello.scale.set(s, s, 1);
      }
    }

    for (const n of nemici.values()) {
      n.x = smorza(n.x, n.tx, dt, VELOCITA_POSIZIONE);
      n.z = smorza(n.z, n.tz, dt, VELOCITA_POSIZIONE);
      n.yaw = smorzaAngolo(n.yaw, n.tyaw, dt, VELOCITA_ANGOLO);
      n.lampo = Math.max(0, n.lampo - dt * 7);

      n.gruppo.position.set(n.x, 0, n.z);
      n.gruppo.rotation.y = n.yaw;

      const d = n.dentro;
      d.position.set(0, 0, 0);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      let rosso = 0;
      switch (n.s) {
        case 'inseguire': {
          const passo = n.def.id === 'lupo' ? 9 : 3.5;
          d.position.y = Math.abs(Math.sin(tempo * passo + n.fase)) * (n.def.id === 'lupo' ? 0.1 : 0.12);
          d.rotation.z = Math.sin(tempo * passo * 0.5 + n.fase) * 0.04;
          break;
        }
        case 'avviso': {
          // si "carica": si schiaccia e diventa rosso; il guardiano si solleva
          const sale = n.def.id === 'guardiano' ? n.p * 0.5 : 0;
          d.scale.set(1 + n.p * 0.1, 1 - n.p * 0.18, 1 + n.p * 0.1);
          d.position.y = sale;
          rosso = 0.3 + 0.35 * n.p + 0.12 * Math.sin(tempo * 30);
          break;
        }
        case 'stordito':
          d.rotation.z = Math.sin(tempo * 45) * 0.16;
          d.scale.y = 0.92;
          break;
        case 'morto':
          d.scale.setScalar(Math.max(0.01, 1 - n.p));
          d.position.y = -n.p * 0.4;
          d.rotation.z = n.p * 1.2;
          break;
        default:
          break;
      }
      n.materiale.emissive.copy(ROSSO_AVVISO).multiplyScalar(Math.max(0, rosso)).lerp(BIANCO, n.lampo * 0.85);

      const f = frazione(n.v, n.vm);
      // La barra si accorcia da destra: il "centro" dello sprite (che segue lo schermo, non il mondo) va oltre 0,5.
      const larghezzaPiena = Math.max(0.001, n.larghezzaBarra * f);
      const vivo = n.s !== 'morto' && n.v > 0;
      n.barre.forEach((barra, i) => {
        const g = giocatori[i];
        barra.gruppoBarra.visible = vivo && Math.hypot(n.x - g.x, n.z - g.z) > DISTANZA_MIN_BARRA + n.def.raggio;
        barra.riempimento.center.set(n.larghezzaBarra / (2 * larghezzaPiena), 0.5);
        barra.riempimento.scale.set(larghezzaPiena, 0.1, 1);
      });

      // zona d'attacco sul pavimento
      const mostraZona = n.s === 'avviso' && n.zonaAttacco !== null;
      n.zona.visible = mostraZona;
      if (mostraZona) {
        n.zona.position.set(n.x, 0.03, n.z);
        n.zona.rotation.y = n.yaw;
        const riemp = n.zona.getObjectByName('riempimento');
        if (riemp) riemp.scale.setScalar(Math.max(0.02, n.p));
      }
    }

    for (const p of particelle) {
      if (p.vita <= 0) continue;
      p.vita -= dt;
      if (p.vita <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.07, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.1, p.vita / p.durata));
    }
  }

  // ------------------------------------------------------------ disegno
  function disegna() {
    const dimensioni = renderer.getSize(new THREE.Vector2());
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    riquadri.forEach((r, i) => {
      const cam = giocatori[i]?.camera;
      if (!cam || r.w < 2 || r.h < 2) return;
      const yGl = dimensioni.y - (r.y + r.h); // WebGL conta dal basso
      renderer.setViewport(r.x, yGl, r.w, r.h);
      renderer.setScissor(r.x, yGl, r.w, r.h);
      cam.aspect = r.w / r.h;
      cam.updateProjectionMatrix();
      renderer.render(scena, cam);
    });
  }

  let richiestaFotogramma = 0;
  function fotogramma(adesso) {
    richiestaFotogramma = requestAnimationFrame(fotogramma);
    const secondi = adesso / 1000;
    const dt = ultimoTempo === null ? 0.016 : Math.min(0.1, secondi - ultimoTempo);
    ultimoTempo = secondi;
    anima(dt, secondi);
    disegna();
  }

  return {
    /** Una nuova fotografia dal server. */
    aggiorna: applicaSnapshot,

    /** Dimensione della finestra e riquadri dei giocatori (in pixel). */
    ridimensiona(larghezza, altezza, riquadriGiocatori) {
      renderer.setSize(larghezza, altezza, false);
      riquadri = riquadriGiocatori;
    },

    avvia() {
      if (!richiestaFotogramma) richiestaFotogramma = requestAnimationFrame(fotogramma);
    },

    ferma() {
      cancelAnimationFrame(richiestaFotogramma);
      richiestaFotogramma = 0;
      ultimoTempo = null;
    },

    /** Per i collaudi visivi: disegna subito un fotogramma. */
    disegnaOra(dt = 0.016) {
      anima(dt, performance.now() / 1000);
      disegna();
    },

    distruggi() {
      this.ferma();
      scena.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose?.();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
