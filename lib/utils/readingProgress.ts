export function calculateReadingProgress(chapterIndex: number, chapterCount: number, chapterPercent: number, hasAccess: boolean) {
  const percent = Math.min(100, Math.max(0, chapterPercent));
  return {
    percentComplete: chapterCount > 0 ? Math.round(((chapterIndex + percent / 100) / chapterCount) * 100) : 0,
    isFinished: hasAccess && chapterCount > 0 && chapterIndex === chapterCount - 1 && percent >= 95,
  };
}
