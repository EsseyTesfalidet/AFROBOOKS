// Read only metadata locally: no file is sent until the creator submits.
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'); const url = URL.createObjectURL(file);
    const timer = setTimeout(() => finish(), 15000);
    function finish(seconds?: number) {
      clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null;
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
      if (seconds && Number.isFinite(seconds)) resolve(seconds);
      else reject(new Error('We could not read this video’s length. Try an MP4 file, or set its length under upload options.'));
    }
    video.preload = 'metadata'; video.onloadedmetadata = () => finish(video.duration); video.onerror = () => finish(); video.src = url;
  });
}

export function uploadReservation(seconds: number, trailer: boolean) {
  const maximum = trailer ? 300 : 10800;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > maximum) throw new Error(trailer ? 'Choose a trailer up to five minutes long.' : 'Choose a video up to three hours long.');
  return Math.min(maximum, Math.max(60, Math.ceil(seconds / 60) * 60));
}
