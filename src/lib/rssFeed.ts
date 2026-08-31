import { getCollection } from "astro:content";

const feedCopy = {
  en: { title: "Pro UPI QR — Guides & Tutorials", description: "Free UPI QR code generator guides, merchant standee setup, printing tutorials, and payment workflows for Indian business owners.", language: "en-in" },
  hi: { title: "Pro UPI QR — हिंदी गाइड", description: "दुकानदारों और व्यवसाय मालिकों के लिए UPI QR, भुगतान और प्रिंटिंग की उपयोगी गाइड।", language: "hi-in" },
  ta: { title: "Pro UPI QR — தமிழ் வழிகாட்டிகள்", description: "இந்திய வணிகங்களுக்கான UPI QR, கட்டணம் மற்றும் அச்சிடுதல் வழிகாட்டிகள்.", language: "ta-in" },
  te: { title: "Pro UPI QR — తెలుగు గైడ్‌లు", description: "భారతీయ వ్యాపారాల కోసం UPI QR, చెల్లింపులు మరియు ప్రింటింగ్ మార్గదర్శకాలు.", language: "te-in" },
  mr: { title: "Pro UPI QR — मराठी मार्गदर्शक", description: "भारतीय व्यवसायांसाठी UPI QR, पेमेंट आणि प्रिंटिंग मार्गदर्शक.", language: "mr-in" },
} as const;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function createRssFeed(site: URL | undefined, lang: keyof typeof feedCopy = "en") {
  const baseUrl = site?.toString().replace(/\/$/, "") ?? "https://www.proupiqr.in";
  const prefix = lang === "en" ? "" : `/${lang}`;
  const copy = feedCopy[lang];
  const collection = lang === "en" ? "blog" : lang === "hi" ? "blogHi" : null;
  const posts = collection
    ? (await getCollection(collection)).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    : [];
  const items = posts.map((post) => {
    const slug = post.id.replace(/\.mdx?$/, "");
    const link = lang === "hi" ? `${baseUrl}/hi/blog/${slug}/` : `${baseUrl}/blog/${slug}/`;
    return `<item><title>${escapeXml(post.data.title)}</title><link>${escapeXml(link)}</link><guid isPermaLink="true">${escapeXml(link)}</guid><description>${escapeXml(post.data.description)}</description><pubDate>${post.data.pubDate.toUTCString()}</pubDate><author>${escapeXml(post.data.author ?? "Kunal Siyag")}</author></item>`;
  }).join("\n");
  const channelLink = lang === "en" ? `${baseUrl}/blog/` : lang === "hi" ? `${baseUrl}/hi/blog/` : `${baseUrl}${prefix}/`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(copy.title)}</title><link>${channelLink}</link><description>${escapeXml(copy.description)}</description><language>${copy.language}</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400", "X-Robots-Tag": "noindex, follow" } });
}
