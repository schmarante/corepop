// Alles, was corepop an fremden Bibliotheken und Schriften nutzt – einzige Quelle für „Über corepop“ im
// Optionen-Dialog. Zweck-Texte: about.libs.<id> in src/i18n/*.json.
// Neue Abhängigkeit → hier eintragen (mit Lizenz) und den Zweck in allen Sprachen ergänzen.

// Autor (Optionen-Dialog → „Über corepop“)
export const ABOUT = {
  author: 'Marco Schrenk',
  email: 'mail@marco-schrenk.de',
};

export const RUNTIME = [
  { id: 'three', name: 'three.js', url: 'https://threejs.org', license: 'MIT' },
];

export const ASSETS = [
  { id: 'sour-gummy', name: 'Sour Gummy', url: 'https://fonts.google.com/specimen/Sour+Gummy', license: 'OFL-1.1' },
];

export const BUILD = [
  { id: 'astro', name: 'Astro', url: 'https://astro.build', license: 'MIT' },
  { id: 'tailwindcss', name: 'Tailwind CSS', url: 'https://tailwindcss.com', license: 'MIT' },
  { id: 'vitest', name: 'Vitest', url: 'https://vitest.dev', license: 'MIT' },
];
