// Modell „Retro-Rakete“ (eigenes Design): schlanker weißer Rumpf, rote Spitze, drei rote Flossen unten, rundes
// blaues Bullauge. Steht senkrecht – bewusst nicht rund.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'r', 'b'];

/**
 * @param {{ radius: number }} params  radius: halbe Höhe in Voxeln (der Rumpf ist schmaler)
 */
export function rocketModel({ radius: H }) {
  const body = H * 0.42;          // Rumpfradius
  const top = H;                  // Spitze
  const noseStart = H * 0.3;      // ab hier verjüngt sich der Rumpf zur Spitze
  const bottom = -H * 0.75;
  /** Rumpfradius in Höhe y: unten leicht eingezogen, oben spitz zulaufend (Ogive) */
  const radiusAt = y => {
    if (y > noseStart) {
      const t = (y - noseStart) / (top - noseStart);
      return body * Math.sqrt(Math.max(0, 1 - t * t));
    }
    const t = (y - bottom) / (noseStart - bottom);
    return body * (0.8 + 0.2 * Math.sin(t * Math.PI * 0.75));
  };
  // drei Flossen (links-vorne, rechts-vorne, hinten): dünne senkrechte Platten, unten breiter – von vorn sieht man
  // zwei seitlich abstehen
  const fins = [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2].map(a => [Math.cos(a), Math.sin(a)]);
  const finLow = bottom - H * 0.2;
  const finHigh = bottom + H * 0.5;
  const finAt = (x, y, z) => {
    if (y < finLow || y > finHigh) return false;
    const reach = body + H * 0.38 * (1 - (y - finLow) / (finHigh - finLow));
    return fins.some(([c, s]) => x * c + z * s > 0 && Math.abs(-x * s + z * c) < 0.75 && Math.hypot(x, z) <= reach);
  };
  return {
    bounds: Math.ceil(H) + 2,
    solid(x, y, z) {
      if (y > top || y < bottom - H * 0.2) return false;
      if (y >= bottom && Math.hypot(x, z) <= radiusAt(y) + 0.3) return true;
      return finAt(x, y, z);
    },
    skin(x, y, z) {
      if (y > H * 0.48) return 'r';                                             // Spitze
      if (Math.hypot(x, z) > radiusAt(Math.max(bottom, y)) + 0.8 || y < bottom) return 'r';   // Flossen
      if (Math.hypot(x, y - H * 0.08) < H * 0.2 && z > 0) return 'b';           // Bullauge vorne
      return 'w';
    },
  };
}
