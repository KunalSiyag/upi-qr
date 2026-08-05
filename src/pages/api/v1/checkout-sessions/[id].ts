import type { APIRoute } from 'astro';
import { getMerchantByKey, getCheckoutSession } from '../../../../lib/kv';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
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

    // 2. Get Session
    const id = params.id;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing session ID' }), { status: 400 });
    }

    const session = await getCheckoutSession(id);

    if (!session || session.merchantId !== merchant.id) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
    }

    // 3. Return Session status
    return new Response(JSON.stringify({
      id: session.id,
      status: session.status,
      order_id: session.orderId,
      payment_details: {
        utr: session.utr || null,
        verified_via: session.verifiedVia || null
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Error fetching checkout session:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
