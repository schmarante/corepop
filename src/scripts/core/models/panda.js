// Modell „Pandakopf“ (eigenes Design, Comic): großer, runder weißer Kopf, etwas breiter als hoch; zwei runde schwarze
// Ohren oben; große schwarze Augenflecken (schräge Tropfen, außen tiefer) mit weißem Lichtpunkt oben innen; kleine
// weiße Schnauze mit schwarzer Nase und Mund; rosa Bäckchen. Hinterkopf schlicht weiß.
import { inSphere, inEllipsoid } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'n', 'h'];

// Gesicht als Pixelbild der Vorderansicht (für Radius 9, wird mitskaliert): Zeilen von oben (y = FACE_TOP) nach unten,
// Spalten x = −8 … 8. n = schwarz, h = rosa, alles andere weiß.
const FACE_TOP = 3;
const FACE = [
  '....nn.....nn....',
  '...nnnn...nnnn...',
  '..nnnwn...nwnnn..',
  '..nnnnn...nnnnn..',
  '.nnnnn.....nnnnn.',
  '.nnnn..nnn..nnnn.',
  '..nn....n....nn..',
  '.hhh...n.n...hhh.',
  '.hhh.........hhh.',
];

/** @param {{ radius: number }} params  radius: halbe Kopfbreite */
export function pandaModel({ radius: R }) {
  const head = [0, -R * 0.1, 0];
  const headR = [R, R * 0.86, R * 0.86];
  const ears = [-1, 1].map(s => [s * R * 0.7, R * 0.62, -R * 0.12]);
  const earR = R * 0.32;
  const snout = [0, -R * 0.42, R * 0.6];
  const snoutR = [R * 0.36, R * 0.26, R * 0.3];
  const scale = 9 / R;
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) =>
      inEllipsoid(x, y, z, head, headR) || ears.some(e => inSphere(x, y, z, e, earR)) || inEllipsoid(x, y, z, snout, snoutR),
    skin(x, y, z) {
      if (ears.some(e => inSphere(x, y, z, e, earR + 0.6)) && !inEllipsoid(x, y, z, head, headR.map(r => r - 0.3))) return 'n';
      if (z < R * 0.3) return 'w';   // Seiten und Hinterkopf
      const pixel = FACE[FACE_TOP - Math.round(y * scale)]?.[Math.round(x * scale) + 8];
      return pixel === 'n' || pixel === 'h' ? pixel : 'w';
    },
  };
}
