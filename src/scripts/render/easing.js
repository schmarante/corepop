// Easing-Kurven für Übergänge (p: 0 … 1). Grundsatz im ganzen Spiel: nichts poppt rein oder raus –
// alles blendet, wächst, schrumpft oder fliegt, auch wenn es nur 150 ms dauert.
export const clamp01 = p => Math.min(1, Math.max(0, p));
export const easeOutCubic = p => 1 - (1 - clamp01(p)) ** 3;
export const easeInCubic = p => clamp01(p) ** 3;
export const easeInOutCubic = p => (p = clamp01(p)) < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
/** wächst leicht über das Ziel hinaus und federt zurück */
export const easeOutBack = p => {
  const x = clamp01(p);
  const c = 1.7;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
};
