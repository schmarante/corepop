// Modell „Basketball“: orange Kugel mit schwarzen Nähten – zwei Großkreise (senkrecht und waagrecht) und zwei
// gebogene Nähte (Kreise um die linke und rechte Seite), wie beim echten Ball.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['o', 'n'];

const SEAM = 1.15;          // Breite der Nähte in Voxeln
const CURVE = Math.cos(0.9); // gebogene Nähte: Kreise im Winkel ~52° um die ±x-Achse

/** @param {{ radius: number }} params */
export function basketballModel({ radius: R }) {
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) => Math.hypot(x, y, z) <= R + 0.3,
    skin(x, y, z) {
      const len = Math.hypot(x, y, z) || 1;
      const half = SEAM / 2;
      const seam =
        Math.abs(x) < half ||                         // senkrechter Großkreis
        Math.abs(y) < half ||                         // waagrechter Großkreis
        Math.abs(Math.abs(x) - CURVE * len) < half;   // gebogene Nähte links und rechts
      return seam ? 'n' : 'o';
    },
  };
}
