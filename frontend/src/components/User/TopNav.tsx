import type { ReactNode } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";
import { LanguageToggle } from "../LanguageToggle";

interface TopNavProps {
  onBack?: () => void;
  backLabel?: string;
  rightSlot?: ReactNode;
}

/**
Used inside the login/verify flow (UserLoginPage), where a full Navbar would be too heavy.
*/
export function TopNav({ onBack, backLabel, rightSlot }: TopNavProps) {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <>
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={14} />
                {backLabel ?? t("shell.topnav.back")}
              </button>
              <div className="w-px h-4 bg-border" />
            </>
          )}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/20">
              <Shield size={13} className="text-white" />
            </div>
            <span
              className="font-semibold text-foreground text-sm"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              REVITA
            </span>
            <span className="text-muted-foreground/50 text-xs hidden sm:block">
              {t("shell.topnav.brandFull")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {rightSlot}
        </div>
      </div>
    </header>
  );
}