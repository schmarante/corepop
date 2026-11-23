// Modell „Häufchen“ (eigenes Design im Emoji-Stil): drei gestapelte braune Kringel mit Spitze, große Augen,
// breites Grinsen. Blickt nach vorn (+z).
import { inEllipsoid, inSphere } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['u', 'w', 'n'];

/** @param {{ radius: number }} params */
export function poopModel({ radius: R }) {
  const tiers = [
    { c: [0, -R * 0.55, 0], r: [R * 0.98, R * 0.36, R * 0.82] },
    { c: [0, -R * 0.08, 0], r: [R * 0.76, R * 0.32, R * 0.64] },
    { c: [0, R * 0.32, 0], r: [R * 0.5, R * 0.26, R * 0.44] },
  ];
  const tip = [R * 0.12, R * 0.62, 0];
  const eyes = [-1, 1].map(s => [s * R * 0.3, -R * 0.02, R * 0.6]);
  const inBody = (x, y, z) => tiers.some(t => inEllipsoid(x, y, z, t.c, t.r)) || inSphere(x, y, z, tip, R * 0.2);
  return {
    bounds: Math.ceil(R) + 1,
    solid: inBody,
    skin(x, y, z) {
      if (z > 0) {
        // Augen: weißer Kreis mit dunkler Pupille (Pupille etwas nach oben-innen versetzt)
        for (const [ex, ey] of eyes) {
          const d = Math.hypot(x - ex, y - ey);
          if (d < R * 0.12) return 'n';
          if (d < R * 0.23) return 'w';
        }
        // Grinsen: Bogen auf dem unteren Kringel
        const u = x / (R * 0.45);
        if (Math.abs(u) < 1 && Math.abs(y - (-R * 0.46 - R * 0.1 * (1 - u * u))) < 0.75 && z > R * 0.45) return 'n';
      }
      return 'u';
    },
  };
}
