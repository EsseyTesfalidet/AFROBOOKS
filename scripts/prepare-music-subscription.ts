// Creates an inactive Play product only; never enables real purchases.
import { loadEnvConfig } from '@next/env';
import { getPlayAuthClient } from '../lib/server/watchPlayClient';
import { MUSIC_PRODUCT, MUSIC_BASE_PLAN } from '../lib/music/policy';
import { PLAY_PACKAGE } from '../lib/watch/play';
type Money = { currencyCode: string; units: string; nanos?: number };
async function main() {
  loadEnvConfig(process.cwd()); const client = getPlayAuthClient();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}`;
  const existing = await client.request<{ subscriptions?: { productId: string }[] }>({ url: `${base}/subscriptions`, method: 'GET', timeout: 15000 });
  if (existing.data.subscriptions?.some(item => item.productId === MUSIC_PRODUCT)) { console.log('Music subscription already exists. No changes made.'); return; }
  const prices = await client.request<{ convertedRegionPrices: Record<string, { regionCode: string; price: Money }>; regionVersion: { version: string } }>({ url: `${base}/pricing:convertRegionPrices`, method: 'POST', data: { price: { currencyCode: 'USD', units: '2', nanos: 990000000 } }, timeout: 15000 });
  if (!prices.data.regionVersion?.version || !prices.data.convertedRegionPrices?.US) throw new Error('Regional prices are unavailable.');
  const regionalConfigs = Object.values(prices.data.convertedRegionPrices).map(row => ({ regionCode: row.regionCode, price: row.regionCode === 'US' ? { currencyCode: 'USD', units: '2', nanos: 990000000 } : row.price, newSubscriberAvailability: true }));
  const result = await client.request<{ productId: string; basePlans: { state: string }[] }>({ url: `${base}/subscriptions`, method: 'POST', params: { productId: MUSIC_PRODUCT, 'regionsVersion.version': prices.data.regionVersion.version }, data: {
    packageName: PLAY_PACKAGE, productId: MUSIC_PRODUCT,
    listings: [{ languageCode: 'en-US', title: 'AfroBooks Music', description: 'Listen to all participating music in AfroBooks. Renews monthly until cancelled. Separately sold podcasts and audiobooks are not included.', benefits: ['Access participating music', 'Listen in AfroBooks', 'Cancel in Google Play'] }],
    basePlans: [{ basePlanId: MUSIC_BASE_PLAN, regionalConfigs, autoRenewingBasePlanType: { billingPeriodDuration: 'P1M', gracePeriodDuration: 'P3D', legacyCompatible: true } }],
  }, timeout: 30000 });
  console.log(JSON.stringify({ productId: result.data.productId, states: result.data.basePlans.map(plan => plan.state), regionalPrices: regionalConfigs.length, usPrice: '2.99 USD/month' }));
}
main().catch(error => { console.error('Music draft was not created.', { status: (error as { response?: { status?: number } }).response?.status || 'unavailable' }); process.exitCode = 1; });
