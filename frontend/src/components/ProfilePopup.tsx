import { BadgeCheck, LogOut, Settings, X, type LucideIcon } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import { useDialogAccessibility } from "./Accessibility";

export interface ProfilePopupDetail {
  icon: LucideIcon;
  label: string;
  value: string;
}

interface ProfilePopupProps {
  initials: string;
  name: string;
  subtitle: string;
  badge?: string | null;
  details: ProfilePopupDetail[];
  settingsLabel: string;
  logoutLabel: string;
  onClose: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void | Promise<void>;
}

export function ProfilePopup({
  initials,
  name,
  subtitle,
  badge,
  details,
  settingsLabel,
  logoutLabel,
  onClose,
  onOpenSettings,
  onLogout,
}: ProfilePopupProps) {
  const { t } = useLang();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("shell.accessibility.profileMenu")}
        tabIndex={-1}
        className="fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-72"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <div className="flex items-start justify-between bg-gradient-to-br from-blue-700 to-blue-800 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-lg font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{name}</p>
              <p className="text-xs font-medium text-blue-200">{subtitle}</p>
              {badge && (
                <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                  <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{badge}</span>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 mt-0.5 shrink-0 text-white/60 transition-colors hover:text-white"
            aria-label={t("shell.accessibility.close")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-5 py-4">
          {details.map(({ icon: Icon, label, value }) => (
            <div key={`${label}-${value}`} className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Icon className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="break-words text-xs font-medium text-slate-700">{value || "—"}</p>
              </div>
            </div>
          ))}
        </div>

        {(onOpenSettings || onLogout) && (
          <div className="flex gap-2 px-4 py-3">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200"
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" /> {settingsLabel}
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={() => void onLogout()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> {logoutLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
