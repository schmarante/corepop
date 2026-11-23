// Modell „Halbe Avocado“: Birnenform, Schnittfläche nach vorn (+z) mit hellgrünem Fruchtfleisch und großem braunen
// Kern, der etwas herausragt; außen dunkelgrüne Schale.
import { inSphere } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['l', 'e', 'u'];

/** @param {{ radius: number }} params  radius: halbe Höhe */
export function avocadoModel({ radius: R }) {
  const bottom = [0, -R * 0.3, 0];
  const top = [0, R * 0.42, 0];
  const pit = [0, -R * 0.28, R * 0.05];
  const pitR = R * 0.36;
  const inBody = (x, y, z) => {
    // Birne: zwei Kugeln, dazwischen weich verbunden (Radius wächst linear von oben nach unten)
    if (inSphere(x, y, z, bottom, R * 0.68) || inSphere(x, y, z, top, R * 0.45)) return true;
    if (y < bottom[1] || y > top[1]) return false;
    const t = (y - bottom[1]) / (top[1] - bottom[1]);
    return Math.hypot(x, z) <= R * (0.68 + (0.45 - 0.68) * t);
  };
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) => (z <= 0 && inBody(x, y, z)) || inSphere(x, y, z, pit, pitR),
    skin(x, y, z) {
      if (inSphere(x, y, z, pit, pitR + 0.4)) return 'u';
      if (z >= -0.5) {
        // Schnittfläche: Rand dunkelgrün (Schale), sonst Fruchtfleisch
        const edge = !inBody(x * 1.12, (y - bottom[1]) * 1.08 + bottom[1], 0);
        return edge ? 'e' : 'l';
      }
      return 'e';
    },
  };
}
