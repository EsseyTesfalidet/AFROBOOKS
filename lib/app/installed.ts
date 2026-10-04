export const APP_DISPLAY = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)';
const ANDROID_APP_SESSION = 'afrobooks:android-app';
const WEBSITE_SESSION = 'afrobooks:website-tab';

function isWebsiteTab() {
  if (window.location.pathname === '/author/start' && new URLSearchParams(window.location.search).get('view') === 'web') return true;
  if (document.documentElement.dataset.websiteTab === 'true') return true;
  try { return sessionStorage.getItem(WEBSITE_SESSION) === '1'; } catch { return false; }
}

// A presentation signal, never proof of identity or payment authorization.
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (isWebsiteTab()) return false;
  let androidSession = false;
  try { androidSession = sessionStorage.getItem(ANDROID_APP_SESSION) === '1'; } catch { /* Storage is optional. */ }
  return window.matchMedia(APP_DISPLAY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /^android-app:\/\/com\.afrobs\.app(?:\/|$)/.test(document.referrer) || androidSession;
}

// Runs in the head, before protected app content can paint. The Android marker
// lasts only for this tab, including full navigations after Google/email login.
export const APP_MODE_BOOTSTRAP = `(()=>{let w=typeof location!=='undefined'&&location.pathname==='/author/start'&&new URLSearchParams(location.search).get('view')==='web';try{if(w)sessionStorage.setItem('${WEBSITE_SESSION}','1');w=w||sessionStorage.getItem('${WEBSITE_SESSION}')==='1'}catch{}if(w){document.documentElement.dataset.websiteTab='true';document.documentElement.dataset.appMode='browser';return}let a=/^android-app:\\/\\/com\\.afrobs\\.app(?:\\/|$)/.test(document.referrer);try{if(a)sessionStorage.setItem('${ANDROID_APP_SESSION}','1');a=a||sessionStorage.getItem('${ANDROID_APP_SESSION}')==='1'}catch{}document.documentElement.dataset.appMode=(matchMedia('${APP_DISPLAY}').matches||navigator.standalone===true||a)?'installed':'browser'})()`;
