import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { ENGLISH_SLUGS, HINDI_SLUGS, REGIONAL_SLUGS, INTERNATIONAL_SLUGS } from "../data/validRoutes";
import { GLOSSARY_TERMS } from "../data/glossary";
import { imagesForPath, resolveSiteImage, type SiteImage } from "../data/siteImages";

// Programmatically generate all valid static paths for each locale
const allStaticPaths: string[] = [
  ...Array.from(ENGLISH_SLUGS).map((slug) => (slug ? `/${slug}/` : "/")),
  ...Array.from(HINDI_SLUGS).map((slug) => (slug ? `/hi/${slug}/` : "/hi/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/ta/${slug}/` : "/ta/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/te/${slug}/` : "/te/")),
  ...Array.from(REGIONAL_SLUGS).map((slug) => (slug ? `/mr/${slug}/` : "/mr/")),
  ...Array.from(INTERNATIONAL_SLUGS).map((slug) => (slug ? `/es/${slug}/` : "/es/")),
  ...Array.from(INTERNATIONAL_SLUGS).map((slug) => (slug ? `/pt/${slug}/` : "/pt/")),
  ...Array.from(INTERNATIONAL_SLUGS).map((slug) => (slug ? `/fr/${slug}/` : "/fr/")),
  ...Array.from(INTERNATIONAL_SLUGS).map((slug) => (slug ? `/de/${slug}/` : "/de/")),
  ...Array.from(INTERNATIONAL_SLUGS).map((slug) => (slug ? `/id/${slug}/` : "/id/")),
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

interface SitemapImage {
  loc: string;
  title: string;
  caption?: string;
}

interface SitemapEntry {
  path: string;
  lastmod?: string;
  images?: SitemapImage[];
}

function absoluteAsset(src: string, baseUrl: string): string {
  if (src.startsWith("http")) return src;
  return `${baseUrl}${src.startsWith("/") ? "" : "/"}${src}`;
}

function fromCatalog(image: SiteImage, baseUrl: string): SitemapImage {
  return {
    loc: absoluteAsset(image.src, baseUrl),
    title: image.title,
    caption: image.caption,
  };
}

function mergeImages(baseUrl: string, path: string, extra?: SiteImage | null): SitemapImage[] {
  const list = imagesForPath(path).map((image) => fromCatalog(image, baseUrl));
  if (extra) {
    const loc = absoluteAsset(extra.src, baseUrl);
    if (!list.some((item) => item.loc === loc)) {
      list.unshift(fromCatalog(extra, baseUrl));
    }
  }
  return list;
}

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.proupiqr.in";

  const blogPosts = await getCollection("blog");
  const hindiBlogPosts = await getCollection("blogHi");

  const englishById = new Map(blogPosts.map((post) => [post.id.replace(/\.mdx?$/, ""), post]));

  const entries: SitemapEntry[] = [
    ...uniquePaths
      .filter((path) => path === "/glossary/" || !path.startsWith("/glossary/"))
      .map((path) => ({ path, images: mergeImages(baseUrl, path) })),
    ...blogPosts.map((post) => {
      const path = `/blog/${post.id.replace(/\.mdx?$/, "")}/`;
      const extra = post.data.image ? resolveSiteImage(post.data.image) ?? {
        id: post.id,
        src: post.data.image,
        width: 1200,
        height: 630,
        mime: "image/jpeg" as const,
        alt: post.data.title,
        caption: post.data.description,
        title: post.data.title,
      } : null;
      return {
        path,
        lastmod: formatLastmod(post.data.updatedDate ?? post.data.pubDate),
        images: mergeImages(baseUrl, path, extra),
      };
    }),
    ...GLOSSARY_TERMS.map((term) => ({ path: `/glossary/${term.slug}/` })),
    ...hindiBlogPosts.map((post) => {
      const slug = post.id.replace(/\.mdx?$/, "");
      const path = `/hi/blog/${slug}/`;
      const en = englishById.get(slug);
      const src = post.data.image ?? en?.data.image;
      const extra = src ? resolveSiteImage(src) ?? null : null;
      return {
        path,
        lastmod: formatLastmod(post.data.updatedDate ?? post.data.pubDate),
        images: mergeImages(baseUrl, path, extra),
      };
    }),
  ];

  const urls = entries
    .map((entry) => {
      const loc = escapeXml(`${baseUrl}${entry.path}`);
      const lastmodXml = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
      const imageXml = (entry.images ?? [])
        .map((image) => {
          const caption = image.caption
            ? `<image:caption>${escapeXml(image.caption)}</image:caption>`
            : "";
          return `<image:image><image:loc>${escapeXml(image.loc)}</image:loc><image:title>${escapeXml(image.title)}</image:title>${caption}</image:image>`;
        })
        .join("");
      return `<url><loc>${loc}</loc>${lastmodXml}${imageXml}</url>`;
    })
    .join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
