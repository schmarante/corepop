#!/usr/bin/env bash
# Musik-WAVs (Export der Dev-Seite /dev/musik/: menu.wav, game.wav, boss.wav) → public/audio/<name>-v<MUSIC_VERSION>.mp3
# Vorher MUSIC_VERSION in src/scripts/audio/music.js erhöhen – die Version steckt im Dateinamen, damit Browser und CDN
# nicht die alte Fassung liefern. Alte Fassungen werden entfernt.
# Auf dem Rechner ausführen (braucht `lame`), z. B.:  scripts/encode-music.sh ~/Downloads
set -euo pipefail
src="${1:-$HOME/Downloads}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dst="$root/public/audio"
version="$(sed -n 's/^export const MUSIC_VERSION = \([0-9]*\);.*/\1/p' "$root/src/scripts/audio/music.js")"
[ -n "$version" ] || { echo "MUSIC_VERSION nicht gefunden" >&2; exit 1; }
mkdir -p "$dst"
for name in menu game boss; do
  wav="$src/$name.wav"
  [ -f "$wav" ] || { echo "fehlt: $wav" >&2; exit 1; }
  out="$dst/$name-v$version.mp3"
  find "$dst" -maxdepth 1 -name "$name.mp3" -o -maxdepth 1 -name "$name-v*.mp3" | grep -vx "$out" | xargs -r rm -f
  # 128 kbit/s CBR, Stereo; die Dateien enthalten einen Rand (MUSIC_PAD), Encoder-Verzögerung stört die Schleife nicht
  lame --quiet -b 128 -m j "$wav" "$out"
  echo "$out  $(du -h "$out" | cut -f1)"
done
