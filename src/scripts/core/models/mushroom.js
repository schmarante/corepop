// Modell „Fliegenpilz“: halbrunder roter Hut (Halbkugel, Rand leicht eingerollt) mit weißen Punkten, cremefarbene
// Unterseite; stilisierter Cartoon-Stiel – bauchig, unten zur runden Knolle verdickt. Steht senkrecht.
import { inEllipsoid } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['r', 'w', 'c'];

/** @param {{ radius: number }} params  radius: Hutradius */
export function mushroomModel({ radius: R }) {
  const capBase = -R * 0.05;           // Unterkante des Huts
  const cap = [0, capBase, 0];
  const capR = [R, R * 0.92, R];       // fast eine Halbkugel
  const curl = 1.2;                    // eingerollter Rand: reicht so weit unter die Hutkante
  const stemTop = capBase + 0.5;
  const stemBottom = -R * 0.98;
  const stemR = R * 0.3;
  // weiße Punkte: gleichmäßig auf der Kuppel (Sonnenblumen-Muster), unterschiedlich groß
  const dots = Array.from({ length: 14 }, (_, k) => {
    const h = 0.18 + 0.8 * ((k + 0.5) / 14);
    const a = k * 2.39996;
    const r = Math.sqrt(1 - h * h);
    return { at: [Math.cos(a) * r * capR[0], capBase + h * capR[1], Math.sin(a) * r * capR[2]], size: R * (0.17 + 0.07 * ((k * 7) % 3) / 2) };
  });
  /** Stielradius in Höhe y: oben schmal, nach unten bauchig, ganz unten runde Knolle */
  const stemAt = y => {
    const t = (stemTop - y) / (stemTop - stemBottom);   // 0 oben … 1 unten
    return stemR * (0.85 + 0.55 * t * t);
  };
  const bulb = [0, stemBottom + R * 0.28, 0];
  const inStem = (x, y, z) =>
    (y >= bulb[1] && y <= stemTop && Math.hypot(x, z) <= stemAt(y)) || inEllipsoid(x, y, z, bulb, [stemR * 1.4, R * 0.3, stemR * 1.4]);
  const inCap = (x, y, z) => {
    if (y >= capBase) return inEllipsoid(x, y, z, cap, capR);
    // eingerollter Rand: schmaler Ring unter der Hutkante
    const r = Math.hypot(x, z);
    return y >= capBase - curl && r <= R && r >= R - 1.6;
  };
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) => inCap(x, y, z) || inStem(x, y, z),
    skin(x, y, z) {
      if (inStem(x, y, z) && !inCap(x, y, z)) return 'w';
      if (y < capBase + 0.6 && Math.hypot(x, z) < R - 1.2) return 'c';         // Unterseite (Lamellen)
      return dots.some(d => Math.hypot(x - d.at[0], y - d.at[1], z - d.at[2]) < d.size) ? 'w' : 'r';
    },
  };
}
