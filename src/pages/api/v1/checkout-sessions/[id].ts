import type { APIRoute } from 'astro';
import { getMerchantByKey, getCheckoutSession, updateCheckoutSessionStatus } from '../../../../lib/kv';
import { jsonResponse, readJsonObject, RequestBodyError, validCheckoutSessionId, validMerchantApiKey, validUtr } from '../../../../lib/apiSecurity';
import { consumeRateLimit, rateLimitHeaders } from '../../../../lib/rateLimit';

export const prerender = false;

async function authenticatedMerchant(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const apiKey = authHeader.slice(7).trim();
  return validMerchantApiKey(apiKey) ? getMerchantByKey(apiKey) : null;
}

export const GET: APIRoute = async ({ request, params }) => {
  try {
    const merchant = await authenticatedMerchant(request);
    if (!merchant) return jsonResponse({ error: 'Invalid or missing API key.' }, 401);

    const rateLimit = await consumeRateLimit('checkout-read', merchant.id, 240, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: 'Too many requests.' }, 429, rateLimitHeaders(rateLimit));

    const id = params.id;
    if (!validCheckoutSessionId(id)) return jsonResponse({ error: 'Invalid session ID.' }, 400);

    const session = await getCheckoutSession(id);
    if (!session || session.merchantId !== merchant.id) return jsonResponse({ error: 'Session not found.' }, 404);
    return jsonResponse({
      id: session.id,
      status: session.status,
      order_id: session.orderId,
      payment_details: {
        submitted_utr: session.submittedUtr || null,
        submitted_at: session.utrSubmittedAt || null,
        utr: session.utr || null,
        verified_via: session.verifiedVia || null,
        verified_at: session.verifiedAt || null,
      }
    });
  } catch {
    return jsonResponse({ error: 'Checkout service is unavailable.' }, 503);
  }
};

export const PATCH: APIRoute = async ({ request, params }) => {
  try {
    const merchant = await authenticatedMerchant(request);
    if (!merchant) return jsonResponse({ error: 'Invalid or missing API key.' }, 401);

    const rateLimit = await consumeRateLimit('checkout-update', merchant.id, 120, 3600);
    if (!rateLimit.allowed) return jsonResponse({ error: 'Too many updates.' }, 429, rateLimitHeaders(rateLimit));

    const id = params.id;
    if (!validCheckoutSessionId(id)) return jsonResponse({ error: 'Invalid session ID.' }, 400);
    const session = await getCheckoutSession(id);
    if (!session || session.merchantId !== merchant.id) return jsonResponse({ error: 'Session not found.' }, 404);
    if (session.status === 'paid' || session.status === 'failed') {
      return jsonResponse({ error: `Session is already finalized as ${session.status}.` }, 409);
    }

    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request, 4096);
    } catch (error) {
      if (error instanceof RequestBodyError) return jsonResponse({ error: error.message }, error.status);
      return jsonResponse({ error: 'Request body must be a JSON object.' }, 400);
    }
    if (body.confirmed !== true || (body.status !== 'paid' && body.status !== 'failed')) {
      return jsonResponse({ error: 'Set confirmed=true and status to paid or failed after checking your bank or gateway.' }, 400);
    }

    const submittedReference = typeof body.utr === 'string' ? body.utr.trim() : session.submittedUtr;
    if (submittedReference && !validUtr(submittedReference)) return jsonResponse({ error: 'Invalid transaction reference.' }, 400);

    const updated = await updateCheckoutSessionStatus(id, body.status, {
      utr: body.status === 'paid' ? submittedReference : undefined,
      verifiedVia: 'merchant_confirmation',
    });
    if (!updated) {
      const current = await getCheckoutSession(id);
      if (current?.merchantId === merchant.id && (current.status === 'paid' || current.status === 'failed')) {
        return jsonResponse({ error: `Session is already finalized as ${current.status}.` }, 409);
      }
      return jsonResponse({ error: 'Session not found.' }, 404);
    }
    return jsonResponse({ id: updated.id, status: updated.status, verified_at: updated.verifiedAt });
  } catch {
    return jsonResponse({ error: 'Checkout service is unavailable.' }, 503);
  }
};
