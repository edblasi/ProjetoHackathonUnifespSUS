import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export interface DashboardCardOption<T extends string = string> {
  id: T;
  label: string;
}

export function useDashboardCardPreferences<T extends string>(storageKey: string, defaultIds: readonly T[]) {
  const defaults = useMemo(() => [...defaultIds], [defaultIds]);
  const [visibleIds, setVisibleIds] = useState<T[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return [...defaultIds];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [...defaultIds];
      const valid = parsed.filter((id): id is T => defaultIds.includes(id as T));
      return valid.length ? valid : [...defaultIds];
    } catch {
      return [...defaultIds];
    }
  });

  useEffect(() => {
    const valid = visibleIds.filter((id) => defaults.includes(id));
    localStorage.setItem(storageKey, JSON.stringify(valid.length ? valid : defaults));
  }, [storageKey, visibleIds, defaults]);

  const toggle = (id: T) => {
    setVisibleIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  };

  const reset = () => setVisibleIds([...defaults]);
  const isVisible = (id: T) => visibleIds.includes(id);

  return { visibleIds, toggle, reset, isVisible };
}

export function DashboardCustomizer<T extends string>({
  options,
  visibleIds,
  onToggle,
  onReset,
}: {
  options: readonly DashboardCardOption<T>[];
  visibleIds: readonly T[];
  onToggle: (id: T) => void;
  onReset: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        <SlidersHorizontal size={13} />
        {t("shell.cards.customize")}
      </button>

      {open && (
        <div className="fixed left-4 right-4 top-20 z-[80] rounded-xl border border-border bg-white p-4 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-72">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">{t("shell.cards.title")}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{t("shell.cards.subtitle")}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("shell.cards.close")}>
              <X size={14} />
            </button>
          </div>

          <div className="space-y-1.5">
            {options.map((option) => {
              const checked = visibleIds.includes(option.id);
              const onlyVisible = checked && visibleIds.length === 1;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={onlyVisible}
                  onClick={() => onToggle(option.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-white" : "border-border bg-white text-transparent"}`}>
                    <Check size={12} />
                  </span>
                  <span className="text-xs font-medium text-foreground">{option.label}</span>
                </button>
              );
            })}
          </div>

          <button type="button" onClick={onReset} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
            <RotateCcw size={12} />
            {t("shell.cards.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
