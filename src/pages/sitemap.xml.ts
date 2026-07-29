import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const coreSlugs = [
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
  "idfc-qr-generator",
  "idbi-qr-generator",
  "yes-bank-qr-generator",
  "rbl-qr-generator",
  "central-bank-qr-generator",
  "gym-qr-generator",
  "salon-qr-generator",
  "parking-qr-generator",
  "temple-qr-generator",
  "sbi-business-qr-code-generator",
  "universal-upi-qr-code-generator-for-bank-account",
  "hdfc-business-qr-code-generator",
  "icici-business-qr-code-generator",
  "doctor-clinic-upi-qr-generator",
  "upi-qr-decoder",
  "upi-link-generator",
  "survey-qr-generator",
  "generator",
  "invoice-generator",
  "qr-sticker-generator",
  "bulk-qr",
  "upi-calculator",
  "gst-calculator",
  "offer-poster-generator",
  "whatsapp-order-generator",
  "menu-qr-generator",
  "upi-error-codes",
  "margin-calculator",
  "digital-visiting-card",
  "upi-limits",
  "dynamic-qr-generator",
  "developer",
  "free-qr-generator-without-watermark",
  "upi-qr-code-generator-no-signup",
  "privacy",
  "terms",
  "disclaimer",
  "blog",
];

const langPrefixes = ["hi", "ta", "te", "mr"];

// Programmatically generate all language variations (en, hi, ta, te, mr)
const allStaticPaths: string[] = [
  ...coreSlugs.map((slug) => (slug ? `/${slug}/` : "/")),
  ...langPrefixes.flatMap((lang) =>
    coreSlugs.map((slug) => (slug ? `/${lang}/${slug}/` : `/${lang}/`))
  ),
];

// Deduplicate paths
const uniquePaths = Array.from(new Set(allStaticPaths));

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
    ...uniquePaths.map((path) => ({
      path,
      lastmod: siteLastModified,
    })),
    ...blogPosts.map((post) => ({
      path: `/blog/${post.id.replace(/\.mdx?$/, "")}/`,
      lastmod: formatLastmod(post.data.pubDate),
      image: post.data.image
        ? post.data.image.startsWith("http")
          ? post.data.image
          : `${baseUrl}${post.data.image.startsWith("/") ? "" : "/"}${post.data.image}`
        : null,
      title: post.data.title,
    })),
  ];

  const urls = entries
    .map((entry) => {
      const loc = escapeXml(`${baseUrl}${entry.path}`);
      const priority =
        entry.path === "/"
          ? "1.0"
          : entry.path === "/universal-qr-generator/"
          ? "0.9"
          : entry.path.startsWith("/blog/")
          ? "0.7"
          : "0.8";
      const imageXml = entry.image
        ? `<image:image><image:loc>${escapeXml(entry.image)}</image:loc><image:title>${escapeXml(entry.title || "Pro UPI QR")}</image:title></image:image>`
        : "";
      return `<url><loc>${loc}</loc><lastmod>${entry.lastmod}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority>${imageXml}</url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
};
