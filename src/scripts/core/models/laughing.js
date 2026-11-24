// Modell „Lachgesicht mit Freudentränen“ (eigenes Design, Comic – kein Hersteller-Emoji): runder gelber Kopf, Augen
// vor Lachen zugekniffen (schwarze Bögen ∩), darunter ein großes offenes D-Lachen, 1 Voxel tief eingelassen: oben
// eine weiße Zahnreihe, innen dunkel, unten rosa Zunge. Aus den äußeren Augenwinkeln kullern zwei dicke blaue
// Tränen, die seitlich aus dem Gesicht herausstehen. Hinterkopf schlicht gelb.
import { inEllipsoid, inSphere, normalize } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['y', 'n', 'w', 'h', 'b'];

// Gesicht als Pixelbild der Vorderansicht (für Radius 9, wird mitskaliert): Zeilen von oben (y = FACE_TOP) nach unten,
// Spalten x = −8 … 8. n = schwarz, w = Zähne, h = Zunge, b = Tränenspur, m = Mund (eingelassen, dunkel),
// t = Zunge (eingelassen). Alles andere gelb.
const FACE_TOP = 4;
const FACE = [
  '...nnn.....nnn...',
  '..n...n...n...n..',
  '.n.............n.',
  '.b.............b.',
  '.b.............b.',
  '...wwwwwwwwwww...',
  '...mmmmmmmmmmm...',
  '....mmmmmmmmm....',
  '....mmtttttmm....',
  '.....mtttttm.....',
  '.......mmm.......',
];
const COLOR = { n: 'n', w: 'w', h: 'h', b: 'b', m: 'n', t: 'h' };

/** @param {{ radius: number }} params  radius: halbe Kopfbreite */
export function laughingModel({ radius: R }) {
  const headR = [R, R * 0.94, R * 0.88];
  const scale = 9 / R;
  const pixel = (x, y) => FACE[FACE_TOP - Math.round(y * scale)]?.[Math.round(x * scale) + 8];
  /** z der Kopfoberfläche vorne bei (x, y) */
  const surfaceZ = (x, y) => headR[2] * Math.sqrt(Math.max(0, 1 - (x / headR[0]) ** 2 - (y / headR[1]) ** 2));
  // Tränen: dicke Tropfen am Kopfrand neben den äußeren Augenwinkeln, ein Stück aus der Oberfläche herausgeschoben,
  // mit kleinerer Spitze Richtung Auge
  const tears = [-1, 1].map(s => {
    const x = s * R * 0.74;
    const y = -R * 0.3;
    const z = surfaceZ(x, y);
    const n = normalize([x / headR[0] ** 2, y / headR[1] ** 2, z / headR[2] ** 2]);
    const out = R * 0.14;
    return {
      drop: [x + n[0] * out, y + n[1] * out, z + n[2] * out],
      tip: [x - s * R * 0.05 + n[0] * out * 0.5, y + R * 0.22 + n[1] * out * 0.5, z + n[2] * out * 0.5],
    };
  });
  const inTear = (x, y, z) =>
    tears.some(t => inEllipsoid(x, y, z, t.drop, [R * 0.19, R * 0.22, R * 0.19]) || inSphere(x, y, z, t.tip, R * 0.12));
  const inHead = (x, y, z) => inEllipsoid(x, y, z, [0, 0, 0], headR);
  // Mund: vorderste Lage ausgespart (eingelassen), Zähne bleiben stehen
  const carved = (x, y, z) => {
    const p = pixel(x, y);
    return (p === 'm' || p === 't') && z > R * 0.3 && z > surfaceZ(x, y) - 1.2;
  };
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) => inTear(x, y, z) || (inHead(x, y, z) && !carved(x, y, z)),
    skin(x, y, z) {
      if (inTear(x, y, z) && !inEllipsoid(x, y, z, [0, 0, 0], headR.map(r => r - 0.4))) return 'b';
      if (z < R * 0.3) return 'y';   // Seiten und Hinterkopf
      return COLOR[pixel(x, y)] ?? 'y';
    },
  };
}
