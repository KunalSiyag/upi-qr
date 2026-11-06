// CTC to in-hand salary for an Indian employee, in integer paise. Imports only the tax and HRA engines (.ts extensions), so
// `scripts/salary.test.mjs` runs it under Node.
//
// The structure (state it on the page; employers differ, so the user is told to check the offer letter):
// - Basic is a share of CTC, HRA a share of basic, and the special allowance is whatever is left of CTC after basic, HRA,
//   the employer's PF and the optional gratuity accrual.
// - PF is 12% from the employee and 12% from the employer on PF wages: the full basic, or basic capped at the statutory wage
//   ceiling of Rs 25,000 a month (raised from Rs 15,000 on 17 Sep 2026; see the research notes in the ROADMAP).
// - The gratuity accrual is a month's basic x 15/26 per year of service, so about 4.81% of annual basic.
// - Gross salary = basic + HRA + special allowance. Income tax comes from incomeTax.ts, in the regime chosen. In the old regime
//   the employee's PF counts toward the 80C limit and the HRA exemption comes from hra.ts using the rent you enter.
// - Take-home = gross - employee PF - professional tax - income tax. Employer contributions above Rs 7.5 lakh a year can be
//   taxable; that rule is not modelled.
import { hraExemption } from "./hra.ts";
import { BLANK_INPUT, newRegime, oldRegime, type RegimeResult, type TaxInput } from "./incomeTax.ts";

export const PF_WAGE_CEILING_MONTH = 25_000 * 100; // paise

export type SalaryInput = {
  ctc: number; // paise a year
  basicBps: number; // basic as a share of CTC
  hraBps: number; // HRA as a share of basic
  pfOnCeiling: boolean; // PF on basic capped at the wage ceiling instead of the full basic
  gratuity: boolean; // include the gratuity accrual inside CTC
  professionalTax: number; // paise a year
  regime: "new" | "old";
  // Old regime only
  rentMonth: number;
  listedCity: boolean;
  other80c: number;
  health: number;
  homeLoanInterest: number;
  nps1b: number;
};

export type SalaryResult = {
  basic: number;
  hra: number;
  special: number;
  gross: number;
  employerPf: number;
  employeePf: number;
  gratuity: number;
  professionalTax: number;
  tax: number;
  takeHome: number; // a year
  takeHomeMonth: number;
  taxableIncome: number;
  regime: RegimeResult;
  other: { regime: "new" | "old"; tax: number; takeHome: number; takeHomeMonth: number };
};

const roundHalfUp = (n: number, d: number): number => Math.floor((n * 2 + d) / (d * 2));

/** The result, or null when basic and HRA leave nothing for the special allowance (a negative remainder). */
export function salaryBreakdown(i: SalaryInput): SalaryResult | null {
  const ctc = Math.max(0, Math.trunc(i.ctc));
  const basic = roundHalfUp(ctc * Math.max(0, Math.trunc(i.basicBps)), 10000);
  const hra = roundHalfUp(basic * Math.max(0, Math.trunc(i.hraBps)), 10000);
  const pfWages = i.pfOnCeiling ? Math.min(basic, PF_WAGE_CEILING_MONTH * 12) : basic;
  const employerPf = roundHalfUp(pfWages * 12, 100);
  const gratuity = i.gratuity ? roundHalfUp(basic * 15, 312) : 0;
  const special = ctc - employerPf - gratuity - basic - hra;
  if (special < 0) return null;
  const gross = basic + hra + special;
  const pt = Math.max(0, Math.trunc(i.professionalTax));

  // The HRA exemption only matters in the old regime; it is worked out from the rent you enter (nothing when there is no rent).
  const hraExempt = i.rentMonth > 0 ? hraExemption({ salaryMonth: roundHalfUp(basic, 12), hraMonth: roundHalfUp(hra, 12), rentMonth: i.rentMonth, fiftyPercentCity: i.listedCity, months: 12 }).exempt : 0;
  const base: TaxInput = { ...BLANK_INPUT, salary: gross, basicDa: basic };
  const n = newRegime(base);
  const o = oldRegime({ ...base, hraExempt, professionalTax: pt, c80: employerPf + Math.max(0, Math.trunc(i.other80c)), nps1b: Math.max(0, Math.trunc(i.nps1b)), selfHealth: Math.max(0, Math.trunc(i.health)), homeLoanInterest: Math.max(0, Math.trunc(i.homeLoanInterest)), homeLoanQualifies: true });
  const chosen = i.regime === "new" ? n : o;
  const otherR = i.regime === "new" ? o : n;
  const takeHome = gross - employerPf - pt - chosen.totalTax;
  const otherTakeHome = gross - employerPf - pt - otherR.totalTax;
  return {
    basic, hra, special, gross, employerPf, employeePf: employerPf, gratuity, professionalTax: pt, tax: chosen.totalTax,
    takeHome, takeHomeMonth: roundHalfUp(takeHome, 12), taxableIncome: chosen.taxableIncome, regime: chosen,
    other: { regime: otherR.regime, tax: otherR.totalTax, takeHome: otherTakeHome, takeHomeMonth: roundHalfUp(otherTakeHome, 12) },
  };
}
