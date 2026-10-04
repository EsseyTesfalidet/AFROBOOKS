// A presentation-only destination. Authentication stays in Firebase/session
// cookies; never put tokens or user details in a browser handoff URL.
export const AUTHOR_WEB_START = '/author/start?view=web';
export const AUTHOR_APP_START = '/author/start';
export const READER_APP_RETURN = '/browse?view=app';

// Fixed destinations/packages only. No identity or arbitrary redirect input.
function androidLink(path: string, packageId: string) {
  return `intent://afrobs.com${path}#Intent;scheme=https;package=${packageId};S.browser_fallback_url=${encodeURIComponent(`https://afrobs.com${path}`)};end`;
}

export function authorWebsiteHref(android: boolean) {
  return android ? androidLink(AUTHOR_WEB_START, 'com.android.chrome') : AUTHOR_WEB_START;
}

export function readerAppHref(android: boolean) {
  return android ? androidLink(READER_APP_RETURN, 'com.afrobs.app') : READER_APP_RETURN;
}
