import { useState } from "react";
import { Search, Bell, X, Mail, Shield, BadgeCheck, Phone, MapPin } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import { LanguageToggle } from "./LanguageToggle";
import { ProfilePopup } from "./ProfilePopup";

export interface NavbarNotification {
  id?: string | number;
  title: string;
  description: string;
  time?: string;
  unread?: boolean;
  onClick?: () => void;
}

export interface NavbarProfileDetail {
  label: string;
  value: string;
}

interface NavbarProps {
  brandName?: string;
  brandSubtitle?: string;
  userName: string;
  userInitials: string;
  userEmail?: string | null;
  userRoleLabel?: string;
  notification?: NavbarNotification | null;
  notifications?: NavbarNotification[];
  profileDetails?: NavbarProfileDetail[];
  onOpenSettings?: () => void;
  onSignOut?: () => void;
}

export function Navbar({
  brandName = "SUS Digital",
  brandSubtitle,
  userName,
  userInitials,
  userEmail,
  userRoleLabel,
  notification = null,
  notifications,
  profileDetails = [],
  onOpenSettings,
  onSignOut,
}: NavbarProps) {
  const { t } = useLang();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const subtitle = brandSubtitle ?? t("shell.navbar.brandSubtitle");
  const roleLabel = userRoleLabel ?? t("shell.navbar.userRoleLabel");
  const alertItems = notifications?.length ? notifications.slice(0, 5) : notification ? [notification] : [];
  const hasUnread = alertItems.some((item) => item.unread !== false);

  return (
    <header className="bg-white border-b border-border sticky top-0 z-50" style={{ boxShadow: "0 1px 8px rgba(0,86,172,0.07)" }}>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-6">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-white" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" opacity="0.3" />
              <path d="M11 8H9v8h2V8zm4 0h-2v8h2V8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-primary leading-none tracking-tight">{brandName}</div>
            <div className="text-[10px] text-muted-foreground leading-none mt-0.5 tracking-wide uppercase">{subtitle}</div>
          </div>
        </div>

        <div className="hidden md:block flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" placeholder={t("shell.navbar.searchPlaceholder")} className="w-full h-9 pl-9 pr-4 text-sm rounded-lg bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" aria-label={t("shell.navbar.searchPlaceholder")} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <LanguageToggle />

          <div className="relative">
            <button onClick={() => { setShowNotif(!showNotif); setShowDropdown(false); }} className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label={t("shell.navbar.notifications")} aria-expanded={showNotif} aria-controls="patient-notifications-panel">
              <Bell className="w-4.5 h-4.5" />
              {hasUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" aria-hidden="true" />}
            </button>
            {showNotif && (
              <div id="patient-notifications-panel" role="region" aria-label={t("shell.accessibility.notificationsPanel")} className="fixed left-4 right-4 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80 bg-white rounded-xl border border-border shadow-lg z-50 overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(0,86,172,0.12)" }}>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground">{t("shell.navbar.recentAlerts")}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("shell.navbar.recentAlertsHint")}</p>
                  </div>
                  <button type="button" onClick={() => setShowNotif(false)} aria-label={t("shell.accessibility.close")} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" aria-hidden="true" /></button>
                </div>
                {alertItems.length ? (
                  <div className="max-h-80 divide-y divide-border overflow-y-auto">
                    {alertItems.map((item, index) => (
                      <button key={item.id ?? index} type="button" onClick={() => { item.onClick?.(); setShowNotif(false); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50">
                        <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${item.unread === false ? "bg-slate-300" : "bg-amber-500"}`} /><span className="sr-only">{t(item.unread === false ? "shell.accessibility.read" : "shell.accessibility.unread")}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                          {item.time && <p className="mt-1 text-[10px] text-muted-foreground/80">{item.time}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : <div className="px-4 py-6 text-center text-xs text-muted-foreground">{t("shell.navbar.noRecentAlerts")}</div>}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowDropdown(!showDropdown); setShowNotif(false); }}
              className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label={t("shell.navbar.myProfile")}
              aria-expanded={showDropdown}
            >
              {userInitials}
            </button>
            {showDropdown && (
              <ProfilePopup
                initials={userInitials}
                name={userName}
                subtitle={roleLabel}
                details={[
                  ...(userEmail ? [{ icon: Mail, label: t("shell.profile.email"), value: userEmail }] : []),
                  ...profileDetails.map((detail, index) => ({
                    icon: [Shield, BadgeCheck, BadgeCheck, Phone, MapPin][index] ?? Shield,
                    label: detail.label,
                    value: detail.value,
                  })),
                ]}
                settingsLabel={t("shell.navbar.settings")}
                logoutLabel={t("shell.navbar.signOut")}
                onClose={() => setShowDropdown(false)}
                onOpenSettings={onOpenSettings}
                onLogout={onSignOut}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
