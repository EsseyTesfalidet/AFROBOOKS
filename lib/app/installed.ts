export const APP_DISPLAY = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)';
const ANDROID_APP_SESSION = 'afrobooks:android-app';

// A presentation signal, never proof of identity or payment authorization.
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  let androidSession = false;
  try { androidSession = sessionStorage.getItem(ANDROID_APP_SESSION) === '1'; } catch { /* Storage is optional. */ }
  return window.matchMedia(APP_DISPLAY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /^android-app:\/\/com\.afrobs\.app(?:\/|$)/.test(document.referrer) || androidSession;
}

// Runs in the head, before protected app content can paint. The Android marker
// lasts only for this tab, including full navigations after Google/email login.
export const APP_MODE_BOOTSTRAP = `(()=>{let a=/^android-app:\\/\\/com\\.afrobs\\.app(?:\\/|$)/.test(document.referrer);try{if(a)sessionStorage.setItem('${ANDROID_APP_SESSION}','1');a=a||sessionStorage.getItem('${ANDROID_APP_SESSION}')==='1'}catch{}document.documentElement.dataset.appMode=(matchMedia('${APP_DISPLAY}').matches||navigator.standalone===true||a)?'installed':'browser'})()`;
