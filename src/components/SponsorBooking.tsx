import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SPONSOR_EXCLUSIONS, SPONSOR_TIERS, type SponsorTier } from "../data/sponsors";

/**
 * Self-serve sponsor booking on /sponsor/: pick the featured card or a logo tile, add the copy and a logo, pay on
 * Dodo's hosted checkout. The logo is resized in the browser to a 128 px PNG before upload. After payment Dodo sends
 * the sponsor back here with ?booking=…, and this shows the booking's progress.
 */

interface Availability {
  open: boolean;
  tilesFree: number;
  featuredBookable: boolean;
}

interface Status {
  id: string;
  tier: SponsorTier;
  name: string;
  status: string;
}

const input = "mt-1 block w-full rounded-[10px] bg-white px-3 py-2.5 text-base text-ink ring-1 ring-hairline outline-none transition focus:ring-2 focus:ring-leaf";
const label = "block text-sm font-semibold text-ink";
const hint = "mt-1 text-xs text-muted";
const rupees = (paise: number) => `₹${new Intl.NumberFormat("en-IN").format(paise / 100)}`;

/** Fits any image into a 128×128 transparent PNG (data URL), or explains why it can't. */
async function logoPng(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) throw new Error("Use a PNG, JPEG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("That image is over 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    // Photos can make a large PNG; the server takes up to 64 KB, so fall back to WebP.
    const png = canvas.toDataURL("image/png");
    return png.length < 80_000 ? png : canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function BookingProgress({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/sponsors/${id}/`, { credentials: "omit" });
        if (res.status === 404) { setMissing(true); return; }
        if (res.ok) {
          const next = await res.json() as Status;
          setStatus(next);
          if (next.status !== "checkout") return;
        }
      } catch { /* try again */ }
      if (!stop && ++tries < 40) setTimeout(poll, 3000);
    };
    void poll();
    return () => { stop = true; };
  }, [id]);

  const message = missing ? "We couldn't find this booking. If you paid, email us and we'll sort it out."
    : !status || status.status === "checkout" ? "Confirming your payment with Dodo Payments…"
    : status.status === "review" ? `Paid, thank you. We check every first booking against our rules and reply within a day. ${status.tier === "featured" ? "Your featured card" : "Your tile"} appears as soon as we approve it. If we can't run it, you get a full refund.`
    : status.status === "approved" ? `Approved. Your ${status.tier === "featured" ? "featured card" : "logo tile"} is live on the homepage.`
    : status.status === "soldout" ? `${status.tier === "featured" ? "The featured card was" : "Every logo tile was"} taken by the time your payment arrived, so we've refunded it in full.`
    : status.status === "rejected" ? "We couldn't run this booking, so we've refunded it in full."
    : "This booking has ended.";
  return (
    <div role="status" className="rounded-[12px] bg-white p-5 shadow-card" data-booking-status={status?.status ?? (missing ? "missing" : "loading")}>
      <p className="text-sm font-semibold text-leaf">{status?.name ?? "Your booking"}</p>
      <p className="mt-2 text-base leading-7 text-charcoal">{message}</p>
      <a href="/sponsor/#book" className="mt-3 inline-block text-sm font-semibold text-leaf underline underline-offset-4">Book another placement</a>
    </div>
  );
}

export function SponsorBooking({ email }: { email: string }) {
  const [returned, setReturned] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [tier, setTier] = useState<SponsorTier>("featured");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [href, setHref] = useState("https://");
  const [contact, setContact] = useState("");
  const [logo, setLogo] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: string; text: string } | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("booking");
    if (id && /^spb_[a-f0-9]{32}$/.test(id)) setReturned(id);
    fetch("/api/v1/sponsors/", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAvailability(data ? { open: Boolean(data.open), tilesFree: Number(data.tilesFree) || 0, featuredBookable: Boolean(data.featuredBookable) } : { open: false, tilesFree: 0, featuredBookable: false }))
      .catch(() => setAvailability({ open: false, tilesFree: 0, featuredBookable: false }));
  }, []);

  const unavailable = availability && (tier === "tile" ? availability.tilesFree <= 0 : !availability.featuredBookable);
  const total = SPONSOR_TIERS[tier].paise;
  const host = useMemo(() => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return ""; } }, [href]);

  const pickLogo = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      setLogo(await logoPng(file));
    } catch (e) {
      setLogo("");
      setError({ field: "logo", text: e instanceof Error ? e.message : "Couldn't read that image." });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!logo) { setError({ field: "logo", text: "Add your logo." }); return; }
    if (!agree) { setError({ field: "agree", text: "Confirm the booking rules first." }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/sponsors/checkout/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, name, tagline, href, email: contact, logo, agree, company: honeypot.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string; field?: string };
      if (res.ok && data.url) { location.assign(data.url); return; }
      setError({ field: data.field ?? "form", text: data.error ?? "Couldn't start the booking. Try again shortly." });
    } catch {
      setError({ field: "form", text: "Couldn't reach the server. Check your connection and try again." });
    }
    setBusy(false);
  };

  if (returned) return <BookingProgress id={returned} />;
  if (availability && !availability.open) {
    return (
      <div className="rounded-[12px] bg-white p-5 shadow-card" data-booking-closed>
        <p className="text-base leading-7 text-charcoal">Online booking opens soon. Until then, email <a href={`mailto:${email}?subject=${encodeURIComponent("Sponsorship enquiry")}`} className="font-semibold text-leaf underline underline-offset-4">{email}</a> with the placement, your brand and link, and we'll set it up.</p>
      </div>
    );
  }

  const fieldError = (field: string) => error?.field === field ? <p role="alert" className="mt-1 text-sm font-semibold text-[#a8321d]">{error.text}</p> : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]" data-sponsor-form>
      <div className="grid gap-5">
        <fieldset>
          <legend className={label}>Placement</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(["featured", "tile"] as const).map((t) => {
              const full = availability && (t === "tile" ? availability.tilesFree <= 0 : !availability.featuredBookable);
              return (
                <label key={t} className={`cursor-pointer rounded-[12px] bg-white p-4 ring-1 transition ${tier === t ? "ring-2 ring-leaf" : "ring-hairline hover:ring-ink/30"}`}>
                  <input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} className="sr-only" />
                  <span className="block text-base font-semibold text-ink">{SPONSOR_TIERS[t].name}</span>
                  <span className="mt-1 block text-sm text-charcoal">{SPONSOR_TIERS[t].label} a month, cancel any time</span>
                  <span className="mt-2 block text-xs text-muted" data-availability={t}>
                    {!availability ? "Checking availability…"
                      : full ? (t === "tile" ? "All tiles taken" : "Taken right now")
                      : t === "tile" ? `${availability.tilesFree} of ${SPONSOR_TIERS.tile.spots} free`
                      : "Free now"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="sp-name" className={label}>Brand name</label>
          <input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required autoComplete="organization" className={input} />
          {fieldError("name")}
        </div>
        {tier === "featured" && (
          <div>
            <label htmlFor="sp-line" className={label}>One line about it</label>
            <input id="sp-line" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={90} required className={input} />
            <p className={hint}>{tagline.length}/90. Plain and checkable: no "guaranteed", no cashback promises.</p>
            {fieldError("tagline")}
          </div>
        )}
        <div>
          <label htmlFor="sp-href" className={label}>Link</label>
          <input id="sp-href" type="url" inputMode="url" value={href} onChange={(e) => setHref(e.target.value)} required className={input} />
          <p className={hint}>We add utm_source=proupiqr so your analytics count the visits.</p>
          {fieldError("href")}
        </div>
        <div>
          <label htmlFor="sp-logo" className={label}>Logo</label>
          <input id="sp-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickLogo(e.target.files?.[0])} className="mt-1 block w-full text-sm text-charcoal file:mr-3 file:rounded-[10px] file:border-0 file:bg-fog file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink" />
          <p className={hint}>A square icon works best. We shrink it to 128 px in your browser.</p>
          {fieldError("logo")}
        </div>
        <div>
          <label htmlFor="sp-email" className={label}>Your email</label>
          <input id="sp-email" type="email" value={contact} onChange={(e) => setContact(e.target.value)} required autoComplete="email" className={input} />
          <p className={hint}>For the receipt and for us to reach you about this booking. Never shown.</p>
          {fieldError("email")}
        </div>
        <input ref={honeypot} name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />

        <div className="rounded-[12px] bg-fog p-4 text-sm leading-6 text-charcoal">
          <p className="font-semibold text-ink">Booking rules</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>We review every first booking within a day. If we can't run it, you get a full refund.</li>
            <li>We don't accept: {SPONSOR_EXCLUSIONS.join("; ").toLowerCase()}.</li>
            <li>It renews every month until you cancel: email us any time and it stays up until the paid month ends. A month that has started can't be refunded.</li>
          </ul>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#1c1d1f]" />
            <span>My brand, line, logo and landing page follow these rules.</span>
          </label>
          {fieldError("agree")}
        </div>

        {(error?.field === "form" || error?.field === "tier") && <p role="alert" className="text-sm font-semibold text-[#a8321d]">{error.text}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy || Boolean(unavailable)} className="rounded-[10px] bg-forest px-6 py-3 text-sm font-semibold text-white transition hover:bg-graphite disabled:opacity-50">
            {busy ? "Opening payment…" : `Continue to payment · ${rupees(total)}/month`}
          </button>
          <p className="text-xs text-muted">Paid securely on Dodo Payments. GST included; add your GSTIN there for the invoice.</p>
        </div>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
        <p className="text-sm font-semibold text-leaf">Preview</p>
        {tier === "featured" ? (
          <div className="mt-2 flex min-h-[176px] flex-col rounded-[12px] bg-white p-4 shadow-card" data-preview="featured">
            <span className="text-xs font-medium text-muted">Sponsored</span>
            <span className="mt-2 flex items-center gap-3">
              {logo && <img src={logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px] object-contain ring-1 ring-hairline" />}
              <span className="block text-base font-semibold text-ink">{name || "Your brand"}</span>
            </span>
            <span className="mt-1 block text-sm leading-6 text-charcoal">{tagline || "Your one line appears here."}</span>
            <span className="mt-auto block pt-3 text-sm font-semibold text-leaf">{host || "yoursite.com"} →</span>
          </div>
        ) : (
          <div className="mt-2 w-28" data-preview="tile">
            <span className="flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-white px-2 py-3 ring-1 ring-hairline">
              {logo ? <img src={logo} alt="" width={32} height={32} className="h-8 w-8 rounded-[7px] object-contain" /> : <span className="h-8 w-8 rounded-[7px] bg-fog" />}
              <span className="w-full truncate text-center text-xs font-semibold text-ink">{name || "Your brand"}</span>
            </span>
          </div>
        )}
      </div>
    </form>
  );
}
