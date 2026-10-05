'use client';
import type { StudioEntry } from './WatchStudio';
export default function WatchPlaySetup({ entry, busy, save }: { entry: StudioEntry; busy: boolean; save: (action: string, data: unknown) => Promise<void> }) {
  if (!entry.video.priceCents) return null;
  return <form className="watch-review" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void save('play_product', { videoId: entry.video.id, productId: form.get('productId'), enabled: form.get('enabled') === 'on', liveEnabled: form.get('liveEnabled') === 'on' });
  }}>
    <h3>Google Play checkout</h3>
    <p className="watch-muted">Create a one-time product in Play Console with one standard buy option, quantity one and no rental or preorder. Play Console controls the checkout price, taxes and country availability. The server verifies the active product before enabling real purchases. Net revenue is split 80% to the creator and 20% to AfroBooks.</p>
    <label>Google Play product ID<input name="productId" required pattern="afrobooks_video_[a-z0-9_]{1,100}" defaultValue={entry.private?.playProductId || ''} readOnly={!!entry.private?.playProductId} placeholder="afrobooks_video_your_film" /></label>
    <label className="watch-check"><input type="checkbox" name="enabled" defaultChecked={entry.private?.playTestEnabled === true} />Enable checkout for configured license testers</label>
    <label className="watch-check"><input type="checkbox" name="liveEnabled" defaultChecked={entry.private?.playLiveEnabled === true} />Enable real purchases for this published video</label>
    <button className="watch-button" disabled={busy}>Save Play product</button>
  </form>;
}
