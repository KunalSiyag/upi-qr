import { kv } from '@vercel/kv';
import { createHash } from 'node:crypto';

export interface Merchant {
  id: string;
  name: string;
  apiKey: string;
  vpa?: string; // For manual mode
  clerkUserId?: string; // Links this merchant to a Clerk authentication account
}

export interface CheckoutSession {
  id: string;
  merchantId: string;
  orderId: string;
  amountPaise?: number;
  amount?: number; // Legacy sessions stored rupees as a floating-point number.
  currency: 'INR';
  status: 'open' | 'verification_pending' | 'paid' | 'failed';
  checkoutUrl: string;
  redirectUrl: string;
  merchantName?: string;
  merchantVpa?: string;
  submittedUtr?: string;
  utrSubmittedAt?: number;
  utr?: string;
  verifiedVia?: 'automated_gateway' | 'merchant_confirmation';
  verifiedAt?: number;
  createdAt: number;
}

export const getMerchantByKey = async (apiKey: string): Promise<Merchant | null> => {
  if (apiKey === "puqi_test_12345") return null;
  return await kv.get<Merchant>(`merchant_key:${apiKey}`);
};

export const getMerchantByUserId = async (clerkUserId: string): Promise<Merchant | null> => {
  const apiKey = await kv.get<string>(`clerk_user:${clerkUserId}`);
  if (!apiKey) return null;
  return await getMerchantByKey(apiKey);
};

export const createMerchant = async (merchant: Merchant): Promise<void> => {
  await kv.set(`merchant_key:${merchant.apiKey}`, merchant);
  if (merchant.clerkUserId) {
    await kv.set(`clerk_user:${merchant.clerkUserId}`, merchant.apiKey);
  }
};

export const createMerchantIfAbsent = async (merchant: Merchant): Promise<Merchant> => {
  if (!merchant.clerkUserId) throw new Error("Clerk user ID is required");
  const script = `
    local existing = redis.call('GET', KEYS[1])
    if existing then return existing end
    redis.call('SET', KEYS[2], ARGV[2])
    redis.call('SET', KEYS[1], ARGV[1])
    return ARGV[1]
  `;
  const apiKey = await kv.eval<string[], string>(
    script,
    [`clerk_user:${merchant.clerkUserId}`, `merchant_key:${merchant.apiKey}`],
    [merchant.apiKey, JSON.stringify(merchant)],
  );
  if (apiKey === merchant.apiKey) return merchant;
  const existing = await getMerchantByKey(apiKey);
  if (!existing) throw new Error("Merchant profile mapping is invalid");
  return existing;
};

function checkoutOrderKey(session: CheckoutSession): string {
  const digest = createHash('sha256').update(`${session.merchantId}:${session.orderId}`).digest('hex');
  return `checkout_order:${digest}`;
}

function parseCheckoutSession(value: unknown): CheckoutSession | null {
  if (!value) return null;
  if (typeof value === 'object') return value as CheckoutSession;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value) as CheckoutSession; } catch { return null; }
}

export const createCheckoutSession = async (session: CheckoutSession): Promise<CheckoutSession> => {
  const script = `
    local existing_id = redis.call('GET', KEYS[2])
    if existing_id then
      local existing = redis.call('GET', ARGV[3] .. existing_id)
      if existing then return existing end
      redis.call('DEL', KEYS[2])
    end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
    redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[4])
    return ARGV[2]
  `;
  const value = await kv.eval<string[], unknown>(
    script,
    [`checkout_session:${session.id}`, checkoutOrderKey(session)],
    [session.id, JSON.stringify(session), 'checkout_session:', '86400'],
  );
  const saved = parseCheckoutSession(value);
  if (!saved) throw new Error("Checkout session could not be created");
  return saved;
};

export const getCheckoutSession = async (id: string): Promise<CheckoutSession | null> => {
  return await kv.get<CheckoutSession>(`checkout_session:${id}`);
};

export const updateCheckoutSessionStatus = async (
  id: string, 
  status: CheckoutSession['status'], 
  details?: { utr?: string, verifiedVia?: CheckoutSession['verifiedVia'] }
): Promise<CheckoutSession | null> => {
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return nil end
    local ttl = redis.call('TTL', KEYS[1])
    if ttl <= 0 then return nil end
    local session = cjson.decode(raw)
    if session.status == 'paid' or session.status == 'failed' then return nil end
    session.status = ARGV[1]
    if ARGV[2] ~= '' then session.utr = ARGV[2] end
    if ARGV[3] ~= '' then session.verifiedVia = ARGV[3] end
    session.verifiedAt = tonumber(ARGV[4])
    local encoded = cjson.encode(session)
    redis.call('SET', KEYS[1], encoded, 'EX', ttl)
    return encoded
  `;
  const value = await kv.eval<string[], unknown>(
    script,
    [`checkout_session:${id}`],
    [status, details?.utr || '', details?.verifiedVia || '', String(Date.now())],
  );
  return parseCheckoutSession(value);
};

export const submitCheckoutUtr = async (id: string, utr: string): Promise<CheckoutSession | null> => {
  const script = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return nil end
    local ttl = redis.call('TTL', KEYS[1])
    if ttl <= 0 then return nil end
    local session = cjson.decode(raw)
    if session.status ~= 'open' then return nil end
    session.status = 'verification_pending'
    session.submittedUtr = ARGV[1]
    session.utrSubmittedAt = tonumber(ARGV[2])
    local encoded = cjson.encode(session)
    redis.call('SET', KEYS[1], encoded, 'EX', ttl)
    return encoded
  `;
  const value = await kv.eval<string[], unknown>(
    script,
    [`checkout_session:${id}`],
    [utr, String(Date.now())],
  );
  return parseCheckoutSession(value);
};
