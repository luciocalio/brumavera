// Funzioni che controllano e puliscono tutto ciò che arriva dalla rete.
// Regola d'oro: i telefoni sono "ospiti", i loro dati non si considerano mai affidabili.

import { validaIncontro } from './dati/nemici.js';

export const LIMITI = Object.freeze({
  nomeMax: 20,
  sceltaMax: 200,
  codiceLunghezza: 4,
  giocatoriMin: 1,
  giocatoriMax: 4,
});

// Tolgo i caratteri di controllo (tranne gli spazi normali) e riduco gli spazi multipli.
function pulisciTesto(valore) {
  if (typeof valore !== 'string') return '';
  return valore
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pulisciNome(valore) {
  return pulisciTesto(valore).slice(0, LIMITI.nomeMax);
}

export function pulisciScelta(valore) {
  return pulisciTesto(valore).slice(0, LIMITI.sceltaMax);
}

export function normalizzaCodice(valore) {
  if (typeof valore !== 'string') return '';
  return valore.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, LIMITI.codiceLunghezza);
}

export function numeroGiocatoriValido(valore) {
  return Number.isInteger(valore) && valore >= LIMITI.giocatoriMin && valore <= LIMITI.giocatoriMax;
}

/**
 * Controlla che la storia sia scritta bene, all'avvio del server.
 * Se c'è un errore, il server non parte e dice esattamente dove sbagliare: meglio di un errore a metà partita.
 */
export function validaStoria(storia, classi) {
  const errori = [];
  const idClassi = Object.keys(classi);

  if (!Array.isArray(storia) || storia.length === 0) {
    throw new Error('La storia è vuota o non è una lista.');
  }

  storia.forEach((momento, i) => {
    const dove = `Storia, momento n. ${i + 1}`;
    switch (momento?.tipo) {
      case 'pagina':
        if (!momento.testo?.trim()) errori.push(`${dove}: pagina senza testo.`);
        break;
      case 'combattimento':
        if (!momento.titolo?.trim()) errori.push(`${dove}: combattimento senza titolo.`);
        {
          const problema = validaIncontro(momento.incontro);
          if (problema) errori.push(`${dove}: ${problema}.`);
        }
        break;
      case 'scelta':
        if (!momento.domanda?.trim()) errori.push(`${dove}: scelta senza domanda.`);
        for (const id of idClassi) {
          if (!momento.risultati?.[id]?.trim()) errori.push(`${dove}: manca il risultato per la classe "${id}".`);
        }
        break;
      case 'fine':
        if (i !== storia.length - 1) errori.push(`${dove}: "fine" deve essere l'ultimo momento.`);
        break;
      default:
        errori.push(`${dove}: tipo sconosciuto "${momento?.tipo}".`);
    }
  });

  if (storia.at(-1)?.tipo !== 'fine') errori.push('L\'ultimo momento della storia deve essere di tipo "fine".');

  if (errori.length > 0) {
    throw new Error(`La storia non è valida:\n - ${errori.join('\n - ')}`);
  }
}
