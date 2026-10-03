// Le classi giocabili. Per cambiare numeri, nomi o equipaggiamento basta modificare questo file.
// Le statistiche vanno da 1 a 10.

export const STATISTICHE = Object.freeze({
  salute: 'Salute',
  attacco: 'Attacco',
  velocita: 'Velocità',
  destrezza: 'Destrezza',
});

export const CLASSI = Object.freeze({
  guerriero: {
    id: 'guerriero',
    nome: 'Guerriero',
    emoji: '⚔️',
    descrizione: 'Combatte da vicino con colpi potenti. Attacco fisico in mischia.',
    statistiche: { salute: 7, attacco: 9, velocita: 5, destrezza: 5 },
    equipaggiamento: 'Spada vecchia ma affilata',
  },
  scudiere: {
    id: 'scudiere',
    nome: 'Scudiere',
    emoji: '🛡️',
    descrizione: 'Resiste ai colpi e protegge i compagni con lo scudo.',
    statistiche: { salute: 10, attacco: 5, velocita: 4, destrezza: 5 },
    equipaggiamento: 'Scudo di legno rinforzato',
  },
  mago: {
    id: 'mago',
    nome: 'Mago',
    emoji: '🧙',
    descrizione: 'Colpisce da lontano con la magia.',
    statistiche: { salute: 5, attacco: 9, velocita: 5, destrezza: 6 },
    equipaggiamento: 'Bastone con pietra opaca',
  },
  arciere: {
    id: 'arciere',
    nome: 'Arciere',
    emoji: '🏹',
    descrizione: 'Colpisce da lontano con frecce precise.',
    statistiche: { salute: 6, attacco: 7, velocita: 8, destrezza: 9 },
    equipaggiamento: 'Arco e dieci frecce',
  },
});

// Valori iniziali uguali per tutti (monete e punti abilità si useranno dalla tappa 4).
export const VALORI_INIZIALI = Object.freeze({ monete: 0, puntiAbilita: 0 });
