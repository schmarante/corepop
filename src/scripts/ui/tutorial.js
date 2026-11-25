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

/** Handschuh (eigener Entwurf): weißer Comic-Handschuh, Zeigefinger nach unten, Bündchen in Spreng-Magenta */
const GLOVE = `<svg viewBox="0 0 64 84" aria-hidden="true">
  <g stroke="#1b1d33" stroke-width="3" stroke-linejoin="round">
    <rect x="13" y="4" width="38" height="16" rx="7" fill="#ff2bd6"/>
    <path d="M19 12h26" stroke="#ffd6f5" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M14 22c0-3 3-5 6-5h24c3 0 6 2 6 5v17c0 7-5 12-12 12H26c-7 0-12-5-12-12z" fill="#fff"/>
    <path d="M14 30c-5 0-8 3-8 7s3 7 8 7" fill="#fff"/>
    <rect x="26" y="40" width="13" height="38" rx="6.5" fill="#fff"/>
    <path d="M20 44v4M44 44v3" stroke-linecap="round"/>
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
