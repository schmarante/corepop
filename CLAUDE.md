# corepop – Farb-Sortier-Puzzle mit Raumschiffen

Kommunikation mit dem User auf Deutsch.

## Idee
Das Spiel heißt **corepop** (immer klein geschrieben). Der Schriftzug nutzt die Logo-Schrift Sour Gummy
(`src/fonts/`, nur für das Logo: `components/Logo.astro`, Token `font-logo`). Das DDEV-Projekt heißt `corepop`.

Eigenes Spiel im Genre der Farb-Sortier-Puzzles, bei denen man ein Bild abbaut oder aufdeckt.
**Kein Klon:** Thema, Grafik,
Namen und Levels sind eigene Ideen. Keine Assets, Namen oder Levels aus bestehenden Spielen übernehmen.

**Thema:** Raumschiffe schießen einen rotierenden 3D-Voxel-Asteroiden aus mehreren Farbschichten ab.

## Kernmechanik (Prototyp)
- **Figur + Lolli-Kern:** Die Außenhaut stellt eine erkennbare Figur dar (Modell in `core/models/`, z. B. Asteroid mit
  Kratern; später Mond, eigene Raumschiffe/Stationen …). Darunter liegt ein bunter Kern in Schichten wie bei einem
  Lolli (`level.core`, mehrere Farben einer Schicht als Spirale). Modelle (je ein Level, Reihenfolge wie in `levels.js`): `football`, `basketball`, `heart`, `poop`
  (Häufchen, eigenes Design), `rocket`, `pirateShip` (Zwischenboss, `boss: true`, ~5000 Voxel, Comic-Schiff mit Totenkopf-Segel), `watermelon` (halb, mit Kernen), `avocado` (halb, mit Kern), `popsicle` (Eis am
  Stiel), `teddy` (Teddykopf), `chicken`, `mushroom` (Fliegenpilz), `chest` (Schatztruhe, klassisch). Gemeinsame
  Formhelfer: `models/shapes.js`. Erfahrung: Bei ~16–20 Voxeln Durchmesser funktionieren nur **markante, kontrastreiche
  Formen und Muster** – feine Details (Krater, Mondflecken) gehen unter; ein Asteroid und ein Mond wurden deshalb
  verworfen. Kernfarben dürfen nicht in der Haut vorkommen (Test).
  **Stil: Comic** – übertriebene Proportionen (bauchig, kopflastig, geschwungen), Details genau 1 Voxel breit
  (sonst überdecken sie die Grundfarbe). Prüfen per Text-Vorderansicht (Voxel mit größtem z je x/y) oder /dev/modelle/. Haut = äußerste `skin` Voxel + alles von außen
  schräg Sichtbare. **Nur eigene Designs** – keine erkennbaren fremden Marken/Designs, auch nicht verpixelt.
- Der Körper dreht sich um die Y-Achse und taumelt/schwebt dabei langsam (rein optisch). Ziehen dreht zusätzlich.
- Unten stehen mehrere Spalten mit Schiffen (Farbe + Munition). Nur das vorderste Schiff einer Spalte ist antippbar.
- Ein angetipptes Schiff fliegt in einen freien Hangar-Slot (5 Slots).
- Ein Schiff im Slot schießt automatisch nur auf Voxel seiner Farbe, die **freiliegend** sind
  (mindestens ein leerer Nachbar) und bei denen **eine freie Fläche zur Kamera oder zum Schiff zeigt**
  (Normale·Richtung > `FACING`). Geschossen wird mit **Lenkgeschossen** (Bézier-Bogen außen herum), die genau durch
  diese Fläche eintreten (`shot.normal`) – nie durch den Körper. So ist jede freie Fläche irgendwann erreichbar
  (oben/seitlich über die Kamera, unten über das Schiff) und das Spiel kann sich nicht festfahren. (Früher: gerade
  Schussbahn mit Sichtlinien-Prüfung → Soft-Lock, weil oben liegende Ziele nie erreichbar waren.)
  Dadurch spielt die Drehung eine Rolle: Ziele kommen erst zum richtigen Zeitpunkt nach vorn.
- Bei leerer Munition fliegt das Schiff weg und macht den Slot frei.
- Gewonnen: alle Voxel zerstört. Verloren: alle Slots belegt, und kein Schiff hat irgendwo ein freiliegendes Ziel seiner Farbe.
- **Riss-Kristall / Spezial-Würfel (wunder Punkt):** pulsierend leuchtender Würfel in der ersten Kernschicht (`crystals` pro Level, erste Level ohne).
  Trifft ihn ein Schiff seiner Farbe (freiliegend + zur Kamera), bricht das Bruchstück um ihn ab (`chunkRadius`) und
  fliegt davon: erst gerade raus aus einer Schutzkugel um den Körper, dann an der Kamera vorbei (Bruchstelle vorn)
  oder seitlich ins All (sonst) – nie durch andere Würfel, nie kleiner werdend, mit DOF-Unschärfe nahe der Kamera. Liegt darin ein weiterer Kristall, bricht der mit ab. Sichtbare Kristalle werden bevorzugt beschossen.
- Ist eine Farbe komplett weg, fliegen ihre Schiffe im Hangar ab und verschwinden aus der Warteschlange („+n übersprungen“) –
  sonst würde die durch Bruchstücke übrige Munition den Hangar verstopfen.
- Die Munition pro Farbe entspricht exakt der Voxelanzahl. Die Pakete werden von außen nach innen geschnitten und grob nach Schicht sortiert auf die Spalten verteilt (machbar, aber nicht garantiert lösbar).

## Technik
- **Astro 7 + Tailwind 4**, statische Seiten (`output: 'static'`), Three.js als npm-Paket. Aufbau wie `../wyrfl`.
- DDEV-Projekt `corepop`, Node nur im Container:
  - `ddev npm run dev` → Dev-Server mit HMR unter https://corepop.localhost:4321/
  - `ddev npm run build` → `dist/`, ausgeliefert unter https://corepop.localhost/
  - `ddev npm test` → Vitest (`tests/`)
- Der ursprüngliche Ein-Datei-Prototyp liegt zum Nachschlagen in `prototype/asteroid.html` (wird nicht gebaut).

## Projektstruktur (Grundregel: Logik, Darstellung und Bedienung strikt getrennt)
```
src/
  pages/              Routen (dünn: nur Layout + Komponente). Deutsch ohne Präfix, andere Sprachen unter [lang]/
  layouts/Base.astro  <head>, Spracherkennung vor dem ersten Paint, Menü-Verhalten
  components/         Astro-Markup: Home, SoloGame, LanguageMenu, Logo
  i18n/               index.js (t(), localePath(), SLUGS) + eine JSON pro Sprache
  styles/global.css   Tailwind-Import, Farb-Tokens (@theme), eigene Klassen: .logo, .candy, .ship, .press, .shake
  scripts/
    core/    REINE Spiellogik: kein three.js, kein DOM, kein Math.random() → testbar, deterministisch per Seed
             rng · colors · levels · asteroid (Voxel, Freiliegen, facing, Kristalle) · fleet (Munitions-Pakete) · game (Ablauf)
    render/  Darstellung, liest nur aus core: stage · asteroid-view · hangar-view · ship-model · effects-view (Schüsse,
             Funken, Bruchstücke) · starfield · frame-loop · easing
    ui/      DOM-Bausteine: queue · hud · dialog · toast · drag-rotate · icons
    store/   localStorage (progress: freigeschaltete Level)
    modes/   verdrahtet core + render + ui zu einem Spielmodus (solo.js; später battle.js)
tests/       Vitest: core.test.js (Logik inkl. „jedes Level ist mit unbegrenztem Hangar gewinnbar“), i18n.test.js
```
- `createGame(level, { seed })` liefert `launch(column)` und `step(dt, camera)`; beide geben **Ereignisse** zurück
  (`launch`, `fire`, `hit`, `fizzle`, `break`, `skip`, `leave`, `free`, `won`, `lost`). Der Modus reicht sie an Darstellung/UI weiter –
  im Battle-Modus später auch ans Netzwerk.
- Sichtbarkeit: Die Logik bekommt die Kameraposition im Voxel-Raster (`asteroidView.cameraInGrid(camera)`) und
  rechnet `facing()` selbst. Konstanten: `FACING` und `TIMING` in `core/game.js`.
- Voxel als `InstancedMesh`; zerstörte bekommen eine Null-Skalierung. `asteroid.grid` enthält nur lebende Voxel.
- Level in `core/levels.js` (Radius, Schichten, Slots, Spalten, Drehung, Munitionsspanne, Seed).

## Grundsätze (Priorität)
- **Nichts poppt rein oder raus.** Alles, was erscheint, verschwindet oder sich ändert, bekommt einen Übergang –
  kurz (150–300 ms) ist okay, hart nie. Beispiele: Voxel schrumpfen weg, Asteroid wächst beim Laden hinein und
  schrumpft beim Levelwechsel heraus, Hangar-Ringe/Labels blenden, Warteschlange gleitet (FLIP, `ui/queue.js`),
  Dialoge/Menüs/Toasts blenden (`@starting-style`, `allow-discrete`), Seitenwechsel per `@view-transition`,
  Canvas blenden ein (`.fade-in`), skriptabhängige Inhalte per `.reveal`. Easing-Kurven: `render/easing.js`.
  Bei `prefers-reduced-motion` Bewegung weglassen, Überblendungen dürfen bleiben.
- **Performance/Akku:** Jede Animation läuft über `render/frame-loop.js` mit fester Bildrate: Spiel `GAME_FPS` = 60,
  Hintergrund `BACKGROUND_FPS` = 30. Pixel-Ratio gedeckelt (Bühne 2, Sterne 1.5). Animationen bildratenunabhängig
  schreiben (mit `dt`, z. B. `1 - Math.exp(-rate * dt)` statt fester Faktoren pro Bild).

## Look
- 3D im Candy-Look: abgerundete, glänzende Würfel bündig ohne Fugen (`candyBox`, `candyMaterial` in
  `render/asteroid-view.js`), Umgebungslicht (RoomEnvironment) + Randlichter blau/pink, gebackene Voxel-AO
  (`render/voxel-ao.js`, Eckwerte pro Instanz, Shader-Patch). Nur von außen sichtbare Voxel werden gezeichnet.
- Hangar = Deck mit Landeplattformen (`render/hangar-view.js`), Schiff = eigenes Candy-Modell (`render/ship-model.js`).
- Kopfzeile: Zurück · Level · Candy-Fortschrittsbalken · Zahnrad → Optionen-Dialog (Sprache + „Über“ mit Credits aus
  `src/data/credits.js`). Spiel pausiert, solange die Optionen offen sind. Bedienhinweis nur bis zum ersten Start.
- Hintergrund: vollflächiger, dezenter Sternenflug (`components/Starfield.astro` → `render/starfield.js`, 2D-Canvas
  hinter allen Seiten). Die 3D-Bühne ist transparent darüber.
- Logo „corepop“: `components/Logo.astro` + `.logo` in global.css (zwei Candy-Farben, Glanz, Extrusion per drop-shadow).
- Alle Buttons im einfarbigen Candy-Look: Klasse `candy`, Farbe über `--c` (Standard Akzentblau), z. B.
  `class="candy [--c:var(--color-accent-2)]"` oder `style="--c:#ff4d5e"`. Nicht antippbar: `aria-disabled="true"`,
  `disabled` oder `.is-waiting`. Reine Icon-Buttons (Zurück, Sprache) bleiben flach.

## Schwierigkeit / Balancing
- `src/scripts/core/simulate.js`: Spiel ohne Grafik mit Bots – `random` (drückt blind) und `smart` (startet nur
  Schiffe mit freiliegenden Zielen). Geometrie wie im Spiel (Neigung, Drehung, Kamera, Hangar).
- `ddev exec node scripts/balance.mjs [level] [seeds]` → Gewinnquoten beider Bots je Level.
- Regler pro Level: `slots`, `shuffle` (0 … 1+, mischt tiefe Kernschiffe nach vorn, `core/fleet.js`), `spin`,
  `ships` (Mischung der Schiffsklassen 20/50/100/250, `SHIP_CLASSES`; dazu je Spreng-Block ein Spreng-Flieger), `skin`, `core`.
- Absicherung gegen Festfahren: `PATIENCE` in `core/game.js` – nach 2,5 s ohne Ziel nimmt ein Schiff jedes freiliegende
  Ziel **seiner Farbe** (nie fremde Farben, Test).
- **Stand 2026-11-24:** Kurve über die 13 Level eingestellt (Plätze 5 → 4 → 3, `shuffle` 0 → 1.4, mehr große Schiffe
  bis 250). Messung (6 Seeds): Zufalls-Bot gewinnt Level 1–11 noch immer, verliert erst bei Pilz (83 %) und Truhe
  (67 %); der schlaue Bot schafft alle. Wartende Schiffe kosten weiterhin nur Zeit – für mehr Druck in der Mitte
  bräuchte es eine Strafe fürs Verstopfen (z. B. Treibstoff) oder noch knappere Plätze.
- Leistung: `asteroid.targets` (freiliegende lebende Voxel je Farbe) wird laufend gepflegt – die Zielsuche geht nur
  diese durch.

## Mehrsprachigkeit
- Nie UI-Texte hart codieren. Jeder Schlüssel steht in jeder Sprachdatei (Test prüft Schlüssel + Platzhalter).
- Seiten-Slugs sind übersetzt (`SLUGS` in `src/i18n/index.js`, nur ASCII). Sprache: `?lang=` > gespeicherte Wahl
  (`corepop:lang`) > Browsersprache > Deutsch.
- Neue Sprache: JSON anlegen, in `LOCALES`, `LANGUAGES`, `SLUGS` und `astro.config.mjs` (`i18n.locales`) eintragen.
- Neue Seite: Id in `PAGES` + Slug je Sprache, deutsche Route unter `src/pages/<slug>/`, Fall in `src/pages/[lang]/[slug]/`.

## Mobile-first
- **Dev-Übersicht der Modelle:** https://corepop.localhost:4321/dev/modelle/ (Dev-Server) – alle Figuren mit 3D-Vorschau,
  Kennzahlen, Level-Zuordnung und „Schnitt“ durch den Kern. Quelle `src/dev/models.astro` + `src/scripts/dev/`,
  eingebunden per `devPages()` in `astro.config.mjs`: nur im Dev-Server und in Builds mit `PUBLIC_DEBUG=true`.
  Dev-Seiten sind bewusst nur Deutsch (Ausnahme von der i18n-Regel).
- Test-Hilfe: mit `PUBLIC_DEBUG=true` bauen (`.env`, siehe `.env.example`) → Taste **B** sprengt den nächsten Kristall.
- Testen im Browser ohne Klicken: headless Chromium per DevTools-Pipe (rAF läuft in `--virtual-time-budget` NICHT).
- Spielbildschirm ist Vollbild (`Base fullscreen`, `h-dvh`), Safe-Areas über `env(safe-area-inset-*)`.
- Die Bühne passt sich per ResizeObserver an ihren Container an; der Kameraabstand richtet sich nach der Breite.

## Multiplayer (geplant, noch nicht gebaut)
- Battle mit bis zu 4 Spielern, Verbindung per QR-Code wie in `../wyrfl` (`src/scripts/duel/rtc.js`: WebRTC ohne
  Server, Sternnetz über den Host; `src/scripts/ui/qr.js`: qrcode-generator + qr-scanner). Übernehmen nach
  `src/scripts/net/`, Modus in `src/scripts/modes/battle.js`.
- Grundlage ist schon da: gleicher Level + Seed → identisches Spiel auf allen Geräten; Fortschritt über die Ereignisse
  (`hit`, `won`, `lost`) an die anderen senden.

## Offene Punkte / nächste Schritte (Stand 2026-11-24)
- **Balancing:** In der Mitte (ca. Level 4–11) gewinnt blindes Drücken noch. Entscheidung offen: früher nur 3 Plätze
  und/oder „Treibstoff“ (Schiff ohne Ziel verliert Treibstoff, leer → Absturz/verloren). Messen mit `scripts/balance.mjs`.
- **Auf echtem Handy prüfen:** Leistung (60 fps Spiel / 30 fps Sterne), Bruchstück-Flug an der Kamera vorbei mit DOF.
- Teddy: Augen wirkten in der Übersicht etwas tief – prüfen.
- Noch nicht gebaut: Battle-Modus (QR, bis 4 Spieler), PWA/Offline, weitere Sprachen.

## Ideen für später
- Schilde, die eine Farbschicht schützen, bis ein Generator-Voxel zerstört ist
- Kettenexplosionen, Bossplaneten, mehrere Asteroiden gleichzeitig
- Booster (z. B. „Slot +1“, Drehung pausieren, Bombe)
- Level-Editor bzw. Formen aus Modellen (Planeten, Raumstationen, Figuren) statt nur Kugeln
- Echte Lösbarkeitsprüfung (Solver) für generierte Level
- Sound, Juice (Screenshake, Trefferblitz), Mobile-Optimierung bzw. PWA

## Alternative Themen für dasselbe Prinzip (Brainstorm)
Ameisenbären saugen farbige Ameisen ein (Magengröße als Limit, Schluckauf bei falscher Farbe) ·
Bienen und Blumenwiese · Möwen klauen Pommes nach Soße · Taucher am Korallenriff (Strömung, Sauerstoff) ·
Magnetkräne auf einem Schrottplatz (Kettenreaktionen) · Hirtenhunde und Schafe · Geisterjäger im Spukhaus ·
Zauberlehrlinge und ein Buntglasfenster · Wäsche sortieren (eine rote Socke färbt alles um)
