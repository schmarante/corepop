// Modell „Huhn“: rundlicher weißer Körper mit Schwanzbüschel hinten, Kopf vorne oben mit rotem Kamm und
// Kehllappen, orangem Schnabel und schwarzen Augen, zwei orange Beine. Blickt nach vorn (+z).
import { inSphere, inEllipsoid, inCylinderY } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'r', 'o', 'n'];

/** @param {{ radius: number }} params */
export function chickenModel({ radius: R }) {
  const body = [0, -R * 0.15, -R * 0.1];
  const bodyR = [R * 0.66, R * 0.58, R * 0.78];
  const tail = [0, R * 0.2, -R * 0.72];
  const head = [0, R * 0.5, R * 0.42];
  const headR = R * 0.36;
  const combs = [-0.12, 0.02, 0.16].map(dz => [0, R * 0.88, R * (0.36 + dz)]);
  const beak = [0, R * 0.46, R * 0.82];
  const wattle = [0, R * 0.24, R * 0.7];
  const eyes = [-1, 1].map(s => [s * R * 0.3, R * 0.58, R * 0.62]);
  const legs = [-1, 1].map(s => [s * R * 0.25, R * 0.05]);
  const legTop = body[1] - bodyR[1] * 0.8;
  const legBottom = -R * 1.05;
  const inBody = (x, y, z) =>
    inEllipsoid(x, y, z, body, bodyR) || inEllipsoid(x, y, z, tail, [R * 0.3, R * 0.42, R * 0.28]) || inSphere(x, y, z, head, headR);
  return {
    bounds: Math.ceil(R * 1.1) + 1,
    solid: (x, y, z) =>
      inBody(x, y, z) ||
      combs.some(c => inSphere(x, y, z, c, R * 0.15)) ||
      inEllipsoid(x, y, z, beak, [R * 0.13, R * 0.1, R * 0.18]) ||
      inEllipsoid(x, y, z, wattle, [R * 0.09, R * 0.15, R * 0.09]) ||
      legs.some(l => inCylinderY(x, y, z, l, R * 0.09 + 0.4, legBottom, legTop)),
    skin(x, y, z) {
      if (y < legTop - 0.3 && !inBody(x, y, z)) return 'o';                         // Beine
      if (eyes.some(e => inSphere(x, y, z, e, 0.95))) return 'n';
      if (inEllipsoid(x, y, z, beak, [R * 0.13 + 0.5, R * 0.1 + 0.5, R * 0.18 + 0.5]) && z > R * 0.68) return 'o';
      if (combs.some(c => inSphere(x, y, z, c, R * 0.15 + 0.5)) && y > R * 0.75) return 'r';
      if (inEllipsoid(x, y, z, wattle, [R * 0.09 + 0.5, R * 0.15 + 0.5, R * 0.09 + 0.5]) && !inSphere(x, y, z, head, headR - 0.3)) return 'r';
      return 'w';
    },
  };
}
