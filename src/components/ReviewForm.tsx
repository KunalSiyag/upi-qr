import { useState, type FormEvent } from "react";
import { PRODUCT_HUNT_REVIEWS_URL, REVIEW_EMAIL } from "../data/reviews";

const ROLES = [
  "Kirana / shop owner",
  "Freelancer",
  "Cafe / restaurant",
  "Temple / NGO",
  "Cab / delivery",
  "Tutor / coaching",
  "Other",
] as const;

const STARS = [1, 2, 3, 4, 5] as const;

export function ReviewForm() {
  const [rating, setRating] = useState<number>(5);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("Kirana / shop owner");
  const [city, setCity] = useState("");
  const [quote, setQuote] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedQuote = quote.trim();
    if (trimmedName.length < 2) {
      setError("Add the name you are happy to show next to the quote.");
      return;
    }
    if (trimmedQuote.length < 20) {
      setError("Write at least a sentence about what you printed or generated.");
      return;
    }
    if (!consent) {
      setError("Tick the box if we may publish your first name, city, and quote.");
      return;
    }

    const subject = encodeURIComponent(`Pro UPI QR review: ${rating}/5 from ${trimmedName}`);
    const body = encodeURIComponent(
      [
        `Rating: ${rating}/5`,
        `Name: ${trimmedName}`,
        `Role: ${role}`,
        `City: ${city.trim() || "(not given)"}`,
        "",
        trimmedQuote,
        "",
        "I agree Pro UPI QR may publish my first name, city, role, rating, and this quote on https://www.proupiqr.in/reviews/.",
      ].join("\n"),
    );

    window.location.href = `mailto:${REVIEW_EMAIL}?subject=${subject}&body=${body}`;
    setOpened(true);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[1.75rem] border border-forest/10 bg-white p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)] md:p-7"
      noValidate
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-forest">Your rating</legend>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Star rating from 1 to 5">
          {STARS.map((star) => {
            const selected = rating === star;
            return (
              <label
                key={star}
                className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-black transition ${
                  star <= rating
                    ? "border-sun bg-sun/15 text-forest"
                    : "border-forest/10 bg-cream text-forest/40"
                }`}
              >
                <input
                  type="radio"
                  name="rating"
                  value={star}
                  checked={selected}
                  onChange={() => setRating(star)}
                  className="sr-only"
                />
                <span aria-hidden="true">★</span>
                <span className="sr-only">
                  {star} star{star === 1 ? "" : "s"}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs font-semibold tabular-nums text-forest/60">{rating} out of 5</p>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-forest">
          Name to publish
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Ananya"
            className="mt-1.5 w-full rounded-2xl border border-forest/15 bg-cream px-3.5 py-2.5 text-sm font-medium text-forest outline-none transition focus-visible:ring-2 focus-visible:ring-leaf"
            required
            minLength={2}
          />
        </label>
        <label className="block text-sm font-bold text-forest">
          City
          <input
            type="text"
            name="city"
            autoComplete="address-level2"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="e.g. Jaipur"
            className="mt-1.5 w-full rounded-2xl border border-forest/15 bg-cream px-3.5 py-2.5 text-sm font-medium text-forest outline-none transition focus-visible:ring-2 focus-visible:ring-leaf"
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-bold text-forest">
        What you run
        <select
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as (typeof ROLES)[number])}
          className="mt-1.5 w-full rounded-2xl border border-forest/15 bg-cream px-3.5 py-2.5 text-sm font-medium text-forest outline-none transition focus-visible:ring-2 focus-visible:ring-leaf"
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm font-bold text-forest">
        What worked (or did not)
        <textarea
          name="quote"
          value={quote}
          onChange={(event) => setQuote(event.target.value)}
          rows={4}
          minLength={20}
          required
          placeholder="e.g. Printed an A5 standee for the kirana counter. PhonePe and GPay both scanned it..."
          className="mt-1.5 w-full rounded-2xl border border-forest/15 bg-cream px-3.5 py-2.5 text-sm font-medium text-forest outline-none transition focus-visible:ring-2 focus-visible:ring-leaf"
        />
      </label>

      <label className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-forest/80">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-forest/30 text-leaf"
        />
        <span>You may publish my first name, city, role, star rating, and this quote on the reviews page.</span>
      </label>

      {error && (
        <p className="mt-3 text-sm font-semibold text-coral" role="alert">
          {error}
        </p>
      )}
      {opened && (
        <p className="mt-3 text-sm font-semibold text-leaf" role="status" aria-live="polite">
          Your mail app should open with the review filled in. If it did not, email {REVIEW_EMAIL} directly.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="submit"
          className="rounded-full bg-forest px-5 py-3 text-sm font-bold text-white transition hover:bg-leaf"
        >
          Open email to send review
        </button>
        <a
          href={`${PRODUCT_HUNT_REVIEWS_URL}?utm_source=proupiqr&utm_medium=site&utm_campaign=review-form`}
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full border border-forest/15 px-5 py-3 text-sm font-bold text-forest transition hover:bg-mint"
        >
          Or review on Product Hunt
        </a>
      </div>
      <p className="mt-3 text-xs leading-5 text-forest/55">
        Reviews stay in your mail app until you send them. We do not store the form on our servers. Quotes go live only after a reply from us.
      </p>
    </form>
  );
}
