import { useLang } from "../i18n/LanguageContext";

interface FooterProps {
  copyrightText?: string;
}

export function Footer({ copyrightText }: FooterProps) {
  const { t } = useLang();
  return (
    <footer className="border-t border-border mt-10 py-6">
      <div className="max-w-[1440px] mx-auto px-8 text-xs text-muted-foreground">
        <span>{copyrightText ?? t("shell.footer.copyright")}</span>
      </div>
    </footer>
  );
}