#!/usr/bin/env bash
# Musik-WAVs (Export der Dev-Seite /dev/musik/: menu.wav, game.wav, boss.wav) → public/audio/*.mp3
# Auf dem Rechner ausführen (braucht `lame`), z. B.:  scripts/encode-music.sh ~/Downloads
# Danach MUSIC_VERSION in src/scripts/audio/music.js erhöhen, damit Browser die neuen Dateien laden.
set -euo pipefail
src="${1:-$HOME/Downloads}"
dst="$(cd "$(dirname "$0")/.." && pwd)/public/audio"
mkdir -p "$dst"
for name in menu game boss; do
  wav="$src/$name.wav"
  [ -f "$wav" ] || { echo "fehlt: $wav" >&2; exit 1; }
  # 128 kbit/s CBR, Stereo; die Dateien enthalten einen Rand (MUSIC_PAD), Encoder-Verzögerung stört die Schleife nicht
  lame --quiet -b 128 -m j "$wav" "$dst/$name.mp3"
  echo "$dst/$name.mp3  $(du -h "$dst/$name.mp3" | cut -f1)"
done
