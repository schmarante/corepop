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
  Lolli (`level.core`, mehrere Farben einer Schicht als Spirale). 18 Level, **Bosse auf 5, 10 und 15** (`boss: true`, ~10 000 Voxel), Reihenfolge wie in `levels.js`:
  1 `football`, 2 `heart`, 3 `basketball`, 4 `poop` (Häufchen, eigenes Design), **5 `pirateShip`** (Radius 26, ~10 900
  Voxel, Comic-Schiff mit Totenkopf-Segel, Kanonenrohren, Reling, Steuerrad, Hecklaterne, Wimpel, Anker), 6 `rocket`,
  7 `watermelon` (halb, mit Kernen), 8 `cherries` (Kirschpaar), 9 `avocado` (halb, mit Kern), **10 `tank`** (Comic-
  Panzer, eigenes Design), 11 `popsicle` (Eis am Stiel), 12 `panda` (Kopf), 13 `teddy` (Teddykopf), 14 `eyes`
  (Kulleraugen, schauen zur Seite – eigenes Design, kein Hersteller-Emoji; ersetzt ein Lachgesicht), **15 `mask`** (eigene Low-Poly-Maske, facettiert;
  die Augen sind Spreng-Kristalle an festen Stellen, `model.crystals` – bewusst nicht die Squid-Game-Masken), 16
  `chicken`, 17 `mushroom` (Fliegenpilz), 18 `chest` (Schatztruhe). Gemeinsame
  Formhelfer: `models/shapes.js`. Erfahrung: Bei ~16–20 Voxeln Durchmesser funktionieren nur **markante, kontrastreiche
  Formen und Muster** – feine Details (Krater, Mondflecken) gehen unter; ein Asteroid und ein Mond wurden deshalb
  verworfen. Kernfarben dürfen nicht in der Haut vorkommen (Test).
  **Stil: Comic** – übertriebene Proportionen (bauchig, kopflastig, geschwungen), Details genau 1 Voxel breit
  (sonst überdecken sie die Grundfarbe). Prüfen per Text-Vorderansicht (Voxel mit größtem z je x/y) oder /dev/modelle/. Haut = äußerste `skin` Voxel + alles von außen
  schräg Sichtbare. **Nur eigene Designs** – keine erkennbaren fremden Marken/Designs, auch nicht verpixelt.
- Der Körper dreht sich um die Y-Achse und taumelt/schwebt dabei langsam (rein optisch). Je weniger Würfel übrig sind,
  desto langsamer dreht er (`game.spin`, bis `SPIN_MIN` = 35 % – er „verliert Masse“; Spiel und Bots gleich). Ziehen dreht zusätzlich; beim Loslassen dreht er mit dem Schwung weiter und läuft weich aus
  (`ui/drag-rotate.js` misst die Wischgeschwindigkeit → `asteroid.fling`, Reibung `FLING_FRICTION`; Anfassen hält an).
- **Förderband (seit 2026-11-24, ersetzt „Spalte = Plattform + Wischen“):** Unter dem Deck läuft ein Band mit
  `BELT_LENGTH` (8) sichtbaren Plätzen nach links (`level.belt` Plätze/s, `DEFAULT_BELT_SPEED`; `core/game.js` →
  `belt`, `queue` = Luke). Neue Flieger kommen rechts aus der Luke, je ein Platz Abstand; nimmt man einen heraus,
  bleibt die Lücke. **Jeder Flieger auf dem Band ist antippbar** und fliegt auf **irgendeine freie Plattform**
  (bevorzugt die darüber; keine frei → wackelt). Was links ankommt, **fällt herunter und ist weg** (`drop`): Dafür hat
  jede Farbe Reserve-Munition (`level.reserve`, Standard 25 %, `DEFAULT_RESERVE` in `core/fleet.js`; Farben unter 50
  Voxeln bekommen zwei gleiche Schiffe). Fällt ein Flieger, ohne den seine Farbe nicht mehr reicht (`game.essential`
  – bewusst **ohne Warnung** auf dem Band, sonst wüsste man, was man als Nächstes drückt), ist das Spiel **verloren** (`lost`, reason `ammo`: „Vom Band gefallen!“). Ein
  heruntergefallener **Spreng-Flieger** entschärft einen Kristall (wird normaler Block seiner Schichtfarbe,
  `baseColor`, Munition +1 beim hintersten Schiff dieser Farbe, sonst zerfällt er).
  Darstellung `render/belt-view.js` (Band mit laufenden Streifen, Rollen, Luke mit „+n“; Flieger liegen klein in
  Parkstellung, wachsen aus der Luke, stürzen am Ende taumelnd ab, heben beim Start ab und richten sich auf; Flieger
  fertiger Farben grau), Bedienung `ui/belt-input.js` (Antippen, Tasten 1–9);
  über dem Band dreht Wischen die Figur.
  Verworfen nach Spieltest: **Spalte = Plattform + vorderste Reihe wischen** – zu umständlich (erst schieben, dann
  starten), mittlere Spalten hingen fest, Wischen wirkte wie Strafe, schwer lesbar. Davor: Parkdeck (UI-Reihe zu viel).
- Schiffsklassen 50/100/250 (`SHIP_CLASSES`, `MIN_AMMO` = 50 in `core/fleet.js`): Kleinere lohnen nicht, ein Rest
  unter 50 fliegt im vorigen Schiff derselben Farbe mit (nur Farben mit < 50 Blöcken insgesamt ergeben ein kleineres).
- Ein Schiff im Slot schießt automatisch nur auf Voxel seiner Farbe, die **ganz außen** liegen: vor einer freien Fläche
  liegt in gerader Linie nichts mehr bis nach draußen (`clearRay` in `core/asteroid.js` – 3D-Gegenstück zu „erster Pixel
  einer Reihe“). Wände eines Lochs zählen nicht → man trägt Schicht für Schicht ab, statt dass Tunnel alle Farben
  freilegen. Festfahren geometrisch ausgeschlossen: der äußerste Voxel je Achsenrichtung ist immer treffbar.
  Geschossen wird mit **Lenkgeschossen** (Bézier-Bogen außen herum), die genau durch diese Fläche eintreten
  (`shot.normal`). Flächen, die zur Kamera oder zum Schiff zeigen (`FACING`), kommen zuerst dran – die Drehung bestimmt
  die Reihenfolge, nicht ob getroffen wird. (Früher: nur Flächen zur Kamera + `PATIENCE`-Notlösung; davor gerade
  Schussbahn → Soft-Lock.)
- **Hangar = Engpass (Knobel-Kern, seit 2026-11-24):** Ein Schiff bleibt auf seiner Plattform, bis die Munition leer
  ist. Findet es kein Ziel ganz außen, steht es **blockiert** da (ab `BLOCKED_AFTER` = 0,6 s: kippt zur Seite, Triebwerk
  aus, rote Zahl, roter Ring – `render/hangar-view.js`) und belegt die Plattform, bis seine Farbe außen auftaucht.
  Alle Plattformen blockiert → verloren. Entscheidung beim Antippen: *Liegt von dieser Farbe gerade genug ganz außen?*
  (Vorher wurden Farben durch Tunnel sofort überall erreichbar – blindes Drücken gewann fast immer.)
  Verworfene Alternativen: **Parkdeck** (Schiff kehrt mit Restmunition in eine eigene Reihe zurück, voll = verloren –
  trennte Können/Zufall etwas schärfer, aber die zusätzliche UI-Reihe störte); **Rückkehr vorn in die Spalte** (ein
  Fehlgriff kostet dann gar nichts).
- **Riss-Kristall / Spezial-Würfel (wunder Punkt):** pulsierend leuchtender Würfel in einer **inneren Kernschicht**
  (ab Schicht 2, `crystals` pro Level) – das Bruchstück sprengt dann nach innen in den Kern. Solange er vergraben ist
  und zur Kamera zeigt, blinkt ein pinker Leuchtfleck durch die Hülle (man entdeckt ihn früh und hält den Bomber).
  Trifft ihn der Spreng-Flieger (ganz außen), explodiert er wie ein Sprengsatz (`blastReach` in `core/asteroid.js`):
  Energie am Voxel = Sprengkraft (`blastPower`, 4 + 0,15·Radius) − 0,5 je Voxel Abstand − 1 je Würfel in gerader Linie
  dazwischen; bleibt etwas übrig, fliegt er weg – auch die Hülle, wenn wenige Würfel dazwischen liegen, durch freie
  Schächte trägt die Druckwelle weit. Restenergie = Bewegungsenergie, Masse wächst mit der Tiefe (innen schwer, träge):
  Tempo √(2E/m). Jeder Würfel fliegt **einzeln** davon (`effects-view.js` → `shatter`, ein InstancedMesh je Explosion),
  vom Sprengpunkt weg, mit eigenem Taumeln. Stoßen sie an stehende Würfel, prallen sie an der getroffenen Fläche ab
  (`asteroid-view.collide`, Raster-Test der Vorderkante; Energieverlust `BOUNCE`, Reibung) – nie durch die Figur. Dreht
  sich die Figur in einen Würfel hinein (Eigendrehung, Taumeln, Wischen), wird er herausgeschoben (`penetration`) und
  wird träge mitgenommen (`surfaceVelocity`, Lage des Rasters jetzt/Bild davor; nur ein Teil der Bewegung geht
  über – schwere Würfel weniger –, kaum Rückprall, höchstens `PUSH_MAX`): Wischen schüttelt und schiebt, statt alles
  wegzuschleudern. Untereinander stoßen die Würfel als Kugeln (Raster-Hash je Bild, Impuls nach Masse, kaum
  elastisch); steckt ein Würfel tief in der Figur, wird er ins nächste freie Nachbarfeld geschoben. Ins All hinaus werden sie dunkler bis schwarz:
  seitlich ab 1,2 … 2,8 Körperradien (`SHATTER_DARK`), nach hinten (hinter die Figur, weg von der Kamera) ab 0,4 … 2
  (`SHATTER_BEHIND`) – wer zur Kamera fliegt, bleibt hell. Shader der Explosion werden beim Laden vorkompiliert
  (`effects.warmUp` + `stage.warmUp`), sonst hakte die erste Explosion. **Tiefenschärfe/DOF verworfen** (gefakt mit
  Kopien + Bokeh-Scheiben je Würfel; BokehPass übers Tiefenbild; Unschärfe-Maske nur für Würfel) – sah nicht gut aus
  bzw. machte die Figur unscharf; der User will sie nicht.
- **Treffer-Licht:** Jeder Treffer lässt einen kleinen Lichtpunkt in der Blockfarbe aufblitzen, der die Figur an der
  Stelle beleuchtet (`effects-view.js` → `flash`: 3 feste Punktlichter reihum – Lichter hinzufügen/entfernen würde die
  Shader neu übersetzen –, dazu ein Glanzpunkt). Dazu Blitz, Druckwelle, Funken. Erreicht die
  Druckwelle einen weiteren Kristall, geht der mit hoch. (Früher: fester Kugel-Brocken, der als Ganzes wegflog.) Sichtbare Kristalle werden bevorzugt beschossen.
- **Ist eine Farbe fertig, bleiben ihre übrigen Schiffe auf dem Band (Falle, Wunsch des Users):** grau dargestellt,
  gestartet finden sie nie ein Ziel und blockieren ihre Plattform für immer (`doomed` im Slot) – man lässt sie
  herunterfallen (kostet nichts). Wer schon auf der Plattform steht, wenn seine Farbe fertig wird, fliegt ab.
- Die Munition pro Farbe = Voxelanzahl + Reserve (siehe oben). Die Pakete werden von außen nach innen geschnitten und grob nach Schicht sortiert in die Band-Reihenfolge gebracht (machbar, aber nicht garantiert lösbar).

## Technik
- **Astro 7 + Tailwind 4**, statische Seiten (`output: 'static'`), Three.js als npm-Paket. Aufbau wie `../wyrfl`.
- DDEV-Projekt `corepop`, Node nur im Container, Paketverwaltung **nur Yarn** (`yarn.lock`, keine package-lock.json):
  - `ddev yarn dev` → Dev-Server mit HMR unter https://corepop.localhost:4321/
  - `ddev yarn build` → `dist/`, ausgeliefert unter https://corepop.localhost/
  - `ddev yarn test` → Vitest (`tests/`)
- **Branches:** gearbeitet wird auf `develop` (Standard-Branch); veröffentlicht wird, indem `develop` nach `master`
  gebracht und gepusht wird.
- **GitHub Actions** (`.github/workflows/static.yml`, wie in ../wyrfl): jeder Push auf `master` → `yarn install --frozen-lockfile`, `yarn test`,
  Build mit Basispfad `/corepop/` → GitHub Pages (https://schmarante.github.io/corepop/). Einmalig: Settings → Pages →
  Source „GitHub Actions“. Repository-Variablen: `SITE_URL` (eigene Domain), `PUBLIC_DEBUG=true` (Test-Tasten).
- Der ursprüngliche Ein-Datei-Prototyp liegt zum Nachschlagen in `prototype/asteroid.html` (wird nicht gebaut).

## Projektstruktur (Grundregel: Logik, Darstellung und Bedienung strikt getrennt)
```
src/
  pages/              Routen (dünn: nur Layout + Komponente). Deutsch ohne Präfix, andere Sprachen unter [lang]/
  layouts/Base.astro  <head>, Spracherkennung vor dem ersten Paint, Menü-Verhalten
  components/         Astro-Markup: Home, SoloGame, LanguageMenu, Logo
  i18n/               index.js (t(), localePath(), SLUGS) + eine JSON pro Sprache
  styles/global.css   Tailwind-Import, Farb-Tokens (@theme), eigene Klassen: .logo, .candy, .press, .icon-button
  scripts/
    core/    REINE Spiellogik: kein three.js, kein DOM, kein Math.random() → testbar, deterministisch per Seed
             rng · colors · levels · asteroid (Voxel, Freiliegen, facing, Kristalle) · fleet (Munitions-Pakete) · game (Ablauf)
    render/  Darstellung, liest nur aus core: stage (Layout-Stapel Körper/Deck/Schlange) · asteroid-view · hangar-view ·
             belt-view (3D-Förderband, gibt Modelle beim Start an den Hangar) · ship-model · effects-view (Schüsse,
             Funken, Bruchstücke) · starfield · frame-loop · easing
    ui/      Bedienung/DOM: belt-input (Antippen auf dem Band) · drag-rotate · hud · dialog · toast · hint · icons
    store/   localStorage – Fortschritt verwürfelt + signiert wie in ../wyrfl (secure.js: `c1.<nonce>.<mac>.<data>`, an den
             Speicherschlüssel gebunden; Klartext/geänderte/kopierte Werte werden ignoriert – Schummelschutz gegen die
             Entwicklerwerkzeuge, keine echte Sicherheit). progress.js: `corepop:v1` = { unlocked }. Neue Fortschritts-
             Daten immer darüber. Sprache und Bedienhinweis bleiben Klartext.
    audio/   Klang (Tone.js, MIT): sound.js (getSound(): lädt Tone.js im Leerlauf, startet bei der ersten Geste, Busse
             Musik/Effekte, Tab im Hintergrund → pausiert) · sfx.js (Effekte je Ereignis, alles synthetisch) ·
             music.js (Sequenzer + Stücke `SONGS`: menu/game/boss, eigene Kompositionen)
    modes/   verdrahtet core + render + ui zu einem Spielmodus (solo.js; später battle.js)
tests/       Vitest: core.test.js (Logik inkl. „jedes Level ist mit unbegrenztem Hangar gewinnbar“), i18n.test.js
```
- `createGame(level, { seed })` liefert `launch(shipId, prefer)` und `step(dt, camera)`; alle geben **Ereignisse**
  zurück (`launch`, `drop`, `defuse`, `blocked`, `fire`, `hit`, `fizzle`, `break`, `leave`, `free`, `recall`, `won`, `lost`). Der Modus reicht sie an Darstellung/UI weiter –
  im Battle-Modus später auch ans Netzwerk.
- Sichtbarkeit: Die Logik bekommt die Kameraposition im Voxel-Raster (`asteroidView.cameraInGrid(camera)`) und
  rechnet die Ausrichtung selbst. Konstanten: `FACING`, `BLOCKED_AFTER` und `TIMING` in `core/game.js`.
- Voxel als `InstancedMesh`; zerstörte bekommen eine Null-Skalierung. `asteroid.grid` enthält nur lebende Voxel.
- Level in `core/levels.js` (Radius, Schichten, Slots = Spalten, Drehung, Schiffsklassen, Kristalle, Seed).

## Grundsätze (Priorität)
- **Nichts poppt rein oder raus.** Alles, was erscheint, verschwindet oder sich ändert, bekommt einen Übergang –
  kurz (150–300 ms) ist okay, hart nie. Beispiele: Voxel schrumpfen weg, Asteroid wächst beim Laden hinein und
  schrumpft beim Levelwechsel heraus, Hangar-Ringe/Labels blenden, Flieger fahren aufs Band und stürzen ab (`render/belt-view.js`),
  Dialoge/Menüs/Toasts blenden (`@starting-style`, `allow-discrete`), Seitenwechsel per View Transition (ClientRouter),
  Canvas blenden ein (`.fade-in`), skriptabhängige Inhalte per `.reveal`. Easing-Kurven: `render/easing.js`.
  Förderband (3D): Flieger wachsen aus der Luke, fahren gleichmäßig, stürzen am Ende taumelnd ab.
  Bei `prefers-reduced-motion` Bewegung weglassen, Überblendungen dürfen bleiben.
- **Performance/Akku:** Jede Animation läuft über `render/frame-loop.js` mit fester Bildrate: Spiel `GAME_FPS` = 60,
  Hintergrund `BACKGROUND_FPS` = 30. Pixel-Ratio gedeckelt (Bühne 2, Sterne 1.5). Animationen bildratenunabhängig
  schreiben (mit `dt`, z. B. `1 - Math.exp(-rate * dt)` statt fester Faktoren pro Bild).
- **Automatische Grafik-Stufe** (`render/quality.js`, gemerkt in `store/quality.js`, nur im Spiel: `createStage({ adaptive })`):
  Erreicht das Spiel zwei Messfenster (je 2 s) lang keine 80 % der möglichen Bildrate, geht es eine Stufe herunter:
  1 Schatten aus · 2 Pixel-Ratio 1,5 + Würfel mit 108 statt 300 Dreiecken (`candyBox`, ab dem nächsten Level) ·
  3 Pixel-Ratio 1. **Standard ist Stufe 3** (`DEFAULT_TIER`, Wunsch des Users) – die Automatik greift erst, wenn er
  höher gesetzt wird. „Möglich“ berücksichtigt das Display (90 Hz → 45 fps, Energiesparmodus 30 Hz → 30 fps; Display-Rate
  = kürzester rAF-Abstand, höchstens 33 ms). Zum Testen `?quality=0…3` (fest, ohne Automatik).
  Hintergrund: Boss-Level zeichnen ~4 500 Würfel = 1,4 Mio. Dreiecke, mit Schattendurchlauf fast 3 Mio. pro Bild.
  Ohne Sonnenschatten fallen die blau/pinken Randlichter an Seitenflächen stärker auf (bewusst in Kauf genommen).

## Look
- 3D im Candy-Look: abgerundete, glänzende Würfel bündig ohne Fugen (`candyBox`, `candyMaterial` in
  `render/asteroid-view.js`), Umgebungslicht (RoomEnvironment) + Randlichter blau/pink, gebackene Voxel-AO
  (`render/voxel-ao.js`, Eckwerte pro Instanz, Shader-Patch) plus **Himmelslicht** (`aoSky`: Strahlen in 26 Richtungen
  bis `4 + 0,25·Radius` Voxel – Krater-Inneres dunkel, wird beim Aufräumen heller; nach Treffern begrenzt je Bild
  nachgerechnet und weich übergeblendet) und **Sonnenschatten** auf der Figur und den Explosionswürfeln (die
  werfen und empfangen ihn; Shadow-Map 1024, PCF-weich, `stage.aimShadow` folgt der Figur; Flieger/Deck ohne). Nur von außen sichtbare Voxel werden gezeichnet.
- Hangar = Deck mit Landeplattformen (`render/hangar-view.js`), Schiff = eigenes Candy-Modell (`render/ship-model.js`;
  Teile sind unsichtbare Platzhalter, gezeichnet wird je Geometrie + Materialart ein InstancedMesh für alle Flieger –
  Farbe/Abdunkeln über die Instanzfarbe, neue Teile brauchen nichts extra),
  darunter das Förderband mit denselben Modellen (Zahl auf dem Rumpf; auf der Plattform wandert sie in die Blase).
- Logo hüpft alle 3,6 s wie Gummi (ducken, strecken, platt landen; „pop“ etwas später) – `@keyframes logo-bounce` am
  Wort (`.logo-word`). Das „o“ in „pop“ ist der Spreng-Kristall in WebGL (`render/logo-gem.js`: Candy-Würfel, leicht
  durchscheinend, Klarlack, pulsiert, dreht sich), wächst nach dem Laden heraus und schiebt die „p“ auseinander, ragt
  etwas über sie; ein unsichtbares „o“ darin sorgt fürs Kopieren als „corepop“. Ohne WebGL: CSS-Quadrat.
- Kopfzeile: Zurück · Level · Candy-Fortschrittsbalken · Zahnrad → Optionen-Dialog (Sprache + „Über“ mit Credits aus
  `src/data/credits.js`). Spiel pausiert, solange die Optionen offen sind. Bedienhinweis nur bis zum ersten Start.
- Hintergrund: vollflächiger, dezenter Sternenflug (`components/Starfield.astro` → `render/starfield.js`, 2D-Canvas
  hinter allen Seiten). Die 3D-Bühne ist transparent darüber.
- **Boss-Level:** `solo.js` setzt `<html data-boss="1">` → Sternenflug blendet Plasma-Nebel (Magenta/Violett/Türkis)
  ein, Sterne glühen farbig mit Leuchtspur und fliegen schneller. Die Figur glitcht alle 3,5–8 s für 0,22 s
  (`GLITCH_*` in `asteroid-view.js`, Option `glitch`): springt ruckartig seitlich, zwei additive Farbgeister
  (teilen `instanceMatrix` der Figur) flackern versetzt auf. Bei reduzierter Bewegung kein Glitch.
- Logo „corepop“: `components/Logo.astro` + `.logo` in global.css (zwei Candy-Farben, Glanz, Extrusion per drop-shadow).
- Alle Buttons im einfarbigen Candy-Look: Klasse `candy`, Farbe über `--c` (Standard Akzentblau), z. B.
  `class="candy [--c:var(--color-accent-2)]"` oder `style="--c:#ff4d5e"`. Nicht antippbar: `aria-disabled="true"`,
  `disabled` oder `.is-waiting`. Reine Icon-Buttons (Zurück, Sprache) bleiben flach.

## Ton (seit 2026-11-24)
- **Tone.js** (MIT; Strudel verworfen wegen AGPL). Keine Sound-Dateien – alles live synthetisiert. Eigener Chunk,
  gleich nach dem Laden geholt und aufgebaut: spielt sofort, wenn der Browser Autoplay erlaubt, sonst ab der ersten
  Berührung/Taste (echtes Autoplay ohne Geste blockieren alle Browser).
- **Seitenwechsel ohne Neuladen** (Astro `<ClientRouter />` in `Base.astro`), damit die Musik durchläuft: Sternenflug
  `transition:persist`, Komponenten-Skripte starten bei `astro:page-load` und räumen bei `astro:before-swap` auf
  (`startSolo` und `startLogoGem` geben eine Aufräum-Funktion zurück – WebGL-Kontexte nicht stapeln).
- **Musik** (Blech-Synth, Pulswelle, Slap-Bass, Streicher, Echo), eigene Melodien: `menu` (Startseite, getragen wie ein Abspann, 84 bpm), `game` (treibend, 124 bpm), `boss`
  (Endkampf in d-Moll, 108 bpm, vier Teile: Galopp-Bass + Pauken + tiefe Blech-Schläge → Blech-Thema → Es-Dur-Akkord
  als Schauder → Höhepunkt mit vollem Schlagzeug, Thema hoch und tief, Becken). Notenschrift in `music.js` („D5:4 r:2 | …“, Längen in
  16teln, jeder Takt = 16 – Test `tests/music.test.js`). Stückwechsel blenden.
  **Musik wird vorab offline gerendert** (`renderSong`: `Tone.Offline`, 32 kHz, Nachhall vorn eingemischt → nahtlose
  Schleife) und als `Tone.Player`-Schleife gespielt; danach die übrigen Stücke nacheinander im Hintergrund. Grund: live
  kostete die Musik ~25 % eines Desktop-Kerns (vor allem JS je Note) – auf einem Galaxy S20 FE rauschte der Ton neben
  WebGL, und bei Schüssen fiel er ganz aus. Gemessen per Offline-Render in headless Chromium (DevTools-Pipe).
  Live bleiben nur die Effekte. Handys (`pointer: coarse`): `latencyHint: 'balanced'`.
- **Effekte** (`sfx.js`): Laser (Pulswellen-„Pju“, gedrosselt), Treffer-Plopp mit Tonhöhe je Blockfarbe (pentatonisch),
  Explosion (Rauschen + Bass, Supernova größer), Start (Wusch; Spreng-Flieger mit Warn-Piepsen), Abflug, Absturz vom
  Band (Rutschpfeife), blockiert („oh-oh“, Ereignis `blocked`), „geht nicht“, Entschärfen, Specials, Sterne im
  Sieg-Dialog (`dialog.show({ onStar })`), Sieg-Fanfare, verloren.
- Optionen: Schalter Musik / Effekte (`store/sound.js`, `corepop:sound`, Klartext).

## Freispielen (seit 2026-11-24)
- **Sterne pro Level** (`game.stars()`, `game.stats`): ★ geschafft · ★★ höchstens `STAR_TWO` (4) Fehlstarts ·
  ★★★ höchstens `STAR_THREE` (1) Fehlstart und kein Spreng-Flieger heruntergefallen. Fehlstart = gestarteter Flieger,
  der mit Munition blockiert stehen blieb (`stats.misfires`). Bestwert je Level gespeichert,
  im Sieg-Dialog (leuchten nacheinander auf) und auf den Level-Knöpfen der Startseite.
- **Specials** (je Levelversuch einmal, `game.special(id, …)`; Leiste rechts unter der Kopfzeile, `ui/specials.js`),
  freigeschaltet nach Level (`SPECIALS` in `store/progress.js`): **Plattform +1** ab L3 (schwebende Zusatz-Plattform
  rechts oberhalb des Decks – eine Plattform mehr), **Farbwechsel** ab L5 (Knopf, dann
  Flieger auf dem Band antippen: bis zu 60 äußerste Blöcke anderer Farben bekommen seine Farbe, er die Schüsse dazu), **Supernova**
  ab L7 (Riesen-Explosion am vordersten Punkt, `blastPower` × 1,9), **Zurückziehen** ab L8 (Knopf, dann Flieger auf
  dem Deck antippen – `hangar-view.pick`: er fliegt zur Luke und kommt mit Restmunition als Nächstes wieder aufs Band,
  `queue.unshift`; Schüsse in der Luft fliegen weiter, `shooter` in `core/game.js`).
- **Flieger-Designs** (`render/ship-model.js`, Option `design`): classic, paper (6 ★), gummy (14 ★), rocket (24 ★),
  ufo (34 ★) – `DESIGNS` in `store/progress.js`, Auswahl im Optionen-Dialog (gilt ab dem nächsten Level).
- Spielstand: `corepop:v1` = { unlocked, stars, design }, verwürfelt + signiert (`store/secure.js`).

## Schwierigkeit / Balancing
- `src/scripts/core/simulate.js`: Spiel ohne Grafik mit Bots – `random` (tippt blind) und `smart` (siehe Stand unten).
  Geometrie wie im Spiel.
- `ddev exec node scripts/balance.mjs [level] [seeds]` → Gewinnquoten beider Bots je Level (0 = alle; Standard 8 Seeds).
- Regler pro Level: **`slots`** (wichtigster Hebel: 5 → 4 → 3), `shuffle` (0 … 1.8, mischt tiefe Kernschiffe nach
  vorn, `core/fleet.js`), `spin`, `ships` (Mischung der Schiffsklassen 50/100/250, `SHIP_CLASSES`; dazu je
  Spreng-Block ein Spreng-Flieger), `skin`, `core`. 2 Plattformen waren selbst für den schlauen Bot meist unlösbar.
- **Stand 2026-11-24 (Förderband, 24 Seeds, Reserve 0,25):** schlauer Bot 96–100 % auf allen Leveln, Zufall 79 % (L1)
  → 38–46 % (L2–5) → 13–33 % (L7–13), Boss 4 %. Ein Schiff ist bei Tempo 0,25 ca. 32 s auf dem Band. Levelzeit ≈
  Schiffszahl ÷ Tempo (Lücken schließen sich nicht; Boss ~280 s) – Idee: Band beschleunigen, wenn es fast leer ist.
  250er-Schiffe nur noch in L2 und beim Boss (feuern lange, in kleinen Farben sofort unverzichtbar). Regler pro Level
  jetzt auch `belt` (Tempo). Bots (`simulate.js`): `random` tippt blind, `smart` rettet unverzichtbare Schiffe kurz vor
  dem Bandende, startet sonst das nützlichste, hält dafür eine Plattform frei, startet nie Schiffe fertiger Farben.
- Kernschichten: gleichmäßig über die Tiefe, innere wachsen aber nach außen, bis jede Farbe ≥ 50 Voxel hat
  (`MIN_LAYER` in `core/asteroid.js`) – sonst hatten schmale Figuren innen 1–30 Voxel (Mini-Schiffe).
- Leistung: `asteroid.targets` (freiliegende lebende Voxel je Farbe) wird laufend gepflegt – die Zielsuche geht nur
  diese durch.

## Teilen-Vorschau (SEO)
- `layouts/Base.astro`: `canonical`, Open Graph (`og:*` inkl. `og:locale` + Alternativen aus `meta.ogLocale`) und
  Twitter-Card (`summary_large_image`). Absolute Adressen über `SITE_URL` (GitHub Actions setzt sie; lokal relativ).
- Vorschaubild `public/og-image.jpg` (1200 × 630): Logo mit Kristall, Slogan, Explosion am Herz – Bildtext in
  `meta.imageAlt`. Neu erzeugen: HTML-Seite im Headless-Browser fotografieren (Schrift Sour Gummy), kein englischer
  Spieltext im Bild.

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
- **Dev-Profiler** (`src/scripts/dev/profiler.js`, nur Dev-Server/`PUBLIC_DEBUG=true`, eigener Chunk): im Spiel Taste **I**
  oder `?profiler` (Handy). Bildrate + Verlauf, CPU-Zeit Update/Render (`stage.onFrame`), GPU-Zeit (nur mit
  `EXT_disjoint_timer_query_webgl2`), Draw-Calls, Dreiecke, teuerste Objekte (Namen der Gruppen: Figur, Hangar,
  Förderband, Flieger, Effekte), Grafik-Stufe 0–3 umschalten (`setQuality`), **Drahtgitter** (`scene.overrideMaterial`).
  Befund 2026-11-24 → behoben: Die Figur zeichnete **alle** Instanzen, auch verborgene mit Null-Skalierung (Boss ~10 900
  statt ~4 600 Würfel); jetzt dicht gepackt (`asteroid-view.js`: `slotOf`/`voxelAt`, `mesh.count`, AO je Voxel als
  Quelle in `voxel-ao.js` → `place`). Flieger waren ~56 Meshes = Draw-Calls; jetzt gesammelt (`attachShipBatches` in
  `ship-model.js`, von `stage.js` angehängt). Level 1, Stufe 3: Draw-Calls 86 → 37, Dreiecke der Figur −40 %.
- Test-Hilfe: mit `PUBLIC_DEBUG=true` bauen (`.env`, siehe `.env.example`) → Taste **B** sprengt den nächsten Kristall, Taste **W** gewinnt das Level sofort, Taste **P** schaltet alles frei (alle Level, überall drei Sterne → alle Specials und Flieger).
- Testen im Browser ohne Klicken: headless Chromium per DevTools-Pipe (rAF läuft in `--virtual-time-budget` NICHT).
- Spielbildschirm ist Vollbild (`Base fullscreen`, `h-dvh`), Safe-Areas über `env(safe-area-inset-*)`.
- Die Bühne passt sich per ResizeObserver an ihren Container an; der Kameraabstand richtet sich nach
  Breite (Deck mit 5 Plattformen) bzw. Höhe (Stapel Körper → Deck → Förderband, `STACK` in `render/stage.js`).

## Multiplayer (geplant, noch nicht gebaut)
- Battle mit bis zu 4 Spielern, Verbindung per QR-Code wie in `../wyrfl` (`src/scripts/duel/rtc.js`: WebRTC ohne
  Server, Sternnetz über den Host; `src/scripts/ui/qr.js`: qrcode-generator + qr-scanner). Übernehmen nach
  `src/scripts/net/`, Modus in `src/scripts/modes/battle.js`.
- Grundlage ist schon da: gleicher Level + Seed → identisches Spiel auf allen Geräten; Fortschritt über die Ereignisse
  (`hit`, `won`, `lost`) an die anderen senden.

## Offene Punkte / nächste Schritte (Stand 2026-11-24)
- **Knobel-Umbau im echten Spiel testen:** Ist „ganz außen“ ohne Hilfe erkennbar? Evtl. Hinweis, wie viele Blöcke einer
  Farbe gerade treffbar sind (z. B. Zahl/Leuchten an der vordersten Kachel) – Vorsicht, nimmt Knobelei weg.
  Mitte (L5–9) ist für Zufall noch ~50 % – evtl. mehr große Schiffe (`ships`) oder Level-Design mit mehr Farben je Schicht.
- **Auf echtem Handy prüfen:** Leistung (60 fps Spiel / 30 fps Sterne), Bruchstück-Flug an der Kamera vorbei mit DOF.
- Teddy: Augen wirkten in der Übersicht etwas tief – prüfen.
- Noch nicht gebaut: Battle-Modus (QR, bis 4 Spieler), PWA/Offline, weitere Sprachen.

## Ideen für später
- Schilde, die eine Farbschicht schützen, bis ein Generator-Voxel zerstört ist
- Kettenexplosionen, Bossplaneten, mehrere Asteroiden gleichzeitig
- Booster (z. B. „Slot +1“, Drehung pausieren, Bombe)
- Level-Editor bzw. Formen aus Modellen (Planeten, Raumstationen, Figuren) statt nur Kugeln
- Echte Lösbarkeitsprüfung (Solver) für generierte Level
- Juice (Screenshake, Trefferblitz), Mobile-Optimierung bzw. PWA

## Alternative Themen für dasselbe Prinzip (Brainstorm)
Ameisenbären saugen farbige Ameisen ein (Magengröße als Limit, Schluckauf bei falscher Farbe) ·
Bienen und Blumenwiese · Möwen klauen Pommes nach Soße · Taucher am Korallenriff (Strömung, Sauerstoff) ·
Magnetkräne auf einem Schrottplatz (Kettenreaktionen) · Hirtenhunde und Schafe · Geisterjäger im Spukhaus ·
Zauberlehrlinge und ein Buntglasfenster · Wäsche sortieren (eine rote Socke färbt alles um)
