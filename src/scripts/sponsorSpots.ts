// Fills the homepage sponsor placements (SponsorSlot.astro, SponsorStrip.astro) from our own API. Text goes in as
// textContent and links/logos are checked, so a sponsor's copy can never become markup. On any failure the static
// house card and "your logo here" tile simply stay.

interface PublicSponsor {
  id: string;
  name: string;
  tagline: string;
  href: string;
  logo: string;
}

const safeHref = (href: unknown): href is string => typeof href === "string" && href.startsWith("https://");
const safeLogo = (logo: unknown): logo is string => typeof logo === "string" && logo.startsWith("/api/v1/sponsors/logo/spb_");

function fillFeatured(root: HTMLElement, s: PublicSponsor) {
  const link = root.querySelector<HTMLAnchorElement>("[data-sponsor-link]");
  if (!link || !safeHref(s.href)) return;
  link.href = s.href;
  link.rel = "sponsored noopener";
  link.target = "_blank";
  const set = (sel: string, text: string) => { const el = root.querySelector(sel); if (el) el.textContent = text; };
  set("[data-sponsor-label]", root.dataset.label || "Sponsored");
  set("[data-sponsor-name]", s.name);
  set("[data-sponsor-line]", s.tagline);
  set("[data-sponsor-cta]", `${new URL(s.href).hostname.replace(/^www\./, "")} →`);
  const logo = root.querySelector<HTMLImageElement>("[data-sponsor-logo]");
  if (logo && safeLogo(s.logo)) {
    logo.src = s.logo;
    logo.hidden = false;
  }
  root.dataset.sponsor = s.id;
}

function fillTiles(root: HTMLElement, tiles: PublicSponsor[], free: number) {
  const list = root.querySelector<HTMLElement>("[data-sponsor-tiles]");
  const open = root.querySelector<HTMLElement>("[data-sponsor-open]");
  if (!list) return;
  for (const s of tiles) {
    if (!safeHref(s.href) || !safeLogo(s.logo)) continue;
    const li = document.createElement("li");
    li.dataset.sponsorTile = s.id;
    const a = document.createElement("a");
    a.href = s.href;
    a.rel = "sponsored noopener";
    a.target = "_blank";
    a.title = s.name;
    a.className = "flex h-full min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white px-2 py-3 ring-1 ring-hairline transition hover:shadow-card";
    const img = document.createElement("img");
    img.src = s.logo;
    img.alt = "";
    img.width = 32;
    img.height = 32;
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "h-8 w-8 rounded-[7px] object-contain";
    const name = document.createElement("span");
    name.className = "w-full truncate text-center text-xs font-semibold text-ink";
    name.textContent = s.name;
    a.append(img, name);
    li.append(a);
    list.insertBefore(li, open);
  }
  if (open && free <= 0) open.remove();
  // Every tile held by checkouts in progress and none live yet: nothing to show.
  if (!list.querySelector("li")) root.hidden = true;
}

async function load() {
  const featured = document.querySelector<HTMLElement>("[data-sponsor-featured]");
  const strip = document.querySelector<HTMLElement>("[data-sponsor-strip]");
  if (!featured && !strip) return;
  try {
    const res = await fetch("/api/v1/sponsors/", { credentials: "omit" });
    if (!res.ok) return;
    const data = await res.json() as { featured?: PublicSponsor | null; tiles?: PublicSponsor[]; tilesFree?: number };
    if (featured && data.featured) fillFeatured(featured, data.featured);
    if (strip) fillTiles(strip, Array.isArray(data.tiles) ? data.tiles : [], Number(data.tilesFree ?? 1));
  } catch {
    // Keep the house placements.
  }
}

void load();
