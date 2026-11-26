// Musik: Notenschrift der Stücke (audio/music.js) – jeder Takt einer Melodie ist genau 16 Sechzehntel lang,
// alle Melodien passen ins Stück, Abschnitte, Spuren, Akkorde und Muster sind gültig; Takt für den Sternenflug.
import { describe, it, expect } from 'vitest';
import { SONGS, LAYERS, parseMelody, noteToMidi, barsOf, beatMap, stepInfo } from '../src/scripts/audio/music.js';

describe('Musik', () => {
  it('Notennamen → MIDI', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#5')).toBe(78);
    expect(noteToMidi('Bb4')).toBe(70);
  });

  for (const [name, song] of Object.entries(SONGS))
    it(`${name}: Takte voll, Melodien im Stück, Abschnitte und Muster gültig`, () => {
      const bars = barsOf(song);
      for (const lead of song.leads) {
        const parts = lead.notes.split('|');
        for (const bar of parts) {
          const steps = bar.trim().split(/\s+/).reduce((sum, token) => sum + Number(token.split(':')[1]), 0);
          expect(steps, `${name}: „${bar.trim()}“`).toBe(16);
        }
        expect(lead.bar + parts.length).toBeLessThanOrEqual(bars);
        expect(['lead', 'pluck']).toContain(lead.voice);
        expect(parseMelody(lead.notes).length).toBeGreaterThan(0);
      }
      for (const letter of song.form) expect(song.layers[letter], `${name}: Abschnitt ${letter}`).toBeTypeOf('string');
      for (const layers of Object.values(song.layers))
        for (const layer of layers.split(/\s+/)) expect(LAYERS, `${name}: Spur ${layer}`).toContain(layer);
      expect(bars % song.chords.length).toBe(0);
      expect(song.arp).toMatch(/^[0-3.]{16}$/);
      if (song.stab) expect(song.stab).toMatch(/^[x.]{16}$/);
      for (const [letter, p] of Object.entries(song.patterns ?? {})) {
        expect(song.form).toContain(letter);
        if (p.arp) expect(p.arp).toMatch(/^[0-3.]{16}$/);
        if (p.stab) expect(p.stab).toMatch(/^[x.]{16}$/);
      }
      for (const bar of song.hits) expect(bar).toBeLessThan(bars);
    });

  it('Build-up: Stille im letzten Schlag vor dem Drop, danach Impact', () => {
    const song = SONGS.game;
    const last = song.form.lastIndexOf('U');
    expect(stepInfo(song, last * 16 + 11).silent).toBe(false);
    expect(stepInfo(song, last * 16 + 12).silent).toBe(true);
    const map = beatMap(song);
    expect(map[last * 16 + 12]).toBe(0);
    expect(map[0]).toBeGreaterThan(1);   // Drop am Schleifenanfang
    expect(map[4]).toBe(1);              // Kick
    expect(map[2]).toBe(0);              // dazwischen nichts
  });
});
