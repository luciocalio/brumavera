# La Valle di Brumavera

Gioco di avventura cooperativo per 1-4 giocatori.
Il **computer** è lo schermo (sottotitoli bianchi su nero), i **telefoni** sono i controller. Nessuna app da installare: i telefoni usano il browser.

Questa è la **Tappa 1**: una storia di circa 30 minuti, solo sottotitoli, con i due combattimenti ancora segnati come pagine segnaposto.

```
   TELEFONI (1-4)             SERVER                 COMPUTER
  pagina /p                (questo progetto)        pagina /
 +--------------+         +-----------------+      +------------------+
 | nome + classe|  --->   | tiene lo stato  | ---> | numero giocatori |
 | scheda       |         | della partita   |      | QR + codice      |
 | scrive la    |  <---   | (fase, turni,   | <--- | sottotitoli      |
 | sua scelta   |         |  scena)         |      | barra "scelta"   |
 +--------------+         +-----------------+      +------------------+
```

---

## 1. Cosa serve

Solo **Node.js** (versione 18 o più recente). Se non c'è, scaricalo da https://nodejs.org (scegli la versione "LTS") e installalo cliccando sempre "Avanti".

Per controllare, apri il terminale (su Windows: PowerShell) e scrivi:

```
node --version
```

Deve rispondere con un numero tipo `v22.1.0`.

---

## 2. Primo avvio sul tuo computer

1. Apri il terminale **dentro la cartella del progetto** (su Windows: apri la cartella, clicca sulla barra dell'indirizzo, scrivi `powershell` e premi Invio).
2. Scrivi questo comando e premi Invio (serve solo la prima volta, scarica i pezzi che servono):

   ```
   npm install
   ```

3. Accendi il gioco:

   ```
   npm start
   ```

4. Il terminale scrive qualcosa come:

   ```
   Brumavera è acceso.
     Sul COMPUTER apri:       http://localhost:3000
     I telefoni useranno:     http://192.168.1.20:3000/p
   ```

5. Sul computer apri il browser e vai su **http://localhost:3000**.

**Importante su Windows:** la prima volta che il gioco si accende, Windows chiede se consentire a Node.js di usare la rete. Scegli **"Consenti"** (almeno per le reti private). Se dici no, i telefoni non riescono a collegarsi.

Per spegnere il gioco: nel terminale premi **Ctrl + C**.

---

## 3. Come si gioca

```
 COMPUTER                                   TELEFONI
 ------------------------------------------------------------------
 1. Scegli quanti giocatori (1-4)
 2. Compare il QR e un codice di 4 lettere  -> inquadra il QR
                                               (oppure scrivi l'indirizzo
                                               e il codice a mano)
 3. "Scegli il tuo personaggio"             -> scegli la classe, scrivi il
                                               nome, premi "Conferma personaggio"
 4. Quando tutti hanno confermato
    compare PRONTO: clicca                  -> guarda lo schermo
 5. La storia va avanti con click,
    Spazio o Invio
 6. Nei momenti di scelta compare la
    barra "Fate la vostra scelta"           -> a turno (dal primo che è entrato
                                               all'ultimo) scrivi cosa fai
 7. Il narratore mostra il risultato
    per ogni giocatore                      -> guarda lo schermo
 8. FINE -> "Gioca di nuovo"
```

Trucchi:
- Sul computer premi **F** per lo schermo intero.
- Sul telefono, per rispondere a voce, tocca il **microfono della tastiera** (dettatura). Il microfono dentro il gioco arriverà più avanti.
- Se un telefono si ricarica o perde la connessione, torna da solo al suo posto.
- Se il computer ricarica la pagina, riprende la partita dallo stesso punto.

### Le classi

| Classe | Salute | Attacco | Velocità | Destrezza | Equipaggiamento |
|---|---|---|---|---|---|
| Guerriero | 7 | 9 | 5 | 5 | Spada vecchia ma affilata |
| Scudiere | 10 | 5 | 4 | 5 | Scudo di legno rinforzato |
| Mago | 5 | 9 | 5 | 6 | Bastone con pietra opaca |
| Arciere | 6 | 7 | 8 | 9 | Arco e dieci frecce |

I numeri sono provvisori. Si cambiano in `src/dati/classi.js`.

---

## 4. Se i telefoni non riescono a collegarsi

Controlla in quest'ordine:

1. **Stessa rete**: computer e telefoni devono usare lo stesso Wi-Fi (oppure lo stesso hotspot, vedi sotto).
2. **Windows ha bloccato Node.js**: cerca "Consenti app attraverso Windows Firewall" e controlla che Node.js sia spuntato per le reti private.
3. **Il QR porta all'indirizzo sbagliato**: il computer può avere più schede di rete. Il terminale elenca gli "Altri indirizzi trovati". Apri il gioco sul computer scrivendo uno di quegli indirizzi (es. `http://192.168.1.20:3000`) al posto di `localhost`: il QR userà quell'indirizzo.
4. **Il Wi-Fi isola i dispositivi** (succede in hotel, uffici, reti per ospiti): usa un hotspot, vedi sotto.
5. **Provare con due "telefoni" sullo stesso computer**: usa una finestra normale e una finestra in incognito (il browser ricorda il giocatore e due schede normali si scambierebbero il posto).

### Senza Wi-Fi di casa (fuori casa, da amici)

- **Hotspot del telefono**: attivalo, collega il computer e gli altri telefoni a quello. Il gioco funziona, anche senza internet (in questa tappa non serve).
- **Hotspot di Windows**: Impostazioni, Rete e Internet, Hotspot mobile.
- **Versione online** (vedi punto 5): i telefoni possono usare anche i dati mobili. Serve internet solo sul computer.

---

## 5. Mettere il gioco online (gratis, con Render)

Online non serve più il Wi-Fi in comune: i telefoni possono usare i dati mobili.
**Vercel non va bene** per questo gioco perché non mantiene i collegamenti sempre aperti. Si usa **Render**.

1. Metti il progetto su GitHub (repository nuovo).
2. Vai su https://render.com, crea un account e scegli **New, Web Service**, poi collega il repository.
3. Impostazioni:
   - Build Command: `npm install --omit=dev`
   - Start Command: `npm start`
   - Instance Type: **Free**
4. Premi Deploy. Dopo qualche minuto Render ti dà un indirizzo tipo `https://brumavera.onrender.com`.
5. Apri quell'indirizzo sul computer: da lì il QR punta già all'indirizzo giusto.

Nota sul piano gratuito: se nessuno lo usa per un po', il servizio "dorme" e il primo caricamento può richiedere circa un minuto. Le partite restano in memoria: se il servizio si riavvia, le partite in corso si perdono.

---

## 6. Dove si cambiano le cose

| Cosa vuoi cambiare | File |
|---|---|
| Testi della storia, scelte, risultati per classe | `src/dati/storia.js` |
| Classi, statistiche, equipaggiamento | `src/dati/classi.js` |
| Colori e aspetto | `public/css/stile.css` |

La storia è controllata all'avvio: se dimentichi un pezzo (per esempio il risultato di una classe), il gioco non parte e ti dice esattamente cosa manca.

Impostazioni facoltative (variabili d'ambiente):

| Nome | A cosa serve | Valore normale |
|---|---|---|
| `PORT` | porta del server | 3000 |
| `PUBLIC_URL` | indirizzo da mettere nel QR, se quello automatico è sbagliato | automatico |
| `MAX_STANZE` | quante partite insieme | 50 |
| `INATTIVITA_MINUTI` | dopo quanti minuti una partita ferma viene eliminata | 360 |

---

## 7. Test automatici

```
npm test
```

Prova in pochi secondi: la logica del gioco, il collegamento in tempo reale, e le due pagine (computer e telefono) con una partita intera simulata. Se un test fallisce, il messaggio dice cosa non va.

---

## 8. Com'è fatto il progetto

```
brumavera/
├── server.js                 avvio del server
├── src/
│   ├── stanza.js             TUTTA la logica del gioco (fasi, turni, storia)
│   ├── socket.js             collega i messaggi in tempo reale alla logica
│   ├── gestoreStanze.js      elenco delle partite aperte e pulizia
│   ├── app.js                pagine web e sicurezza del browser
│   ├── rete.js               trova l'indirizzo per il QR
│   ├── validazione.js        controlla tutto ciò che arriva dai telefoni
│   ├── config.js             impostazioni
│   └── dati/
│       ├── storia.js         la storia
│       └── classi.js         le classi
├── public/
│   ├── schermo.html          pagina del computer
│   ├── telefono.html         pagina del telefono
│   ├── css/stile.css
│   └── js/                   schermo.js, telefono.js, comune.js
└── test/                     test automatici
```

Scelte importanti:
- **Il server decide tutto.** Computer e telefoni mostrano soltanto ciò che il server dice, quindi dopo un ricaricamento tutto si ritrova al suo posto.
- **Solo il computer fa avanzare la storia.** I telefoni non possono, nemmeno volendo.
- **Il testo dei giocatori non è mai trattato come codice**, quindi nomi e risposte strane non rompono nulla.

---

## 9. Cosa c'è e cosa manca

| Tappa | Contenuto | Stato |
|---|---|---|
| 1 | Collegamento telefoni, personaggi, sottotitoli, scelte a turno | **Fatta** |
| 2 | Voce del narratore, sfondi, suoni | da fare |
| 3 | I due combattimenti (telefono in orizzontale) | da fare |
| 4 | Monete, punti abilità, miglioramenti | da fare |
| 5 | IA che crea e adatta la storia | da fare |

Limite attuale (voluto): il gioco **non capisce** cosa scrivono i giocatori. Il testo compare sullo schermo, ma il risultato dipende dalla classe. La comprensione del testo arriva con l'IA, alla Tappa 5.
