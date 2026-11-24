// Musik: Notenschrift der Stücke (audio/music.js) – jeder Takt einer Melodie ist genau 16 Sechzehntel lang,
// alle Melodien passen ins Stück, alle Akkorde und Muster sind gültig.
import { describe, it, expect } from 'vitest';
import { SONGS, parseMelody, noteToMidi } from '../src/scripts/audio/music.js';

describe('Musik', () => {
  it('Notennamen → MIDI', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#5')).toBe(78);
    expect(noteToMidi('Bb4')).toBe(70);
  });

  for (const [name, song] of Object.entries(SONGS))
    it(`${name}: Takte voll, Melodien im Stück, Muster 16 Schritte`, () => {
      for (const lead of song.leads) {
        const bars = lead.notes.split('|');
        for (const bar of bars) {
          const steps = bar.trim().split(/\s+/).reduce((sum, token) => sum + Number(token.split(':')[1]), 0);
          expect(steps, `${name}: „${bar.trim()}“`).toBe(16);
        }
        expect(lead.bar + bars.length).toBeLessThanOrEqual(song.bars);
        expect(parseMelody(lead.notes).length).toBeGreaterThan(0);
      }
      const patterns = [...song.bass, ...Object.values(song.drums).flat(), ...[song.stabs ?? []].flat(), ...(song.doom ?? [])];
      for (const p of patterns) expect(p).toHaveLength(16);
      // Listen je Takt: entweder kurz (laufen reihum) oder genau so lang wie das Stück
      for (const list of [song.bass, ...Object.values(song.drums), song.doom, song.stabs].filter(Array.isArray))
        expect(song.bars % list.length).toBe(0);
      for (const chord of song.chords) expect(typeof chord).toBe('string');
    });
});
