// Stamp duty and registration cost for a property purchase, in integer paise. No imports, so `scripts/stamp-duty.test.mjs` runs it under Node.
//
// There is no state table here on purpose: stamp duty, surcharges, registration fees, caps and concessions (for women buyers, first homes,
// metro areas) differ by state and change often, and a wrong pre-filled rate would give a wrong total. The buyer enters the rates from the state
// registration department's site or a registered document writer. This tool does the arithmetic and the "higher of agreement value and
// circle rate" rule that many states apply: duty is charged on whichever is greater.
// Each charge is rounded half-up to the paisa. Some offices round duty to the next Rs 10 or Rs 100; this does not.

export type StampDutyInput = {
  agreementValue: number; // paise
  circleValue: number; // paise, 0 when unknown
  useHigher: boolean; // charge on the higher of the two
  stampBps: number;
  surchargeBps: number; // cess, local body tax or metro surcharge, charged on the same base
  registrationBps: number;
  registrationCap: number; // paise, 0 = no cap
  otherCharges: number; // paise, fixed (document writer, e-stamp fee and the like)
};

export type StampDutyResult = {
  base: number; // the value duty is charged on
  baseIsCircle: boolean;
  stampDuty: number;
  surcharge: number;
  registration: number;
  registrationCapped: boolean;
  other: number;
  totalCharges: number;
  allIn: number; // agreement value + charges
  chargesBps: number; // charges as a share of the agreement value, in basis points (rounded)
};

const mulBps = (paise: number, bps: number): number => Math.floor((paise * bps * 2 + 10000) / 20000);

export function stampDuty(input: StampDutyInput): StampDutyResult {
  const agreement = Math.max(0, Math.trunc(input.agreementValue));
  const circle = Math.max(0, Math.trunc(input.circleValue));
  const baseIsCircle = input.useHigher && circle > agreement;
  const base = baseIsCircle ? circle : agreement;
  const stamp = mulBps(base, input.stampBps);
  const surcharge = mulBps(base, input.surchargeBps);
  const rawReg = mulBps(base, input.registrationBps);
  const cap = Math.max(0, Math.trunc(input.registrationCap));
  const registrationCapped = cap > 0 && rawReg > cap;
  const registration = registrationCapped ? cap : rawReg;
  const other = Math.max(0, Math.trunc(input.otherCharges));
  const totalCharges = stamp + surcharge + registration + other;
  return {
    base,
    baseIsCircle,
    stampDuty: stamp,
    surcharge,
    registration,
    registrationCapped,
    other,
    totalCharges,
    allIn: agreement + totalCharges,
    chargesBps: agreement > 0 ? Math.floor((totalCharges * 20000 + agreement) / (agreement * 2)) : 0,
  };
}
