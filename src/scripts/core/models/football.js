// Modell „Fußball“: runde Kugel mit dem klassischen Ballmuster – abgestumpftes Ikosaeder aus 12 schwarzen Fünfecken
// und 20 weißen Sechsecken.
// Jeder Punkt der Oberfläche bekommt die Fläche, die ein Strahl vom Mittelpunkt in seiner Richtung zuerst trifft:
// Fläche f mit größtem (Richtung · Normale_f) / Abstand_f. Dadurch werden die Fünfecke echte Fünfecke mit geraden
// Kanten statt Kreisflecken. Normalen: Fünfecke = Ecken eines Ikosaeders, Sechsecke = Mitten seiner Dreiecke.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'n'];

// Abstand der Flächen vom Mittelpunkt beim abgestumpften Ikosaeder: Fünfeck / Sechseck (nachgerechnet, ≈ 1.0265)
const PENTAGON_DISTANCE = 1.0265;

const PHI = (1 + Math.sqrt(5)) / 2;
const normalize = v => {
  const l = Math.hypot(...v);
  return v.map(c => c / l);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const ICOSA = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) ICOSA.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
/** Mitten der 20 Dreiecke (Nachbarecken haben Abstand 2) */
const TRIANGLES = [];
for (let i = 0; i < 12; i++)
  for (let j = i + 1; j < 12; j++)
    for (let k = j + 1; k < 12; k++) {
      const edge = (p, q) => Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - 2) < 1e-6;
      if (edge(ICOSA[i], ICOSA[j]) && edge(ICOSA[j], ICOSA[k]) && edge(ICOSA[i], ICOSA[k]))
        TRIANGLES.push([0, 1, 2].map(m => ICOSA[i][m] + ICOSA[j][m] + ICOSA[k][m]));
    }
const PENTAGONS = ICOSA.map(normalize);
const HEXAGONS = TRIANGLES.map(normalize);

/**
 * @param {{ radius: number, tilt?: number }} params  tilt: Drehung des Musters (rad), damit kein Fünfeck genau vorne sitzt
 * @returns {{ bounds: number, solid: (x: number, y: number, z: number) => boolean, skin: (x: number, y: number, z: number) => string }}
 */
export function footballModel({ radius: R, tilt = 0.4 }) {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return {
    bounds: Math.ceil(R) + 1,
    solid: (x, y, z) => Math.hypot(x, y, z) <= R + 0.3,
    skin(x, y, z) {
      // Muster leicht gedreht (um x und y), dann Fläche bestimmen
      const y1 = y * c - z * s;
      const z1 = y * s + z * c;
      const d = normalize([x * c + z1 * s, y1, -x * s + z1 * c].map(v => v || 1e-9));
      const pentagon = Math.max(...PENTAGONS.map(n => dot(d, n))) / PENTAGON_DISTANCE;
      const hexagon = Math.max(...HEXAGONS.map(n => dot(d, n)));
      return pentagon > hexagon ? 'n' : 'w';
    },
  };
}
