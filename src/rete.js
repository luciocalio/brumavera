import { networkInterfaces } from 'node:os';

const SCHEDE_VIRTUALI = /(vethernet|virtualbox|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale|zerotier|utun|tun\d|br-)/i;

// Priorità: le reti domestiche più comuni prima, poi le altre reti private.
function priorita(ip) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

/**
 * Elenca gli indirizzi IP di questo computer sulla rete locale (quelli che i telefoni possono raggiungere),
 * dal più probabile al meno probabile.
 */
export function trovaIndirizziLan() {
  const candidati = [];
  for (const [nome, indirizzi] of Object.entries(networkInterfaces())) {
    if (SCHEDE_VIRTUALI.test(nome)) continue;
    for (const info of indirizzi ?? []) {
      if (info.family === 'IPv4' && !info.internal) candidati.push(info.address);
    }
  }
  return candidati.sort((a, b) => priorita(a) - priorita(b));
}

/** L'indirizzo più probabile. Se è sbagliato, si può forzare con la variabile d'ambiente PUBLIC_URL. */
export function trovaIndirizzoLan() {
  return trovaIndirizziLan()[0] ?? null;
}

const HOST_LOCALI = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Decide quale indirizzo mettere nel QR code.
 * 1. Se è impostato PUBLIC_URL, usa quello.
 * 2. Se il computer ha aperto il gioco con un indirizzo "vero" (non localhost), usa lo stesso.
 * 3. Altrimenti (localhost) usa l'IP del computer sulla rete locale.
 */
export function risolviUrlBase({ urlPubblico, hostRichiesta, protocolloRichiesto, porta, ipLan }) {
  if (urlPubblico) return urlPubblico;

  const host = typeof hostRichiesta === 'string' ? hostRichiesta.trim() : '';
  const hostValido = /^[A-Za-z0-9.\-:[\]]+$/.test(host) && host.length <= 255;
  if (hostValido) {
    const senzaPorta = host.replace(/:\d+$/, '').toLowerCase();
    if (!HOST_LOCALI.has(senzaPorta)) {
      const protocollo = protocolloRichiesto === 'https' ? 'https' : 'http';
      return `${protocollo}://${host}`;
    }
  }

  if (!ipLan) return null;
  return `http://${ipLan}:${porta}`;
}
