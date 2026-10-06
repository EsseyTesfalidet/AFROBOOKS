import { Impersonated, JWT, OAuth2Client, type AuthClient } from 'google-auth-library';
import { PLAY_PACKAGE } from '@/lib/watch/play';
import { WatchError } from './watchErrors';

export interface PlayPurchase {
  productLineItem?: { productId?: string; productOfferDetails?: { quantity?: number; refundableQuantity?: number; consumptionState?: string; rentOfferDetails?: unknown; preorderOfferDetails?: unknown } }[];
  purchaseStateContext?: { purchaseState?: string };
  testPurchaseContext?: { fopType?: string };
  obfuscatedExternalAccountId?: string;
  acknowledgementState?: string;
  orderId?: string;
}
export interface PlayClient {
  purchase(token: string): Promise<PlayPurchase>;
  acknowledge(productId: string, token: string): Promise<void>;
  order?(orderId: string): Promise<PlayOrder>;
  product?(productId: string): Promise<PlayProduct>;
}
export interface PlayMoney { currencyCode?: string; units?: string; nanos?: number }
export interface PlayOrder {
  orderId?: string;
  purchaseToken?: string;
  state?: string;
  lastEventTime?: string;
  lineItems?: { productId?: string }[];
  developerRevenueInBuyerCurrency?: PlayMoney;
}
export interface PlayProduct {
  packageName?: string;
  productId?: string;
  purchaseOptions?: { state?: string; buyOption?: { multiQuantityEnabled?: boolean }; rentOption?: unknown }[];
}
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
export function playConfigured() {
  return !!(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT));
}
let cached: { raw: string; target: string; client: AuthClient } | undefined;
export function getPlayAuthClient(): AuthClient {
  // Impersonation uses the already configured server identity to mint temporary
  // billing credentials. Never fall back to billing as the Firebase identity.
  const direct = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  const target = direct ? '' : (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || '').trim();
  const raw = direct || (target ? process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT : undefined);
  if (!raw) throw new WatchError(503, 'Google Play verification is not configured yet.');
  if (cached?.raw === raw && cached.target === target) return cached.client;
  try {
    const credentials = JSON.parse(raw);
    if (typeof credentials.client_email !== 'string' || !credentials.client_email || typeof credentials.private_key !== 'string' || !credentials.private_key) throw new Error();
    if (target && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(target)) throw new Error();
    // Only consume the key and email, never arbitrary endpoints from JSON.
    const source = new JWT({
      email: credentials.client_email, key: credentials.private_key.replace(/\\n/g, '\n'),
      scopes: [target ? 'https://www.googleapis.com/auth/cloud-platform' : PLAY_SCOPE],
      transporterOptions: { timeout: 15000 },
    });
    const client = target ? new Impersonated({ sourceClient: source, targetPrincipal: target, targetScopes: [PLAY_SCOPE], lifetime: 3600 }) : source;
    cached = { raw, target, client };
    return client;
  } catch { throw new WatchError(503, 'Google Play verification is not configured correctly.'); }
}
async function request<T>(path: string, body?: object): Promise<T> {
  try {
    const client = getPlayAuthClient();
    const response = await client.request<T>({
      url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/${path}`,
      method: body ? 'POST' : 'GET', ...(body ? { data: body } : {}), timeout: 15000,
    });
    return response.data;
  } catch (error) {
    if (error instanceof WatchError) throw error;
    // Google errors can contain the purchase token in the URL. Never log them.
    throw new WatchError(502, 'Google Play could not verify this purchase. Please restore purchases or try again shortly.');
  }
}
export const playApiRequest = request;
export const googlePlay: PlayClient = {
  purchase: token => request<PlayPurchase>(`purchases/productsv2/tokens/${encodeURIComponent(token)}`),
  acknowledge: async (productId, token) => { await request(`purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, {}); },
  order: orderId => request<PlayOrder>(`orders/${encodeURIComponent(orderId)}`),
  product: productId => request<PlayProduct>(`oneTimeProducts/${encodeURIComponent(productId)}`),
};
export async function verifyPlayNotification(authorization: string | null) {
  return verifyGooglePush(authorization, process.env.GOOGLE_PLAY_RTDN_AUDIENCE, process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL);
}
export async function verifyGooglePush(authorization: string | null, audience: string | undefined, email: string | undefined) {
  if (!audience || !email) throw new WatchError(503, 'Play notifications are not configured.');
  if (!authorization?.startsWith('Bearer ')) throw new WatchError(401, 'Notification authentication required.');
  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: authorization.slice(7), audience });
    const payload = ticket.getPayload();
    if (payload?.email !== email || payload.email_verified !== true) throw new Error();
  } catch { throw new WatchError(401, 'Notification authentication failed.'); }
}
