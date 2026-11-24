// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Dev-Seiten (src/dev/): nur im Dev-Server und in Builds mit PUBLIC_DEBUG=true – nie auf der veröffentlichten Seite.
//   /dev/modelle/  alle Figuren auf einen Blick (3D-Vorschau, Kennzahlen, Schnitt durch den Kern)
//   /dev/musik/    Musikstücke vorhören (gerendert wie im Spiel, Renderzeit, Spitzenpegel)
function devPages() {
  return {
    name: 'corepop-dev-pages',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev' && process.env.PUBLIC_DEBUG !== 'true') return;
        injectRoute({ pattern: '/dev/modelle', entrypoint: './src/dev/models.astro' });
        injectRoute({ pattern: '/dev/musik', entrypoint: './src/dev/music.astro' });
      },
    },
  };
}

// DDEV setzt IS_DDEV_PROJECT im web-Container: Der Dev-Server läuft hinter dem DDEV-Router
// (https://corepop.localhost:4321/), HMR muss deshalb per wss über diesen Port verbinden.
const inDdev = process.env.IS_DDEV_PROJECT === 'true';

export default defineConfig({
  output: 'static',
  integrations: [devPages()],
  outDir: './dist',
  base: process.env.BASE_PATH || '/',
  ...(process.env.SITE_URL ? { site: process.env.SITE_URL } : {}),
  // Sprachen: Liste und Slugs stehen in src/i18n/index.js – hier nur die Codes
  i18n: {
    locales: ['de', 'en'],
    defaultLocale: 'de',
    routing: { prefixDefaultLocale: false },
  },
  server: { host: '0.0.0.0', port: 4321, allowedHosts: true },
  vite: {
    plugins: [tailwindcss()],
    server: inDdev ? { hmr: { protocol: 'wss', clientPort: 4321 } } : {},
    // three.js allein ist ~700 kB – die Warnung ab 500 kB wäre Dauerrauschen
    build: { chunkSizeWarningLimit: 900 },
  },
});
