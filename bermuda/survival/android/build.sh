#!/usr/bin/env bash
# BERMUDA SURVIVAL — build a signed APK from the web game.
# Requires: JDK 17+, .build/bt/android-14 (build-tools), .build/plat/android-34/android.jar
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BT="$ROOT/.build/bt/android-14"
AJ="$ROOT/.build/plat/android-34/android.jar"
WORK="$ROOT/.build/apk"
OUT="$ROOT/dist"
KS="$ROOT/android/bermuda.keystore"
KS_PASS="bermuda2026"
VNAME="${1:-1.0}"

[ -x "$BT/aapt2.exe" ] || { echo "missing build-tools in $BT"; exit 1; }
[ -f "$AJ" ] || { echo "missing android.jar in $AJ"; exit 1; }

rm -rf "$WORK"; mkdir -p "$WORK/classes" "$OUT"

echo "== assets"
rm -rf "$ROOT/android/assets"; mkdir -p "$ROOT/android/assets"
cp "$ROOT/index.html" "$ROOT/preview.html" "$ROOT/README.md" "$ROOT/android/assets/"
cp -r "$ROOT/css" "$ROOT/js" "$ROOT/android/assets/"

echo "== resources"
"$BT/aapt2.exe" compile --dir "$ROOT/android/res" -o "$WORK/res.zip"

echo "== java"
javac -nowarn -source 8 -target 8 -bootclasspath "$AJ" -d "$WORK/classes" \
  $(find "$ROOT/android/java" -name "*.java" | tr '\n' ' ')

echo "== dex"
"$BT/d8.bat" --lib "$AJ" --min-api 23 --release --output "$WORK" \
  $(find "$WORK/classes" -name "*.class" | tr '\n' ' ')

echo "== link"
"$BT/aapt2.exe" link -o "$WORK/base.apk" -I "$AJ" \
  --manifest "$ROOT/android/AndroidManifest.xml" \
  -A "$ROOT/android/assets" \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code 1 --version-name "$VNAME" \
  "$WORK/res.zip"

echo "== add dex"
python - "$WORK" <<'PY'
import sys, zipfile, shutil, os
work = sys.argv[1]
src = os.path.join(work, 'base.apk')
dst = os.path.join(work, 'withdex.apk')
shutil.copyfile(src, dst)
with zipfile.ZipFile(dst, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(work, 'classes.dex'), 'classes.dex')
print('dex added')
PY

echo "== align"
"$BT/zipalign.exe" -f -p 4 "$WORK/withdex.apk" "$WORK/aligned.apk"

if [ ! -f "$KS" ]; then
  echo "== keystore"
  keytool -genkeypair -keystore "$KS" -alias bermuda -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=BERMUDA SURVIVAL, OU=Games, O=Indie, L=Island, C=IR" >/dev/null
fi

APK="$OUT/bermuda-survival-v$VNAME.apk"
rm -f "$APK"
echo "== sign"
"$BT/apksigner.bat" sign --ks "$KS" --ks-key-alias bermuda \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --min-sdk-version 23 --v1-signing-enabled true --v2-signing-enabled true \
  --out "$APK" "$WORK/aligned.apk"

echo "== verify"
"$BT/apksigner.bat" verify --min-sdk-version 23 --print-certs "$APK" | head -6
ls -la "$APK"
