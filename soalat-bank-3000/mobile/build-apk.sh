#!/usr/bin/env bash
# ساخت APK اندروید (debug) از اپ وب
# پیش‌نیاز: JDK 21 و Android SDK با platforms;android-36 و build-tools;36.0.0
#   JAVA_HOME=/path/to/jdk21  ANDROID_HOME=/path/to/android-sdk  ./build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk21}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

# ۱) کپی تازه اپ و داده‌ها به www
rm -rf www
mkdir -p www/data
cp -r ../app/* www/
cp ../data/*.json www/data/

# ۲) همگام‌سازی با پروژه اندروید
npx cap sync android

# ۳) بیلد
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
(cd android && ./gradlew assembleDebug)

# ۴) خروجی
mkdir -p ../apk
cp android/app/build/outputs/apk/debug/app-debug.apk ../apk/soalat-3000-170ruz.apk
echo "APK: apk/soalat-3000-170ruz.apk"
