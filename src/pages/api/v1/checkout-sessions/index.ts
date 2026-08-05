import type { APIRoute } from 'astro';
import { v4 as uuidv4 } from 'uuid';
import { getMerchantByKey, createCheckoutSession, type CheckoutSession } from '../../../../lib/kv';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  try {
    // 1. Authenticate Merchant
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401 });
    }
    
    const apiKey = authHeader.split(' ')[1];
    const merchant = await getMerchantByKey(apiKey);
    
    if (!merchant) {
      return new Response(JSON.stringify({ error: 'Invalid API Key' }), { status: 401 });
    }

    // 2. Parse payload
    const body = await request.json();
    const { order_id, amount, currency = 'INR', customer, redirect_url } = body;

    if (!order_id || !amount || !redirect_url) {
      return new Response(JSON.stringify({ error: 'Missing required fields: order_id, amount, redirect_url' }), { status: 400 });
    }

    // 3. Create Session
    const sessionId = `cs_live_${uuidv4().replace(/-/g, '')}`;
    const checkoutUrl = new URL(`/c/${sessionId}`, url.origin).toString();

    const session: CheckoutSession = {
      id: sessionId,
      merchantId: merchant.id,
      orderId: order_id,
      amount: Number(amount),
      currency: currency,
      status: 'open',
      checkoutUrl: checkoutUrl,
      redirectUrl: redirect_url,
      customerName: customer?.name,
      customerEmail: customer?.email,
      createdAt: Date.now()
    };

    await createCheckoutSession(session);

    // 4. Return Session
    return new Response(JSON.stringify({
      id: session.id,
      status: session.status,
      checkout_url: session.checkoutUrl
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
