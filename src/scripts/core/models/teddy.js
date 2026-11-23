// Modell „Teddykopf“ (allgemeiner Teddy, eigenes Design): runder brauner Kopf, zwei runde Ohren mit hellem Inneren,
// helle Schnauze vorne mit schwarzer Nase, zwei schwarze Augen.
import { inSphere, inEllipsoid } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['u', 'c', 'n'];

/** @param {{ radius: number }} params  radius: Kopfradius */
export function teddyModel({ radius: R }) {
  const head = [0, -R * 0.08, 0];
  const ears = [-1, 1].map(s => [s * R * 0.72, R * 0.68, -R * 0.1]);
  const earR = R * 0.36;
  const snout = [0, -R * 0.32, R * 0.72];
  const snoutR = [R * 0.42, R * 0.32, R * 0.32];
  const eyes = [-1, 1].map(s => [s * R * 0.36, R * 0.18, R * 0.86]);
  const nose = [0, -R * 0.16, R * 1.02];
  return {
    bounds: Math.ceil(R * 1.2) + 1,
    solid: (x, y, z) =>
      inSphere(x, y, z, head, R * 0.92) || ears.some(e => inSphere(x, y, z, e, earR)) || inEllipsoid(x, y, z, snout, snoutR),
    skin(x, y, z) {
      if (inSphere(x, y, z, nose, R * 0.2)) return 'n';
      if (eyes.some(e => inSphere(x, y, z, e, R * 0.13 + 0.4))) return 'n';
      if (inEllipsoid(x, y, z, snout, snoutR.map(r => r + 0.5)) && z > R * 0.55) return 'c';
      // Ohr-Innenseite: vorne an den Ohren
      if (ears.some(e => inSphere(x, y, z, e, earR + 0.6) && z > e[2] + earR * 0.35 && Math.hypot(x - e[0], y - e[1]) < earR * 0.62)) return 'c';
      return 'u';
    },
  };
}
