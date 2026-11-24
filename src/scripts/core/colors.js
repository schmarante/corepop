// Spielfarben. Die Ids (ein Buchstabe) stehen in den Level-Definitionen und Modellen; die Namen kommen aus i18n
// (colors.<id>). Bunte Farben für den Kern, gedeckte für die Außenhaut der Figuren.
export const COLORS = {
  // Außenhaut
  w: 0xd9dbe9,   // Silber/Weiß (Fußball, Helm, Rakete)
  n: 0x2b2d4a,   // Schwarz (Fußball, Basketball-Nähte, Visier) – leicht blau, passt zum Candy-Look
  h: 0xff9ccb,   // Rosa (Herz-Glanzlicht, Eis)
  e: 0x2f9a57,   // Dunkelgrün (Melonen-, Avocadoschale)
  l: 0xc9e47a,   // Hellgrün (Avocado-Fruchtfleisch, Melonenstreifen)
  u: 0x8f5b3d,   // Braun (Teddy, Avocadokern, Schokolade)
  c: 0xf3d6a2,   // Creme (Teddyschnauze, Eisstiel, Pilz-Unterseite)
  k: 0x474c72,   // Graphit (Panzer, Maske)
  z: 0x9aa1c4,   // Stahlgrau (Panzer, Maske)
  // Spezial
  x: 0xff2bd6,   // Spreng-Magenta: Spreng-Blöcke und Spreng-Flieger (core/asteroid.js BLAST)
  // Kern
  r: 0xff4d5e,
  o: 0xffa630,
  y: 0xffe14d,
  g: 0x4ddb7a,
  b: 0x4da6ff,
  p: 0xb36bff,
};

/** '#rrggbb' für CSS */
export const cssColor = id => `#${COLORS[id].toString(16).padStart(6, '0')}`;
