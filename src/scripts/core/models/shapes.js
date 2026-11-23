// Gemeinsame Helfer für Modelle.

export const normalize = v => {
  const l = Math.hypot(...v) || 1;
  return v.map(c => c / l);
};
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Abstand des Punkts (in Voxeln) zu einer Fläche, die durch einen Wert ≈ 0 beschrieben ist – für Linien auf Kugeln:
 *  liegt |wert| unter halber Linienbreite, gehört der Voxel zur Linie. */
export const onLine = (value, width = 1.1) => Math.abs(value) < width / 2;

/** Punkt in Kugel um c mit Radius r? */
export const inSphere = (x, y, z, [cx, cy, cz], r) => Math.hypot(x - cx, y - cy, z - cz) <= r;

/** Punkt in Ellipsoid um c mit Halbachsen [rx, ry, rz]? */
export const inEllipsoid = (x, y, z, [cx, cy, cz], [rx, ry, rz]) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1;

/** Punkt in senkrechtem Zylinder (Achse y) um (cx, cz) mit Radius r zwischen y0 und y1? */
export const inCylinderY = (x, y, z, [cx, cz], r, y0, y1) => y >= y0 && y <= y1 && Math.hypot(x - cx, z - cz) <= r;
