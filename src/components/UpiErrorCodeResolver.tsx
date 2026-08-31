import React, { useEffect, useId, useMemo, useState } from "react";
import {
  UPI_ERROR_CODES,
  type ErrorCategory,
  type UpiErrorCode,
} from "../data/upiErrorCodes";
import { ERROR_UI, localizeErrorCode } from "../data/errorI18n";
import type { SiteLang } from "../lib/locale";

function codeAnchor(code: string): string {
  return code.toLowerCase();
}

function looksLikeNpciReturned(query: string): boolean {
  const q = query.toLowerCase();
  return (
    q.includes("npci returned") ||
    q.includes("npci error") ||
    q === "npci" ||
    q.includes("एनपीसीआई") ||
    q.includes("என்பிசிஐ") ||
    q.includes("ఎన్‌పిసిఐ") ||
    q.includes("एनपीसीआय")
  );
}

function OriginBadge({ origin, label }: { origin: UpiErrorCode["origin"]; label: string }) {
  return (
    <span className="rounded-full border border-forest/10 bg-mint/60 px-2.5 py-0.5 text-[11px] font-bold text-forest">
      {label}
    </span>
  );
}

export function UpiErrorCodeResolver({ lang = "en" }: { lang?: SiteLang }) {
  const ui = ERROR_UI[lang] ?? ERROR_UI.en;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ErrorCategory | "all">("all");
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const queryId = useId();
  const resultsId = useId();

  const filters: { id: ErrorCategory | "all"; label: string }[] = [
    { id: "all", label: ui.allCodes },
    { id: "auth", label: ui.category.auth },
    { id: "funds", label: ui.category.funds },
    { id: "limit", label: ui.category.limit },
    { id: "bank_tech", label: ui.category.bank_tech },
    { id: "network", label: ui.category.network },
    { id: "account", label: ui.category.account },
    { id: "security", label: ui.category.security },
    { id: "request", label: ui.category.request },
  ];

  const filtered = useMemo(() => {
    const normalised = query.trim().toLowerCase();
    return UPI_ERROR_CODES.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!normalised) return true;
      const localized = localizeErrorCode(lang, item);
      const haystack = [
        item.code,
        item.title,
        item.cause,
        item.actionStep,
        localized.title,
        localized.cause,
        localized.actionStep,
        ui.origin[item.origin],
        ui.category[item.category],
        ...item.aliases,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalised);
    });
  }, [query, category, lang, ui]);

  useEffect(() => {
    const applyHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (!raw) return;
      const match = UPI_ERROR_CODES.find((item) => codeAnchor(item.code) === raw.toLowerCase());
      if (!match) return;
      setQuery(match.code);
      setCategory("all");
      setActiveCode(match.code);
      requestAnimationFrame(() => {
        document.getElementById(codeAnchor(match.code))?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const showNpciHint = looksLikeNpciReturned(query);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-forest/10 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor={queryId} className="block text-xs font-bold uppercase tracking-wider text-forest/60">
          {ui.searchLabel}
        </label>
        <div className="relative mt-2">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id={queryId}
            name="upi-error-query"
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={ui.searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveCode(null);
            }}
            aria-controls={resultsId}
            className="w-full rounded-2xl border border-forest/15 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-forest outline-none focus-visible:border-leaf focus-visible:ring-2 focus-visible:ring-leaf/20"
          />
        </div>
        <p className="mt-2 text-xs text-forest/55">
          {UPI_ERROR_CODES.length} {ui.codesCount}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={ui.filterAria}>
        {filters.map((filter) => {
          const pressed = category === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => setCategory(filter.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf/30 ${
                pressed
                  ? "border-forest bg-forest text-mint"
                  : "border-forest/15 bg-white text-forest hover:border-leaf/40 hover:bg-mint/40"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {showNpciHint && (
        <div className="rounded-2xl border border-leaf/20 bg-mint/40 p-4 text-sm leading-relaxed text-forest">
          <p className="font-black text-forest">{ui.npciHintTitle}</p>
          <p className="mt-1 text-forest/80">{ui.npciHintBody}</p>
        </div>
      )}

      <p id={resultsId} aria-live="polite" className="text-xs font-semibold text-forest/55">
        {filtered.length === 0
          ? ui.noMatch
          : `${filtered.length} ${ui.codesFound}`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-forest/20 bg-white p-8 text-center">
          <p className="font-black text-forest">{ui.noMatch}{query ? ` “${query}”` : ""}.</p>
          <p className="mt-2 text-sm text-forest/70">{ui.noMatchHint}</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-forest px-4 py-2 text-xs font-bold text-white hover:bg-leaf focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf/40"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            {ui.clearSearch}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const highlighted = activeCode === item.code;
            const localized = localizeErrorCode(lang, item);
            return (
              <article
                key={item.code}
                id={codeAnchor(item.code)}
                className={`scroll-mt-28 rounded-3xl border bg-white p-6 shadow-md space-y-3 ${
                  highlighted ? "border-leaf ring-2 ring-leaf/25" : "border-forest/10"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-xl bg-forest px-3 py-1 text-xs font-black tracking-wide text-mint" translate="no">
                    {item.code}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                    {localized.refundTime}
                  </span>
                </div>
                <h3 className="text-base font-black text-forest text-pretty">{localized.title}</h3>
                <div className="flex flex-wrap gap-2">
                  <OriginBadge origin={item.origin} label={ui.origin[item.origin]} />
                  <span className="rounded-full border border-forest/10 bg-white px-2.5 py-0.5 text-[11px] font-bold text-forest/70">
                    {ui.category[item.category]}
                  </span>
                  <span className="rounded-full border border-forest/10 bg-white px-2.5 py-0.5 text-[11px] font-bold text-forest/70">
                    {ui.debit[item.debitStatus]}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-forest/75">
                  <strong>{ui.cause}:</strong> {localized.cause}
                </p>
                <div className="rounded-2xl border border-leaf/10 bg-mint/40 p-3 text-xs text-forest">
                  <span className="block font-bold text-leaf">{ui.whatToDo}</span>
                  <span className="mt-1 block leading-relaxed text-forest/80">{localized.actionStep}</span>
                </div>
                <p className="text-xs leading-relaxed text-forest/65">
                  <strong>{ui.merchant}:</strong> {localized.merchantNote}
                </p>
                <a
                  href={`#${codeAnchor(item.code)}`}
                  className="inline-flex text-[11px] font-bold text-leaf underline decoration-leaf/30 underline-offset-2 hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf/30 rounded"
                  onClick={() => setActiveCode(item.code)}
                >
                  {ui.permalink} #{codeAnchor(item.code)}
                </a>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
