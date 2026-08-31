import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { getMerchantByKey, createCheckoutSession, type CheckoutSession } from '../../../../lib/kv';
import { jsonResponse, parseInrToPaise, readJsonObject, RequestBodyError, safePublicHttpsUrl, validMerchantApiKey, validOrderId, validVpa } from '../../../../lib/apiSecurity';
import { consumeRateLimit, rateLimitHeaders } from '../../../../lib/rateLimit';

export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header.' }, 401);
    }

    const apiKey = authHeader.slice(7).trim();
    if (!validMerchantApiKey(apiKey)) return jsonResponse({ error: 'Invalid API key.' }, 401);
    const merchant = await getMerchantByKey(apiKey);
    if (!merchant) return jsonResponse({ error: 'Invalid API key.' }, 401);
    if (!validVpa(merchant.vpa || '')) return jsonResponse({ error: 'Configure a valid merchant UPI ID before creating checkout sessions.' }, 409);

    const rateLimit = await consumeRateLimit('checkout-create', merchant.id, 60, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: 'Checkout session rate limit exceeded.' }, 429, rateLimitHeaders(rateLimit));

    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request, 8192);
    } catch (error) {
      if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
      return jsonResponse({ error: 'Request body must be a JSON object.' }, 400);
    }
    const { order_id, amount, currency = 'INR', redirect_url } = body;
    const orderId = typeof order_id === 'string' ? order_id.trim() : '';
    const amountPaise = parseInrToPaise(amount);
    const redirectUrl = safePublicHttpsUrl(redirect_url);

    if (!validOrderId(orderId)) return jsonResponse({ error: 'Provide a valid order_id using letters, numbers, dots, colons, underscores, or hyphens.' }, 400);
    if (amountPaise === null) return jsonResponse({ error: 'Provide a positive INR amount with no more than two decimal places.' }, 400);
    if (currency !== 'INR') return jsonResponse({ error: 'Only INR checkout sessions are supported.' }, 400);
    if (!redirectUrl) return jsonResponse({ error: 'redirect_url must be a public HTTPS URL.' }, 400);

    const sessionId = `cs_live_${randomBytes(18).toString('hex')}`;
    const checkoutUrl = new URL(`/c/${sessionId}/`, url.origin).toString();

    const session: CheckoutSession = {
      id: sessionId,
      merchantId: merchant.id,
      merchantName: merchant.name.trim().slice(0, 80) || 'Merchant',
      merchantVpa: merchant.vpa,
      orderId,
      amountPaise,
      currency: 'INR',
      status: 'open',
      checkoutUrl,
      redirectUrl,
      createdAt: Date.now()
    };

    const savedSession = await createCheckoutSession(session);
    const created = savedSession.id === session.id;
    if (!created && (
      savedSession.amountPaise !== session.amountPaise
      || savedSession.redirectUrl !== session.redirectUrl
      || savedSession.merchantVpa !== session.merchantVpa
    )) {
      return jsonResponse({ error: 'This order_id already belongs to a checkout with different payment details.' }, 409);
    }

    return jsonResponse({
      id: savedSession.id,
      status: savedSession.status,
      checkout_url: savedSession.checkoutUrl
    }, created ? 201 : 200);
  } catch {
    return jsonResponse({ error: 'Checkout service is unavailable.' }, 503);
  }
};
