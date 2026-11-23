// Modell „Halbe Wassermelone“: Halbkugel, die Schnittfläche zeigt nach vorn (+z): rotes Fruchtfleisch mit schwarzen
// Kernen im Kreis, darum ein weißer Rand; hinten die dunkelgrüne Schale mit hellen Streifen.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['r', 'n', 'w', 'e', 'l'];

const SEEDS = [
  { ring: 0.55, count: 9, offset: 0 },
  { ring: 0.3, count: 5, offset: 0.6 },
];

/** @param {{ radius: number }} params */
export function watermelonModel({ radius: R }) {
  const seeds = SEEDS.flatMap(({ ring, count, offset }) =>
    Array.from({ length: count }, (_, k) => {
      const a = offset + (k / count) * Math.PI * 2;
      return [Math.cos(a) * ring * R, Math.sin(a) * ring * R];
    }),
  );
  return {
    bounds: Math.ceil(R) + 1,
    // Halbkugel: alles hinter der Schnittfläche z ≤ 0
    solid: (x, y, z) => z <= 0 && Math.hypot(x, y, z) <= R + 0.3,
    skin(x, y, z) {
      if (z >= -0.5) {
        // Schnittfläche
        const r = Math.hypot(x, y);
        if (r > R - 1.1) return 'e';                                       // Schale am Rand
        if (r > R - 2.1) return 'w';                                       // weißer Rand
        return seeds.some(([sx, sy]) => Math.hypot(x - sx, (y - sy) * 0.75) < 0.85) ? 'n' : 'r';
      }
      // Schale: dunkelgrün mit hellen Längsstreifen (um die z-Achse)
      const angle = Math.atan2(y, x);
      return Math.abs(Math.sin(angle * 4 + Math.sin(z * 0.6) * 0.6)) < 0.25 ? 'l' : 'e';
    },
  };
}
