// Modell „Kirschpaar“ (eigenes Design, Comic): zwei pralle rote Kirschen nebeneinander, die linke etwas tiefer und
// leicht nach vorn versetzt, mit rosa Glanzfleck vorne oben links. Zwei dünne dunkelgrüne Stiele schwingen im Bogen
// nach oben und treffen sich in einem Knoten, an dem ein hellgrünes Blatt mit dunkler Mittelrippe hängt.
import { inEllipsoid } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['r', 'h', 'w', 'e', 'l'];

/** Punkte einer quadratischen Bézierkurve a → b mit Kontrollpunkt c */
const bezier = (a, c, b, steps) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return [0, 1, 2].map(k => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t * t * b[k]);
  });

/** @param {{ radius: number }} params  radius: halbe Breite des Paars */
export function cherriesModel({ radius }) {
  // Das Paar mit Stielen ist höher als breit: etwas kleiner bauen und nach unten schieben, damit es wie die anderen
  // Figuren ungefähr in die Kugel mit `radius` passt
  const R = radius * 0.93;
  const shift = R * 0.13;
  const cr = R * 0.6;   // Kirschradius
  const cherries = [
    { at: [-R * 0.5, -R * 0.4, R * 0.12], r: [cr * 1.04, cr * 0.96, cr] },
    { at: [R * 0.52, -R * 0.2, -R * 0.12], r: [cr * 1.04, cr * 0.96, cr] },
  ];
  // Stiele: vom oberen Ende jeder Kirsche im Bogen zum gemeinsamen Knoten oben
  const knot = [R * 0.05, R * 1.02, 0];
  const stemWidth = Math.max(0.75, R * 0.085);
  const stems = [
    bezier([cherries[0].at[0] + 0.5, cherries[0].at[1] + cr * 0.7, cherries[0].at[2]], [-R * 0.3, R * 0.55, 0], knot, 40),
    bezier([cherries[1].at[0] - 0.5, cherries[1].at[1] + cr * 0.7, cherries[1].at[2]], [R * 0.55, R * 0.45, 0], knot, 40),
  ].flat();
  // Blatt: flaches Oval schräg nach rechts oben vom Knoten aus, Mittelrippe entlang der Längsachse
  const leafAngle = 0.2;
  const leafDir = [Math.cos(leafAngle), Math.sin(leafAngle)];
  const leafLength = R * 0.5;
  const leafCenter = [knot[0] + leafDir[0] * leafLength * 0.95, knot[1] + leafDir[1] * leafLength * 0.95 - 0.3, 0];
  const leafLocal = (x, y) => {
    const dx = x - leafCenter[0];
    const dy = y - leafCenter[1];
    return [dx * leafDir[0] + dy * leafDir[1], -dx * leafDir[1] + dy * leafDir[0]];
  };
  const inLeaf = (x, y, z) => {
    const [u, v] = leafLocal(x, y);
    return (u / leafLength) ** 2 + (v / (R * 0.24)) ** 2 + (z / 1.1) ** 2 <= 1;
  };
  const inStem = (x, y, z) => stems.some(p => Math.hypot(x - p[0], y - p[1], z - p[2]) <= stemWidth);
  const inCherry = (x, y, z) => cherries.some(c => inEllipsoid(x, y, z, c.at, c.r));
  return {
    bounds: Math.ceil(radius * 1.1) + 1,
    solid: (x, y, z) => inCherry(x, y + shift, z) || inStem(x, y + shift, z) || inLeaf(x, y + shift, z),
    skin(x, y0, z) {
      const y = y0 + shift;
      if (inLeaf(x, y, z) && !inStem(x, y, z)) {
        const [u, v] = leafLocal(x, y);
        return Math.abs(v) < 0.55 && u < leafLength * 0.75 ? 'e' : 'l';
      }
      if (!inCherry(x, y, z)) return 'e';
      // Glanzfleck: vorne oben links auf jeder Kirsche
      const shine = Math.min(...cherries.map(({ at }) => Math.hypot(x - (at[0] - cr * 0.32), y - (at[1] + cr * 0.36), z - (at[2] + cr * 0.85))));
      return shine < 1 ? 'w' : shine < cr * 0.38 ? 'h' : 'r';
    },
  };
}
