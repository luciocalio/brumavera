// Il catalogo dei nemici. Ogni nemico è un cubetto (o un insieme di cubetti) con questi dati.
//
// L'IA narratrice, più avanti, potrà dire soltanto "qui ci sono 3 lupi e un guardiano":
// come si combatte lo decide sempre questo catalogo, così la storia inventata non può rompere il gioco.
//
// Attacchi:
//   tipo "cono": colpisce davanti al nemico, fino a `portata` metri, con mezza ampiezza `angolo` (radianti)
//   tipo "area": colpisce tutto intorno al nemico, fino a `raggio` metri
//   avviso:   secondi di preavviso. Il nemico si "carica" (cambia colore e forma) e sul pavimento
//             compare la zona che sta per colpire. Chi si sposta o schiva in tempo non si fa male.
//   scatto:   balzo in avanti nel momento in cui colpisce
//   peso:     quanto è probabile che scelga questo attacco rispetto agli altri

export const NEMICI = Object.freeze({
  lupo: {
    id: 'lupo',
    nome: 'Lupo grigio',
    vita: 2,
    velocita: 4.2,
    raggio: 0.5, // il cubetto è largo 1 metro
    altezza: 0.9,
    colore: '#8b93a1',
    coloreOcchi: '#ffd166',
    stordibile: true, // un colpo lo ferma per un attimo
    resistenzaSpinta: 1, // 1 = normale, più alto = più pesante da spingere
    attacchi: [
      { tipo: 'cono', nome: 'morso', portata: 1.8, innesco: 1.7, angolo: 0.7, avviso: 0.6, danno: 1, recupero: 1.0, scatto: 1.1, peso: 1 },
    ],
    // Ricompensa: per ora non viene assegnata (arriva con monete e punti abilità, Tappa 4).
    ricompensa: { monete: 5, puntiAbilita: 0 },
  },

  guardiano: {
    id: 'guardiano',
    nome: 'Guardiano di pietra',
    vita: 12,
    velocita: 1.9,
    raggio: 1.3, // cubo grande, largo 2,6 metri
    altezza: 2.6,
    colore: '#6d7a6e',
    coloreOcchi: '#5eead4',
    stordibile: false, // si ferma solo con il colpo forte
    resistenzaSpinta: 4,
    attacchi: [
      { tipo: 'cono', nome: 'pugno', portata: 3.6, innesco: 3.3, angolo: 0.8, avviso: 0.9, danno: 2, recupero: 1.3, scatto: 0, peso: 1.2 },
      { tipo: 'area', nome: 'schianto', raggio: 4.2, innesco: 3.0, avviso: 1.25, danno: 3, recupero: 1.8, scatto: 0, peso: 1 },
    ],
    ricompensa: { monete: 30, puntiAbilita: 2 },
  },
});

/** Controlla un incontro scritto nella storia: [{ nemico: 'lupo', quanti: 3 }, ...] */
export function validaIncontro(incontro) {
  if (!Array.isArray(incontro) || incontro.length === 0) return 'manca l\'elenco dei nemici (incontro)';
  let totale = 0;
  for (const voce of incontro) {
    if (!Object.hasOwn(NEMICI, voce?.nemico)) return `nemico sconosciuto "${voce?.nemico}"`;
    if (!Number.isInteger(voce.quanti) || voce.quanti < 1 || voce.quanti > 8) return `numero di nemici non valido per "${voce.nemico}" (da 1 a 8)`;
    totale += voce.quanti;
  }
  if (totale > 10) return 'troppi nemici insieme (massimo 10)';
  return null;
}
