import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const staticPages = [
  "",
  "phonepe-qr-generator",
  "google-pay-qr-generator",
  "paytm-qr-generator",
  "donation-qr-generator",
  "privacy",
  "terms",
  "disclaimer",
  "blog"
];

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.proupiqr.in";
  const lastModified = new Date().toISOString();

  // Fetch dynamic blog posts
  const blogPosts = await getCollection("blog");
  const blogUrls = blogPosts.map((post) => `blog/${post.slug}`);

  const allPages = [...staticPages, ...blogUrls];

  const urls = allPages
    .map((page) => {
      const path = page ? `/${page}/` : "/";
      return `<url><loc>${baseUrl}${path}</loc><lastmod>${lastModified}</lastmod></url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml"
    }
  });
};
