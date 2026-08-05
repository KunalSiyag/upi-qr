import { kv } from '@vercel/kv';

export interface Merchant {
  id: string;
  name: string;
  apiKey: string;
  vpa?: string; // For manual mode
  razorpayKeyId?: string; // For automated mode
  razorpayKeySecret?: string;
  webhookUrl?: string; // Where we send the clean webhook to the merchant
  clerkUserId?: string; // Links this merchant to a Clerk authentication account
}

export interface CheckoutSession {
  id: string;
  merchantId: string;
  orderId: string;
  amount: number; // in INR
  currency: string;
  status: 'open' | 'paid' | 'failed';
  checkoutUrl: string;
  redirectUrl: string;
  customerName?: string;
  customerEmail?: string;
  utr?: string;
  verifiedVia?: 'automated_gateway' | 'manual_utr';
  createdAt: number;
}

export const getMerchantByKey = async (apiKey: string): Promise<Merchant | null> => {
  try {
    return await kv.get<Merchant>(`merchant_key:${apiKey}`);
  } catch (error) {
    console.error("KV Error getMerchantByKey:", error);
    return null;
  }
};

export const getMerchantByUserId = async (clerkUserId: string): Promise<Merchant | null> => {
  try {
    const apiKey = await kv.get<string>(`clerk_user:${clerkUserId}`);
    if (!apiKey) return null;
    return await getMerchantByKey(apiKey);
  } catch (error) {
    console.error("KV Error getMerchantByUserId:", error);
    return null;
  }
};

export const createMerchant = async (merchant: Merchant): Promise<void> => {
  try {
    await kv.set(`merchant_key:${merchant.apiKey}`, merchant);
    if (merchant.clerkUserId) {
      await kv.set(`clerk_user:${merchant.clerkUserId}`, merchant.apiKey);
    }
  } catch (error) {
    console.error("KV Error createMerchant:", error);
  }
};

export const createCheckoutSession = async (session: CheckoutSession): Promise<void> => {
  try {
    // Expire session after 24 hours (86400 seconds)
    await kv.set(`checkout_session:${session.id}`, session, { ex: 86400 });
  } catch (error) {
    console.error("KV Error createCheckoutSession:", error);
  }
};

export const getCheckoutSession = async (id: string): Promise<CheckoutSession | null> => {
  try {
    return await kv.get<CheckoutSession>(`checkout_session:${id}`);
  } catch (error) {
    console.error("KV Error getCheckoutSession:", error);
    return null;
  }
};

export const updateCheckoutSessionStatus = async (
  id: string, 
  status: CheckoutSession['status'], 
  details?: { utr?: string, verifiedVia?: CheckoutSession['verifiedVia'] }
): Promise<CheckoutSession | null> => {
  try {
    const session = await getCheckoutSession(id);
    if (!session) return null;
    
    session.status = status;
    if (details?.utr) session.utr = details.utr;
    if (details?.verifiedVia) session.verifiedVia = details.verifiedVia;
    
    // Maintain the TTL by just updating the value
    await kv.set(`checkout_session:${id}`, session, { ex: 86400 });
    return session;
  } catch (error) {
    console.error("KV Error updateCheckoutSessionStatus:", error);
    return null;
  }
};

// Seed a dummy merchant for testing our API
export const seedTestMerchant = async () => {
  const testMerchant: Merchant = {
    id: "m_test_123",
    name: "Test Merchant",
    apiKey: "puqi_test_12345",
    vpa: "testmerchant@ybl",
  };
  await kv.set(`merchant_key:${testMerchant.apiKey}`, testMerchant);
  console.log("Seeded test merchant with API Key: puqi_test_12345");
};
