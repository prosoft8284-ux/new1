# BERMUDA SURVIVAL — نسخهٔ iOS

همان بازی وب (HTML/Canvas) داخل یک اپ WKWebView آفلاین. هیچ سرور، اینترنت یا مجوز شبکه لازم ندارد؛ همهٔ فایل‌ها داخل بستهٔ اپ هستند.

## چرا اینجا IPA آماده نمی‌بینید؟
ساخت فایل `.ipa` فقط روی **macOS با Xcode** انجام می‌شود (کامپایل + امضای اپل). این مخزن روی لینوکس ساخته شده، پس فقط سورس کامل پروژهٔ iOS اینجاست و باید روی مک خودتان یک بار Build شود. هیچ کد جاافتاده‌ای نیست؛ مراحل زیر کافی است.

## ساخت روی مک (۳ دستور)
```bash
# 1) ابزار تولید پروژهٔ Xcode
brew install xcodegen

# 2) کپی بازی وب داخل بستهٔ اپ
cd bermuda/survival/ios
chmod +x sync-www.sh
./sync-www.sh

# 3) ساخت پروژه و باز کردنش
xcodegen
open BermudaSurvival.xcodeproj
```
در Xcode:
1. بالا، تیم امضا را انتخاب کنید: **Signing & Capabilities → Team** (Apple ID رایگان هم کافی است؛ اپ روی گوشی خودتان ۷ روز کار می‌کند و هر بار با Build دوباره فعال می‌شود).
2. Bundle Identifier اگر لازم شد تغییر دهید (مثلاً `com.<اسم‌شما>.bermuda`).
3. گوشی را با کابل وصل کنید، در نوار بالا گوشی را انتخاب و **Run** بزنید.

برای نصب دائمی/توزیع: حساب Apple Developer (۹۹ دلار در سال) → Archive → TestFlight یا Ad Hoc.

## بدون XcodeGen (اگر brew ندارید)
1. در Xcode یک پروژهٔ جدید **iOS → App → Storyboard** بسازید (اسم: BermudaSurvival، زبان Swift).
2. دو فایل `App/AppDelegate.swift` و `App/GameViewController.swift` را به پروژه اضافه کنید (Replace برای AppDelegate).
3. پوشهٔ `www` را با drag & drop به پروژه اضافه کنید و حتماً **Copy items if needed** و **Create folder references** را بزنید.
4. در `Info.plist`: `UIRequiresFullScreen = YES`، `Status bar is initially hidden = YES`، و فقط دو جهت Landscape.
5. Run.

## نکته‌ها
- پس از هر تغییر در بازی: `./sync-www.sh` و دوباره Run (فایل‌های `www/` در گیت نگه داشته نمی‌شوند).
- جهت صفحه افقی و تمام‌صفحه است؛ Safe Area برای ناچ/Home Bar در WebView رعایت شده.
- لرزش (هپتیک): iOS لرزش وب ندارد، پس `navigator.vibrate` با موتور هپتیک بومی وصل شده است.
- دکمهٔ Back: iOS دکمهٔ سخت‌افزاری ندارد؛ همان پل `window.__onBack` ثبت شده و در صورت نیاز با Swipe از لبه قابل اتصال است.
- جایگزین سریع بدون Xcode: همان بازی را در Safari باز کنید و **Add to Home Screen** بزنید؛ تمام‌صفحه و آفلاین (پس از اولین بار) اجرا می‌شود.
