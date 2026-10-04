export type AppThemeMode = 'auto' | 'light' | 'dark';
export type AppTheme = 'light' | 'dark';
export const APP_APPEARANCE_KEY = 'afrobooks-app-appearance';

export function resolveAppTheme(mode: AppThemeMode, now = new Date()): AppTheme {
  return mode === 'auto' ? (now.getHours() >= 18 || now.getHours() < 6 ? 'dark' : 'light') : mode;
}

export function isAppThemeMode(value: unknown): value is AppThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function safeCoverColor(value: unknown, fallback = '#ac7058'): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

// Runs after the mode bootstrap, before paint; storage may be unavailable.
export const APP_APPEARANCE_BOOTSTRAP = `(()=>{if(document.documentElement.dataset.appMode!=='installed')return;let m='auto';try{const p=JSON.parse(localStorage.getItem('${APP_APPEARANCE_KEY}')||'null');if(['auto','light','dark'].includes(p?.state?.themeMode))m=p.state.themeMode}catch{}const h=new Date().getHours();document.documentElement.dataset.appTheme=m==='auto'?(h>=18||h<6?'dark':'light'):m})()`;
