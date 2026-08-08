import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useLang } from "../i18n/LanguageContext";

type AnnouncementMode = "polite" | "assertive";

interface AccessibilityContextValue {
  announce: (message: string, mode?: AnnouncementMode) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");

  const announce = useCallback((message: string, mode: AnnouncementMode = "polite") => {
    const setter = mode === "assertive" ? setAssertiveMessage : setPoliteMessage;
    setter("");
    window.setTimeout(() => setter(message), 40);
  }, []);

  return (
    <AccessibilityContext.Provider value={{ announce }}>
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[9999] -translate-y-24 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-blue-300"
      >
        {t("shell.accessibility.skipToContent")}
      </a>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {politeMessage}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveMessage}
      </div>
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilityAnnouncement() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error("useAccessibilityAnnouncement must be used inside AccessibilityProvider");
  return context.announce;
}

export function useAccessiblePage(title: string, description?: string) {
  const { t } = useLang();
  const announce = useAccessibilityAnnouncement();

  useEffect(() => {
    if (!title) return;
    document.title = `${title} — REVITA`;
    const timer = window.setTimeout(() => {
      announce(
        description
          ? t("shell.accessibility.pageReadyWithDescription", { title, description })
          : t("shell.accessibility.pageReady", { title }),
      );
    }, 80);
    return () => window.clearTimeout(timer);
  }, [announce, description, t, title]);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogAccessibility<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (!dialog) return;

    const focusInitial = window.setTimeout(() => {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? dialog).focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusInitial);
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => previous?.focus(), 0);
    };
  }, [open]);

  return ref;
}
