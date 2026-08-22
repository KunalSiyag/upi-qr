import { useEffect, useMemo, useState } from "react";

const draftKey = "proupiqr-gratuity-draft";

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

export function GratuityCalculator() {
  const [salary, setSalary] = useState("30000");
  const [yearsService, setYearsService] = useState("10");
  const [coveredByAct, setCoveredByAct] = useState(true);
  const [applyCeiling, setApplyCeiling] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const d = JSON.parse(saved);
      setSalary(String(d.salary ?? "30000"));
      setYearsService(String(d.yearsService ?? "10"));
      setCoveredByAct(typeof d.coveredByAct === "boolean" ? d.coveredByAct : true);
      setApplyCeiling(typeof d.applyCeiling === "boolean" ? d.applyCeiling : true);
    } catch {
      // Ignore broken local drafts.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ salary, yearsService, coveredByAct, applyCeiling }));
  }, [salary, yearsService, coveredByAct, applyCeiling]);

  const result = useMemo(() => {
    const wage = Math.max(0, Number(salary) || 0);
    const rawYears = Math.max(0, Number(yearsService) || 0);
    const eligible = rawYears >= 5;

    let qualifyingYears = rawYears;
    if (coveredByAct) {
      // Fractional year above 6 months rounds UP under the Act.
      const whole = Math.floor(rawYears);
      const fraction = rawYears - whole;
      qualifyingYears = whole + (fraction > 0.5 ? 1 : fraction === 0.5 ? 0 : 0);
      // Note: Act says >6 months counts as full year; exactly 6 months does not.
      if (fraction > 0.5) qualifyingYears = whole + 1;
      else qualifyingYears = whole;
    }

    let gratuity = coveredByAct
      ? (wage * 15 * qualifyingYears) / 26
      : (wage / 2) * rawYears;

    const capped = applyCeiling && gratuity > 2000000;
    if (capped) gratuity = 2000000;

    return { eligible, qualifyingYears, rawYears, gratuity, capped };
  }, [salary, yearsService, coveredByAct, applyCeiling]);

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="no-print rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="border-b border-forest/5 pb-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Gratuity planner</p>
          <h2 className="mt-1 text-2xl font-black text-forest">Estimate Leaving Benefits</h2>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-forest sm:col-span-2">Last drawn monthly salary (Basic + DA) ₹<input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
          <label className="text-sm font-bold text-forest sm:col-span-2">Years of continuous service<input type="number" step="0.1" min={0} max={45} value={yearsService} onChange={(e) => setYearsService(e.target.value)} placeholder="e.g. 7.6 for 7 years 7 months" className="mt-2 w-full rounded-2xl border border-forest/10 bg-cream px-4 py-3 font-medium outline-none focus:border-leaf" /></label>
        </div>

        <div className="mt-5 space-y-3">
          <label className="flex items-start gap-3 rounded-2xl bg-cream p-4 text-sm font-semibold text-forest">
            <input type="checkbox" checked={coveredByAct} onChange={(e) => setCoveredByAct(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#15803d]" />
            <span>Employer covered by the Payment of Gratuity Act, 1972<br /><span className="text-xs font-medium text-forest/60">Most factories, shops &amp; establishments with 10+ employees are.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl bg-cream p-4 text-sm font-semibold text-forest">
            <input type="checkbox" checked={applyCeiling} onChange={(e) => setApplyCeiling(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#15803d]" />
            <span>Cap at the ₹20 lakh statutory ceiling<br /><span className="text-xs font-medium text-forest/60">Employers may pay above the cap; only ₹20L is tax-exempt.</span></span>
          </label>
        </div>

        {!result.eligible && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Under the Act, gratuity is payable only after 5 years of continuous service (waived for death/disability).
          </p>
        )}
      </div>

      <div className="no-print flex flex-col rounded-[2rem] border border-white/75 bg-white/90 p-5 shadow-[0_18px_48px_rgba(17,59,44,0.08)]">
        <div className="border-b border-forest/5 pb-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-leaf">Estimated payout</p>
          <h2 className="mt-1 text-xl font-black text-forest">{result.eligible ? "Gratuity payable on exit" : "Not yet eligible"}</h2>
        </div>

        <div className="mt-6 rounded-[1.5rem] bg-forest p-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Estimated gratuity</p>
          <p className="mt-2 text-4xl font-black">{result.eligible ? money(result.gratuity) : "₹0"}</p>
          {result.capped && <p className="mt-2 text-xs font-bold text-sun">Capped at the ₹20 lakh statutory limit — employer may pay more voluntarily.</p>}
        </div>

        <div className="mt-5 space-y-2 text-sm leading-7 text-forest/80">
          {coveredByAct ? (
            <>
              <p><strong className="text-forest">Formula used:</strong> (15 × last drawn salary × qualifying years) ÷ 26</p>
              <p><strong className="text-forest">Qualifying years:</strong> {Math.floor(result.rawYears)} year(s){result.rawYears % 1 > 0.5 ? ` → rounded up to ${Math.floor(result.rawYears) + 1} (fraction above 6 months)` : ""}</p>
            </>
          ) : (
            <>
              <p><strong className="text-forest">Formula used:</strong> half month's salary per completed year of actual service</p>
              <p><strong className="text-forest">Years counted:</strong> {result.rawYears}</p>
            </>
          )}
          <p className="rounded-2xl bg-mint p-3 text-xs font-semibold text-forest/75">
            Gratuity is tax-exempt up to ₹20 lakh for private-sector employees covered by the Act. Amounts are indicative — your final settlement follows the employer's payroll records.
          </p>
        </div>

        <p className="mt-auto pt-5 text-xs font-semibold text-forest/55">
          Planning a farewell? Send the leaving letter with your final invoice via the <a href="/hi/invoice-generator/" className="font-bold text-leaf hover:underline">invoice tool</a> — or explore all <a href="/tools/" className="font-bold text-leaf hover:underline">money tools</a>.
        </p>
      </div>
    </div>
  );
}
