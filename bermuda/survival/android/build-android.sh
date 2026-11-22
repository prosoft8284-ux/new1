#!/usr/bin/env bash
# =============================================================================
# BERMUDA SIEGE — Android build, no Gradle, no AndroidX, no network.
#
#   bash android/build-android.sh [versionName] [versionCode]
#
# Pipeline: aapt2 compile -> aapt2 link (+ assets/) -> javac -> d8 -> merge dex
#           -> zipalign -> apksigner (v1 + v2) -> verify + badging report.
#
# Target: Android 5.0 (API 21) .. Android 9 (API 28), targetSdk 28.
# Every asset the game loads must be inside the APK: the prop manifest, the GLB
# wrecks and both ground textures included.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"          # .../bermuda/survival
ANDROID_DIR="$ROOT/android"
BUILD_ROOT="$(cd "$ROOT/../.." && pwd)"           # repo root
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$BUILD_ROOT/.android-build/sdk}}"
JDK="${JAVA_HOME:-$BUILD_ROOT/.android-build/jdk}"
BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"
KEYSTORE="$ANDROID_DIR/bermuda.keystore"
KEY_ALIAS="bermuda"
KEY_PASS="bermuda2026"
VNAME="${1:-5.0}"
VCODE="${2:-20}"
MIN_SDK=21
TARGET_SDK=28
WORK="$ROOT/.build/android"
DIST="$ROOT/dist"
APK="$DIST/bermuda-siege-android-v$VNAME.apk"

export JAVA_HOME="$JDK"
export PATH="$JDK/bin:$PATH"

say() { printf '\033[1m== %s\033[0m\n' "$*"; }

command -v java >/dev/null || { echo "no java in $JDK"; exit 1; }
[ -x "$BT/aapt2" ] || { echo "missing aapt2 in $BT"; exit 1; }
[ -f "$AJ" ] || { echo "missing android.jar in $AJ"; exit 1; }

rm -rf "$WORK"
mkdir -p "$WORK/classes" "$WORK/assets/game" "$WORK/res" "$DIST"

# ---------------------------------------------------------------- 1. assets
say "assets"
cp "$ROOT/index.html" "$ROOT/README.md" "$WORK/assets/game/"
for d in css js textures models; do
  [ -d "$ROOT/$d" ] && cp -r "$ROOT/$d" "$WORK/assets/game/"
done
# the game never loads these in the APK, and every megabyte matters on a 2015
# phone with 1 GB of storage
rm -rf "$WORK/assets/game/models/src"
rm -f "$WORK/assets/game/models/vanguard.glb" "$WORK/assets/game/models/mech.glb"
find "$WORK/assets" -type f | wc -l | xargs echo "  asset files:"
du -sh "$WORK/assets/game" | xargs echo "  assets size:"

# ------------------------------------------------------------- 2. resources
say "resources"
"$BT/aapt2" compile --dir "$ANDROID_DIR/res" -o "$WORK/res.zip"

# ------------------------------------------------------------------ 3. java
say "java"
find "$ANDROID_DIR/java" -name '*.java' > "$WORK/srcs.txt"
javac -nowarn -source 8 -target 8 -bootclasspath "$AJ" \
  -d "$WORK/classes" @"$WORK/srcs.txt"
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
echo "  classes: $(wc -l < "$WORK/classes.txt")"

# ------------------------------------------------------------------- 4. dex
say "dex (min-api $MIN_SDK)"
"$BT/d8" --lib "$AJ" --min-api "$MIN_SDK" --release --output "$WORK" \
  $(cat "$WORK/classes.txt")

# ----------------------------------------------------------------- 5. link
say "link (min $MIN_SDK / target $TARGET_SDK)"
"$BT/aapt2" link -o "$WORK/base.apk" -I "$AJ" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  -A "$WORK/assets" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VCODE" --version-name "$VNAME" \
  --no-version-vectors \
  "$WORK/res.zip"

# ------------------------------------------------------------- 6. merge dex
say "merge dex"
python3 - "$WORK" <<'PY'
import os, shutil, sys, zipfile
work = sys.argv[1]
src = os.path.join(work, 'base.apk')
dst = os.path.join(work, 'withdex.apk')
shutil.copyfile(src, dst)
with zipfile.ZipFile(dst, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(work, 'classes.dex'), 'classes.dex')
PY

# ---------------------------------------------------------- 7. align + sign
say "align"
"$BT/zipalign" -f -p 4 "$WORK/withdex.apk" "$WORK/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  say "keystore"
  keytool -genkeypair -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
    -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=BERMUDA SIEGE, OU=Games, O=Indie, L=Island, C=IR" >/dev/null
fi

say "sign"
rm -f "$APK"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
  --min-sdk-version "$MIN_SDK" \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$APK" "$WORK/aligned.apk"

# --------------------------------------------------------------- 8. verify
say "verify"
"$BT/apksigner" verify --min-sdk-version "$MIN_SDK" "$APK" >/dev/null
echo "  signature: OK (v1 + v2, minSdk $MIN_SDK)"

"$BT/aapt" dump badging "$APK" | grep -E "package:|sdkVersion|targetSdkVersion|launchable-activity|application-label" | sed 's/^/  /'

echo "  assets in apk: $(unzip -l "$APK" | grep -c 'assets/game/')"
unzip -l "$APK" | grep -E "assets/game/(index.html|js/siege3d.js|textures/ground_diff.jpg|models/props/manifest.json)" | sed 's/^/  /'
echo "  size: $(du -h "$APK" | cut -f1)"
say "done"
echo "$APK"
