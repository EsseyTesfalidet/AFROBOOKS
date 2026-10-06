export const PLAYER_SWIPE_THRESHOLD = 64;

export type PlayerSwipe = 'previous' | 'next' | 'collapse' | null;

export function classifyPlayerSwipe(deltaX: number, deltaY: number): PlayerSwipe {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (vertical >= PLAYER_SWIPE_THRESHOLD && vertical > horizontal * 1.3) {
    return deltaY > 0 ? 'collapse' : null;
  }
  if (horizontal >= PLAYER_SWIPE_THRESHOLD && horizontal > vertical * 1.3) {
    return deltaX < 0 ? 'next' : 'previous';
  }
  return null;
}
