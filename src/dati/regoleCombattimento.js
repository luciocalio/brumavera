// Regole del combattimento. Tutti i numeri sono qui: per bilanciare il gioco basta modificare questo file.
//
// Unità di misura: "metri" del mondo di gioco. Tempi in secondi.
// Convenzioni: x = destra, z = verso il basso (sud). Direzione "avanti" con angolo `yaw`: (-sin yaw, -cos yaw).
// Con yaw = 0 si guarda verso nord (z negativo).

export const ARENA = Object.freeze({
  lato: 24, // l'arena è un quadrato da -12 a +12
  zonaPartenzaGiocatori: 9, // i giocatori partono a sud (z = +9)
  zonaPartenzaNemici: -7, // i nemici partono a nord (z = -7)
});

// Per ora tutti i giocatori combattono con il GUERRIERO (le altre classi arrivano più avanti).
export const GUERRIERO = Object.freeze({
  vita: 10,
  raggio: 0.4,
  velocita: 5.2,
  velocitaDuranteColpo: 0.35, // frazione della velocità normale mentre si colpisce
  rotazioneMax: 8, // radianti al secondo con cui si gira verso il bersaglio
  invulnerabilitaDopoDanno: 0.6, // dopo aver preso un colpo non se ne prendono altri per un attimo
  stordimentoDopoDanno: 0.25, // quanto tempo si resta fermi dopo aver preso un colpo

  colpo: {
    avvio: 0.12, // dall'inizio al momento in cui la spada colpisce
    recupero: 0.3, // dopo il colpo, tempo prima di poter fare altro
    portata: 2.5,
    angolo: 0.95, // mezza ampiezza del colpo (radianti, circa 55 gradi per lato)
    danno: 1,
    scatto: 0.5, // piccolo balzo in avanti mentre si colpisce
    spinta: 5, // di quanto il nemico viene respinto
  },
  colpoForte: {
    avvio: 0.4,
    recupero: 0.55,
    portata: 2.9,
    angolo: 1.15,
    danno: 3,
    scatto: 0.9,
    spinta: 8,
  },
  schivata: {
    durata: 0.3,
    velocita: 12,
    invulnerabile: 0.26, // per quanto tempo della schivata non si prendono colpi
    attesa: 0.8, // tempo prima di poter schivare di nuovo
  },

  bufferAzioni: 0.25, // se premi un pulsante poco prima di essere libero, l'azione parte lo stesso
  inputScadutoDopo: 0.6, // se il telefono smette di mandare la leva, il personaggio si ferma
});

export const TEMPI = Object.freeze({
  conto: 3, // conto alla rovescia prima dello scontro
  attesaDopoSconfitta: 4, // dopo la sconfitta si riparte da capo
  durataMorteNemico: 0.8, // animazione del nemico che cade
});

export const NUMERO_MAX_GIOCATORI = 4;
