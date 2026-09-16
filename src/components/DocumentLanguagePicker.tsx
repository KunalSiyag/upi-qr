import { DOC_LANG_OPTIONS, type DocLang } from "../data/documentLang";

export function DocumentLanguagePicker({
  value,
  onChange,
  label,
}: {
  value: DocLang;
  onChange: (lang: DocLang) => void;
  label: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-forest/50">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {DOC_LANG_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              value === option.id
                ? "border-leaf bg-leaf text-white shadow-sm"
                : "border-forest/10 bg-cream text-forest hover:border-leaf/40"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
