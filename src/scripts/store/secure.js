// Verwürfelter und signierter localStorage für alles, was als Fortschritt zählt (wie in ../wyrfl, store.js).
// Ziel: Einen Wert in den Entwicklerwerkzeugen des Browsers zu ändern, darf nichts freischalten. Ein geänderter,
// kopierter oder selbst geschriebener Wert fällt durch die Prüfung und wird ignoriert (= leer). Keine echte Sicherheit –
// der Code ist offen, wer will, liest den Schlüssel; es nimmt nur den einfachen Weg zum Schummeln.
//
// Format: "c1.<nonce>.<mac>.<data>" – data = UTF-8-Bytes XOR Schlüsselstrom aus (Geheimnis, Speicherschlüssel, Nonce),
// base64; mac = 106-Bit-Hash aus (Geheimnis, Speicherschlüssel, Nonce, Klartext). Der Speicherschlüssel steckt in
// beidem – ein Wert lässt sich nicht von einem Schlüssel zum anderen kopieren. Jede Speicherung bekommt eine neue
// zufällige Nonce: derselbe Wert sieht nie zweimal gleich aus.
// Klartext-Werte werden nicht angenommen (sonst wäre Klartext-JSON schreiben der Trick). Sprache und der Bedienhinweis
// bleiben im Klartext (corepop:lang, corepop:hinted) – dort gibt es nichts zu gewinnen.

const SECRET = 'corepop·kern·4d91b2e7·nicht-schummeln';
const PREFIX = 'c1.';

/** cyrb53 – 53-Bit-Hash eines Texts */
function cyrb53(text, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const mac = (key, nonce, plain) => {
  const text = `${SECRET}|${key}|${nonce}|${plain}`;
  return cyrb53(text, 1).toString(36) + cyrb53(text, 2).toString(36);
};

/** XOR mit einem mulberry32-Schlüsselstrom aus (Geheimnis, Speicherschlüssel, Nonce) – derselbe Aufruf ver- und entschlüsselt */
function xor(bytes, key, nonce) {
  let a = cyrb53(`${SECRET}|${key}|${nonce}`) >>> 0;
  const out = new Uint8Array(bytes.length);
  let word = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (i % 4 === 0) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      word = (t ^ (t >>> 14)) >>> 0;
    }
    out[i] = bytes[i] ^ ((word >>> ((i % 4) * 8)) & 0xff);
  }
  return out;
}

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

export function encode(key, plain) {
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(36)).join('');
  const data = toBase64(xor(new TextEncoder().encode(plain), key, nonce));
  return `${PREFIX}${nonce}.${mac(key, nonce, plain)}.${data}`;
}

/** Klartext – oder null, wenn der Wert fehlt, im Klartext steht, verändert wurde oder zu einem anderen Schlüssel gehört */
export function decode(key, stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return null;
  const [nonce, sum, data] = stored.slice(PREFIX.length).split('.');
  if (!nonce || !sum || data === undefined) return null;
  try {
    const plain = new TextDecoder('utf-8', { fatal: true }).decode(xor(fromBase64(data), key, nonce));
    return mac(key, nonce, plain) === sum ? plain : null;
  } catch {
    return null;
  }
}

/** Liest einen geschützten Wert (null, wenn er fehlt, manipuliert ist oder der Speicher blockiert ist). */
export function secureGet(key) {
  try {
    return decode(key, localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Schreibt einen geschützten Wert (bleibt still weg, wenn der Speicher blockiert ist). */
export function secureSet(key, plain) {
  try {
    localStorage.setItem(key, encode(key, String(plain)));
  } catch {
    /* Speicher nicht verfügbar – Spiel läuft trotzdem */
  }
}
