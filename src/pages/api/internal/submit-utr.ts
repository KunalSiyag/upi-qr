import type { APIRoute } from 'astro';
import { updateCheckoutSessionStatus, getCheckoutSession } from '../../../lib/kv';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { sessionId, utr } = body;

    if (!sessionId || !utr) {
      return new Response(JSON.stringify({ error: 'Missing sessionId or utr' }), { status: 400 });
    }

    const session = await getCheckoutSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
    }

    // In a production app, we would NOT mark it as paid immediately.
    // We would send an email/Telegram to the merchant, and THEY would click an API link to verify it.
    // For this MVP/Demo, we will mark it as paid instantly to show the full working flow,
    // and log the simulated notification.
    
    console.log(`\n==============================================`);
    console.log(`[SIMULATED NOTIFICATION TO MERCHANT]`);
    console.log(`Email / Telegram sent to merchant ${session.merchantId}:`);
    console.log(`"You have received a new UTR submission for Order ${session.orderId}."`);
    console.log(`"Amount: ₹${session.amount}"`);
    console.log(`"UTR: ${utr}"`);
    console.log(`==============================================\n`);

    await updateCheckoutSessionStatus(sessionId, 'paid', {
      utr: utr,
      verifiedVia: 'manual_utr'
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("Error submitting UTR:", error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
