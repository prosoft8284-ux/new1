#!/usr/bin/env bash
# Install a no-root Tesseract plus Persian models into ~/tools (or $1).
# Everything here is free; nothing is written outside the destination folder.
#
#   tools/best/fas.traineddata   most accurate, ~2.3x slower
#   tools/fast/fas.traineddata   default for bulk runs
set -euo pipefail

DEST="${1:-$HOME/tools}"
mkdir -p "$DEST" "$DEST/best" "$DEST/fast"

if [ ! -x "$DEST/squashfs-root/AppRun" ]; then
  echo "==> downloading portable tesseract"
  URL=$(curl -s https://api.github.com/repos/AlexanderP/tesseract-appimage/releases/latest \
        | grep -o 'https://[^"]*x86_64\.AppImage' | head -1)
  if [ -z "${URL:-}" ]; then
    echo "could not resolve an AppImage URL; download one manually from" \
         "https://github.com/AlexanderP/tesseract-appimage/releases" >&2
    exit 1
  fi
  curl -sL -o "$DEST/tess.AppImage" "$URL"
  chmod +x "$DEST/tess.AppImage"
  ( cd "$DEST" && ./tess.AppImage --appimage-extract >/dev/null )
  rm -f "$DEST/tess.AppImage"
fi

fetch() { # repo, lang, target-dir
  local repo="$1" lang="$2" dir="$3"
  if [ ! -f "$dir/$lang.traineddata" ]; then
    echo "==> $repo/$lang.traineddata"
    curl -sL -o "$dir/$lang.traineddata" \
      "https://github.com/tesseract-ocr/$repo/raw/main/$lang.traineddata"
  fi
}

for lang in fas ara eng; do
  fetch tessdata_best "$lang" "$DEST/best"
  fetch tessdata_fast "$lang" "$DEST/fast"
done

"$DEST/squashfs-root/AppRun" --version | head -1
echo "models: $DEST/best (accurate), $DEST/fast (bulk)"
