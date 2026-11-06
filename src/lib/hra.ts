// House rent allowance exemption in integer paise. No imports, so `scripts/hra.test.mjs` runs it under Node.
//
// Rule, read from Schedule III item 11 of the Income-tax Act, 2025 and rule 279 of the Income-tax Rules, 2026 (checked on
// TAX_RULES_REVIEWED_ON, see TAX_SOURCES in incomeTax.ts): the exemption is the LEAST of
//   (a) the HRA actually received for the period,
//   (b) the rent actually paid for the period, less one tenth of the salary for the period,
//   (c) 50% of the salary for the period if the home is in one of the listed cities, else 40%.
// "Salary" is basic plus dearness allowance if it is provided under the terms of employment, and excludes other allowances and
// perquisites. Whether a commission on turnover counts is unclear in the rule text, so this model leaves it out.
// HRA is not available in the new tax regime. The home must not be owned by the employee, and the rent must really be paid.

/** The cities where 50% applies since the Income-tax Rules, 2026 (rule 279): four before, eight now. */
export const HRA_FIFTY_PERCENT_CITIES = ["Mumbai", "Delhi", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Pune", "Ahmedabad"] as const;

export type HraInput = {
  salaryMonth: number; // basic + DA that counts as salary, per month, in paise
  hraMonth: number; // HRA received per month
  rentMonth: number; // rent paid per month
  fiftyPercentCity: boolean;
  months: number; // months of the tax year the home was rented, 1 to 12
};

export type HraResult = {
  salary: number; // for the period
  hraReceived: number;
  rentPaid: number;
  actual: number; // (a)
  rentLessTenth: number; // (b), never below zero
  percentOfSalary: number; // (c)
  exempt: number; // the least of the three
  taxable: number; // HRA received less the exemption
  limiting: "actual" | "rent" | "salary"; // which of (a), (b), (c) is the least
  exemptMonth: number;
};

const roundHalfUp = (n: number, d: number): number => Math.floor((n * 2 + d) / (d * 2));

export function hraExemption(input: HraInput): HraResult {
  const months = Math.max(1, Math.min(12, Math.trunc(input.months)));
  const salary = Math.max(0, Math.trunc(input.salaryMonth)) * months;
  const hraReceived = Math.max(0, Math.trunc(input.hraMonth)) * months;
  const rentPaid = Math.max(0, Math.trunc(input.rentMonth)) * months;
  const actual = hraReceived;
  const rentLessTenth = Math.max(0, rentPaid - roundHalfUp(salary, 10));
  const percentOfSalary = roundHalfUp(salary * (input.fiftyPercentCity ? 50 : 40), 100);
  const exempt = Math.min(actual, rentLessTenth, percentOfSalary);
  const limiting: HraResult["limiting"] = exempt === actual ? "actual" : exempt === rentLessTenth ? "rent" : "salary";
  return { salary, hraReceived, rentPaid, actual, rentLessTenth, percentOfSalary, exempt, taxable: hraReceived - exempt, limiting, exemptMonth: roundHalfUp(exempt, months) };
}
