import { useEffect, useRef, type ReactNode } from "react";
import type { InvoiceState } from "../../lib/workspace/model";
import { useWs } from "./i18n";

// Ledger tokens for the workspace: hairline cards on a fog page, ink text, graphite for the one
// filled action per view, leaf green only for links and focus. Weights stop at 600.
export const inputClass =
  "w-full rounded-[10px] border border-pebble/80 bg-white px-3 py-2 text-sm text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 focus:border-leaf focus:ring-[3px] focus:ring-leaf/15";
export const labelClass = "mb-1.5 block text-[13px] font-medium text-charcoal";
export const primaryButton =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-graphite px-3.5 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgba(28,40,64,0.12)] hover:bg-ink disabled:opacity-50";
export const secondaryButton =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 text-sm font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-fog disabled:opacity-50";
/** Compact row action (tables). */
export const rowButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] bg-white px-2.5 text-[13px] font-medium text-ink ring-1 ring-inset ring-hairline hover:bg-fog disabled:opacity-50";
export const rowPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] bg-graphite px-2.5 text-[13px] font-medium text-white hover:bg-ink disabled:opacity-50";
export const ghostButton =
  "inline-flex h-8 items-center justify-center rounded-[8px] px-2 text-[13px] font-medium text-muted hover:bg-fog hover:text-ink";
export const dangerText = "text-[#a8321d]";
/** White card with a hairline ring and the faintest blue-tinted lift. */
export const card = "rounded-[12px] bg-white ring-1 ring-hairline shadow-[0_1px_2px_rgba(28,40,64,0.04)]";
export const cardTitle = "text-[15px] font-semibold text-ink";
export const cardNote = "text-[13px] leading-5 text-muted";

const STATE_STYLE: Record<InvoiceState, { label: string; className: string; dot: string }> = {
  paid: { label: "Paid", className: "bg-[#ecf6f0] text-[#17603f]", dot: "bg-[#1f7a52]" },
  overdue: { label: "Overdue", className: "bg-[#fdeeec] text-[#a8321d]", dot: "bg-[#d84a3a]" },
  due: { label: "Due", className: "bg-[#fdf4e6] text-[#8a5a00]", dot: "bg-[#e8a33d]" },
  partial: { label: "Part paid", className: "bg-[#eef3fd] text-[#2453a6]", dot: "bg-[#4a7be0]" },
  void: { label: "Void", className: "bg-fog text-muted", dot: "bg-pebble" },
};

export function StatusBadge({ state }: { state: InvoiceState }) {
  const style = STATE_STYLE[state];
  const { tr } = useWs();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[7px] px-2 py-0.5 text-[12px] font-medium ${style.className}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {tr(style.label)}
    </span>
  );
}

/** 16px line icons (1.5 stroke) for the sidebar and row actions. */
const ICONS = {
  overview: "M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zm10-16v4h6V4h-6z",
  invoices: "M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5M9.5 12.5h5m-5 3.5h5",
  clients: "M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19m16 0v-1.5a3.5 3.5 0 00-2.6-3.4M14.5 4.1a3.5 3.5 0 010 6.8M13.5 7.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z",
  settings: "M10.3 4.3a1.7 1.7 0 013.4 0l.2.9a1.7 1.7 0 002.5 1l.8-.4a1.7 1.7 0 012.4 2.4l-.5.8a1.7 1.7 0 001 2.5l.9.2a1.7 1.7 0 010 3.4l-.9.2a1.7 1.7 0 00-1 2.5l.5.8a1.7 1.7 0 01-2.4 2.4l-.8-.5a1.7 1.7 0 00-2.5 1l-.2.9a1.7 1.7 0 01-3.4 0l-.2-.9a1.7 1.7 0 00-2.5-1l-.8.5a1.7 1.7 0 01-2.4-2.4l.5-.8a1.7 1.7 0 00-1-2.5l-.9-.2a1.7 1.7 0 010-3.4l.9-.2a1.7 1.7 0 001-2.5l-.5-.8a1.7 1.7 0 012.4-2.4l.8.4a1.7 1.7 0 002.5-1l.2-.9zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zm9 2l-4-4",
  whatsapp: "M4 20l1.3-3.9A8 8 0 1112 20a8 8 0 01-4.1-1.1L4 20z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1m-2 7.4a4 4 0 01-5.7 0 4 4 0 010-5.7l3-3",
  download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
  cloud: "M7 18a4 4 0 01-.9-7.9 5.5 5.5 0 0110.7-1.4A4.5 4.5 0 0117 18H7z",
  lock: "M7 11V8a5 5 0 0110 0v3M6 11h12v9H6v-9z",
  chevrons: "M8 9.5l4-4 4 4m-8 5l4 4 4-4",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
    </svg>
  );
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
    <div className="ws-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(16,17,19,0.32)] sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ws-sheet max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[16px] bg-white p-5 shadow-[0_2px_6px_rgba(28,40,64,0.06),0_24px_64px_rgba(28,40,64,0.18)] sm:rounded-[14px] sm:p-6"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label={tr("Close")} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-xl text-muted hover:bg-fog hover:text-ink">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, htmlFor, error, children }: { label: ReactNode; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>{label}</label>
      {children}
      {/* `${htmlFor}-error`, so the input can point aria-describedby at its message. */}
      {error && <p id={`${htmlFor}-error`} className={`mt-1 text-xs font-medium ${dangerText}`} role="alert" data-field-error>{error}</p>}
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
