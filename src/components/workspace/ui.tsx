import { useEffect, useRef, type ReactNode } from "react";
import type { InvoiceState } from "../../lib/workspace/model";
import { useWs } from "./i18n";

export const inputClass =
  "w-full rounded-xl border border-forest/15 bg-cream px-3 py-2.5 text-sm text-forest outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20";
export const labelClass = "mb-1 block text-xs font-bold text-forest/70";
export const primaryButton =
  "rounded-xl bg-forest px-4 py-2.5 text-sm font-black text-white transition hover:bg-leaf disabled:opacity-50";
export const secondaryButton =
  "rounded-xl border border-forest/15 bg-white px-4 py-2.5 text-sm font-bold text-forest transition hover:bg-mint disabled:opacity-50";

const STATE_STYLE: Record<InvoiceState, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-mint text-leaf" },
  overdue: { label: "Overdue", className: "bg-coral/15 text-[#a8321d]" },
  due: { label: "Due", className: "bg-sun/25 text-[#7a4b00]" },
  partial: { label: "Part paid", className: "bg-sky-100 text-sky-800" },
  void: { label: "Void", className: "bg-forest/10 text-forest/60" },
};

export function StatusBadge({ state }: { state: InvoiceState }) {
  const style = STATE_STYLE[state];
  const { tr } = useWs();
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${style.className}`}>{tr(style.label)}</span>;
}

/** Bottom sheet on phones, centered dialog on larger screens. Esc and backdrop close it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const { tr } = useWs();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-forest/40 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[1.5rem] bg-white p-5 shadow-2xl sm:rounded-[1.5rem]"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-forest">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label={tr("Close")} className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-forest/50 hover:bg-mint hover:text-forest">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      {children}
      {error && <p className="mt-1 text-xs font-bold text-[#a8321d]" role="alert">{error}</p>}
    </div>
  );
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
