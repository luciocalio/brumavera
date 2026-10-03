// La storia di "La Valle di Brumavera", scritta a mano (nessuna IA in questa tappa).
//
// È una lista ordinata di "momenti". Ogni momento ha un tipo:
//   pagina        -> una pagina di sottotitoli
//   scelta        -> una domanda; ogni giocatore scrive la sua risposta, poi il narratore
//                    mostra il risultato scritto per la CLASSE di quel giocatore
//   combattimento -> uno scontro vero nell'arena; `incontro` dice quali nemici ci sono (vedi src/dati/nemici.js)
//   fine          -> schermata finale
//
// Il campo "scena" servirà in futuro per sfondi e musica: per ora non viene usato.

export const storia = [
  // ---------- SCENA 1: IL VILLAGGIO ----------
  { tipo: 'pagina', scena: 'villaggio', testo: 'Brumavera è un piccolo villaggio di montagna. Il sole sta sorgendo e una nebbia leggera avvolge le case di pietra.' },
  { tipo: 'pagina', scena: 'villaggio', testo: "Da secoli il villaggio vive grazie a una sorgente d'acqua limpida. Ma da tre giorni l'acqua si è fermata." },
  { tipo: 'pagina', scena: 'villaggio', testo: 'I pozzi sono asciutti. Gli animali hanno sete. I bambini guardano le fontane vuote.' },
  { tipo: 'pagina', scena: 'villaggio', testo: "L'anziana Marta si avvicina a voi con passo lento. «Una volta la sorgente nasceva da un antico tempio, su in montagna. Se nessuno fa qualcosa, il villaggio non resisterà una settimana.»" },
  { tipo: 'pagina', scena: 'villaggio', testo: "«Voi siete forestieri, ma avete l'aria di chi sa cavarsela. Vi prego, aiutateci.»" },
  {
    tipo: 'scelta',
    scena: 'villaggio',
    domanda: 'Cosa rispondete a Marta?',
    risultati: {
      guerriero: 'Marta ti porge una spada vecchia ma ben affilata. «Era di mio marito. Usala bene.»',
      scudiere: 'Marta ti porge uno scudo di legno rinforzato. «Proteggi i tuoi compagni, giovane.»',
      mago: 'Marta ti porge un bastone con una pietra opaca. «Dicono che si accenda vicino alla magia antica.»',
      arciere: 'Marta ti porge un arco e dieci frecce. «Lassù servono occhi acuti e mano ferma.»',
    },
  },
  { tipo: 'pagina', scena: 'villaggio', testo: "Con l'equipaggiamento del villaggio in mano, vi mettete in cammino verso la montagna." },

  // ---------- SCENA 2: IL SENTIERO NEL BOSCO ----------
  { tipo: 'pagina', scena: 'bosco', testo: 'Il sentiero sale tra querce enormi. La luce che filtra dalle foglie è verde e tranquilla.' },
  { tipo: 'pagina', scena: 'bosco', testo: 'Il letto del ruscello è vuoto: solo sassi bianchi e silenzio.' },
  { tipo: 'pagina', scena: 'bosco', testo: "A un bivio trovate un cartello rotto. Una freccia punta a sinistra, l'altra è caduta nel fango." },
  {
    tipo: 'scelta',
    scena: 'bosco',
    domanda: 'Come cercate di capire da che parte andare?',
    risultati: {
      guerriero: "Frugando nel fango trovi una piccola borsa con 5 monete d'oro.",
      scudiere: "Frugando nel fango trovi una piccola borsa con 5 monete d'oro.",
      mago: 'La pietra del tuo bastone brilla più forte quando la punti verso destra. Quella è la strada giusta.',
      arciere: "Sulla corteccia di un albero noti profondi segni di artigli. Qualcosa di grosso vive da queste parti. Meglio restare all'erta.",
    },
  },
  { tipo: 'pagina', scena: 'bosco', testo: 'Qualunque idea abbiate avuto, il gruppo decide di andare a destra.' },
  { tipo: 'pagina', scena: 'bosco', testo: 'Un ululato attraversa il bosco. Poi un altro. Poi molti altri.' },

  // ---------- SCENA 3: COMBATTIMENTO 1 ----------
  { tipo: 'combattimento', scena: 'radura', titolo: 'COMBATTIMENTO 1: I lupi grigi', incontro: [{ nemico: 'lupo', quanti: 3 }] },
  { tipo: 'pagina', scena: 'radura', testo: "L'ultimo lupo fugge nel buio. Nel silenzio sentite, finalmente, il rumore dell'acqua." },

  // ---------- SCENA 4: IL FIUME SPEZZATO ----------
  { tipo: 'pagina', scena: 'fiume', testo: "Seguite il rumore dell'acqua fino a una gola rocciosa. Il ponte di corda è crollato." },
  { tipo: 'pagina', scena: 'fiume', testo: "Dall'altra parte il sentiero continua verso un arco di pietra coperto di muschio." },
  {
    tipo: 'scelta',
    scena: 'fiume',
    domanda: 'Come attraversate il fiume?',
    risultati: {
      guerriero: "Abbatti un albero con pochi colpi di spada e lo fai cadere da una sponda all'altra, come un ponte.",
      scudiere: 'Pianti lo scudo nel terreno e reggi la corda con tutta la tua forza mentre gli altri attraversano.',
      mago: 'Con un gesto del bastone fai levitare un tronco e lo trasformi in una passerella.',
      arciere: "Leghi una corda a una freccia e la lanci sull'altra sponda. Il gruppo si aggrappa e attraversa.",
    },
  },
  { tipo: 'pagina', scena: 'fiume', testo: "Uno dopo l'altro arrivate sull'altra sponda, sani e salvi. L'arco di pietra vi aspetta." },

  // ---------- SCENA 5: LE ROVINE DEL TEMPIO ----------
  { tipo: 'pagina', scena: 'tempio', testo: "Oltre l'arco si apre una sala di pietra. L'aria è fredda e si sente il rumore di gocce lontane." },
  { tipo: 'pagina', scena: 'tempio', testo: 'Quattro statue vi guardano: un guerriero, uno scudiere, un mago e un arciere.' },
  { tipo: 'pagina', scena: 'tempio', testo: "Al centro c'è un altare vuoto con un incavo a forma di goccia. Sul muro è incisa una scritta: «L'acqua torna a chi onora chi la protegge.»" },
  {
    tipo: 'scelta',
    scena: 'tempio',
    domanda: 'Cosa fate davanti alla statua della vostra classe? Scrivete un gesto di rispetto.',
    risultati: {
      guerriero: 'Ti inchini davanti alla statua del guerriero. La sua spada di pietra sembra brillare per un istante.',
      scudiere: 'Appoggi il tuo scudo ai piedi della statua dello scudiere. Un lieve calore passa attraverso la pietra.',
      mago: 'Alzi il bastone verso la statua del mago. La pietra opaca si illumina di una luce azzurra.',
      arciere: "Posi una freccia davanti alla statua dell'arciere. Per un attimo gli occhi di pietra sembrano seguirti.",
    },
  },
  { tipo: 'pagina', scena: 'tempio', testo: "Quando tutti avete onorato la vostra statua, l'altare si apre con un suono profondo. Dentro c'è un Cristallo Blu che pulsa piano." },
  { tipo: 'pagina', scena: 'tempio', testo: "Lo sollevate. Appena il cristallo lascia l'altare, il pavimento comincia a tremare." },

  // ---------- SCENA 6: COMBATTIMENTO 2 ----------
  { tipo: 'combattimento', scena: 'sala-guardiano', titolo: 'COMBATTIMENTO 2: Il Guardiano di pietra', incontro: [{ nemico: 'guardiano', quanti: 1 }] },
  { tipo: 'pagina', scena: 'sala-guardiano', testo: 'Il Guardiano si sbriciola in mille pezzi. La sala torna silenziosa. Il cristallo brilla più forte che mai.' },

  // ---------- SCENA 7: IL RITORNO DELL'ACQUA ----------
  { tipo: 'pagina', scena: 'villaggio-sera', testo: 'Tornate al villaggio mentre il sole tramonta.' },
  { tipo: 'pagina', scena: 'villaggio-sera', testo: 'Mettete il cristallo nella fontana della piazza. Per un attimo non succede niente.' },
  { tipo: 'pagina', scena: 'villaggio-sera', testo: "Poi un fruscio, poi un getto d'acqua limpida. Gli abitanti escono dalle case e gridano di gioia. Marta piange e ride insieme." },
  { tipo: 'pagina', scena: 'villaggio-sera', testo: 'Brumavera vi deve la vita. La vostra leggenda è appena cominciata.' },
  { tipo: 'fine' },
];
