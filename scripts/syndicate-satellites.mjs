/**
 * Web 2.0 Satellite Syndication & DR Link Building Engine
 * Automates publishing rich, long-form guest posts with embedded images & widgets to:
 * 1. WordPress REST API (using Application Passwords)
 * 2. Blogger API v3 (Google Blogger REST API)
 *
 * Usage:
 *   node scripts/syndicate-satellites.mjs
 */

import fetch from "node-fetch";

// ============================================================================
// CONFIGURATION (Set via Environment Variables or direct values)
// ============================================================================
const WORDPRESS_CONFIG = {
  enabled: process.env.WP_ENABLED === "true" || false,
  siteUrl: process.env.WP_SITE_URL || "", // e.g. https://mytechblog.com
  username: process.env.WP_USERNAME || "",
  applicationPassword: process.env.WP_APP_PASSWORD || ""
};

const BLOGGER_CONFIG = {
  enabled: process.env.BLOGGER_ENABLED === "true" || false,
  blogId: process.env.BLOGGER_BLOG_ID || "",
  apiKey: process.env.BLOGGER_API_KEY || "",
  accessToken: process.env.BLOGGER_ACCESS_TOKEN || ""
};

// ============================================================================
// HIGH-QUALITY RICH ARTICLES WITH EMBEDDED IMAGES & INTERACTIVE WIDGETS
// ============================================================================
const SATELLITE_ARTICLES = [
  {
    title: "Complete Guide to Free UPI QR Code Standee & Poster Generation for Indian Merchants",
    summary: "Comprehensive manual on how small businesses, Kirana stores, doctors, and freelancers can generate zero-MDR vector UPI QR codes for PhonePe, GPay, Paytm, and SBI.",
    content: `
      <article style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; color: #1e293b;">
        <figure style="margin: 0 0 24px 0; text-align: center;">
          <img 
            src="https://www.proupiqr.in/images/og-image.png" 
            alt="Pro UPI QR Code Generator - Free Universal Payment Standees" 
            style="width: 100%; max-width: 780px; height: auto; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;"
          />
          <figcaption style="font-size: 13px; color: #64748b; margin-top: 8px;">Figure 1: High-Resolution Universal Peer-to-Peer UPI Payment QR Poster Builder</figcaption>
        </figure>

        <h2>1. Why Zero-MDR Peer-to-Peer Payments Matter</h2>
        <p>In modern retail and service industries across India, digital payment collection is indispensable. Traditional point-of-sale (POS) machines and third-party payment gateways often levy a <strong>1.5% to 2.5% MDR (Merchant Discount Rate)</strong> fee on transactions, eating into small business profits.</p>
        <p>By leveraging NPCI's official <code>upi://pay</code> protocol, merchants can receive direct bank-to-bank funds with <strong>0% transaction fees</strong>. Any scanned payment settles instantly into your registered bank account regardless of whether the customer uses Google Pay, PhonePe, Paytm, BHIM, or WhatsApp Pay.</p>

        <blockquote style="background: #f8fafc; border-left: 4px solid #10b981; padding: 14px 20px; margin: 20px 0; border-radius: 0 12px 12px 0;">
          <strong>Pro Tip:</strong> Universal QR codes do not tie you to a single vendor soundbox rental fee. You own the vector poster permanently.
        </blockquote>

        <h2>2. Instant Embedded UPI QR Generator</h2>
        <p>Try the live interactive generator below directly inside this post to build your branded payment poster:</p>
        
        <div style="margin: 24px 0;">
          <iframe 
            src="https://www.proupiqr.in/embed" 
            width="100%" 
            height="520" 
            frameborder="0" 
            style="border: 1px solid #cbd5e1; border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); overflow: hidden;"
          ></iframe>
          <p style="font-size: 13px; text-align: center; margin-top: 10px;">
            Powered by <a href="https://www.proupiqr.in/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold; text-decoration: underline;">Pro UPI QR Code Generator Suite</a>
          </p>
        </div>

        <h2>3. Specialized Payment Generator Tools</h2>
        <p>Depending on your bank account handle or app preference, explore these dedicated micro-utilities:</p>
        <ul>
          <li><a href="https://www.proupiqr.in/phonepe-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">PhonePe Compatible UPI QR Generator</a> — Supports YBL, IBL, and AXL handles natively.</li>
          <li><a href="https://www.proupiqr.in/google-pay-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">Google Pay (GPay) Friendly QR Builder</a> — Tailored for OKSBI, OKHDFC, OKICICI, and OKAxis VPAs.</li>
          <li><a href="https://www.proupiqr.in/sbi-qr-generator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">SBI Bank UPI QR Code Standee</a> — Direct State Bank of India merchant billing posters.</li>
          <li><a href="https://www.proupiqr.in/bulk-qr/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">Printable A4 Bulk QR Sticker Sheet Builder</a> — Print 6 to 12 sticker tiles per A4 sheet for multi-counter shops.</li>
          <li><a href="https://www.proupiqr.in/gst-calculator/" target="_blank" rel="noopener" style="color: #0284c7; font-weight: 600;">GST Invoice QR Code Calculator</a> — Compute 5%, 12%, 18%, 28% GST and generate instant scan-to-pay codes.</li>
        </ul>

        <h2>4. Step-by-Step Printing & Acrylic Setup</h2>
        <ol>
          <li>Enter your registered UPI Virtual Payment Address (e.g. <code>9876543210@paytm</code> or <code>store@sbi</code>).</li>
          <li>Set optional fixed billing amounts or leave empty for dynamic customer entry.</li>
          <li>Export in high-DPI PNG or lossless vector SVG format.</li>
          <li>Print on glossy photo paper and slide into standard T-shape A5/A4 acrylic standees for your billing counter.</li>
        </ol>
      </article>
    `
  },
  {
    title: "How to Print A4 Bulk UPI QR Code Sticker Sheets for Retail Counters & Restaurants",
    summary: "Step-by-step workflow for printing multiple QR code stickers on a single A4 sheet for multi-counter billing, tables, and product packaging.",
    content: `
      <article style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; color: #1e293b;">
        <figure style="margin: 0 0 24px 0; text-align: center;">
          <img 
            src="https://www.proupiqr.in/images/og-image.png" 
            alt="Printable Bulk A4 UPI QR Code Sticker Sheet Builder" 
            style="width: 100%; max-width: 780px; height: auto; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;"
          />
          <figcaption style="font-size: 13px; color: #64748b; margin-top: 8px;">Figure 2: A4 Printable Grid Layout for Store Counter QR Stickers</figcaption>
        </figure>

        <h2>1. Simplifying Multi-Counter Payment Displays</h2>
        <p>For supermarkets, restaurants, parking lots, and events, placing individual payment QR codes on every table or checkout lane can be time-consuming. Generating bulk sticker sheets allows businesses to print 6, 8, 12, or 24 standardized QR labels in a single PDF or high-res image export.</p>

        <h2>2. Features of the Pro UPI QR Bulk Sheet Engine</h2>
        <ul>
          <li><strong>Zero Background Processing:</strong> All QR codes are rendered 100% locally inside your web browser.</li>
          <li><strong>Vector Quality Output:</strong> Crisp edges ensure scanning reliability even under low shop lighting.</li>
          <li><strong>Custom Branding:</strong> Embed your business logo, store name, and instructions directly above each sticker tile.</li>
        </ul>

        <h2>3. Explore Additional Creator & Business Tools</h2>
        <p>Boost your business checkout workflow with these free utility builders:</p>
        <p>
          👉 <a href="https://www.proupiqr.in/menu-qr-generator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Digital Restaurant Menu QR Code Generator</a><br/>
          👉 <a href="https://www.proupiqr.in/invoice-generator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Free Client Invoice Builder with Embedded UPI QR</a><br/>
          👉 <a href="https://www.proupiqr.in/upi-link-generator/" target="_blank" rel="noopener" style="color: #059669; font-weight: bold;">Create Click-to-Pay WhatsApp & SMS Payment Links</a>
        </p>

        <div style="margin: 24px 0; text-align: center;">
          <a href="https://www.proupiqr.in/bulk-qr/" target="_blank" rel="noopener" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; border-radius: 12px; font-weight: bold; text-decoration: none; box-shadow: 0 4px 14px rgba(16,185,129,0.4);">Launch Free Bulk QR Generator &rarr;</a>
        </div>
      </article>
    `
  }
];

// ============================================================================
// 🟢 WORDPRESS REST API PUBLISHING AUTOMATION
// ============================================================================
async function publishToWordPress(article) {
  if (!WORDPRESS_CONFIG.enabled || !WORDPRESS_CONFIG.siteUrl) {
    console.log("[WordPress] Syndication skipped (WP_ENABLED is false or not configured).");
    return;
  }

  const endpoint = `${WORDPRESS_CONFIG.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const authHeader = "Basic " + Buffer.from(`${WORDPRESS_CONFIG.username}:${WORDPRESS_CONFIG.applicationPassword}`).toString("base64");

  console.log(`[WordPress] Publishing article with images: "${article.title}" to ${WORDPRESS_CONFIG.siteUrl}...`);

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
      console.log(`[WordPress] ✅ Post Published Successfully! URL: ${data.link}`);
    } else {
      const err = await res.text();
      console.error(`[WordPress] ❌ Failed to publish. Status: ${res.status}. Error: ${err}`);
    }
  } catch (error) {
    console.error(`[WordPress] ❌ Request error:`, error);
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

  const endpoint = `https://www.googleapis.com/blogger/v3/blogs/${BLOGGER_CONFIG.blogId}/posts/?key=${BLOGGER_CONFIG.apiKey}`;
  const headers = { "Content-Type": "application/json" };
  
  if (BLOGGER_CONFIG.accessToken) {
    headers["Authorization"] = `Bearer ${BLOGGER_CONFIG.accessToken}`;
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
