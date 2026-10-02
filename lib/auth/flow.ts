const pending = new Set<Promise<void>>();

// Firebase emits auth changes before sign-up has saved its Firestore profile.
// Let the explicit form finish before the global observer validates that profile.
export function beginAuthFlow(): () => void {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => { finish = resolve; });
  pending.add(promise);
  return () => { pending.delete(promise); finish(); };
}

export async function waitForAuthFlow(): Promise<void> {
  while (pending.size) await Promise.all([...pending]);
}
