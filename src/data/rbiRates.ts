/**
 * RBI Bank Rate for MSMED Act Section 16 interest: three times the Bank Rate,
 * compounded with monthly rests. Update after any MPC decision that moves it,
 * and log the change in src/data/corrections.ts.
 */
export const RBI_BANK_RATE = {
  pct: 5.75,
  asOf: "2026-10-07",
  label: "7 Oct 2026",
  source: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63742",
} as const;

/** Statutory MSMED interest, % p.a., exact to two decimals (3 × 5.75 = 17.25). */
export const MSMED_INTEREST_PCT = Math.round(RBI_BANK_RATE.pct * 300) / 100;
