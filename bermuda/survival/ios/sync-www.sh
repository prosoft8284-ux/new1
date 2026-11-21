#!/usr/bin/env bash
# Copies the web game into the iOS app bundle folder (ios/www).
# Run it after every gameplay change, then rebuild in Xcode.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$HERE/.." && pwd)"
DST="$HERE/www"

rm -rf "$DST"
mkdir -p "$DST"
cp "$SRC/index.html" "$DST/"
cp -r "$SRC/css" "$SRC/js" "$DST/"

# sanity: the game must have its entry point and scripts
[ -f "$DST/index.html" ] || { echo "index.html missing"; exit 1; }
[ -d "$DST/js" ] || { echo "js folder missing"; exit 1; }
echo "www synced -> $DST ($(find "$DST" -type f | wc -l | tr -d ' ') files)"
