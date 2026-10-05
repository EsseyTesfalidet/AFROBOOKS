import { authenticatedPost } from '@/lib/firebase/request';
import { PLAY_METHOD, PLAY_PRODUCT_PATTERN, type PlayOffer, type PlayPurchaseResult } from './play';
export { playPrice } from './play';

export interface PlayItem { itemId: string; title: string; price: { currency: string; value: string } }
export interface DigitalGoods {
  getDetails(ids: string[]): Promise<PlayItem[]>;
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>;
}
export async function playService(): Promise<DigitalGoods | null> {
  const host = window as Window & { getDigitalGoodsService?: (method: string) => Promise<DigitalGoods> };
  if (!host.getDigitalGoodsService || !window.PaymentRequest) return null;
  try { return await host.getDigitalGoodsService(PLAY_METHOD); } catch { return null; }
}
export async function buyPlayVideo(offer: PlayOffer, item: PlayItem): Promise<PlayPurchaseResult> {
  if (item.itemId !== offer.productId) throw new Error('The video’s Google Play product does not match.');
  // show() runs synchronously from the click, preserving browser user activation.
  const request = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku: offer.productId, obfuscatedAccountId: offer.accountId } }], { total: { label: item.title, amount: item.price } });
  const response = await request.show();
  let result: PlayPurchaseResult;
  try {
    const token = (response.details as { purchaseToken?: string }).purchaseToken;
    if (!token) throw new Error('Google Play did not return a purchase. Use Restore purchases before trying to pay again.');
    result = await authenticatedPost('/api/watch/play', { action: 'verify', productId: offer.productId, purchaseToken: token });
  } catch (error) {
    try { await response.complete('unknown'); } catch { /* OS dialog may already be closed. */ }
    throw error;
  }
  try { await response.complete(result.status === 'active' ? 'success' : 'unknown'); } catch { /* Server confirmation remains authoritative. */ }
  return result;
}
export async function restorePlayVideos(service: DigitalGoods) {
  const purchases = (await service.listPurchases()).filter(item => PLAY_PRODUCT_PATTERN.test(item.itemId));
  let failures = 0;
  for (const item of purchases) {
    try { await authenticatedPost('/api/watch/play', { action: 'verify', productId: item.itemId, purchaseToken: item.purchaseToken }); }
    catch { failures++; }
  }
  let cursor: string | undefined;
  do {
    const page: { next: string | null } = await authenticatedPost('/api/watch/play', { action: 'reconcile', ...(cursor ? { cursor } : {}) });
    cursor = page.next || undefined;
  } while (cursor);
  if (failures) throw new Error('Some purchases could not be restored. Use the same AfroBooks account as your original purchase and try again.');
}
