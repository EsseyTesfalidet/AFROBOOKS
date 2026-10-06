export const PULL_REFRESH_TRIGGER = 52;

export function pullRefreshDistance(deltaX: number, deltaY: number) {
  if (deltaY < 8 || Math.abs(deltaX) > Math.abs(deltaY) * 0.75) return 0;
  return Math.min(72, (deltaY - 8) * 0.72);
}

export function shouldPullRefresh(distance: number) {
  return distance >= PULL_REFRESH_TRIGGER;
}
