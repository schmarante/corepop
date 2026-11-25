// Tutorial im ersten Level: Ein federnder Comic-Handschuh zeigt auf den vordersten Flieger auf dem Band und wandert mit
// ihm, dazu eine Sprechblase („Klick auf die Schiffe!“). Reagiert man nicht (IDLE) oder kommt der Flieger dem Bandende
// nahe (PAUSE_AT), pausiert das Spiel (`paused` – der Modus hält dann Band und Figur an) und eine Fokus-Maske dunkelt
// alles außer dem Flieger ab. Mit dem ersten gestarteten Flieger ist das Tutorial fertig (auf diesem Gerät gemerkt).
// Die Ebene lässt Antippen durch (pointer-events: none) – getippt wird wie sonst auf den Flieger im Canvas.
// Darstellung: .tutorial-* in styles/global.css. Nichts poppt: Maske, Handschuh und Blase blenden.
const KEY = 'corepop:tutorial';
const IDLE = 2.5;       // s ohne Antippen → Pause + Fokus-Maske
const PAUSE_AT = 1.4;   // Bandplatz: spätestens hier pausieren, damit der Flieger nicht herunterfällt
const FADE = 300;       // ms

/** Handschuh (eigener Entwurf): pummelige Comic-Zeigehand – Zeigefinger, daneben drei eingeklappte Finger als Wülste,
 *  Daumen quer davor, gerolltes Bündchen; dunkle Kontur + heller Außenrand (hebt sich vom All ab). Gezeichnet zeigt sie
 *  nach oben, gedreht tippt sie von rechts oben schräg nach unten; die Fingerspitze liegt unten in der Mitte. */
const GLOVE = `<svg viewBox="0 0 120 130" aria-hidden="true">
  <defs>
    <g id="corepop-glove" stroke-linejoin="round" stroke-linecap="round">
      <path d="M26 62c0-6 5-10 11-10h42c8 0 13 6 13 13v18c0 12-9 20-21 20H45c-11 0-19-8-19-19z" fill="#fff"/>
      <rect x="50" y="44" width="17" height="27" rx="8.5" fill="#eef0fb"/>
      <rect x="65" y="49" width="15.5" height="24" rx="7.8" fill="#eef0fb"/>
      <rect x="78.5" y="56" width="14" height="21" rx="7" fill="#eef0fb"/>
      <rect x="31" y="16" width="22" height="56" rx="11" fill="#fff"/>
      <path d="M30 70c-9-3-17 1-17 8 0 6 6 9 13 8l16-2c5-1 7-5 5-9-2-3-6-4-10-3z" fill="#fff"/>
      <rect x="35" y="98" width="56" height="22" rx="9" fill="#fff"/>
    </g>
  </defs>
  <g transform="rotate(200 60 65)">
    <use href="#corepop-glove" stroke="#fff" stroke-width="11"/>
    <use href="#corepop-glove" stroke="#1b1d33" stroke-width="4"/>
    <path d="M41 109h44" stroke="#c9cde3" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M37 27v16" stroke="#dfe3f5" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`;

/** schon einmal durchgespielt? */
export function tutorialDone() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {HTMLElement} container  Spielbildschirm (liegt deckungsgleich über dem Canvas)  @param {string} text */
export function createTutorial(container, text) {
  const layer = document.createElement('div');
  layer.className = 'tutorial';
  layer.innerHTML = `<div class="tutorial-mask"></div>
    <div class="tutorial-pointer"><p class="tutorial-bubble"></p><div class="tutorial-glove">${GLOVE}</div></div>`;
  layer.querySelector('.tutorial-bubble').textContent = text;
  container.append(layer);
  requestAnimationFrame(() => layer.classList.add('is-on'));

  let idle = 0;
  let paused = false;
  let finished = false;

  return {
    /** hält das Spiel an (Modus: Band und Figur stehen) */
    get paused() {
      return paused && !finished;
    },
    /**
     * je Bild: `target` = Bildschirmpunkt des vordersten Fliegers relativ zum Container ({ x, y } in px) oder null,
     * `frontPos` = sein Bandplatz (Pause, bevor er herunterfällt)
     */
    update(dt, target, frontPos = Infinity) {
      if (finished) return;
      layer.classList.toggle('has-target', !!target);
      if (!target) return;
      if (!paused) idle += dt;
      if (!paused && (idle >= IDLE || frontPos < PAUSE_AT)) {
        paused = true;
        layer.classList.add('is-paused');
      }
      layer.style.setProperty('--x', `${target.x}px`);
      layer.style.setProperty('--y', `${target.y}px`);
    },
    /** erster Flieger gestartet: ausblenden, merken */
    done() {
      if (finished) return;
      finished = true;
      layer.classList.remove('is-on', 'is-paused');
      setTimeout(() => layer.remove(), FADE);
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* nicht gemerkt – kommt beim nächsten Mal wieder */
      }
    },
    dispose() {
      finished = true;
      layer.remove();
    },
  };
}
