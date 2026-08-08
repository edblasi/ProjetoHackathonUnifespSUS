import { useState } from "react";
import { useLang } from "../i18n/LanguageContext";

export function LanguageToggle() {
  const { locale, setLocale } = useLang();
  const [hoveredLocale, setHoveredLocale] = useState<string | null>(null);
  const options = [
    { locale: "pt-BR" as const, label: "🇧🇷 PT", title: "Português" },
    { locale: "en-US" as const, label: "🇺🇸 EN", title: "English" },
    { locale: "es-419" as const, label: "🇲🇽 ES", title: "Español" },
  ];

  return (
    <>
      <label className="sm:hidden">
        <span className="sr-only">Language / Idioma</span>
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as typeof locale)}
          className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
          aria-label="Language / Idioma"
        >
          <option value="pt-BR">🇧🇷 PT</option>
          <option value="en-US">🇺🇸 EN</option>
          <option value="es-419">🇲🇽 ES</option>
        </select>
      </label>
      <div
        className="hidden sm:flex items-center gap-0.5 rounded-lg border p-0.5"
        style={{ backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" }}
        role="group"
        aria-label="Language / Idioma"
      >
        {options.map((option) => {
          const active = locale === option.locale;
          const hovered = hoveredLocale === option.locale;
          return (
            <button
              key={option.locale}
              type="button"
              onClick={() => setLocale(option.locale)}
              onMouseEnter={() => setHoveredLocale(option.locale)}
              onMouseLeave={() => setHoveredLocale(null)}
              onFocus={() => setHoveredLocale(option.locale)}
              onBlur={() => setHoveredLocale(null)}
              title={option.title}
              aria-pressed={active}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all"
              style={{
                backgroundColor: active || hovered ? "#FFFFFF" : "transparent",
                color: active || hovered ? "#0F172A" : "#64748B",
                boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
