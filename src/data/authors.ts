export interface Author {
  slug: string;
  name: string;
  hindiName: string;
  jobTitle: string;
  path: string;
  personId: string;
  email: string;
  sameAs: string[];
  initials: string;
  shortBio: string;
  hindiShortBio: string;
  longBio: string[];
}

const SITE = "https://www.proupiqr.in";

export const AUTHORS: Author[] = [
  {
    slug: "kunal-siyag",
    name: "Kunal Siyag",
    hindiName: "कुणाल सियाग",
    jobTitle: "Founder",
    path: "/authors/kunal-siyag/",
    personId: `${SITE}/authors/kunal-siyag/#person`,
    email: "support@proupiqr.in",
    sameAs: ["https://github.com/KunalSiyag", "https://x.com/proupiqr"],
    initials: "KS",
    shortBio:
      "Founder of Pro UPI QR. Builds the generators and calculators, writes the merchant guides, and cites NPCI, RBI, and bank sources instead of inventing a research team.",
    hindiShortBio:
      "Pro UPI QR के संस्थापक। जनरेटर और कैलकुलेटर बनाते हैं, मर्चेंट गाइड लिखते हैं, और NPCI/RBI स्रोतों का हवाला देते हैं।",
    longBio: [
      "Kunal Siyag founded Pro UPI QR to give Indian shops and freelancers a local-first way to print a standard upi://pay QR without a merchant gateway.",
      "He writes and updates the guides on this site. Financial claims are checked against NPCI, RBI, and bank pages. Calculator math uses integer paise. Official PhonePe or Google Pay Business QRs are described as distinct from a compatible print.",
      "He is not employed by NPCI, PhonePe, Google, Paytm, or any bank, and is not a CA, lawyer, or registered financial adviser. App menus and circulars change; the accuracy policy explains how corrections are logged.",
    ],
  },
];

export const DEFAULT_AUTHOR = AUTHORS[0];

export function resolveAuthor(name?: string): Author {
  if (!name) return DEFAULT_AUTHOR;
  const lower = name.trim().toLowerCase();
  const match = AUTHORS.find(
    (author) =>
      author.slug === lower ||
      author.name.toLowerCase() === lower ||
      author.hindiName === name.trim()
  );
  if (match) return match;
  if (lower.includes("pro upi") || lower.includes("team")) return DEFAULT_AUTHOR;
  return DEFAULT_AUTHOR;
}

export function personSchema(author: Author = DEFAULT_AUTHOR) {
  return {
    "@type": "Person" as const,
    "@id": author.personId,
    name: author.name,
    url: `${SITE}${author.path}`,
    jobTitle: author.jobTitle,
    email: `mailto:${author.email}`,
    sameAs: author.sameAs,
    worksFor: { "@id": `${SITE}/#organization` },
  };
}

export function formatEnIn(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatHiIn(date: Date): string {
  return new Intl.DateTimeFormat("hi-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function nextReviewDate(reviewedOn: Date, intervalDays: number): Date {
  const next = new Date(reviewedOn.getTime());
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next;
}
