/**
 * Web 2.0 Satellite Syndication & DR Link Building Engine
 * Automates publishing rich, long-form guest posts with embedded images & widgets to:
 * 1. WordPress REST API (using Application Passwords)
 * 2. Blogger API v3 (Google Blogger REST API)
 *
 * Usage:
 *   node scripts/syndicate-satellites.mjs
 */

// Uses Node.js native global fetch (Node.js 18+)

// ============================================================================
// CONFIGURATION (Set via Environment Variables or direct values)
// ============================================================================
const WORDPRESS_CONFIG = {
  enabled: String(process.env.WP_ENABLED || "").toLowerCase() === "true",
  siteUrl: (process.env.WP_SITE_URL || "").trim(), // e.g. https://mytechblog.com
  username: (process.env.WP_USERNAME || "").trim(),
  applicationPassword: (process.env.WP_APP_PASSWORD || "").trim()
};

const BLOGGER_CONFIG = {
  enabled: String(process.env.BLOGGER_ENABLED || "").toLowerCase() === "true",
  blogId: (process.env.BLOGGER_BLOG_ID || "").trim(),
  apiKey: (process.env.BLOGGER_API_KEY || "").trim(),
  clientId: (process.env.BLOGGER_CLIENT_ID || "").trim(),
  clientSecret: (process.env.BLOGGER_CLIENT_SECRET || "").trim(),
  refreshToken: (process.env.BLOGGER_REFRESH_TOKEN || "").trim(),
  accessToken: (process.env.BLOGGER_ACCESS_TOKEN || "").trim()
};

async function getBloggerAccessToken() {
  if (BLOGGER_CONFIG.clientId && BLOGGER_CONFIG.clientSecret && BLOGGER_CONFIG.refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: BLOGGER_CONFIG.clientId,
          client_secret: BLOGGER_CONFIG.clientSecret,
          refresh_token: BLOGGER_CONFIG.refreshToken,
          grant_type: "refresh_token"
        })
      });

      if (res.ok) {
        const data = await res.json();
        return data.access_token;
      } else {
        const errText = await res.text();
        console.error(`[Blogger] Dynamic token refresh failed: ${errText}`);
      }
    } catch (e) {
      console.error("[Blogger] Dynamic token refresh error:", e);
    }
  }
  return BLOGGER_CONFIG.accessToken;
}

// ============================================================================
// HIGH-QUALITY RICH ARTICLES WITH EMBEDDED IMAGES & INTERACTIVE WIDGETS
// ============================================================================
const SATELLITE_ARTICLES = [
  {
    title: "The Definitive 2026 Manual for Zero-MDR Merchant UPI QR Code Implementation in India",
    summary: "An authoritative guide for merchants, retailers, clinics, and freelancers on deploying zero-commission UPI QR payment standees, understanding NPCI URI protocols, and eliminating 2% payment gateway MDR fees.",
    content: `
      <article style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.8; color: #0f172a; max-width: 860px; margin: 0 auto; padding: 12px;">
        
        <figure style="margin: 0 0 28px 0; text-align: center;">
          <img 
            src="https://www.proupiqr.in/images/og-image.png" 
            alt="Universal Peer-to-Peer UPI Payment QR Poster Builder" 
            style="width: 100%; max-width: 820px; height: auto; border-radius: 16px; box-shadow: 0 12px 32px rgba(15,23,42,0.12); border: 1px solid #e2e8f0;"
          />
          <figcaption style="font-size: 13px; color: #64748b; margin-top: 10px; font-weight: 500;">
            Figure 1: High-Resolution Universal Peer-to-Peer UPI Payment QR Standee Builder
          </figcaption>
        </figure>

        <h2>1. Executive Summary & Financial Analysis</h2>
        <p>As digital payment penetration reaches record highs across tier-1, tier-2, and rural Indian markets, small businesses, medical clinics, restaurants, and freelance consultants face a critical operational decision: how to collect digital payments efficiently without surrendering margin to financial intermediaries.</p>
        <p>Traditional Point-of-Sale (POS) card swipe terminals and commercial payment gateways typically charge a <strong>1.5% to 2.5% Merchant Discount Rate (MDR)</strong> per transaction, plus monthly device rental fees ranging from ₹300 to ₹1,000. For a business processing ₹3,000,000 annually, credit/debit MDR charges silently consume upwards of <strong>₹45,000 to ₹75,000 in gross margin</strong> every year.</p>

        <div style="overflow-x: auto; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <thead>
              <tr style="background: #0f172a; color: #ffffff;">
                <th style="padding: 14px 18px;">Payment Channel</th>
                <th style="padding: 14px 18px;">Transaction Fee (MDR)</th>
                <th style="padding: 14px 18px;">Settlement Speed</th>
                <th style="padding: 14px 18px;">Hardware & Rental Costs</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 14px 18px; font-weight: 600;">Credit Cards / POS Machines</td>
                <td style="padding: 14px 18px; color: #dc2626; font-weight: 600;">1.8% – 2.5%</td>
                <td style="padding: 14px 18px;">T+1 to T+2 Business Days</td>
                <td style="padding: 14px 18px;">₹300 – ₹1,000 / month</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 14px 18px; font-weight: 600;">Payment Gateway Links</td>
                <td style="padding: 14px 18px; color: #dc2626; font-weight: 600;">2.0% + GST</td>
                <td style="padding: 14px 18px;">T+2 Business Days</td>
                <td style="padding: 14px 18px;">Setup & Maintenance Cuts</td>
              </tr>
              <tr style="background: #f0fdf4;">
                <td style="padding: 14px 18px; font-weight: 700; color: #166534;">Direct Universal UPI QR</td>
                <td style="padding: 14px 18px; color: #166534; font-weight: 700;">0.0% (Zero MDR)</td>
                <td style="padding: 14px 18px; color: #166534; font-weight: 700;">Instant Bank Credit</td>
                <td style="padding: 14px 18px; color: #166534; font-weight: 700;">₹0 (Print Once, Own Forever)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>2. Technical Architecture of the NPCI <code>upi://pay</code> Protocol</h2>
        <p>National Payments Corporation of India (NPCI) defines an open standard protocol for initiating peer-to-peer and peer-to-merchant transfers. When a customer opens Google Pay, PhonePe, Paytm, BHIM, or any banking application and scans a QR code, the camera parses a standard URI string structured as follows:</p>

        <pre style="background: #0f172a; color: #38bdf8; padding: 18px; border-radius: 12px; font-size: 13px; overflow-x: auto; line-height: 1.6;">upi://pay?pa=merchant@sbi&pn=Store%20Name&am=250.00&cu=INR&tn=Invoice%201042</pre>

        <h3>Key Key-Value Parameters Explained:</h3>
        <ul>
          <li><code>pa</code> (Payee Address): Your registered Virtual Payment Address (VPA) linked directly to your bank account (e.g. <code>storename@sbi</code>, <code>9876543210@paytm</code>).</li>
          <li><code>pn</code> (Payee Name): The verified legal or business name displayed on the customer's payment confirmation screen.</li>
          <li><code>am</code> (Amount): Optional fixed transaction value in INR. If omitted, the customer manually inputs the billing total.</li>
          <li><code>cu</code> (Currency): Always <code>INR</code> for domestic Indian UPI transactions.</li>
          <li><code>tn</code> (Transaction Note): Optional bill reference, table number, or invoice ID.</li>
        </ul>

        <blockquote style="background: #f8fafc; border-left: 4px solid #10b981; padding: 16px 22px; margin: 24px 0; border-radius: 0 12px 12px 0; font-size: 15px;">
          <strong>Technical Insight:</strong> Universal QR codes do not restrict payment acceptance to a single provider app. A single vector QR standee rendered with standard <code>upi://pay</code> parameters accepts incoming payments seamlessly from <strong>Google Pay, PhonePe, Paytm, BHIM, Mobikwik, WhatsApp Pay, and all major Indian banking apps</strong>.
        </blockquote>

        <h2>3. Try the Live Interactive Standee Builder</h2>
        <p>Use the live embedded builder below to generate your customized high-resolution payment poster right inside this guide:</p>

        <div style="margin: 28px 0;">
          <iframe 
            src="https://www.proupiqr.in/embed" 
            width="100%" 
            height="540" 
            frameborder="0" 
            style="border: 1px solid #cbd5e1; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); overflow: hidden;"
          ></iframe>
          <p style="font-size: 13px; text-align: center; margin-top: 12px; color: #64748b;">
            Powered by <a href="https://www.proupiqr.in/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold; text-decoration: underline;">Pro UPI QR Standee Generator Suite</a>
          </p>
        </div>

        <h2>4. Major Bank VPA Handle Reference Matrix</h2>
        <p>Whether you bank with State Bank of India, HDFC Bank, ICICI Bank, or Axis Bank, your account has an assigned VPA handle structure. Ensure your payee VPA matches one of the standard bank syntax handles:</p>

        <div style="overflow-x: auto; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <thead>
              <tr style="background: #f8fafc;">
                <th style="padding: 12px 16px; border-bottom: 2px solid #e2e8f0;">Bank / UPI Provider</th>
                <th style="padding: 12px 16px; border-bottom: 2px solid #e2e8f0;">Standard VPA Suffixes</th>
                <th style="padding: 12px 16px; border-bottom: 2px solid #e2e8f0;">Dedicated Generator Tool</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: 600;">State Bank of India (SBI)</td>
                <td style="padding: 12px 16px;"><code>@sbi</code>, <code>@oksbi</code></td>
                <td style="padding: 12px 16px;"><a href="https://www.proupiqr.in/sbi-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">SBI QR Generator &rarr;</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: 600;">PhonePe Payments</td>
                <td style="padding: 12px 16px;"><code>@ybl</code>, <code>@ibl</code>, <code>@axl</code></td>
                <td style="padding: 12px 16px;"><a href="https://www.proupiqr.in/phonepe-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">PhonePe QR Generator &rarr;</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: 600;">Google Pay (GPay)</td>
                <td style="padding: 12px 16px;"><code>@okhdfcbank</code>, <code>@okicici</code>, <code>@okaxis</code></td>
                <td style="padding: 12px 16px;"><a href="https://www.proupiqr.in/google-pay-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">Google Pay Builder &rarr;</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: 600;">Paytm Payments Bank</td>
                <td style="padding: 12px 16px;"><code>@paytm</code></td>
                <td style="padding: 12px 16px;"><a href="https://www.proupiqr.in/paytm-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">Paytm QR Builder &rarr;</a></td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>5. Print Production & Acrylic Counter Standee Specifications</h2>
        <p>To guarantee frictionless scanning under varying store illumination and customer camera distances, follow these professional printing guidelines:</p>

        <ol>
          <li><strong>Paper Weight & Finish:</strong> Print on <strong>220+ GSM heavy cardstock or photo paper</strong> with a matte or non-reflective gloss lamination. Heavy glossy lamination causes camera lens glare under ceiling spotlights, increasing scan failure rates.</li>
          <li><strong>Dimensions & Scan Distance Ratio:</strong> Use an optimal 1:10 ratio between QR symbol size and scanning distance. For a billing counter where customers scan from 3 feet away, the printed QR code square must measure at least <strong>8 cm x 8 cm (3.15" x 3.15")</strong>.</li>
          <li><strong>Display Hardware:</strong> Mount the printed QR poster inside a <strong>T-shape or L-shape vertical A5 acrylic display standee</strong>. Keep the display at chest level (approx. 4 feet from the floor) adjacent to the billing machine.</li>
        </ol>

        <h2>6. Specialized Merchant Utility Hub</h2>
        <p>Explore dedicated utilities for specific business workflows:</p>
        <p>
          🔹 <a href="https://www.proupiqr.in/bulk-qr/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Printable A4 Bulk QR Sticker Sheet Builder</a> — Generate 6 to 12 sticker tiles per page for multi-counter checkouts.<br/>
          🔹 <a href="https://www.proupiqr.in/gst-calculator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Free GST Tax Calculator with QR Code Generator</a> — Calculate 5%, 12%, 18%, 28% tax and generate payment QRs instantly.<br/>
          🔹 <a href="https://www.proupiqr.in/invoice-generator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Professional Client Invoice PDF Generator with Embedded UPI QR</a> — Ideal for freelancers, tuition teachers, and contractors.<br/>
          🔹 <a href="https://www.proupiqr.in/upi-calculator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">MDR Fee Savings & Payment Gateway Calculator</a> — Calculate monthly savings by switching to direct bank UPI.
        </p>

        <h2>7. Merchant Security & Anti-Tampering Checklist</h2>
        <p>Fraud prevention is vital for physical retail stores. Follow these security practices:</p>
        <ul>
          <li><strong>Daily Physical Audit:</strong> Inspect billing counter standees every morning to confirm no scammer has pasted a fake sticker QR over your authentic QR code.</li>
          <li><strong>Test Scan Before Displaying:</strong> Always scan your printed standee using a personal smartphone prior to customer placement to verify payee name and VPA accuracy.</li>
          <li><strong>SMS / Push Notifications:</strong> Enable instant bank SMS or bank app push notifications so staff verify receipt of funds before handing over goods.</li>
        </ul>
      </article>
    `
  },
  {
    title: "A4 Bulk UPI QR Code Sticker Sheet Printing Manual for Multi-Counter Retail & Restaurants",
    summary: "A practical guide for supermarkets, cloud kitchens, tuition centers, and event organizers to print multiple customized QR stickers on a single A4 sheet with vector precision.",
    content: `
      <article style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.8; color: #0f172a; max-width: 860px; margin: 0 auto; padding: 12px;">
        
        <figure style="margin: 0 0 28px 0; text-align: center;">
          <img 
            src="https://www.proupiqr.in/images/og-image.png" 
            alt="Printable Bulk A4 UPI QR Code Sticker Sheet Builder" 
            style="width: 100%; max-width: 820px; height: auto; border-radius: 16px; box-shadow: 0 12px 32px rgba(15,23,42,0.12); border: 1px solid #e2e8f0;"
          />
          <figcaption style="font-size: 13px; color: #64748b; margin-top: 10px; font-weight: 500;">
            Figure 2: A4 Printable Grid Layout for Store Counter & Table QR Stickers
          </figcaption>
        </figure>

        <h2>1. Operational Efficiency in Multi-Checkout Environments</h2>
        <p>Managing payment collection across multiple physical points of contact—such as dining tables in a restaurant, individual sales desks in a retail showroom, or delivery packages in a cloud kitchen—requires scalable printing solutions. Manually designing separate QR posters for every counter or table creates unnecessary administrative friction.</p>
        <p>By leveraging an <strong>A4 Bulk UPI QR Sticker Sheet Generator</strong>, business managers can render grid layouts containing <strong>4, 6, 8, 12, or 24 standardized QR labels</strong> on a single printable page, reducing printing costs while maintaining visual branding consistency.</p>

        <h2>2. Choosing Between Fixed-Amount & Open-Amount QR Stickers</h2>

        <div style="overflow-x: auto; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <thead>
              <tr style="background: #0f172a; color: #ffffff;">
                <th style="padding: 14px 18px;">Sticker Type</th>
                <th style="padding: 14px 18px;">Ideal Use Case</th>
                <th style="padding: 14px 18px;">Customer Experience</th>
                <th style="padding: 14px 18px;">Key Advantage</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 14px 18px; font-weight: 600;">Open-Amount Standee Sticker</td>
                <td style="padding: 14px 18px;">Kirana Counters, General Stores, Clinics</td>
                <td style="padding: 14px 18px;">Customer enters variable bill total</td>
                <td style="padding: 14px 18px; color: #166534; font-weight: 600;">Single sticker handles all customer amounts</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 14px 18px; font-weight: 600;">Fixed-Amount Product / Menu QR</td>
                <td style="padding: 14px 18px;">Combo Menus, Parking Lots, Event Entry</td>
                <td style="padding: 14px 18px;">Amount pre-filled automatically on phone</td>
                <td style="padding: 14px 18px; color: #166534; font-weight: 600;">Eliminates customer entry errors & speeds queue</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>3. Step-by-Step A4 Sheet Generation Workflow</h2>
        <ol>
          <li>Navigate to the <a href="https://www.proupiqr.in/bulk-qr/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Pro UPI QR Bulk Sticker Sheet Tool</a>.</li>
          <li>Select your preferred grid tile arrangement: <strong>2x2 (4 stickers per A4 page)</strong> for large standees, or <strong>3x4 (12 stickers per A4 page)</strong> for packaging labels.</li>
          <li>Input your merchant VPA details (e.g. <code>canteen@hdfcbank</code>) and store title.</li>
          <li>Customize theme colors to match your brand palette (e.g. emerald green, deep navy, or classic black).</li>
          <li>Download high-resolution print PDF or lossless vector SVG file.</li>
          <li>Print on self-adhesive A4 sticker sheets using any standard inkjet or laser printer.</li>
        </ol>

        <h2>4. Digital Utilities & Micro-Tools Directory</h2>
        <p>Empower your daily commercial operations with these specialized web tools:</p>
        <p>
          👉 <a href="https://www.proupiqr.in/upi-link-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: bold;">Create Clickable WhatsApp & SMS Payment Links</a> — Generate direct payment links for remote billing.<br/>
          👉 <a href="https://www.proupiqr.in/universal-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: bold;">Universal Wi-Fi, URL & Contact VCard QR Builder</a> — Generate multi-purpose promotional QR codes.<br/>
          👉 <a href="https://www.proupiqr.in/upi-qr-decoder/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: bold;">Free Client-Side UPI QR Decoder & VPA Inspector</a> — Extract underlying payee VPA details from any QR image.<br/>
          👉 <a href="https://www.proupiqr.in/upi-limits/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: bold;">2026 Bank-Wise UPI Transaction Limits Directory</a> — Check daily limits for SBI, HDFC, ICICI, and Axis.
        </p>

        <div style="margin: 32px 0; text-align: center;">
          <a href="https://www.proupiqr.in/bulk-qr/" target="_blank" rel="noopener" style="display: inline-block; background: #059669; color: white; padding: 16px 36px; border-radius: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 6px 20px rgba(5,150,105,0.35);">Open Free A4 Bulk Sticker Sheet Tool &rarr;</a>
        </div>
      </article>
    `
  }
];

// ============================================================================
// 🟢 WORDPRESS REST API PUBLISHING AUTOMATION
// ============================================================================
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function publishToWordPressXmlRpc(article) {
  const baseUrl = WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "");
  const xmlrpcEndpoint = `${baseUrl}/xmlrpc.php`;

  const xmlPayload = `<?xml version="1.0"?>
<methodCall>
  <methodName>wp.newPost</methodName>
  <params>
    <param><value><int>1</int></value></param>
    <param><value><string>${escapeXml(WORDPRESS_CONFIG.username)}</string></value></param>
    <param><value><string>${escapeXml(WORDPRESS_CONFIG.applicationPassword)}</string></value></param>
    <param>
      <value>
        <struct>
          <member><name>post_type</name><value><string>post</string></value></member>
          <member><name>post_status</name><value><string>publish</string></value></member>
          <member><name>post_title</name><value><string>${escapeXml(article.title)}</string></value></member>
          <member><name>post_content</name><value><string>${escapeXml(article.content)}</string></value></member>
          <member><name>post_excerpt</name><value><string>${escapeXml(article.summary)}</string></value></member>
        </struct>
      </value>
    </param>
  </params>
</methodCall>`;

  const res = await fetch(xmlrpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: xmlPayload
  });

  if (res.ok) {
    const text = await res.text();
    if (text.includes("<fault>") || text.includes("<error>")) {
      throw new Error(`XML-RPC fault: ${text.slice(0, 150)}`);
    }
    console.log(`[WordPress XML-RPC] ✅ Post Published Successfully!`);
    return true;
  }
  throw new Error(`HTTP ${res.status}`);
}

async function publishToWordPress(article) {
  const wpUrl = WORDPRESS_CONFIG.siteUrl;
  if (!WORDPRESS_CONFIG.enabled || !wpUrl || !wpUrl.startsWith("http")) {
    console.log("[WordPress] Syndication skipped (WP_ENABLED is false or WP_SITE_URL is not a valid HTTP URL).");
    return;
  }

  console.log(`[WordPress] Publishing article with images: "${article.title}" to ${WORDPRESS_CONFIG.siteUrl}...`);

  // Primary Method: XML-RPC (Works on free WordPress.com subdomains & shared hosting)
  try {
    const xmlrpcSuccess = await publishToWordPressXmlRpc(article);
    if (xmlrpcSuccess) return;
  } catch (xmlrpcErr) {
    console.log(`[WordPress XML-RPC] XML-RPC skipped/failed (${xmlrpcErr.message}). Trying REST API fallback...`);
  }

  // Fallback Method: REST API (/wp-json/wp/v2/posts)
  const endpoint = `${WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const authHeader = "Basic " + Buffer.from(`${WORDPRESS_CONFIG.username}:${WORDPRESS_CONFIG.applicationPassword}`).toString("base64");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({
        title: article.title,
        content: article.content,
        status: "publish",
        excerpt: article.summary
      })
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[WordPress REST API] ✅ Post Published Successfully! URL: ${data.link}`);
    } else {
      const err = await res.text();
      console.error(`[WordPress REST API] ❌ Failed to publish. Status: ${res.status}. Error: ${err}`);
    }
  } catch (error) {
    console.error(`[WordPress REST API] ❌ Request error:`, error);
  }
}

// ============================================================================
// 🟠 BLOGGER REST API PUBLISHING AUTOMATION
// ============================================================================
async function publishToBlogger(article) {
  if (!BLOGGER_CONFIG.enabled || !BLOGGER_CONFIG.blogId) {
    console.log("[Blogger] Syndication skipped (BLOGGER_ENABLED is false or not configured).");
    return;
  }

  const accessToken = await getBloggerAccessToken();
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOGGER_CONFIG.blogId}/posts/`;
  const endpoint = BLOGGER_CONFIG.apiKey ? `${url}?key=${BLOGGER_CONFIG.apiKey}` : url;
  const headers = { "Content-Type": "application/json" };
  
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  console.log(`[Blogger] Publishing post with images: "${article.title}" to Blog ID: ${BLOGGER_CONFIG.blogId}...`);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        kind: "blogger#post",
        title: article.title,
        content: article.content
      })
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[Blogger] ✅ Post Published Successfully! URL: ${data.url}`);
    } else {
      const err = await res.text();
      console.error(`[Blogger] ❌ Failed to publish. Status: ${res.status}. Error: ${err}`);
    }
  } catch (error) {
    console.error(`[Blogger] ❌ Request error:`, error);
  }
}

// ============================================================================
// MAIN EXECUTION ROUTINE
// ============================================================================
async function main() {
  console.log("==========================================================");
  console.log("🌐 Starting Satellite High-Quality Rich Post Syndication (DR Engine)");
  console.log("==========================================================");

  for (const article of SATELLITE_ARTICLES) {
    await publishToWordPress(article);
    await publishToBlogger(article);
  }

  console.log("\n✨ Satellite Syndication Run Complete!");
}

main().catch((err) => {
  console.error("Fatal error during syndication:", err);
});
