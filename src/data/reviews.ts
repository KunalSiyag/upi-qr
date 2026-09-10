/**
 * First-party merchant reviews and third-party listings.
 *
 * Only add quotes from people who emailed feedback@proupiqr.in (or left a
 * public Product Hunt review) and agreed to be named. Do not invent names,
 * cities, or star counts. Empty is safer than fake AggregateRating — Google
 * treats fabricated review markup as spam and can drop rich results.
 *
 * Directory outreach (SellWithBoost and similar) is not a review. Do not
 * link those emails or sites here.
 */

export const PRODUCT_HUNT_URL = "https://www.producthunt.com/products/pro-upi-qr";
export const PRODUCT_HUNT_REVIEWS_URL = "https://www.producthunt.com/products/pro-upi-qr/reviews";
export const GITHUB_URL = "https://github.com/KunalSiyag/upi-qr";
export const X_URL = "https://x.com/proupiqr";
export const REVIEW_EMAIL = "feedback@proupiqr.in";

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  city?: string;
  quote: string;
  rating: 1 | 2 | 3 | 4 | 5;
  date: string;
  source: "email" | "producthunt" | "github";
  sourceUrl?: string;
};

export type ReviewPlatform = {
  name: string;
  href: string;
  blurb: string;
  cta: string;
  kind: "reviews" | "code";
};

export const REVIEW_PLATFORMS: ReviewPlatform[] = [
  {
    name: "Product Hunt",
    href: PRODUCT_HUNT_REVIEWS_URL,
    blurb: "Public, third-party reviews and upvotes. This is the fastest way to leave a rating Google and other founders can see.",
    cta: "Review on Product Hunt",
    kind: "reviews",
  },
  {
    name: "GitHub",
    href: GITHUB_URL,
    blurb: "Star the repo or open an issue if a generator, export, or print layout broke. Code feedback counts.",
    cta: "Open the GitHub repo",
    kind: "code",
  },
];

export const TESTIMONIALS: Testimonial[] = [];

export type AggregateStars = {
  ratingValue: number;
  reviewCount: number;
  bestRating: 5;
  worstRating: 1;
};

export function aggregateFromTestimonials(reviews: Testimonial[] = TESTIMONIALS): AggregateStars | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((total, review) => total + review.rating, 0);
  return {
    ratingValue: Math.round((sum / reviews.length) * 10) / 10,
    reviewCount: reviews.length,
    bestRating: 5,
    worstRating: 1,
  };
}

export function formatRatingLabel(agg: AggregateStars): string {
  const stars = agg.ratingValue.toFixed(1);
  const noun = agg.reviewCount === 1 ? "review" : "reviews";
  return `${stars} out of 5 from ${agg.reviewCount} ${noun}`;
}

type ApplicationSchemaInput = {
  url: string;
  description: string;
};

export function softwareApplicationSchema({ url, description }: ApplicationSchemaInput): Record<string, unknown> {
  const agg = aggregateFromTestimonials();
  const schema: Record<string, unknown> = {
    "@type": ["WebApplication", "SoftwareApplication"],
    "@id": "https://www.proupiqr.in/#application",
    name: "Pro UPI QR",
    alternateName: "Pro UPI QR Generator",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "UPI QR code and merchant document tools",
    operatingSystem: "Web Browser, Android, iOS",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    url,
    image: "https://www.proupiqr.in/images/og-image.jpg",
    screenshot: "https://www.proupiqr.in/images/og-image.jpg",
    description,
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
    },
    featureList: [
      "Instant universal UPI QR generation in the browser",
      "No signup or watermark on static QR posters",
      "Print-ready standees, table tents, and sticker sheets",
      "Bulk CSV QR, GST invoices, receipts, and merchant calculators",
      "Compatible with PhonePe, Google Pay, Paytm, and BHIM",
    ],
    sameAs: [PRODUCT_HUNT_URL, GITHUB_URL, X_URL],
    author: { "@id": "https://www.proupiqr.in/#organization" },
  };

  if (agg) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: agg.ratingValue,
      ratingCount: agg.reviewCount,
      reviewCount: agg.reviewCount,
      bestRating: agg.bestRating,
      worstRating: agg.worstRating,
    };
    schema.review = TESTIMONIALS.map((item) => ({
      "@type": "Review",
      author: { "@type": "Person", name: item.name },
      datePublished: item.date,
      reviewBody: item.quote,
      name: `${item.rating}/5 from ${item.name}`,
      reviewRating: {
        "@type": "Rating",
        ratingValue: item.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(item.sourceUrl ? { url: item.sourceUrl } : {}),
    }));
  }

  return schema;
}
