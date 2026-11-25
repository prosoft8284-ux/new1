/* پل اعلان: پلاگین Capacitor را در وب‌ویو ثبت و در دسترس اپ می‌گذارد */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

window.SB = window.SB || {};
window.SB.LocalNotifications = LocalNotifications;
window.SB.isNative = !!(Capacitor.isNativePlatform && Capacitor.isNativePlatform());
window.SB.platform = Capacitor.getPlatform ? Capacitor.getPlatform() : 'web';
