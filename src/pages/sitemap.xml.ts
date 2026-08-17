import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { ENGLISH_SLUGS, HINDI_SLUGS, REGIONAL_SLUGS } from "../data/validRoutes";

// Programmatically generate all valid static paths for each locale
const allStaticPaths: string[] = [
  ...Array.from(ENGLISH_SLUGS).map((slug) => (slug ? `/${slug}/` : "/")),
  ...Array.from(HINDI_SLUGS).map((slug) => (slug ? `/hi/${slug}/` : "/hi/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/ta/${slug}/` : "/ta/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/te/${slug}/` : "/te/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/mr/${slug}/` : "/mr/")),
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

function changefreqFor(path: string): string {
  if (path === "/" || path === "/universal-qr-generator/") return "weekly";
  if (path.startsWith("/blog/")) return "monthly";
  if (path.includes("/privacy") || path.includes("/terms") || path.includes("/disclaimer")) return "yearly";
  return "monthly";
}

function priorityFor(path: string): string {
  if (path === "/") return "1.0";
  if (path === "/universal-qr-generator/" || path === "/blog/") return "0.9";
  if (path.startsWith("/blog/")) return "0.7";
  if (path.startsWith("/hi/") || path.startsWith("/ta/") || path.startsWith("/te/") || path.startsWith("/mr/")) return "0.6";
  return "0.8";
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.proupiqr.in";

  const blogPosts = await getCollection("blog");

  const entries = [
    ...uniquePaths.map((path) => ({
      path,
      // Recrawl signal for locale tool URLs that GSC previously logged as 404.
      lastmod: path.startsWith("/hi/") && !path.includes("/blog/")
        ? formatLastmod(new Date("2026-08-17T00:00:00Z"))
        : null,
    })),
    ...blogPosts.map((post) => ({
      path: `/blog/${post.id.replace(/\.mdx?$/, "")}/`,
      lastmod: formatLastmod(post.data.updatedDate ?? post.data.pubDate),
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
      const lastmodXml = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
      const imageXml = entry.image
        ? `<image:image><image:loc>${escapeXml(entry.image)}</image:loc><image:title>${escapeXml(entry.title || "Pro UPI QR")}</image:title></image:image>`
        : "";
      return `<url><loc>${loc}</loc>${lastmodXml}<changefreq>${changefreqFor(entry.path)}</changefreq><priority>${priorityFor(entry.path)}</priority>${imageXml}</url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
};
