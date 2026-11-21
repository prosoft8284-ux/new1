#!/usr/bin/env bash
# BERMUDA SURVIVAL — build a signed APK from the web game (Linux/macOS).
# Uses the Android SDK from $ANDROID_HOME (build-tools + platform android-34).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT="${ANDROID_HOME:-$HOME/android-sdk}/build-tools/34.0.0"
AJ="${ANDROID_HOME:-$HOME/android-sdk}/platforms/android-34/android.jar"
WORK="$ROOT/.build/apk"
OUT="$ROOT/dist"
KS="$ROOT/android/bermuda.keystore"
KS_PASS="bermuda2026"
VNAME="${1:-1.2}"
VCODE="${2:-3}"

[ -x "$BT/aapt2" ] || { echo "missing build-tools in $BT"; exit 1; }
[ -f "$AJ" ] || { echo "missing android.jar in $AJ"; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK/classes" "$OUT"

echo "== assets"
rm -rf "$ROOT/android/assets"; mkdir -p "$ROOT/android/assets"
cp "$ROOT/index.html" "$ROOT/README.md" "$ROOT/android/assets/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/android/assets/"

echo "== resources"
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$WORK/res.zip"

echo "== java"
find "$ROOT/android/java" -name '*.java' > "$WORK/srcs.txt"
javac -nowarn -source 8 -target 8 -bootclasspath "$AJ" -d "$WORK/classes" @"$WORK/srcs.txt" 2>/dev/null

echo "== dex"
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
"$BT/d8" --lib "$AJ" --min-api 23 --release --output "$WORK" $(cat "$WORK/classes.txt")

echo "== link"
"$BT/aapt2" link -o "$WORK/base.apk" -I "$AJ" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  -A "$ROOT/android/assets" \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code "$VCODE" --version-name "$VNAME" \
  "$WORK/res.zip"

echo "== add dex"
python3 - "$WORK" <<'PY'
import sys, zipfile, shutil, os
work = sys.argv[1]
shutil.copyfile(os.path.join(work, 'base.apk'), os.path.join(work, 'withdex.apk'))
with zipfile.ZipFile(os.path.join(work, 'withdex.apk'), 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(work, 'classes.dex'), 'classes.dex')
PY

echo "== align"
"$BT/zipalign" -f -p 4 "$WORK/withdex.apk" "$WORK/aligned.apk"

if [ ! -f "$KS" ]; then
  echo "== keystore"
  keytool -genkeypair -keystore "$KS" -alias bermuda -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=BERMUDA SURVIVAL, OU=Games, O=Indie, L=Island, C=IR" >/dev/null
fi

APK="$OUT/bermuda-survival-v$VNAME.apk"
rm -f "$APK"
echo "== sign"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias bermuda \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --min-sdk-version 23 --v1-signing-enabled true --v2-signing-enabled true \
  --out "$APK" "$WORK/aligned.apk"

echo "== verify"
"$BT/apksigner" verify --min-sdk-version 23 --print-certs "$APK" | head -4
ls -la "$APK"
