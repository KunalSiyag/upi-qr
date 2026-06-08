import type { APIRoute } from "astro";

const pages = [
  "",
  "phonepe-qr-generator",
  "google-pay-qr-generator",
  "paytm-qr-generator",
  "donation-qr-generator"
];

export const GET: APIRoute = ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.upiqr.in";
  const lastModified = new Date().toISOString();

  const urls = pages
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
