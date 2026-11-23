// Inline-SVG-Icons (currentColor bzw. weiß), als Strings für Astro-Templates und Client-Skripte.
// Schiff in der Warteschlange: dieselbe Silhouette wie das 3D-Schiff (render/ship-model.js) – runder Rumpf, Cockpit, Flügel
export const SHIP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-7 w-7"><g fill="#fff"><path d="M4.5 15.5 9 12v5l-4.5 1.2z" fill-opacity=".8"/><path d="M19.5 15.5 15 12v5l4.5 1.2z" fill-opacity=".8"/><rect x="8.6" y="3" width="6.8" height="16" rx="3.4" fill-opacity=".95"/><rect x="9.8" y="19" width="4.4" height="2" rx=".8" fill-opacity=".7"/></g><ellipse cx="12" cy="8.2" rx="1.9" ry="2.5" fill="#000" fill-opacity=".28"/></svg>';
/** Symbol-Größe je Schiffsklasse (Munition) – größere Schiffe, größeres Symbol */
export const SHIP_ICON_SIZE = { 1: 'h-7 w-7', 20: 'h-5 w-5', 50: 'h-6 w-6', 100: 'h-7 w-7', 250: 'h-8 w-8' };
// Spreng-Flieger: runde Bombe mit Zündschnur und Funken
export const BOMB_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-7 w-7"><circle cx="11" cy="14" r="7" fill="#fff" fill-opacity=".95"/><circle cx="8.5" cy="11.5" r="2" fill="#000" fill-opacity=".2"/><path d="M15 8.5l2-2" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M17.5 6c.6-1.6 2-2 3-1.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="20.8" cy="4.2" r="1.3" fill="#ffe14d"/></svg>';
export const BACK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
export const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
export const GEAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
export const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
