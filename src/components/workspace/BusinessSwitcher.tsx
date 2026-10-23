import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { BookSyncStatus } from "../../lib/workspace/sync";
import { Icon } from "./ui";
import { useWs } from "./i18n";

/** One business as the switcher shows it (docs/spec-multi-business.md §7.2). */
export interface SwitcherBook {
  id: string;
  name: string;
  status?: BookSyncStatus;
  /** Pay-link claims waiting in this business. */
  claims: number;
  readOnly: boolean;
}

export interface SwitcherUsage {
  used: number;
  /** null while the plan is unknown; `note` then says why adding is off. */
  limit: number | null;
  /** Shown instead of the usage line when adding isn't possible right now. */
  note?: string;
}

const STATUS_LABEL: Partial<Record<BookSyncStatus, string>> = {
  limit: "Not syncing",
  unregistered: "Waiting to sync",
  cloud_only: "In your account",
};

/** "{used} of {limit} businesses", in red when a downgraded account holds more than its plan allows. */
export function UsageLine({ usage, className = "" }: { usage: SwitcherUsage; className?: string }) {
  const { tr } = useWs();
  if (usage.note) return <p className={`text-xs text-muted ${className}`}>{tr(usage.note)}</p>;
  if (usage.limit === null) return null;
  const over = usage.used > usage.limit;
  return (
    <p className={`text-xs tabular-nums ${over ? "text-[#a8321d]" : "text-muted"} ${className}`}>
      {tr(usage.limit === 1 ? "{used} of {limit} business" : "{used} of {limit} businesses", { used: usage.used, limit: usage.limit })}
    </p>
  );
}

function Avatar({ name, size, strong }: { name: string; size: "sm" | "md"; strong: boolean }) {
  const box = size === "md" ? "h-8 w-8 rounded-[8px] text-sm" : "h-6 w-6 rounded-[6px] text-[11px]";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center font-semibold ${box} ${strong ? "bg-graphite text-white" : "bg-fog text-charcoal ring-1 ring-inset ring-hairline"}`}>
      {(name || "P").trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Business switcher: the sidebar header on desktop, a compact chip at the start of the
 * sticky tab strip on phones. A listbox popover (never a dialog, never inside an li, no
 * aria-current) so the e2e selectors for rows, tabs and sheets stay unambiguous.
 */
export function BusinessSwitcher({ variant, books, active, planLabel, usage, onSelect, onAdd }: {
  variant: "sidebar" | "chip";
  books: SwitcherBook[];
  active: string;
  planLabel: string;
  usage: SwitcherUsage;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { tr } = useWs();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = books.find((b) => b.id === active);
  const name = current?.name || tr("Your business");

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    // The selected business takes focus, so arrow keys work at once.
    const selected = list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>("[role=option]");
    selected?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (id: string) => {
    close(true);
    if (id !== active) onSelect(id);
  };

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const options = [...(list.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => { event.preventDefault(); options[(to + options.length) % options.length]?.focus(); };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if ((event.key === "Enter" || event.key === " ") && at >= 0) { event.preventDefault(); choose(options[at].dataset.bookOption as string); }
  }

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.stopPropagation(); close(true); }
        if (event.key === "Tab" && open) setOpen(false);
      }}
    >
      {variant === "sidebar" ? (
        <button
          ref={trigger}
          type="button"
          data-book-switcher
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen(!open)}
          title={name}
          className={`flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/70 ${open ? "bg-white ring-1 ring-hairline" : ""}`}
        >
          <Avatar name={current?.name ?? ""} size="md" strong />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{name}</span>
            <span className="block text-xs text-muted">{planLabel}</span>
          </span>
          <Icon name="chevrons" className="h-4 w-4 shrink-0 text-muted" />
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          data-book-switcher
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen(!open)}
          className="flex h-11 items-center gap-1 rounded-[7px] bg-white pl-2 pr-1.5 ring-1 ring-inset ring-hairline transition-colors duration-150 hover:bg-fog"
        >
          <Avatar name={current?.name ?? ""} size="sm" strong />
          <span className="sr-only">{tr("Businesses")}: {name}</span>
          <Icon name="chevrons" className="h-3.5 w-3.5 text-muted" />
        </button>
      )}

      {open && (
        <div className={`ws-popover absolute top-full z-40 mt-1.5 rounded-[12px] bg-white p-1 ring-1 ring-hairline shadow-[0_2px_6px_rgba(28,40,64,0.06),0_16px_40px_rgba(28,40,64,0.14)] ${variant === "sidebar" ? "left-0 right-0 min-w-[15rem]" : "left-0 w-[17rem] max-w-[calc(100vw-2rem)]"}`}>
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">{tr("Businesses")}</p>
          <div id={listId} ref={list} role="listbox" aria-label={tr("Businesses")} onKeyDown={onListKey} className="max-h-[60vh] overflow-y-auto">
            {books.map((book) => {
              const selected = book.id === active;
              const label = book.readOnly ? "Read-only" : book.status ? STATUS_LABEL[book.status] : undefined;
              return (
                <div
                  key={book.id}
                  role="option"
                  aria-selected={selected}
                  data-book-option={book.id}
                  tabIndex={-1}
                  onClick={() => choose(book.id)}
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-sm outline-none transition-colors duration-100 focus-visible:bg-fog focus-visible:ring-2 focus-visible:ring-leaf/30 lg:min-h-9 ${selected ? "bg-fog" : "hover:bg-fog"}`}
                >
                  <Avatar name={book.name} size="sm" strong={selected} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${selected ? "font-semibold text-ink" : "font-medium text-charcoal"}`}>{book.name || tr("Your business")}</span>
                    {label && <span className="block text-[11px] text-muted">{tr(label)}</span>}
                  </span>
                  {!selected && book.claims > 0 && (
                    <span className="rounded-[6px] bg-[#fdf4e6] px-1.5 text-[11px] font-semibold tabular-nums text-[#8a5a00]" aria-label={tr(book.claims === 1 ? "{n} payment to confirm" : "{n} payments to confirm", { n: book.claims })}>{book.claims}</span>
                  )}
                  {selected && <Icon name="check" className="h-4 w-4 shrink-0 text-ink" />}
                </div>
              );
            })}
          </div>
          <div className="mt-1 border-t border-hairline pt-1">
            <button
              type="button"
              data-add-business
              disabled={usage.limit === null}
              onClick={() => { close(false); onAdd(); }}
              className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-fog disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
            >
              {tr("+ Add business")}
            </button>
            <UsageLine usage={usage} className="px-2 pb-1.5" />
          </div>
        </div>
      )}
    </div>
  );
}
