// Inline-SVG-Icons (currentColor bzw. weiß), als Strings für Astro-Templates und Client-Skripte.
// Specials (Spielbildschirm): Zusatz-Plattform, Farbwechsel (Farbtropfen mit Pfeil), Supernova (Strahlenstern)
export const SPECIAL_ICONS = {
  pad: '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M12 4v8M8 8h8"/></svg>',
  recolor: '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5s-5 5.6-5 9a5 5 0 0 0 10 0c0-3.4-5-9-5-9z"/><path d="M15 14h6M18 11l3 3-3 3"/></svg>',
  recall: '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-2"/></svg>',
  nova: '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
};
export const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-full w-full"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5-4.8-4.5 6.5-.8z" fill="currentColor" stroke="rgb(0 0 0 / .25)" stroke-width="1" stroke-linejoin="round"/></svg>';
export const BACK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
export const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
export const GEAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
export const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
