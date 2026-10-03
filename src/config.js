// Impostazioni del server, lette dalle variabili d'ambiente (con valori di default sensati).

const numero = (valore, predefinito) => {
  const n = Number.parseInt(valore, 10);
  return Number.isFinite(n) && n > 0 ? n : predefinito;
};

export const config = Object.freeze({
  porta: numero(process.env.PORT, 3000),
  // 0.0.0.0 = raggiungibile anche dai telefoni sulla stessa rete
  host: process.env.HOST || '0.0.0.0',
  // Indirizzo pubblico del gioco (es. https://brumavera.onrender.com). Se manca, viene ricavato in automatico.
  urlPubblico: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  maxStanze: numero(process.env.MAX_STANZE, 50),
  // Una stanza senza attività per questo tempo viene eliminata
  inattivitaMassimaMs: numero(process.env.INATTIVITA_MINUTI, 360) * 60 * 1000,
  intervalloPuliziaMs: 5 * 60 * 1000,
  // Freno anti-spam: messaggi al secondo accettati da ogni singolo collegamento
  maxEventiAlSecondo: numero(process.env.MAX_EVENTI_AL_SECONDO, 40),
  // La leva dei telefoni manda molti messaggi: ha un freno tutto suo
  maxInputAlSecondo: numero(process.env.MAX_INPUT_AL_SECONDO, 60),
});
