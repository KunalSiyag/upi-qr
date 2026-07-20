import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const staticPages = [
  "",
  "phonepe-qr-generator",
  "google-pay-qr-generator",
  "paytm-qr-generator",
  "donation-qr-generator",
  "universal-qr-generator",
  "bhim-qr-generator",
  "whatsapp-pay-qr-generator",
  "amazon-pay-qr-generator",
  "sbi-qr-generator",
  "hdfc-qr-generator",
  "icici-qr-generator",
  "axis-qr-generator",
  "kotak-qr-generator",
  "pnb-qr-generator",
  "canara-qr-generator",
  "bob-qr-generator",
  "indusind-qr-generator",
  "union-qr-generator",
  "kirana-qr-generator",
  "cab-driver-qr-generator",
  "freelance-qr-generator",
  "restaurant-qr-generator",
  "generator",
  "invoice-generator",
  "qr-sticker-generator",
  "bulk-qr",
  "upi-calculator",
  "gst-calculator",
  "upi-limits",
  "dynamic-qr-generator",
  "developer",
  "privacy",
  "terms",
  "disclaimer",
  "blog",
  // Hindi versions
  "hi",
  "hi/phonepe-qr-generator",
  "hi/google-pay-qr-generator",
  "hi/paytm-qr-generator",
  "hi/donation-qr-generator",
  "hi/bhim-qr-generator",
  "hi/whatsapp-pay-qr-generator",
  "hi/amazon-pay-qr-generator",
  "hi/sbi-qr-generator",
  "hi/hdfc-qr-generator",
  "hi/icici-qr-generator",
  "hi/axis-qr-generator",
  "hi/kotak-qr-generator",
  "hi/pnb-qr-generator",
  "hi/canara-qr-generator",
  "hi/bob-qr-generator",
  "hi/indusind-qr-generator",
  "hi/union-qr-generator",
  "hi/kirana-qr-generator",
  "hi/cab-driver-qr-generator",
  "hi/freelance-qr-generator",
  "hi/restaurant-qr-generator",
  "hi/privacy",
  "hi/terms",
  "hi/disclaimer"
];

function formatLastmod(date: Date): string {
  return date.toISOString();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.proupiqr.in";
  const siteLastModified = formatLastmod(new Date());

  const blogPosts = await getCollection("blog");

  const entries = [
    ...staticPages.map((page) => ({
      path: page ? `/${page}/` : "/",
      lastmod: siteLastModified,
    })),
    ...blogPosts.map((post) => ({
      path: `/blog/${post.id.replace(/\.mdx?$/, "")}/`,
      lastmod: formatLastmod(post.data.pubDate),
    })),
  ];

  const urls = entries
    .map(
      (entry) =>
        `<url><loc>${escapeXml(`${baseUrl}${entry.path}`)}</loc><lastmod>${entry.lastmod}</lastmod><changefreq>weekly</changefreq><priority>${entry.path === "/" ? "1.0" : entry.path === "/universal-qr-generator/" ? "0.9" : entry.path.startsWith("/blog/") ? "0.7" : "0.8"}</priority></url>`
    )
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml"
    }
  });
};
