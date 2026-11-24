// Modell „Kristallmaske“ (Boss, eigenes Design): eine kantige Low-Poly-Gesichtsmaske wie aus gefaltetem Papier oder
// geschliffenem Kristall. Die Vorderseite ist ein Höhenfeld aus flachen Dreiecks-Facetten (Ecken unten in VERTICES,
// gespiegelt an x = 0); jede Facette bekommt je nach Neigung zum Licht einen eigenen Ton (Silber, Stahlgrau, Graphit)
// – so sieht man die Flächen. Markant: vorspringende Brauenkante, scharfer Nasengrat, hohe Wangenknochen, spitzes Kinn,
// oben ein Kamm aus drei Kristallzacken. Rosa Zierlinien (Tränenstriche unter den Augen, Raute auf der Stirn), ein
// schmaler dunkler Mundschlitz. Hinten eine flache, dunkle Rückplatte mit braunem Riemen und cremefarbener Schnalle.
// Die Augen sind tiefe, dunkle Höhlen – darin sitzen die beiden Spreng-Kristalle (`crystals`), von vorn treffbar.
// Der bunte Kern steckt im dicken Maskenkörper.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'z', 'k', 'n', 'h', 'u', 'c'];

// Ecken der rechten Hälfte (x ≥ 0) für radius = 24: [x, y, z] – z = Höhe der Vorderseite
const VERTICES = {
  T0: [0, 20, 2],     // Stirn oben Mitte
  T1: [9, 19, 0],     // Stirn oben seitlich
  T2: [16, 13, -2],   // Schläfe oben
  F0: [0, 12, 6],     // Stirnmitte
  F1: [8, 11, 5],     // Stirn seitlich
  G0: [0, 5, 7],      // Nasenwurzel
  B1: [6, 6, 9],      // Brauenkante über dem Auge (springt vor)
  B2: [14, 6, 3],     // Braue außen
  S: [17, 0, -2],     // breiteste Stelle auf Augenhöhe
  E0: [7, 1, 3],      // Augenmitte (wird ohnehin ausgehöhlt)
  N1: [2, 0, 8],      // Nasenrücken seitlich
  NT: [0, -6, 13],    // Nasenspitze
  N2: [4, -7, 6],     // Nasenflügel
  K1: [12, -3, 7],    // Wangenknochen (springt vor)
  K2: [15, -11, -2],  // Kiefer seitlich
  L0: [0, -10, 8],    // unter der Nase
  M0: [0, -14, 8],    // Mund Mitte
  M1: [6, -13, 5],    // Mundwinkel
  J1: [9, -19, 2],    // Kiefer unten
  C0: [0, -19, 7],    // Kinn
  CB: [0, -24, 2],    // Kinnspitze
};
// Dreiecke (Facetten) der rechten Hälfte
const TRIANGLES = [
  ['T0', 'T1', 'F0'], ['T1', 'F1', 'F0'], ['T1', 'T2', 'F1'], ['T2', 'B2', 'F1'], ['T2', 'S', 'B2'],
  ['F0', 'F1', 'G0'], ['F1', 'B1', 'G0'], ['F1', 'B2', 'B1'],
  ['B1', 'B2', 'E0'], ['B2', 'K1', 'E0'], ['E0', 'K1', 'N1'], ['B1', 'E0', 'N1'], ['G0', 'B1', 'N1'],
  ['B2', 'S', 'K1'], ['K1', 'S', 'K2'],
  ['G0', 'N1', 'NT'], ['N1', 'N2', 'NT'], ['N1', 'K1', 'N2'], ['NT', 'N2', 'L0'],
  ['N2', 'K1', 'M1'], ['K1', 'K2', 'M1'], ['N2', 'M1', 'L0'], ['L0', 'M1', 'M0'],
  ['M0', 'M1', 'C0'], ['M1', 'J1', 'C0'], ['M1', 'K2', 'J1'], ['C0', 'J1', 'CB'],
];

/** @param {{ radius: number }} params  radius: halbe Höhe (Kinnspitze bis Kammspitze) in Voxeln */
export function maskModel({ radius: R }) {
  const s = R / 24;
  const g = 0.92 * s;                   // Maße der Facetten-Ecken (für radius 24 entworfen), etwas kleiner: Platz für den Kamm
  const shiftY = -Math.round(1 * s);    // Kamm oben ragt heraus → Maske leicht nach unten
  // Licht von vorn oben (symmetrisch wie bei einer gefalteten Papiermaske) – der Ton zeigt die Neigung jeder Facette
  const light = normalize([0, 0.45, 0.9]);
  const backLight = normalize([0, 0.5, -0.87]);
  // Facetten vorbereiten: Ecken skaliert, Ebene z = a·x + b·y + c
  const facets = TRIANGLES.map(names => {
    const p = names.map(n => VERTICES[n].map(c => c * g));
    let n = normalize(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    if (n[2] < 0) n = n.map(c => -c);
    const a = -n[0] / n[2];
    const b = -n[1] / n[2];
    const c = p[0][2] - a * p[0][0] - b * p[0][1];
    const d = dot(n, light);
    // Rückseite: Relief der Vorderseite flach gespiegelt (z = −4 − 0,4 · Vorderseite) → ebenfalls Facetten
    const backDot = dot(normalize([-0.4 * a, -0.4 * b, -1]), backLight);
    return { p, a, b, c, tone: d > 0.86 ? 'w' : d > 0.6 ? 'z' : 'k', backTone: backDot > 0.9 ? 'k' : 'n' };
  });
  /** Facette, in deren Grundriss (|x|, y) der Punkt liegt */
  const facetAt = (x, y) => {
    for (const f of facets) if (inTriangle(Math.abs(x), y, f.p)) return f;
    return null;
  };
  const height = (f, x, y) => f.a * Math.abs(x) + f.b * y + f.c;
  const backAt = (f, x, y) => -4 * s - 0.4 * Math.max(0, height(f, x, y));

  // Augenhöhlen: kantige Mandelform (Sechseck, außen leicht hochgezogen), tief ausgehöhlt mit flachem Boden
  const eye = { x: Math.round(7 * g), y: Math.round(1 * g), w: 4 * s, h: 2.3 * s, floor: Math.round(1 * s) };
  const inEyeHole = (x, y) => {
    const dx = Math.abs(x) - eye.x;
    const dy = y - eye.y - dx * 0.18;
    return Math.abs(dx) <= eye.w && Math.abs(dy) <= eye.h * Math.min(1, (eye.w - Math.abs(dx)) / (eye.w * 0.45));
  };
  // Mundschlitz: schmal, kantig, Mundwinkel leicht hochgezogen (verschmitzt), 2 Voxel tief
  const mouthY = x => -13 * g + Math.abs(x) * 0.28;
  const inMouth = (x, y) => Math.abs(x) <= 5.5 * g && Math.abs(y - mouthY(x)) < 0.55;

  // Kamm: fünf Kristallzacken oben auf der Stirn (Mitte am höchsten), dünn wie Kristallsplitter
  const spikes = [
    { x: 0, y0: 14 * g, top: R + 1 + shiftY, half: 4.6 * s },
    { x: 6.5 * s, y0: 13.5 * g, top: 21.5 * s, half: 3.6 * s },
    { x: 12 * s, y0: 10 * g, top: 17 * s, half: 2.9 * s },
  ];
  const spikeAt = (x, y) => {
    for (const sp of spikes) {
      const t = (y - sp.y0) / (sp.top - sp.y0);
      if (t < 0 || t > 1) continue;
      const off = x - Math.sign(x) * sp.x;          // Lage quer zur Zacke (links negativ)
      if (Math.abs(off) <= sp.half * (1 - t) + 0.01) return { sp, t, off };
    }
    return null;
  };
  /** Zacke: Rautenquerschnitt, vorn ein Grat in der Mitte, nach oben dünner */
  const inSpike = (x, y, z) => {
    const hit = spikeAt(x, y);
    if (!hit) return false;
    const { sp, t, off } = hit;
    const ridge = 4.5 * s - (Math.abs(off) / sp.half) * 3 * s - t * 2 * s;
    return z <= ridge && z >= -5.5 * s + t * 3 * s;
  };

  return {
    bounds: Math.ceil(R) + 1,
    crystals: [-1, 1].map(k => [k * eye.x, eye.y + shiftY, eye.floor]),
    solid(x, y, z) {
      const Y = y - shiftY;
      const f = facetAt(x, Y);
      if (f && z <= height(f, x, Y) + 0.5 && z >= backAt(f, x, Y)) {
        if (inEyeHole(x, Y) && z > eye.floor) return false;
        if (inMouth(x, Y) && z > height(f, x, Y) - 2) return false;
        return true;
      }
      return inSpike(x, Y, z);
    },
    skin(x, y, z) {
      const Y = y - shiftY;
      const f = facetAt(x, Y);
      const strap = Math.abs(Y - eye.y) <= 1.6 * s;   // Riemen auf Augenhöhe
      if (!f || z > height(f, x, Y) + 0.5) {
        // Kristallzacken: linke Seite des Grats hell, rechte stahlgrau, Spitze silbern
        const hit = spikeAt(x, Y);
        if (!hit) return 'k';
        return hit.off < 0 || hit.t > 0.75 ? 'w' : 'z';
      }
      const front = height(f, x, Y);
      const backZ = backAt(f, x, Y);
      // Rand (Seitenwände entlang des Umrisses) und Rückseite: dunkel, Riemen braun, hinten eine Schnalle
      const rim = !facetAt(x + Math.sign(x || 1), Y) || !facetAt(x, Y + 1) || !facetAt(x, Y - 1);
      if (z < backZ + 1 || (rim && z < front - 1.5)) {
        if (strap && z < backZ + 1 && Math.abs(x) <= 2.5 * s) return Math.abs(x) <= 1 && Math.abs(Y - eye.y) <= 0.6 ? 'u' : 'c';
        if (strap) return 'u';
        return rim && z >= backZ + 1 ? 'k' : f.backTone;
      }
      // Augenhöhlen und Mundschlitz: dunkel
      if (inEyeHole(x, Y) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inEyeHole(x + dx, Y + dy) && z > eye.floor)) return 'n';
      if ([[0, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMouth(x + dx, Y + dy)) && z > front - 2.5) return 'n';
      // rosa Tränenlinie unter jedem Auge mit Tropfen (Raute) am Ende
      const ax = Math.abs(x);
      const t = (eye.y - eye.h - 1.2 * s - Y) / (6.5 * s);   // 0 … 1 nach unten
      const lineX = eye.x + 0.5 * s + t * 1.8 * s;
      if (t >= 0 && t <= 1 && Math.abs(ax - lineX) < 0.55) return 'h';
      const drop = Math.abs(ax - (eye.x + 2.3 * s)) + Math.abs(Y - (eye.y - eye.h - 9.2 * s)) * 0.8;
      if (drop <= 1.6 * s) return 'h';
      // Raute auf der Stirn: rosa mit silbernem Kern
      const gem = Math.abs(x) + Math.abs(Y - 11 * g) * 0.7;
      if (gem <= 3 * s) return gem <= 1.3 * s ? 'w' : 'h';
      return f.tone;
    },
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = v => {
  const l = Math.hypot(...v) || 1;
  return v.map(c => c / l);
};
/** Punkt (x, y) im Dreieck (Grundriss) – Ränder zählen dazu (kleine Toleranz, damit keine Lücken entstehen) */
function inTriangle(x, y, [a, b, c]) {
  const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
  const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
  const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
  const eps = 1e-6;
  const neg = d1 < -eps || d2 < -eps || d3 < -eps;
  const pos = d1 > eps || d2 > eps || d3 > eps;
  return !(neg && pos);
}
