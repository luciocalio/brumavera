// Il "cuore" del combattimento: 30 volte al secondo fa avanzare tutte le stanze che stanno combattendo
// e manda lo stato ai computer (tutto il mondo) e ai telefoni (solo vita e ricarica).
//
//   computer: combattimento:stato  -> { ...snapshot, e: [eventi per effetti e suoni], t: tempo del server }
//   telefono: combattimento:io     -> { f, c, v, vm, s, d, h }   (circa 10 volte al secondo)
//
// I messaggi sono "volatili": se la rete è lenta e uno si perde, non si accumulano: arriva il successivo.

const PASSI_AL_SECONDO = 30;
const OGNI_QUANTI_PASSI_IL_TELEFONO = 3;

export function creaCiclo({ io, gestore, ora = () => performance.now() }) {
  let timer = null;
  let ultimo = ora();
  let contatore = 0;

  /** Un singolo passo. `dt` in secondi (esposto per poterlo collaudare senza aspettare). */
  function tick(dt) {
    contatore += 1;
    const aiTelefoni = contatore % OGNI_QUANTI_PASSI_IL_TELEFONO === 0;

    for (const stanza of gestore.tutte()) {
      if (!stanza.combattimentoAttivo) continue;
      try {
        passoDellaStanza(stanza, dt, aiTelefoni);
      } catch (e) {
        // Una stanza con un problema non deve fermare le altre.
        console.error(`[errore] combattimento della stanza ${stanza.codice}:`, e);
      }
    }
  }

  function passoDellaStanza(stanza, dt, aiTelefoni) {
    const cambiata = stanza.passo(dt);
    const c = stanza.combattimento;
    const eventi = c.prendiEventi();

    io.volatile.to(`${stanza.codice}:schermo`).emit('combattimento:stato', { ...c.snapshot(), e: eventi });

    // Ai telefoni basta un campione ogni tanto (vita, ricarica, colpi presi); a ogni cambio di fase subito.
    if (aiTelefoni || cambiata) {
      for (const g of stanza.giocatori) {
        if (g.socketId) io.volatile.to(g.socketId).emit('combattimento:io', c.statoPerGiocatore(g.indice));
      }
    }
    // Cambio di fase (conto, vittoria...): lo stato "normale" serve a tutti per cambiare schermata.
    if (cambiata) io.to(stanza.codice).emit('stato', stanza.snapshot());
  }

  return {
    tick,
    avvia() {
      if (timer) return;
      ultimo = ora();
      timer = setInterval(() => {
        const adesso = ora();
        const dt = (adesso - ultimo) / 1000;
        ultimo = adesso;
        try {
          tick(dt);
        } catch (e) {
          console.error('[errore] ciclo del combattimento:', e);
        }
      }, 1000 / PASSI_AL_SECONDO);
      timer.unref?.();
    },
    ferma() {
      clearInterval(timer);
      timer = null;
    },
  };
}
