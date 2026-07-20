import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

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
  const blogPosts = await getCollection("blog");

  // Sort posts by publication date descending
  const sortedPosts = blogPosts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  const itemsXml = sortedPosts
    .map((post) => {
      const slug = post.id.replace(/\.mdx?$/, "");
      const link = `${baseUrl}/blog/${slug}/`;
      const pubDate = post.data.pubDate.toUTCString();

      return `<item>
  <title>${escapeXml(post.data.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid isPermaLink="true">${escapeXml(link)}</guid>
  <description>${escapeXml(post.data.description)}</description>
  <pubDate>${pubDate}</pubDate>
  <author>${escapeXml(post.data.author ?? "Pro UPI QR Team")}</author>
</item>`;
    })
    .join("\n");

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2000/svg">
  <channel>
    <title>Pro UPI QR — Guides &amp; Tutorials</title>
    <link>${baseUrl}/blog/</link>
    <description>Free UPI QR code generator guides, merchant standee setup, printing tutorials, and bank account payment workflows for Indian business owners.</description>
    <language>en-in</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;

  return new Response(rssXml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
