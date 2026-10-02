export type WelcomeKind = 'signup' | 'signin';
const KEY = 'afrobooks:welcome';
const MAX_AGE = 30 * 60 * 1000;

// Only explicit, successful authentication queues a greeting. Session restoration
// must not create one. Store no name/email; render the current verified profile.
export function queueWelcome(uid: string, kind: WelcomeKind) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ uid, kind, at: Date.now() }));
  } catch { /* A disabled storage API must never interrupt sign-in. */ }
}

export function consumeWelcome(uid: string): WelcomeKind | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const pending = JSON.parse(raw);
    const age = Date.now() - pending.at;
    if (pending.uid !== uid || typeof pending.at !== 'number' || age < 0 || age > MAX_AGE)
      return null;
    return pending.kind === 'signup' || pending.kind === 'signin' ? pending.kind : null;
  } catch { return null; }
}
