// Punto di partenza del server: `npm start`.

import { config } from './src/config.js';
import { creaServer } from './src/app.js';
import { CLASSI } from './src/dati/classi.js';
import { storia } from './src/dati/storia.js';
import { GestoreStanze } from './src/gestoreStanze.js';
import { trovaIndirizziLan } from './src/rete.js';
import { validaStoria } from './src/validazione.js';

// Se la storia ha un errore il server non parte e spiega dov'è il problema.
validaStoria(storia, CLASSI);

const gestore = new GestoreStanze({
  storia,
  classi: CLASSI,
  maxStanze: config.maxStanze,
  inattivitaMassimaMs: config.inattivitaMassimaMs,
});

const indirizziLan = trovaIndirizziLan();
const ipLan = indirizziLan[0] ?? null;
const { server, io } = creaServer({ gestore, config, ipLan });

server.listen(config.porta, config.host, () => {
  console.log('\nBrumavera è acceso.\n');
  console.log(`  Sul COMPUTER apri:       http://localhost:${config.porta}`);
  if (config.urlPubblico) {
    console.log(`  I telefoni useranno:     ${config.urlPubblico}/p`);
  } else if (ipLan) {
    console.log(`  I telefoni useranno:     http://${ipLan}:${config.porta}/p  (si apre da solo col QR)`);
    if (indirizziLan.length > 1) {
      console.log(`  Altri indirizzi trovati: ${indirizziLan.slice(1).join(', ')}`);
      console.log('  (se il QR non funziona, apri il gioco sul computer con uno di questi indirizzi al posto di "localhost")');
    }
  } else {
    console.log('  Attenzione: non trovo la rete. Collega il computer al Wi-Fi o a un hotspot.');
  }
  console.log('\n  Per spegnere: premi Ctrl+C\n');
});

setInterval(() => gestore.pulisciInattive(), config.intervalloPuliziaMs).unref();

// Spegnimento ordinato (Ctrl+C o stop da parte dell'hosting)
for (const segnale of ['SIGINT', 'SIGTERM']) {
  process.once(segnale, () => {
    console.log('\nSpegnimento in corso...');
    io.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
