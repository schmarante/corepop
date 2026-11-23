// Deterministischer Zufall: Spiel-Logik nutzt nie Math.random(). Gleicher Seed → gleicher Asteroid, gleiche Schiffe –
// Voraussetzung für den Battle-Modus (alle Geräte erzeugen aus Level + Seed dasselbe Spiel).

/** Hasht einen Text zu einem 32-Bit-Seed (FNV-1a). */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 – klein und schnell. Liefert eine Funktion für Zahlen in [0, 1) plus int() und pick(). */
export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    /** Ganzzahl in [min, max] (beide inklusive) */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: list => list[Math.floor(next() * list.length)],
  });
}
