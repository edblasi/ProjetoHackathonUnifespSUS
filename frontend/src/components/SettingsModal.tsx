import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Languages, Mail, Save, SlidersHorizontal, UserRound, X } from "lucide-react";
import { LanguageToggle } from "./LanguageToggle";
import { useLang } from "../i18n/LanguageContext";
import { apiGet, apiPatch } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useDialogAccessibility } from "./Accessibility";

interface SettingsProfile {
  nome_exibicao: string;
  email: string | null;
  papel: string;
  idioma_preferido: string;
  cnes_vinculo?: string | null;
  unidade_nome?: string | null;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

const inputClass = "mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function SettingsModal({ open, onClose, title, subtitle }: SettingsModalProps) {
  const { t, locale, setLocale } = useLang();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    apiGet<SettingsProfile>("/api/settings/profile")
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((error: unknown) => { if (!cancelled) setMessage({ ok: false, text: error instanceof Error ? error.message : t("shell.settings.loadError") }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, t]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirm_password") ?? "");
    if (password && password !== confirmPassword) {
      setMessage({ ok: false, text: t("shell.settings.passwordMismatch") });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const nextLocale = String(form.get("idioma_preferido") ?? locale) as "pt-BR" | "en-US" | "es-419";
      await apiPatch("/api/settings/profile", {
        nome_exibicao: String(form.get("nome_exibicao") ?? "").trim() || undefined,
        email: String(form.get("email") ?? "").trim() || undefined,
        password: password || undefined,
        idioma_preferido: nextLocale,
      });
      setLocale(nextLocale);
      await supabase.auth.refreshSession();
      const refreshed = await apiGet<SettingsProfile>("/api/settings/profile");
      setProfile(refreshed);
      window.dispatchEvent(new CustomEvent("umdr-profile-updated"));
      setMessage({ ok: true, text: t("shell.settings.saved") });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : t("shell.settings.saveError") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" tabIndex={-1} className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-foreground">
              <SlidersHorizontal size={16} />
              <h2 id="settings-dialog-title" className="text-sm font-bold">{title ?? t("shell.settings.title")}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle ?? t("shell.settings.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("shell.settings.close")}>
            <X size={16} />
          </button>
        </div>

        {loading && !profile ? <div className="p-8 text-center text-sm text-muted-foreground">…</div> : (
          <form onSubmit={submit}>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              {message && <div role={message.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.ok && <CheckCircle2 size={15} />}{message.text}</div>}

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2"><UserRound size={15} className="text-primary" /><div><p className="text-xs font-bold text-foreground">{t("shell.settings.account")}</p><p className="text-[11px] text-muted-foreground">{profile?.papel ?? "—"}{profile?.unidade_nome ? ` · ${profile.unidade_nome}` : ""}</p></div></div>
                <label className="block text-xs font-semibold text-muted-foreground">{t("shell.settings.name")}<input name="nome_exibicao" defaultValue={profile?.nome_exibicao ?? ""} required className={inputClass} /></label>
                <label className="mt-3 block text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-1.5"><Mail size={12} />{t("shell.settings.email")}</span><input name="email" type="email" defaultValue={profile?.email ?? ""} required className={inputClass} /></label>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2"><KeyRound size={15} className="text-primary" /><div><p className="text-xs font-bold text-foreground">{t("shell.settings.password")}</p><p className="text-[11px] text-muted-foreground">{t("shell.settings.passwordHint")}</p></div></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-muted-foreground">{t("shell.settings.newPassword")}<input name="password" type="password" minLength={8} autoComplete="new-password" className={inputClass} /></label>
                  <label className="block text-xs font-semibold text-muted-foreground">{t("shell.settings.confirmPassword")}<input name="confirm_password" type="password" minLength={8} autoComplete="new-password" className={inputClass} /></label>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Languages size={15} className="text-primary" />
                  <div><p className="text-xs font-bold text-foreground">{t("shell.settings.language")}</p><p className="text-[11px] text-muted-foreground">{t("shell.settings.languageHint")}</p></div>
                </div>
                <input type="hidden" name="idioma_preferido" value={locale} />
                <LanguageToggle />
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-bold text-foreground">{t("shell.settings.dashboard")}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("shell.settings.dashboardHint")}</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <button type="button" onClick={onClose} className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted">{t("shell.settings.close")}</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"><Save size={14} />{saving ? t("shell.settings.saving") : t("shell.settings.save")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
