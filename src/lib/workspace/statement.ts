import { daysBetween, isIsoDate, type InvoiceView } from "./model.ts";

/**
 * Bank statement import — pure functions, runs in the browser only (the file
 * is never uploaded). Reads CSV/TSV exports from Indian net banking, keeps the
 * credits, and suggests which open invoice each credit pays.
 *
 * Kept free of runtime imports other than model.ts so Node tests can load it.
 */

export interface StatementCredit {
  /** Stable key for de-duplication and React lists. */
  key: string;
  date: string;
  amountPaise: number;
  narration: string;
  /** 12-digit UPI RRN/UTR found in the narration or reference column. */
  utr: string;
  /** Bank reference / cheque number column, when present. */
  reference: string;
}

export interface ParsedStatement {
  credits: StatementCredit[];
  /** Rows that looked like transactions but could not be read. */
  skippedRows: number;
  /** Human-readable reason when nothing could be read. */
  error: string;
}

// ---------------------------------------------------------------------------
// CSV

/** RFC 4180-style parser: quotes, escaped quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === "") { quoted = true; field = ""; }
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((cell) => cell.trim()));
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 40).join("\n");
  const counts = [",", ";", "\t", "|"].map((d) => ({ d, n: sample.split(d).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 1 ? counts[0].d : ",";
}

// ---------------------------------------------------------------------------
// Values

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Day-first dates as used by Indian banks; returns ISO or "". */
export function parseStatementDate(raw: string): string {
  const value = raw.trim().replace(/\s+/g, " ");
  let y = 0, m = 0, d = 0;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(value))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else if ((match = /^(\d{1,2})[ /-]([A-Za-z]{3})[A-Za-z]*\.?[ /,-]+(\d{2,4})\b/.exec(value))) { d = +match[1]; m = MONTHS[match[2].toLowerCase()] ?? 0; y = +match[3]; }
  else return "";
  if (y < 100) y += 2000;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : "";
}

/** "1,23,456.78", "₹ 500", "500.5 Cr" → paise; null for blanks, zero, or junk. */
export function parseStatementAmount(raw: string): number | null {
  const value = raw.replace(/[₹,\s]|INR|Rs\.?|\(?(cr|dr)\)?\.?$/gi, "");
  if (!value || value === "-" || value === "0" || /^0+(\.0+)?$/.test(value)) return null;
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
}

export function extractUtr(...texts: string[]): string {
  for (const text of texts) {
    const match = /(?<!\d)(\d{12})(?!\d)/.exec(text);
    if (match) return match[1];
  }
  return "";
}

// ---------------------------------------------------------------------------
// Header detection

type Column = "date" | "narration" | "reference" | "credit" | "debit" | "amount" | "type";

function classify(header: string): Column | null {
  const h = header.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (/\b(credit|cr)\b/.test(h) && /\b(debit|dr)\b/.test(h)) return "type";
  if (/\b(deposit|credit|cr amount|money in)\b/.test(h)) return "credit";
  if (h === "cr") return "credit";
  if (/\b(withdrawal|debit|money out)\b/.test(h) || h === "dr") return "debit";
  if (/\b(dr cr|cr dr|type|transaction type)\b/.test(h)) return "type";
  if (/\b(narration|description|particulars|remarks|details|transaction remarks)\b/.test(h)) return "narration";
  if (/\b(ref|reference|chq|cheque|utr|rrn)\b/.test(h)) return "reference";
  if (/\bvalue d/.test(h)) return null; // prefer the transaction date column
  if (/\b(date|txn date|tran date|transaction date)\b/.test(h)) return "date";
  if (/\bamount\b/.test(h)) return "amount";
  return null;
}

interface Layout {
  headerRow: number;
  columns: Partial<Record<Column, number>>;
}

function findLayout(rows: string[][]): Layout | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const columns: Partial<Record<Column, number>> = {};
    rows[r].forEach((cell, i) => {
      const kind = classify(cell);
      if (kind && columns[kind] === undefined) columns[kind] = i;
    });
    const hasMoney = columns.credit !== undefined || columns.amount !== undefined;
    if (columns.date !== undefined && hasMoney && (columns.narration !== undefined || columns.reference !== undefined)) {
      return { headerRow: r, columns };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse

export function parseStatement(text: string): ParsedStatement {
  const rows = parseDelimited(text.replace(/^﻿/, ""), detectDelimiter(text));
  const layout = findLayout(rows);
  if (!layout) {
    return { credits: [], skippedRows: 0, error: "Couldn't find the date, description and credit columns. Download the statement as CSV from your bank's net banking and try again." };
  }
  const { columns } = layout;
  const credits: StatementCredit[] = [];
  const seen = new Map<string, number>();
  let skippedRows = 0;
  for (const row of rows.slice(layout.headerRow + 1)) {
    const cell = (c: Column) => (columns[c] !== undefined ? row[columns[c]!] ?? "" : "");
    const date = parseStatementDate(cell("date"));
    if (!date) {
      // Footers, totals and opening-balance lines have no date; only count rows that look like data.
      if (row.filter(Boolean).length >= 3 && /\d/.test(row.join(""))) skippedRows++;
      continue;
    }
    let amountPaise: number | null = null;
    if (columns.credit !== undefined) {
      amountPaise = parseStatementAmount(cell("credit"));
    } else {
      const raw = cell("amount");
      const type = `${cell("type")} ${raw}`.toLowerCase();
      const letters = type.replace(/[^a-z ]/g, " ");
      const marked = /\b(cr|credit|c|dr|debit|d)\b/.test(letters) || /(cr|dr)\.?$/i.test(raw.trim());
      // Single signed amount column with no Dr/Cr marker: positive means money in.
      const isCredit = marked
        ? /\b(cr|credit|c)\b/.test(letters) && !/\b(dr|debit|d)\b/.test(letters)
        : !/^[-(]/.test(raw.trim());
      amountPaise = isCredit ? parseStatementAmount(raw) : null;
    }
    if (!amountPaise) continue; // debits and zero rows
    const narration = cell("narration").replace(/\s+/g, " ").slice(0, 300);
    const reference = cell("reference").slice(0, 60);
    const utr = extractUtr(reference, narration);
    const base = `${date}|${amountPaise}|${utr || reference || narration}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    credits.push({ key: n === 1 ? base : `${base}#${n}`, date, amountPaise, narration, utr, reference });
  }
  if (credits.length === 0) {
    return { credits, skippedRows, error: "No incoming payments (credits) found in this file." };
  }
  return { credits, skippedRows, error: "" };
}

// ---------------------------------------------------------------------------
// Matching

export interface MatchSuggestion {
  credit: StatementCredit;
  invoiceId: string;
  score: number;
  reasons: string[];
  /** What to record: never more than the invoice's balance. */
  amountPaise: number;
  /** Pre-ticked in the UI when the evidence is strong. */
  confident: boolean;
}

const STOP = new Set(["mr", "mrs", "ms", "dr", "shri", "smt", "and", "the", "pvt", "ltd", "llp", "co", "sample"]);

function nameTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ")} `;
}

export function scoreCredit(credit: StatementCredit, view: InvoiceView, claimedUtrs: ReadonlyMap<string, string>): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const narration = normalise(`${credit.narration} ${credit.reference}`);
  if (credit.utr && claimedUtrs.get(credit.utr) === view.invoice.id) {
    score += 100;
    reasons.push("UTR sent by the client from the pay link");
  }
  const number = view.invoice.number.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  if (number && narration.includes(` ${number} `)) {
    score += 60;
    reasons.push(`mentions ${view.invoice.number}`);
  } else if (number.replace(/ /g, "").length >= 4 && narration.replace(/ /g, "").includes(number.replace(/ /g, ""))) {
    score += 50;
    reasons.push(`mentions ${view.invoice.number}`);
  }
  if (credit.amountPaise === view.balancePaise) {
    score += 50;
    reasons.push("exact amount due");
  } else if (credit.amountPaise === view.invoice.amountPaise && view.balancePaise > 0) {
    score += 35;
    reasons.push("matches the invoice total");
  } else if (credit.amountPaise < view.balancePaise) {
    score += 5;
    reasons.push("part payment");
  } else {
    score -= 40; // more than is due: probably something else
  }
  const tokens = nameTokens(view.client?.name ?? "");
  const hits = tokens.filter((t) => narration.includes(` ${t} `));
  if (tokens.length && hits.length === tokens.length) {
    score += 30;
    reasons.push(`from ${view.client?.name}`);
  } else if (hits.length) {
    score += 15;
    reasons.push(`name contains “${hits[0]}”`);
  }
  // Money before the invoice existed is unlikely to be for it.
  if (daysBetween(view.invoice.issueDate, credit.date) < -3) score -= 50;
  return { score, reasons };
}

export const SUGGEST_THRESHOLD = 55;
export const CONFIDENT_THRESHOLD = 95;

/**
 * One-to-one greedy assignment, strongest evidence first. Credits whose
 * UTR/reference is already recorded on any payment are skipped, so importing
 * the same statement twice never double-counts.
 */
export function matchCredits(
  credits: StatementCredit[],
  views: InvoiceView[],
  claimedUtrs: ReadonlyMap<string, string> = new Map(),
): { suggestions: MatchSuggestion[]; alreadyRecorded: number; unmatched: StatementCredit[] } {
  const recorded = new Set<string>();
  for (const view of views) for (const p of view.invoice.payments) if (p.reference) recorded.add(p.reference.trim());
  const open = views.filter((v) => v.balancePaise > 0 && v.state !== "void");
  const fresh = credits.filter((c) => !(c.utr && recorded.has(c.utr)) && !(c.reference && recorded.has(c.reference)));
  const alreadyRecorded = credits.length - fresh.length;

  const pairs: { credit: StatementCredit; view: InvoiceView; score: number; reasons: string[] }[] = [];
  for (const credit of fresh) {
    for (const view of open) {
      const { score, reasons } = scoreCredit(credit, view, claimedUtrs);
      if (score >= SUGGEST_THRESHOLD) pairs.push({ credit, view, score, reasons });
    }
  }
  // Strongest first; for equal evidence pay the oldest invoice first (FIFO), then the earliest credit.
  pairs.sort((a, b) => b.score - a.score || a.view.invoice.dueDate.localeCompare(b.view.invoice.dueDate) || a.credit.date.localeCompare(b.credit.date));
  const usedCredits = new Set<string>();
  const usedInvoices = new Set<string>();
  const suggestions: MatchSuggestion[] = [];
  for (const pair of pairs) {
    if (usedCredits.has(pair.credit.key) || usedInvoices.has(pair.view.invoice.id)) continue;
    usedCredits.add(pair.credit.key);
    usedInvoices.add(pair.view.invoice.id);
    suggestions.push({
      credit: pair.credit,
      invoiceId: pair.view.invoice.id,
      score: pair.score,
      reasons: pair.reasons,
      amountPaise: Math.min(pair.credit.amountPaise, pair.view.balancePaise),
      confident: pair.score >= CONFIDENT_THRESHOLD,
    });
  }
  suggestions.sort((a, b) => a.credit.date.localeCompare(b.credit.date));
  return { suggestions, alreadyRecorded, unmatched: fresh.filter((c) => !usedCredits.has(c.key)) };
}
