import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../i18n/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { Card } from "../components/Card";
import { ErrorState, LoadingState } from "../components/DataState";
import { LanguageToggle } from "../components/LanguageToggle";
import { SettingsModal } from "../components/SettingsModal";
import { CommunicationsCenter } from "../components/CommunicationsCenter";
import { CreSupportInbox } from "../components/CreSupportInbox";
import { ShipmentModal, TriageModal } from "../components/CreActionModals";
import { DashboardCustomizer, useDashboardCardPreferences } from "../components/DashboardCustomizer";
import { crePageForAlert } from "../lib/alertRouting";
import { patientFirstName } from "../lib/patientPrivacy";
import { apiPatch, apiPost } from "../lib/api";
import { useSeenAlerts } from "../hooks/useSeenAlerts";
import { useAccessiblePage, useDialogAccessibility } from "../components/Accessibility";
import {
  useKpiDashboard,
  useAlertasCriticos,
  useRecalls,
  useLotesRecentes,
  usePacientesAguardando,
  useUsuarioAtual,
  useFluxoDispositivosMensal,
  useTriagens,
  useRemessasLogistica,
  useRelatorioMensal,
  useCreMatching,
  useNotificacoes,
  type Triagem,
  type TriageWorkflowStatus,
  type PacienteAguardando,
} from "../hooks/FetchData";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  BadgeCheck,
  BarChart2,
  Bell,
  Box,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  FileWarning,
  Heart,
  Home,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Package,
  PackageCheck,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Stethoscope,
  TrendingUp,
  Truck,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ═══════════════════════════════════════════════════════════════
// TYPES & DATA
// ═══════════════════════════════════════════════════════════════

type Page = "inicio" | "pacientes" | "logistica" | "matching" | "triagens" | "relatorios" | "atendimentos" | "comunicacoes";

const CRE_HOME_CARD_IDS = ["queue", "stock", "logistics", "matchings"] as const;
type CreHomeCardId = (typeof CRE_HOME_CARD_IDS)[number];

type AttendanceStatus = "waiting" | "in-progress";
type FilterTab = "all" | "waiting" | "in-progress";

function canStartTriage(patient: PacienteAguardando): boolean {
  return ["AUTORIZADA", "EM_FILA"].includes(patient.status) && !patient.triagem_status;
}


// ═══════════════════════════════════════════════════════════════
// SHARED ATOMS
// ═══════════════════════════════════════════════════════════════

function LoteStatusBadge({ status }: { status: "OK" | "ESTOQUE_BAIXO" | "VENCIDO" }) {
  const { t } = useLang();
  const cls: Record<string, string> = {
    OK: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ESTOQUE_BAIXO: "bg-amber-50 text-amber-700 border-amber-200",
    VENCIDO: "bg-red-50 text-red-700 border-red-200",
  };
  const dot: Record<string, string> = {
    OK: "bg-emerald-500",
    ESTOQUE_BAIXO: "bg-amber-500",
    VENCIDO: "bg-red-500",
  };
  const label: Record<string, string> = {
    OK: t("lots.status.ok"),
    ESTOQUE_BAIXO: t("lots.status.low"),
    VENCIDO: t("lots.status.expired"),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {label[status]}
    </span>
  );
}

function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const { t } = useLang();
  if (status === "in-progress") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {t("patients.badge.inProgress")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
      {t("patients.badge.waiting")}
    </span>
  );
}

function DeviceTag({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border bg-violet-50 text-violet-700 border-violet-200">
      {type}
    </span>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">
        {label}
      </p>
      {payload.map((p: any) => (
        <div
          key={p.dataKey}
          className="flex items-center gap-2"
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-bold text-slate-800">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT — SIDEBAR
// ═══════════════════════════════════════════════════════════════

interface SidebarProps {
  current: Page;
  onNavigate: (p: Page) => void;
  onOpenSettings: () => void;
  open: boolean;
  onClose: () => void;
}

function Sidebar({ current, onNavigate, onOpenSettings, open, onClose }: SidebarProps) 
{
  const { t, locale } = useLang();
  const { signOut } = useAuth();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const nav: { icon: any; label: string; page: Page | null }[] = [
    { icon: Home,          label: t("nav.home"),      page: "inicio"    },
    { icon: Users,         label: t("nav.patients"),  page: "pacientes" },
    { icon: RefreshCw,     label: t("nav.logistics"), page: "logistica" },
    { icon: Zap,           label: t("nav.matching"),  page: "matching" },
    { icon: ClipboardList, label: t("nav.triage"),    page: "triagens"  },
    { icon: Activity,      label: t("nav.reports"),   page: "relatorios"},
    { icon: MessageSquare, label: t("nav.supportInbox"), page: "atendimentos"},
    { icon: Bell,          label: t("nav.communications"), page: "comunicacoes"},
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  const filteredNav = nav.filter((item) => !normalizedSearch || item.label.toLocaleLowerCase(locale).includes(normalizedSearch));

  return (
    <aside
      id="cre-sidebar"
      aria-label={t("shell.accessibility.mainNavigation")}
      className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen shadow-xl transition-transform lg:sticky lg:top-0 lg:z-auto lg:w-56 lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
            <Heart
              className="w-4 h-4 text-white"
              strokeWidth={2.5}
            />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 tracking-tight">REVITA</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Search className="w-3 h-3 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="text"
            placeholder={t("nav.search")}
            aria-label={t("nav.search")}
            className="w-full bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
          />
        </div>
      </div>

      {/* nav */}
      <nav aria-label={t("shell.accessibility.mainNavigation")} className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {filteredNav.map(({ icon: Icon, label, page }) => {
          const active = page !== null && current === page;
          return (
            <button
              key={label}
              aria-current={active ? "page" : undefined}
              onClick={() => { if (page) { onNavigate(page); onClose(); } }}
              disabled={page === null}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${
                  active
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : page === null
                      ? "text-slate-300 cursor-default font-medium"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-medium"
                }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${active ? "text-blue-600" : page === null ? "text-slate-300" : "text-slate-400"}`}
                strokeWidth={active ? 2.5 : 2}
              />
              {label}
              {active && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-blue-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* bottom */}
      <div className="px-3 pb-4 border-t border-slate-100 pt-3 space-y-0.5">
        <button type="button" onClick={() => { onClose(); onOpenSettings(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors">
          <Settings className="w-4 h-4 text-slate-400" /> {t("nav.settings")}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4 text-slate-400" /> {t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT — TOPBAR
// ═══════════════════════════════════════════════════════════════

// PAGE_TITLES is now dynamic — built inside Topbar using t()

function ProfilePopup({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const { t } = useLang();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { data: usuario } = useUsuarioAtual();

  const iniciais =
    (usuario?.nome_exibicao ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t("shell.accessibility.profileMenu")} tabIndex={-1} className="fixed left-4 right-4 top-16 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-72" style={{ fontFamily: "Inter, sans-serif" }}>
        <div className="px-5 py-4 bg-gradient-to-br from-blue-700 to-blue-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white font-bold text-lg">{iniciais}</div>
            <div>
              <p className="text-sm font-bold text-white">{usuario?.nome_exibicao ?? "—"}</p>
              <p className="text-xs text-blue-200 font-medium">{t("profile.role")}</p>
              {usuario?.cnes_vinculo && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-full">
                  <BadgeCheck className="w-3 h-3" /> #{usuario.cnes_vinculo}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="text-white/60 hover:text-white transition-colors mt-0.5">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 border-b border-slate-100">
          {[
            { icon: Mail,      label: t("shell.profile.email"), value: user?.email ?? "—" },
            { icon: Building2, label: t("profile.unit"),        value: usuario?.unidade_nome ?? t("profile.unitValue") },
            { icon: Shield,    label: t("profile.profile"),     value: t("profile.roleValue") },
            { icon: BadgeCheck,label: t("shell.profile.cnes"),  value: usuario?.cnes_vinculo ?? "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-xs font-medium text-slate-700 truncate">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 flex gap-2">
          <button type="button" onClick={() => { onClose(); onOpenSettings(); }} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            <Settings className="w-3.5 h-3.5" /> {t("profile.settings")}
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> {t("profile.logout")}
          </button>
        </div>
      </div>
    </>
  );
}

function Topbar({ page, onNavigate, onOpenSettings, onOpenMenu }: { page: Page; onNavigate: (page: Page) => void; onOpenSettings: () => void; onOpenMenu: () => void }) {
  const { t, locale } = useLang();
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { user } = useAuth();
  const { data: usuario } = useUsuarioAtual();
  const { data: criticalAlerts } = useAlertasCriticos();
  const { data: recalls } = useRecalls();
  const { data: notifications, marcarComoLida } = useNotificacoes();
  const { isSeen, markSeen } = useSeenAlerts(`umdr:cre:${user?.id ?? "anonymous"}:seen-alerts`);
  const recentAlerts = [
    ...(notifications ?? []).map((item) => {
      const id = `notification-${item.id}`;
      return { id, title: item.titulo, description: item.mensagem ?? "", time: new Date(item.criado_em).toLocaleString(locale), target: crePageForAlert(item.destino_ui, "notification") as Page, notificationId: item.id, unread: !item.lida && !isSeen(id) };
    }),
    ...(criticalAlerts ?? []).map((item, index) => {
      const id = `critical-${item.tipo}-${item.gerado_em}-${index}`;
      return { id, title: t("alerts.title"), description: item.mensagem, time: new Date(item.gerado_em).toLocaleString(locale), target: crePageForAlert(item.target, item.tipo) as Page, notificationId: null as number | null, unread: !isSeen(id) };
    }),
    ...(recalls ?? []).filter((item) => !["ENCERRADO", "CANCELADO"].includes(item.status)).map((item) => {
      const id = `recall-${item.id}`;
      return { id, title: t("recalls.title"), description: `${item.codigo_lote} — ${item.nome_produto}`, time: item.data_abertura ? new Date(`${item.data_abertura}T00:00:00`).toLocaleDateString(locale) : "", target: "comunicacoes" as Page, notificationId: null as number | null, unread: !isSeen(id) };
    }),
  ].slice(0, 7);
  const hasUnreadAlerts = recentAlerts.some((alert) => alert.unread);

  const iniciais =
    (usuario?.nome_exibicao ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  const pageTitleMap: Record<Page, { title: string; sub: string }> = {
    inicio:     { title: t("page.inicio.title"),     sub: t("page.inicio.sub")     },
    pacientes:  { title: t("page.pacientes.title"),  sub: t("page.pacientes.sub")  },
    logistica:  { title: t("page.logistica.title"),  sub: t("page.logistica.sub")  },
    matching:   { title: t("page.matching.title"),   sub: t("page.matching.sub")   },
    triagens:   { title: t("page.triagens.title"),   sub: t("page.triagens.sub")   },
    relatorios: { title: t("page.relatorios.title"), sub: t("page.relatorios.sub") },
    atendimentos: { title: t("page.atendimentos.title"), sub: t("page.atendimentos.sub") },
    comunicacoes: { title: t("page.comunicacoes.title"), sub: t("page.comunicacoes.sub") },
  };
  const { title, sub } = pageTitleMap[page];
  useAccessiblePage(title, sub);

  return (
    <header className="min-h-14 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 shrink-0 relative">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenMenu} aria-controls="cre-sidebar" className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Abrir menu"><Menu className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="truncate text-sm sm:text-base font-bold text-slate-900">{title}</h1>
          <p className="hidden sm:block truncate text-xs text-slate-400 font-medium">{sub}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <LanguageToggle />
        <div className="relative">
          <button type="button" onClick={() => { setAlertsOpen((value) => !value); setProfileOpen(false); }} className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-expanded={alertsOpen} aria-controls="cre-alerts-panel" aria-label={t("shell.navbar.notifications")}>
            <Bell aria-hidden="true" className="w-4 h-4 text-slate-500" />
            {hasUnreadAlerts && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
          </button>
          {alertsOpen && <div id="cre-alerts-panel" role="region" aria-label={t("shell.accessibility.notificationsPanel")} className="fixed left-4 right-4 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-80">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-bold text-slate-800">{t("shell.navbar.recentAlerts")}</p><p className="text-[11px] text-slate-400">{t("shell.navbar.recentAlertsHint")}</p></div><button type="button" onClick={() => setAlertsOpen(false)} aria-label={t("shell.accessibility.close")} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" aria-hidden="true" /></button></div>
            {recentAlerts.length ? <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">{recentAlerts.map((alert) => <button key={alert.id} type="button" onClick={() => { markSeen(alert.id); if (alert.notificationId) void marcarComoLida(alert.notificationId); setAlertsOpen(false); onNavigate(alert.target); }} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${alert.unread ? "bg-white" : "bg-slate-50/70"}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${alert.unread ? "bg-red-500" : "bg-slate-300"}`} /><span className="min-w-0"><span className={`block text-xs font-bold ${alert.unread ? "text-slate-800" : "text-slate-500"}`}>{alert.title}</span><span className={`mt-0.5 block text-[11px] line-clamp-2 ${alert.unread ? "text-slate-500" : "text-slate-400"}`}>{alert.description}</span><span className="mt-1 block text-[10px] text-slate-400">{alert.time}</span></span></button>)}</div> : <p className="px-4 py-6 text-center text-xs text-slate-400">{t("shell.navbar.noRecentAlerts")}</p>}
          </div>}
        </div>
        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            aria-label={t("shell.navbar.myProfile")}
            aria-expanded={profileOpen}
            className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all"
          >
            {iniciais}
          </button>
          {profileOpen && <ProfilePopup onClose={() => setProfileOpen(false)} onOpenSettings={onOpenSettings} />}
        </div>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: DASHBOARD (Início)
// ═══════════════════════════════════════════════════════════════

function KpiCards({ onNavigate, visibleIds }: { onNavigate: (page: Page) => void; visibleIds: readonly CreHomeCardId[] }) {
  const { t } = useLang();
  const { data: kpi, loading } = useKpiDashboard();

  const cards = [
    { id: "queue" as const, target: "pacientes" as const, label: t("kpi.queue"), value: kpi?.fila_ativa, icon: Users, iconBg: "bg-blue-50", iconColor: "text-blue-600" },
    { id: "stock" as const, target: "logistica" as const, label: t("kpi.stock"), value: kpi?.estoque_proteses, icon: Package, iconBg: "bg-violet-50", iconColor: "text-violet-600" },
    { id: "logistics" as const, target: "logistica" as const, label: t("kpi.logistics"), value: kpi?.em_logistica_reversa, icon: RefreshCw, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { id: "matchings" as const, target: "matching" as const, label: t("kpi.matchings"), value: kpi?.matchings_mes, icon: Zap, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  ].filter((card) => visibleIds.includes(card.id));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
      {cards.map(({ label, value, icon: Icon, iconBg, iconColor, target }) => (
        <button
          type="button"
          key={label}
          onClick={() => onNavigate(target)}
          className="bg-white rounded-xl border border-slate-200 px-5 py-5 hover:shadow-md hover:border-blue-300 transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
              <Icon className={`w-[18px] h-[18px] ${iconColor}`} strokeWidth={2.5} />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 tracking-tight leading-none mb-1">
            {loading ? "—" : (value ?? 0)}
          </p>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {label}
          </p>
        </button>
      ))}
    </div>
  );
}

function FlowChart() {
  const { t, locale } = useLang();
  const [period, setPeriod] = useState(2);
  const slices = [4, 8, 12];
  const { data: fluxo } = useFluxoDispositivosMensal();
  const formatted = (fluxo ?? []).map((f) => ({
    mes: new Date(f.mes).toLocaleDateString(locale, { month: "short" }).replace(".", ""),
    entradas: f.entradas,
    saidas: f.saidas,
  }));
  const data = formatted.slice(Math.max(0, formatted.length - slices[period]));
  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{t("chart.flow.title")}</h2>
            <p className="text-xs text-slate-400">{t("chart.flow.sub")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {["3M", "6M", "12M"].map((p, i) => (
            <button
              key={p}
              onClick={() => setPeriod(i)}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${period === i ? "bg-blue-700 text-white" : "text-slate-400 hover:bg-slate-100"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-4 py-5">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F1F5F9"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              tick={{
                fontSize: 11,
                fill: "#94A3B8",
                fontFamily: "Inter",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{
                fontSize: 11,
                fill: "#94A3B8",
                fontFamily: "Inter",
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "#E2E8F0", strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{
                fontSize: 12,
                fontFamily: "Inter",
                paddingTop: 12,
              }}
              formatter={(v) => (
                <span className="text-slate-500 font-medium">
                  {v}
                </span>
              )}
            />
            <Line
              key="entradas"
              type="monotone"
              dataKey="entradas"
              name={t("chart.flow.entries")}
              stroke="#1D4ED8"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#1D4ED8", strokeWidth: 0 }}
              activeDot={{
                r: 5.5,
                fill: "#1D4ED8",
                strokeWidth: 0,
              }}
            />
            <Line
              key="saidas"
              type="monotone"
              dataKey="saidas"
              name={t("chart.flow.exits")}
              stroke="#10B981"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#10B981", strokeWidth: 0 }}
              activeDot={{
                r: 5.5,
                fill: "#10B981",
                strokeWidth: 0,
              }}
              strokeDasharray="5 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AlertsCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useLang();
  const { data: alertas } = useAlertasCriticos();
  const items = (alertas ?? []).map((a, i) => ({
    id: i,
    msg: a.mensagem,
    level: a.tipo === "ESTOQUE" ? "high" : "medium",
    target: crePageForAlert(a.target, a.tipo) as Page,
  }));
  return (
    <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-red-100 flex items-center justify-between bg-red-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-sm font-bold text-red-800">{t("alerts.title")}</h3>
        </div>
        <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.length === 0 && (
          <p className="px-4 py-4 text-xs text-slate-400">—</p>
        )}
        {items.map((a) => (
          <button type="button" key={a.id} onClick={() => onNavigate(a.target)} className="w-full px-4 py-3 flex gap-3 hover:bg-red-50/40 transition-colors text-left focus:outline-none focus:bg-red-50/60">
            <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${a.level === "high" ? "bg-red-500" : "bg-amber-400"}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-700 leading-snug">{a.msg}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100">
        <button type="button" onClick={() => onNavigate("comunicacoes")} className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1">
          {t("alerts.viewAll")} <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function RecallsCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t, locale } = useLang();
  const { data } = useRecalls();
  const recalls = (data ?? []).filter((item) => !["ENCERRADO", "CANCELADO"].includes(item.status));
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
            <FileWarning className="w-3.5 h-3.5 text-amber-600" strokeWidth={2.5} />
          </div>
          <h3 className="text-sm font-bold text-slate-800">{t("recalls.title")}</h3>
        </div>
        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
          {recalls.length} {t("recalls.active")}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {recalls.length === 0 && <p className="px-4 py-4 text-xs text-slate-400">—</p>}
        {recalls.map((r) => (
          <button type="button" key={r.id} onClick={() => onNavigate("comunicacoes")} className="w-full px-4 py-3 hover:bg-amber-50/40 transition-colors text-left focus:outline-none focus:bg-amber-50/60">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs font-bold text-slate-800 font-mono">{r.codigo_lote}</p>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">{r.affected_devices} {t("recalls.units")}</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-700 leading-snug">{r.nome_produto}</p>
            <p className="text-[11px] text-slate-500 leading-snug mb-1.5">{r.motivo}</p>
            <p className="text-[11px] text-slate-400">
              {t("recalls.deadline")}: <span className="font-semibold text-red-600">{r.data_limite ? new Intl.DateTimeFormat(locale).format(new Date(`${r.data_limite}T00:00:00`)) : "—"}</span>
            </p>
          </button>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100">
        <button type="button" onClick={() => onNavigate("comunicacoes")} className="text-xs text-amber-600 font-semibold hover:underline flex items-center gap-1">
          {t("recalls.manage")} <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function LotsTable() {
  const { t, locale } = useLang();
  const { data: lotesReais, loading } = useLotesRecentes();
  const lotes = lotesReais ?? [];
  const [sortCol, setSortCol] = useState<"lote_id" | "data_cadastro" | "tipo_item" | "oficina" | "quantidade" | "status">("data_cadastro");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function toggle(col: typeof sortCol) {
    sortCol === col
      ? setSortAsc(!sortAsc)
      : (setSortCol(col), setSortAsc(true));
  }

  const sorted = [...lotes].sort((a, b) =>
    sortAsc
      ? String(a[sortCol]).localeCompare(String(b[sortCol]))
      : String(b[sortCol]).localeCompare(String(a[sortCol])),
  );
  const displayed = showAll ? sorted : sorted.slice(0, 5);

  function Th({ col, label }: { col: typeof sortCol; label: string }) {
    const active = sortCol === col;
    return (
      <th
        onClick={() => toggle(col)}
        className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-slate-600 transition-colors"
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={active ? "text-blue-500" : "text-slate-300"}>
            {active ? (sortAsc ? "↑" : "↓") : "↕"}
          </span>
        </span>
      </th>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            <ClipboardList
              className="w-3.5 h-3.5 text-slate-500"
              strokeWidth={2.5}
            />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{t("lots.title")}</h2>
            <p className="text-xs text-slate-400">{t("lots.sub")}</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowAll((value) => !value)} className="text-xs text-blue-700 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-200">
          {showAll ? t("lots.showRecent") : t("lots.viewAll")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <Th col="lote_id" label={t("lots.col.id")} />
              <Th col="data_cadastro" label={t("lots.col.date")} />
              <Th col="tipo_item" label={t("lots.col.type")} />
              <Th col="oficina" label={t("lots.col.maker")} />
              <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{t("lots.col.qty")}</th>
              <Th col="status" label={t("lots.col.status")} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">—</td>
              </tr>
            )}
            {displayed.map((l) => (
              <tr
                key={l.lote_id}
                className={`hover:bg-slate-50/80 transition-colors ${l.status === "VENCIDO" ? "bg-red-50/30" : ""}`}
              >
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs font-semibold text-slate-700">
                    {l.lote_fabricante ?? `LOTE-${l.lote_id}`}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">
                  {new Date(l.data_cadastro).toLocaleDateString(locale)}
                </td>
                <td className="px-5 py-3.5 text-sm font-medium text-slate-700">
                  {l.tipo_item}
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-500">
                  {l.oficina}
                </td>
                <td className="px-5 py-3.5 text-xs font-bold text-slate-700">
                  {l.quantidade}
                </td>
                <td className="px-5 py-3.5">
                  <LoteStatusBadge status={l.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {t("lots.showing")} {lotes.length} {t("lots.recent")}
        </p>
      </div>
    </div>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useLang();
  const { user } = useAuth();
  const { visibleIds, toggle, reset } = useDashboardCardPreferences<CreHomeCardId>(
    `umdr:cre:${user?.id ?? "anonymous"}:home-cards`,
    CRE_HOME_CARD_IDS,
  );
  const options = [
    { id: "queue" as const, label: t("kpi.queue") },
    { id: "stock" as const, label: t("kpi.stock") },
    { id: "logistics" as const, label: t("kpi.logistics") },
    { id: "matchings" as const, label: t("kpi.matchings") },
  ];

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 overflow-y-auto">
      <div className="flex justify-end"><DashboardCustomizer options={options} visibleIds={visibleIds} onToggle={toggle} onReset={reset} /></div>
      <KpiCards onNavigate={onNavigate} visibleIds={visibleIds} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
        <FlowChart />
        <div className="flex flex-col gap-4">
          <AlertsCard onNavigate={onNavigate} />
          <RecallsCard onNavigate={onNavigate} />
        </div>
      </div>
      <LotsTable />
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: PACIENTES AGUARDADOS
// ═══════════════════════════════════════════════════════════════

function PatientRecordsModal({ patients, onClose, onStartTriage }: { patients: PacienteAguardando[]; onClose: () => void; onStartTriage: (patientId: number) => void }) {
  const { t, locale } = useLang();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/45 p-2 sm:p-5" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="patient-records-title" tabIndex={-1} className="max-h-[86vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 id="patient-records-title" className="text-base font-bold text-slate-900">{t("patients.records.title")}</h2>
            <p className="mt-1 text-xs text-slate-500">{patients.length} {t("patients.records.count")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200">
                {[t("patients.records.patient"), t("patients.records.request"), t("patients.col.device"), t("patients.records.priority"), t("patients.records.wait"), t("patients.col.status"), t("patients.col.action")].map((head) => (
                  <th key={head} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((patient) => (
                <tr key={patient.solicitacao_id} className="hover:bg-slate-50">
                  <td className="px-5 py-3"><p className="font-semibold text-slate-800">{patientFirstName(patient.nome_completo)}</p><p className="text-[11px] text-slate-400">{patient.dispositivo}</p></td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">#{patient.solicitacao_id}<br/><span className="font-sans text-[11px] text-slate-400">{new Date(patient.data_solicitacao).toLocaleDateString(locale)}</span></td>
                  <td className="px-5 py-3 text-xs text-slate-700">{patient.dispositivo}</td>
                  <td className="px-5 py-3 text-xs font-semibold text-slate-600">{patient.prioridade_clinica}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{patient.dias_espera_efetivos ?? 0} {t("patients.records.days")}</td>
                  <td className="px-5 py-3"><AttendanceBadge status={patient.status === "EM_FILA" ? "waiting" : "in-progress"} /></td>
                  <td className="px-5 py-3"><button type="button" disabled={!canStartTriage(patient)} onClick={() => { onClose(); onStartTriage(patient.paciente_id); }} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-700 hover:text-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100">{t("patients.triage")}</button></td>
                </tr>
              ))}
              {patients.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">{t("patients.records.empty")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PatientsTable({ onStartTriage, refreshKey }: { onStartTriage: (patientId: number) => void; refreshKey: number }) {
  const { t, locale } = useLang();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [recordsOpen, setRecordsOpen] = useState(false);
  const { data: pacientesReais, loading } = usePacientesAguardando(refreshKey);
  const allPatients = pacientesReais ?? [];

  const attendanceOf = (patient: PacienteAguardando): AttendanceStatus =>
    patient.triagem_status && patient.triagem_status !== "CANCELADA" ? "in-progress" : (patient.status === "EM_FILA" ? "waiting" : "in-progress");

  const filtered = filter === "all" ? allPatients : allPatients.filter((p) =>
    filter === "waiting" ? attendanceOf(p) === "waiting" : attendanceOf(p) === "in-progress"
  );

  const counts = {
    all: allPatients.length,
    waiting: allPatients.filter((p) => attendanceOf(p) === "waiting").length,
    "in-progress": allPatients.filter((p) => attendanceOf(p) === "in-progress").length,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",         label: `${t("patients.all")} (${counts.all})` },
    { key: "waiting",     label: `${t("patients.waiting")} (${counts.waiting})` },
    { key: "in-progress", label: `${t("patients.inProgress")} (${counts["in-progress"]})` },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t("patients.title")}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{allPatients.length} {t("patients.sub")}</p>
        </div>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto bg-slate-100 p-1 rounded-lg">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${filter === key ? "bg-blue-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {[
                t("patients.col.patient"),
                t("patients.col.device"),
                t("patients.col.type"),
                t("patients.col.date"),
                t("patients.col.status"),
                t("patients.col.action"),
              ].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">—</td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr
                key={p.solicitacao_id}
                className="hover:bg-slate-50/60 transition-colors group"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                      {patientFirstName(p.nome_completo).slice(0, 1)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-mono">
                        {patientFirstName(p.nome_completo)}
                      </p>
                      {p.prioridade_clinica === "URGENTE" && (
                        <span className="text-[10px] font-semibold text-orange-600 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> {t("patients.priority")}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm font-medium text-slate-700">
                  {p.dispositivo}
                </td>
                <td className="px-5 py-4">
                  <DeviceTag type={p.dispositivo} />
                </td>
                <td className="px-5 py-4 text-sm text-slate-500 font-mono">
                  {new Date(p.data_solicitacao).toLocaleDateString(locale)}
                </td>
                <td className="px-5 py-4">
                  <AttendanceBadge status={attendanceOf(p)} />
                </td>
                <td className="px-5 py-4">
                  <button type="button" disabled={!canStartTriage(p)} onClick={() => onStartTriage(p.paciente_id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-700 hover:text-white rounded-lg transition-colors border border-blue-200 hover:border-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-slate-100">
                    {t("patients.triage")} <ChevronRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* footer */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400 font-medium">
            {t("patients.showing")} {filtered.length} {t("patients.of")} {allPatients.length}
          </p>
        </div>
        <button type="button" onClick={() => setRecordsOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
          {t("patients.viewAll")} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      {recordsOpen && <PatientRecordsModal patients={allPatients} onClose={() => setRecordsOpen(false)} onStartTriage={onStartTriage} />}
    </div>
  );
}

function LogisticsPanel() {
  const { t } = useLang();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [labelGenerated, setLabelGenerated] = useState(false);
  const { data: remessasReais } = useRemessasLogistica();
  const remessas = remessasReais ?? [];
  const remessaSelecionada = remessas.find((r) => r.status === "AGUARDANDO_COLETA") ?? remessas[0] ?? null;
  const pendentesCount = remessas.filter((r) => r.status === "AGUARDANDO_COLETA").length;

  function handleScan() {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setScanned(true);
    }, 1800);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
      {/* header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t("logistics.panel.title")}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{t("logistics.panel.sub")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-300 bg-amber-50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          {pendentesCount} {t("logistics.pending")}
        </span>
      </div>

      <div className="flex-1 px-5 py-5 flex flex-col gap-4">
        {!scanned ? (
          <>
            <p className="text-xs text-slate-500 text-center leading-relaxed">{t("logistics.scanInstructions")}</p>

            {/* scanner box */}
            <div className="flex justify-center">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40" />
                {[
                  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl",
                  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl",
                  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl",
                  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl",
                ].map((cls, i) => (
                  <span
                    key={i}
                    className={`absolute w-6 h-6 border-blue-600 ${cls}`}
                  />
                ))}
                {scanning && (
                  <div
                    className="absolute left-4 right-4 h-0.5 bg-blue-500/70 rounded-full"
                    style={{
                      animation:
                        "scanline 1.8s ease-in-out forwards",
                    }}
                  />
                )}
                <div className="relative flex flex-col items-center gap-2 text-center z-10">
                  <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <Camera
                      className={`w-5 h-5 ${scanning ? "text-blue-500" : "text-slate-400"}`}
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-xs text-slate-400 leading-snug max-w-[100px]">
                    {scanning ? t("logistics.reading") : t("logistics.position")}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleScan}
              disabled={scanning}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-blue-700 text-white text-sm font-bold hover:bg-blue-800 active:scale-[0.98] transition-all shadow-md shadow-blue-200 disabled:opacity-60 disabled:cursor-wait"
            >
              <QrCode className="w-4 h-4" strokeWidth={2} />
              {scanning ? t("logistics.scanning") : t("logistics.scanBtn")}
            </button>
          </>
        ) : (
          <>
            {/* scanned result */}
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle2
                className="w-4 h-4 text-emerald-600 shrink-0"
                strokeWidth={2.5}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">{t("logistics.scanned.label")}</p>
                <p className="text-sm font-bold text-emerald-900 font-mono truncate">
                  {remessaSelecionada?.codigo_rastreio || (remessaSelecionada ? `REM-${remessaSelecionada.remessa_id}` : "—")}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 shrink-0">{t("logistics.scanned.tag")}</span>
            </div>

            {/* destination */}
            <div className="rounded-xl border-2 border-blue-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-blue-700 flex items-center gap-2">
                <Zap
                  className="w-3.5 h-3.5 text-white"
                  strokeWidth={2.5}
                />
                <p className="text-xs font-bold text-white tracking-tight">{t("logistics.dest.title")}</p>
              </div>
              <div className="px-4 py-3.5 bg-blue-50/40 space-y-2.5">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{t("logistics.dest.sendTo")}</p>
                  <p className="text-sm font-bold text-slate-900 leading-tight">{remessaSelecionada?.fabricante_destino || t("logistics.dest.factory")}</p>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-600 font-medium">{remessaSelecionada?.endereco_destino || t("logistics.dest.address")}</p>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-blue-200">
                  <div className="flex items-center gap-1.5">
                    <PackageCheck className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                      {labelGenerated ? t("logistics.dest.generated") : t("logistics.dest.waiting")}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {remessaSelecionada ? `#REM-${remessaSelecionada.remessa_id}` : "—"}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setLabelGenerated(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-700 text-white text-sm font-bold hover:bg-blue-800 transition-all shadow-md shadow-blue-200 active:scale-[0.98]"
            >
              <FileText className="w-4 h-4" />
              {labelGenerated ? t("logistics.reprint") : t("logistics.genLabel")}
              <Truck className="w-4 h-4 ml-auto opacity-60" />
            </button>

            {labelGenerated && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-semibold text-emerald-700">
                  {t("logistics.success")} <span className="font-mono text-emerald-900">{remessaSelecionada?.codigo_rastreio || (remessaSelecionada ? `REM-${remessaSelecionada.remessa_id}` : "—")}</span>
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setScanned(false);
                setLabelGenerated(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium text-center hover:underline transition-colors"
            >
              {t("logistics.scanAnother")}
            </button>
          </>
        )}
      </div>

      {/* alert footer */}
      <div className="mx-4 mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle
          className="w-4 h-4 text-amber-600 shrink-0"
          strokeWidth={2.5}
        />
        <p className="text-xs font-semibold text-amber-800 leading-snug">
          {pendentesCount} {t("logistics.alert")}
        </p>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 12%; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 88%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function PacientesAguardados({ onStartTriage, refreshKey }: { onStartTriage: (patientId: number) => void; refreshKey: number }) {
  const { t } = useLang();
  const { data: pacientesReais } = usePacientesAguardando(refreshKey);
  const { data: remessasReais } = useRemessasLogistica();
  const { data: kpiReal } = useKpiDashboard(refreshKey);

  const waitingCount = (pacientesReais ?? []).filter((p) => p.status === "EM_FILA" && !p.triagem_status).length;
  const attendingCount = (pacientesReais ?? []).filter((p) => Boolean(p.triagem_status) && p.triagem_status !== "CANCELADA").length;
  const dispatchCount = (remessasReais ?? []).filter((r) => r.status === "AGUARDANDO_COLETA").length;

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 overflow-y-auto">
      {/* CRE kpis strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Users,        bg: "bg-blue-50",   color: "text-blue-600",   val: String(waitingCount),   label: t("cre.waiting")   },
          { icon: Activity,     bg: "bg-emerald-50",color: "text-emerald-600",val: String(attendingCount), label: t("cre.attending") },
          { icon: Package,      bg: "bg-orange-50", color: "text-orange-500", val: String(dispatchCount),  label: t("cre.dispatch")  },
          { icon: CheckCircle2, bg: "bg-violet-50", color: "text-violet-600", val: String(kpiReal?.matchings_mes ?? "—"), label: t("cre.monthly")   },
        ].map(({ icon: Icon, bg, color, val, label }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div
              className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${color}`}
                strokeWidth={2.5}
              />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {val}
              </p>
              <p className="text-xs font-medium text-slate-400 mt-0.5 leading-tight">
                {label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* two-column */}
      <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-5 items-start">
        <PatientsTable onStartTriage={onStartTriage} refreshKey={refreshKey} />
        <LogisticsPanel />
      </div>
    </main>
  );
}


// ═══════════════════════════════════════════════════════════════
// MATCHING NACIONAL + ESTOQUE DE DISPOSITIVOS FÍSICOS
// ═══════════════════════════════════════════════════════════════

function MatchingPage({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { t, locale } = useLang();
  const { data, loading, error, refetch } = useCreMatching(refreshKey);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("OCIOSO");
  const [selectedReuseRoute, setSelectedReuseRoute] = useState("CLINICO");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshAll = () => { refetch(); onChanged(); };

  const submitInventory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitting(true);
    setMessage(null);
    const form = new FormData(formElement);
    const body: Record<string, unknown> = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, value === "" ? null : value]));
    if (body.produto_id) body.produto_id = Number(body.produto_id);
    body.apto_reuso = form.get("apto_reuso") === "on";
    try {
      const result = await apiPost<{ new_matches?: unknown[] }>("/api/cre/inventory/devices", body);
      formElement.reset();
      setSelectedProduct("");
      setSelectedCondition("OCIOSO");
      setSelectedReuseRoute("CLINICO");
      setMessage({ ok: true, text: t("matching.messages.deviceSaved", { count: result.new_matches?.length ?? 0 }) });
      refreshAll();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("matching.messages.genericError") });
    } finally {
      setSubmitting(false);
    }
  };

  const updateReuseRoute = async (deviceId: number, route: string) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await apiPatch<{ new_matches?: unknown[] }>(`/api/cre/inventory/devices/${deviceId}/reuse-route`, { destino_reaproveitamento: route });
      setMessage({ ok: true, text: t("matching.messages.routeSaved", { count: result.new_matches?.length ?? 0 }) });
      refreshAll();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("matching.messages.genericError") });
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (matchingId: number, action: "ACCEPT" | "REJECT") => {
    const reason = action === "REJECT" ? window.prompt(t("matching.rejectPrompt")) : null;
    if (action === "REJECT" && !reason?.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await apiPatch(`/api/cre/matching/${matchingId}`, { action, motivo: reason });
      setMessage({ ok: true, text: action === "ACCEPT" ? t("matching.messages.accepted") : t("matching.messages.rejected") });
      refreshAll();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("matching.messages.genericError") });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8"><LoadingState message={t("matching.loading")} /></main>;
  if (error || !data) return <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8"><ErrorState message={error ?? t("matching.messages.genericError")} retryLabel={t("matching.retry")} onRetry={refetch} /></main>;

  const proposed = data.outgoing.filter((item) => item.status === "PROPOSTO");
  const accepted = data.outgoing.filter((item) => ["ACEITO", "EM_TRANSITO", "CONCLUIDO"].includes(item.status));
  const physicalStock = data.inventory.filter((item) => ["DISPONIVEL", "RESERVADO", "EM_TRANSFERENCIA"].includes(item.status)).length;
  const materialRecovery = data.inventory.filter((item) => item.status === "DISPONIVEL" && ["FUNDICAO", "PECAS_COMPONENTES"].includes(item.destino_reaproveitamento)).length;
  const unsafeSelected = ["DANIFICADO", "VENCIDO"].includes(selectedCondition);

  const statusClass = (status: string) => status === "PROPOSTO" ? "bg-amber-50 text-amber-700 border-amber-200" : status === "ACEITO" || status === "CONCLUIDO" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "RECUSADO" || status === "CANCELADO" ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900">{t("matching.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("matching.subtitle")}</p>
      </div>
      {message && <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${message.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: t("matching.kpi.available"), value: physicalStock, icon: Package, tone: "bg-blue-50 text-blue-700" },
          { label: t("matching.kpi.pending"), value: proposed.length, icon: Zap, tone: "bg-amber-50 text-amber-700" },
          { label: t("matching.kpi.accepted"), value: accepted.length, icon: PackageCheck, tone: "bg-emerald-50 text-emerald-700" },
          { label: t("matching.kpi.materialRecovery"), value: materialRecovery, icon: RefreshCw, tone: "bg-violet-50 text-violet-700" },
        ].map(({ label, value, icon: Icon, tone }) => <Card key={label} className="p-4"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}><Icon className="w-4 h-4" /></div><p className="text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></Card>)}
      </div>

      <Card className="p-5 mb-6">
        <div className="mb-4"><h3 className="text-sm font-bold text-slate-900">{t("matching.inventoryForm.title")}</h3><p className="mt-1 text-xs text-slate-500">{t("matching.inventoryForm.subtitle")}</p></div>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void submitInventory(event)}>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.existingProduct")}<select name="produto_id" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">{t("matching.inventoryForm.newProduct")}</option>{data.products.map((item) => <option key={item.id} value={item.id}>{item.nome_produto}</option>)}</select></label>
          {!selectedProduct && <><label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.procedure")}<select name="procedimento_sigtap" required className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="">—</option>{data.procedures.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} — {item.nome_procedimento}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.productName")}<input name="nome_produto" required className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label></>}
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.serial")}<input name="numero_serie" required className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.model")}<input name="modelo_exato" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.manufacturer")}<input name="fabricante" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.condition")}<select name="condicao" value={selectedCondition} onChange={(event) => { const value = event.target.value; setSelectedCondition(value); if (["DANIFICADO", "VENCIDO"].includes(value) && selectedReuseRoute === "CLINICO") setSelectedReuseRoute("FUNDICAO"); }} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="NOVO">{t("matching.conditions.NOVO")}</option><option value="OCIOSO">{t("matching.conditions.OCIOSO")}</option><option value="RECONDICIONADO">{t("matching.conditions.RECONDICIONADO")}</option><option value="DANIFICADO">{t("matching.conditions.DANIFICADO")}</option><option value="VENCIDO">{t("matching.conditions.VENCIDO")}</option></select></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.reuseRoute")}<select name="destino_reaproveitamento" value={selectedReuseRoute} onChange={(event) => setSelectedReuseRoute(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm"><option value="CLINICO" disabled={unsafeSelected}>{t("matching.reuseRoutes.CLINICO")}</option><option value="FUNDICAO">{t("matching.reuseRoutes.FUNDICAO")}</option><option value="PECAS_COMPONENTES">{t("matching.reuseRoutes.PECAS_COMPONENTES")}</option><option value="DESCARTE">{t("matching.reuseRoutes.DESCARTE")}</option></select></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.manufactureDate")}<input name="data_fabricacao" type="date" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.expiry")}<input name="data_validade" type="date" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" /></label>
          {selectedReuseRoute === "CLINICO" && !unsafeSelected ? <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-700"><input name="apto_reuso" type="checkbox" defaultChecked className="h-4 w-4" />{t("matching.inventoryForm.reusable")}</label> : <div className="self-end rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{unsafeSelected ? t("matching.materialOnlyWarning") : t("matching.nonClinicalHint")}</div>}
          <div className="md:col-span-2 xl:col-span-3"><label className="text-xs font-semibold text-slate-600">{t("matching.inventoryForm.notes")}<textarea name="observacao" className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" /></label></div>
          <div className="md:col-span-2 xl:col-span-3"><button disabled={submitting} className="rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{t("matching.inventoryForm.save")}</button></div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-slate-900">{t("matching.outgoing.title")}</h3><p className="mt-1 text-xs text-slate-500">{t("matching.outgoing.subtitle")}</p></div>{data.outgoing.length ? <div className="divide-y divide-slate-100">{data.outgoing.map((item) => <div key={item.matching_id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{item.nome_produto}</p><p className="mt-1 text-xs text-slate-500">{t("matching.route", { from: item.cre_origem_nome || item.cre_origem_cnes, to: item.cre_destino_nome || item.cre_destino_cnes })}</p><p className="mt-1 text-xs text-slate-400">{item.numero_serie} · {item.distancia_km === null ? t("matching.distanceUnknown") : t("matching.distanceKm", { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.distancia_km) })}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(item.status)}`}>{item.status}</span></div>{item.status === "PROPOSTO" && <div className="mt-3 flex gap-2"><button disabled={submitting} onClick={() => void decide(item.matching_id, "ACCEPT")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{t("matching.accept")}</button><button disabled={submitting} onClick={() => void decide(item.matching_id, "REJECT")} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{t("matching.reject")}</button></div>}</div>)}</div> : <p className="p-6 text-center text-xs text-slate-400">{t("matching.emptyOutgoing")}</p>}</Card>
        <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-slate-900">{t("matching.incoming.title")}</h3><p className="mt-1 text-xs text-slate-500">{t("matching.incoming.subtitle")}</p></div>{data.incoming.length ? <div className="divide-y divide-slate-100">{data.incoming.map((item) => <div key={item.matching_id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{item.nome_produto}</p><p className="mt-1 text-xs text-slate-500">{t("matching.patientRequest", { patient: item.paciente_primeiro_nome, request: item.solicitacao_id })}</p><p className="mt-1 text-xs text-slate-400">{item.cre_origem_nome || item.cre_origem_cnes} · {item.distancia_km === null ? t("matching.distanceUnknown") : t("matching.distanceKm", { value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.distancia_km) })}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(item.status)}`}>{item.status}</span></div></div>)}</div> : <p className="p-6 text-center text-xs text-slate-400">{t("matching.emptyIncoming")}</p>}</Card>
      </div>

      <Card className="overflow-hidden"><div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-slate-900">{t("matching.inventory.title")}</h3></div>{data.inventory.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-slate-100 bg-slate-50 text-left text-slate-500"><th className="px-4 py-3">{t("matching.inventory.product")}</th><th className="px-4 py-3">{t("matching.inventory.serial")}</th><th className="px-4 py-3">{t("matching.inventory.condition")}</th><th className="px-4 py-3">{t("matching.inventory.status")}</th><th className="px-4 py-3">{t("matching.inventory.destination")}</th></tr></thead><tbody>{data.inventory.map((item) => { const unsafe = ["DANIFICADO", "VENCIDO"].includes(item.condicao) || Boolean(item.data_validade && item.data_validade < new Date().toISOString().slice(0, 10)); const locked = ["RESERVADO", "EM_TRANSFERENCIA", "UTILIZADO"].includes(item.status); return <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 font-semibold text-slate-800">{item.nome_produto}</td><td className="px-4 py-3 font-mono text-slate-500">{item.numero_serie}</td><td className="px-4 py-3">{t(`matching.conditions.${item.condicao}` as any)}</td><td className="px-4 py-3">{item.status}</td><td className="px-4 py-3"><select aria-label={t("matching.inventory.destination")} value={item.destino_reaproveitamento} disabled={submitting || locked} onChange={(event) => void updateReuseRoute(item.id, event.target.value)} className="h-9 min-w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="CLINICO" disabled={unsafe}>{t("matching.reuseRoutes.CLINICO")}</option><option value="FUNDICAO">{t("matching.reuseRoutes.FUNDICAO")}</option><option value="PECAS_COMPONENTES">{t("matching.reuseRoutes.PECAS_COMPONENTES")}</option><option value="DESCARTE">{t("matching.reuseRoutes.DESCARTE")}</option></select></td></tr>; })}</tbody></table></div> : <p className="p-6 text-center text-xs text-slate-400">{t("matching.emptyInventory")}</p>}</Card>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// PAGE: LOGÍSTICA REVERSA
// ═══════════════════════════════════════════════════════════════

function RemessaBadge({ status }: { status: "AGUARDANDO_COLETA" | "EM_TRANSITO" | "ENTREGUE" }) {
  const { t } = useLang();
  const map: Record<string, string> = {
    AGUARDANDO_COLETA: "bg-amber-50 text-amber-700 border-amber-200",
    EM_TRANSITO: "bg-blue-50 text-blue-700 border-blue-200",
    ENTREGUE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const dot: Record<string, string> = {
    AGUARDANDO_COLETA: "bg-amber-500",
    EM_TRANSITO: "bg-blue-500 animate-pulse",
    ENTREGUE: "bg-emerald-500",
  };
  const label: Record<string, string> = {
    AGUARDANDO_COLETA: t("logistics.kpi.waiting"),
    EM_TRANSITO: t("logistics.kpi.transit"),
    ENTREGUE: t("logistics.status.delivered"),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {label[status]}
    </span>
  );
}

function LogisticaReversa({ onNewReturn, refreshKey }: { onNewReturn: () => void; refreshKey: number }) {
  const { t, locale } = useLang();
  const [search, setSearch] = useState("");
  const { data: remessasReais, loading } = useRemessasLogistica(refreshKey);
  const remessas = remessasReais ?? [];
  const filtered = remessas.filter(
    (r) => r.tipo_dispositivo.toLowerCase().includes(search.toLowerCase()) || String(r.remessa_id).includes(search)
  );

  const kpis = [
    { icon: Package,      bg: "bg-amber-50",   color: "text-amber-600",  val: remessas.filter(r => r.status === "AGUARDANDO_COLETA").length.toString(), label: t("logistics.kpi.waiting")   },
    { icon: Truck,        bg: "bg-blue-50",    color: "text-blue-600",   val: remessas.filter(r => r.status === "EM_TRANSITO").length.toString(),       label: t("logistics.kpi.transit")   },
    { icon: CheckCircle2, bg: "bg-emerald-50", color: "text-emerald-600",val: remessas.filter(r => r.status === "ENTREGUE").length.toString(),          label: t("logistics.kpi.delivered") },
    { icon: Box,          bg: "bg-violet-50",  color: "text-violet-600", val: remessas.reduce((s, r) => s + r.quantidade, 0).toString(),                label: t("logistics.kpi.total")     },
  ];

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 overflow-y-auto">
      {/* kpis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {kpis.map(({ icon: Icon, bg, color, val, label }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-[18px] h-[18px] ${color}`} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 leading-none">{val}</p>
              <p className="text-xs font-medium text-slate-400 mt-0.5 leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <RefreshCw className="w-3.5 h-3.5 text-amber-600" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">{t("logistics.table.title")}</h2>
              <p className="text-xs text-slate-400">{t("logistics.table.sub")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("logistics.search")}
                className="text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 w-40"
              />
            </div>
            <button type="button" onClick={() => downloadCreCsv("umdr-cre-remessas.csv", filtered.map((item) => ({ id: item.remessa_id, origem: item.origem, destino: item.fabricante_destino, dispositivo: item.tipo_dispositivo, quantidade: item.quantidade, rastreio: item.codigo_rastreio ?? "", status: item.status, data: item.data_criacao })))} className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
              <Download className="w-3.5 h-3.5" /> {t("logistics.export")}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[
                  t("logistics.col.lot"),
                  t("logistics.col.origin"),
                  t("logistics.col.dest"),
                  t("logistics.col.type"),
                  t("logistics.col.qty"),
                  t("logistics.col.date"),
                  t("logistics.col.tracking"),
                  t("logistics.col.status"),
                ].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-xs text-slate-400">—</td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.remessa_id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5"><span className="font-mono text-xs font-semibold text-slate-700">#{r.remessa_id}</span></td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 font-medium">{r.origem}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-600">{r.fabricante_destino}</td>
                  <td className="px-5 py-3.5 text-xs font-medium text-slate-700">{r.tipo_dispositivo}</td>
                  <td className="px-5 py-3.5 text-xs font-bold text-slate-700">{r.quantidade}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">{new Date(r.data_criacao).toLocaleDateString(locale)}</td>
                  <td className="px-5 py-3.5">
                    {!r.codigo_rastreio
                      ? <span className="text-xs text-slate-400">—</span>
                      : <span className="font-mono text-xs text-blue-600 font-semibold">{r.codigo_rastreio}</span>
                    }
                  </td>
                  <td className="px-5 py-3.5"><RemessaBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <p className="text-xs text-slate-400">{t("logistics.showing")} {filtered.length} {t("logistics.of")} {remessas.length} {t("logistics.remessas")}</p>
          <button type="button" onClick={onNewReturn} className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
            <QrCode className="w-3.5 h-3.5" /> {t("logistics.scanNew")}
          </button>
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: TRIAGENS
// ═══════════════════════════════════════════════════════════════

function TriagemBadge({ status }: { status: TriageWorkflowStatus }) {
  const { t } = useLang();
  const map: Record<TriageWorkflowStatus, string> = {
    PENDENTE: "bg-amber-50 text-amber-700 border-amber-200",
    EM_ANDAMENTO: "bg-blue-50 text-blue-700 border-blue-200",
    CONCLUIDA: "bg-emerald-50 text-emerald-700 border-emerald-200",
    EM_PRODUCAO: "bg-violet-50 text-violet-700 border-violet-200",
    PRONTA_PARA_ENTREGA: "bg-cyan-50 text-cyan-700 border-cyan-200",
    ENTREGUE: "bg-emerald-100 text-emerald-800 border-emerald-300",
    CANCELADA: "bg-red-50 text-red-700 border-red-200",
  };
  const dot: Record<TriageWorkflowStatus, string> = {
    PENDENTE: "bg-amber-500",
    EM_ANDAMENTO: "bg-blue-500 animate-pulse",
    CONCLUIDA: "bg-emerald-500",
    EM_PRODUCAO: "bg-violet-500 animate-pulse",
    PRONTA_PARA_ENTREGA: "bg-cyan-500",
    ENTREGUE: "bg-emerald-600",
    CANCELADA: "bg-red-500",
  };
  const label: Record<TriageWorkflowStatus, string> = {
    PENDENTE: t("triage.status.pending"),
    EM_ANDAMENTO: t("triage.status.progress"),
    CONCLUIDA: t("triage.status.done"),
    EM_PRODUCAO: t("triage.status.production"),
    PRONTA_PARA_ENTREGA: t("triage.status.ready"),
    ENTREGUE: t("triage.status.delivered"),
    CANCELADA: t("triage.status.cancelled"),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${map[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {label[status]}
    </span>
  );
}

function escapePrintHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
}

function printTriageReceipt(triage: Triagem, locale: string, labels: { title: string; patient: string; request: string; professional: string; device: string; date: string; status: string; notes: string }) {
  const popup = window.open("", "_blank", "width=820,height=900");
  if (!popup) return;
  const status = triage.workflow_status ?? triage.status;
  const values = {
    patient: patientFirstName(triage.paciente),
    request: triage.solicitacao_id ? `#${triage.solicitacao_id}` : "—",
    professional: triage.profissional,
    device: triage.dispositivo ?? "—",
    date: new Date(triage.data_hora).toLocaleString(locale),
    status,
    notes: triage.observacao_clinica ?? "—",
  };
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapePrintHtml(labels.title)}</title><style>
    body{font-family:Arial,sans-serif;color:#0f172a;margin:40px} .head{border-bottom:3px solid #1d4ed8;padding-bottom:18px;margin-bottom:24px}
    h1{font-size:22px;margin:0 0 6px} .muted{color:#64748b;font-size:12px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
    .field{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em}.value{font-size:14px;font-weight:600;margin-top:5px}
    .notes{margin-top:12px}.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b}@media print{body{margin:22mm}.no-print{display:none}}
  </style></head><body><div class="head"><h1>${escapePrintHtml(labels.title)}</h1><div class="muted">CRE · comprovante gerado pelo sistema</div></div>
  <div class="grid">
    <div class="field"><div class="label">${escapePrintHtml(labels.patient)}</div><div class="value">${escapePrintHtml(values.patient)}</div></div>
    <div class="field"><div class="label">${escapePrintHtml(labels.request)}</div><div class="value">${escapePrintHtml(values.request)}</div></div>
    <div class="field"><div class="label">${escapePrintHtml(labels.professional)}</div><div class="value">${escapePrintHtml(values.professional)}</div></div>
    <div class="field"><div class="label">${escapePrintHtml(labels.device)}</div><div class="value">${escapePrintHtml(values.device)}</div></div>
    <div class="field"><div class="label">${escapePrintHtml(labels.date)}</div><div class="value">${escapePrintHtml(values.date)}</div></div>
    <div class="field"><div class="label">${escapePrintHtml(labels.status)}</div><div class="value">${escapePrintHtml(values.status)}</div></div>
  </div><div class="field notes"><div class="label">${escapePrintHtml(labels.notes)}</div><div class="value">${escapePrintHtml(values.notes)}</div></div>
  <div class="footer">Documento demonstrativo de registro de triagem. A via clínica oficial deve seguir os fluxos institucionais aplicáveis.</div>
  <script>window.onload=()=>{window.print();}</script></body></html>`);
  popup.document.close();
}


function Triagens({ onNewTriage, onEditTriage, refreshKey }: { onNewTriage: () => void; onEditTriage: (triage: Triagem) => void; refreshKey: number }) {
  const { t, locale } = useLang();
  const { data: triagensReais, loading } = useTriagens(refreshKey);
  const triagens = triagensReais ?? [];
  const [selected, setSelected] = useState<Triagem | null>(null);
  const [filterStatus, setFilterStatus] = useState<TriageWorkflowStatus | "TODAS">("TODAS");

  const statusOpts: { key: TriageWorkflowStatus | "TODAS"; label: string }[] = [
    { key: "TODAS", label: t("triage.filter.all") },
    { key: "PENDENTE", label: t("triage.status.pending") },
    { key: "EM_ANDAMENTO", label: t("triage.status.progress") },
    { key: "CONCLUIDA", label: t("triage.status.done") },
    { key: "EM_PRODUCAO", label: t("triage.status.production") },
    { key: "PRONTA_PARA_ENTREGA", label: t("triage.status.ready") },
    { key: "ENTREGUE", label: t("triage.status.delivered") },
    { key: "CANCELADA", label: t("triage.status.cancelled") },
  ];
  const workflowOf = (tr: Triagem): TriageWorkflowStatus => tr.workflow_status ?? tr.status;
  const filtered = filterStatus === "TODAS" ? triagens : triagens.filter(tr => workflowOf(tr) === filterStatus);

  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const estaSemanaCount = triagens.filter(tr => new Date(tr.data_hora) >= seteDiasAtras).length;
  const hojeStr = new Date().toDateString();
  const concluidasHojeCount = triagens.filter(tr => tr.status === "CONCLUIDA" && new Date(tr.data_hora).toDateString() === hojeStr).length;

  const kpis = [
    { icon: Clock,        bg: "bg-amber-50",   color: "text-amber-600",  val: triagens.filter(tr => tr.status === "PENDENTE").length.toString(),     label: t("triage.kpi.pending")    },
    { icon: Stethoscope,  bg: "bg-blue-50",    color: "text-blue-600",   val: triagens.filter(tr => tr.status === "EM_ANDAMENTO").length.toString(), label: t("triage.kpi.inProgress") },
    { icon: CheckCircle2, bg: "bg-emerald-50", color: "text-emerald-600",val: concluidasHojeCount.toString(),                                        label: t("triage.kpi.done")       },
    { icon: Calendar,     bg: "bg-violet-50",  color: "text-violet-600", val: estaSemanaCount.toString(),                                            label: t("triage.kpi.week")       },
  ];

  const avatarOf = (nome: string) => nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 overflow-y-auto">
      {/* kpis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {kpis.map(({ icon: Icon, bg, color, val, label }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-[18px] h-[18px] ${color}`} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-3xl font-bold text-slate-900 leading-none">{val}</p>
              <p className="text-xs font-medium text-slate-400 mt-0.5 leading-tight">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">
        {/* table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <ClipboardList className="w-3.5 h-3.5 text-blue-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t("triage.table.title")}</h2>
                <p className="text-xs text-slate-400">{t("triage.table.sub")}</p>
              </div>
            </div>
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto bg-slate-100 p-1 rounded-lg">
              {statusOpts.map(({ key, label }) => (
                <button key={key} onClick={() => setFilterStatus(key)} className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${filterStatus === key ? "bg-blue-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[t("triage.col.patient"), t("triage.col.professional"), t("triage.col.device"), t("triage.col.datetime"), t("triage.col.status"), ""].map((h, i) => (
                    <th key={i} className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">—</td>
                  </tr>
                )}
                {filtered.map((tr) => (
                  <tr
                    key={tr.triagem_id}
                    onClick={() => setSelected(tr)}
                    className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${selected?.triagem_id === tr.triagem_id ? "bg-blue-50/60" : ""}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">{avatarOf(patientFirstName(tr.paciente))}</div>
                        <span className="text-xs font-bold text-slate-800">{patientFirstName(tr.paciente)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 font-medium">{tr.profissional}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">{tr.dispositivo ?? "—"}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">{new Date(tr.data_hora).toLocaleString(locale)}</td>
                    <td className="px-5 py-3.5"><TriagemBadge status={workflowOf(tr)} /></td>
                    <td className="px-5 py-3.5">
                      <ChevronRight className={`w-4 h-4 transition-colors ${selected?.triagem_id === tr.triagem_id ? "text-blue-600" : "text-slate-300"}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs text-slate-400">{t("triage.showing")} {filtered.length} {t("triage.of")} {triagens.length} {t("triage.triagens")}</p>
            <button type="button" onClick={onNewTriage} className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
              {t("triage.new")} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* detail panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{t("triage.detail.title")}</h3>
                <button onClick={() => setSelected(null)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-600">{avatarOf(patientFirstName(selected.paciente))}</div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{patientFirstName(selected.paciente)}</p>
                    <TriagemBadge status={workflowOf(selected)} />
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { icon: Stethoscope, label: t("triage.detail.professional"), val: selected.profissional },
                    { icon: Package,     label: t("triage.detail.device"),       val: selected.dispositivo ?? "—" },
                    { icon: Calendar,    label: t("triage.detail.date"),         val: new Date(selected.data_hora).toLocaleString(locale) },
                  ].map(({ icon: Icon, label, val }) => (
                    <div key={label} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                        <p className="text-xs font-semibold text-slate-700 mt-0.5">{val}</p>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{t("triage.detail.obs")}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{selected.observacao_clinica ?? "—"}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => onEditTriage(selected)} className="flex-1 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors">{t("triage.detail.edit")}</button>
                  <button type="button" onClick={() => printTriageReceipt(selected, locale, { title: t("triage.print.title"), patient: t("triage.col.patient"), request: t("patients.records.request"), professional: t("triage.detail.professional"), device: t("triage.detail.device"), date: t("triage.detail.date"), status: t("triage.col.status"), notes: t("triage.detail.obs") })} className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">{t("triage.detail.print")}</button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                <ClipboardList className="w-6 h-6 text-slate-300" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-slate-400">{t("triage.detail.empty")}</p>
              <p className="text-xs text-slate-300 mt-1">{t("triage.detail.emptySub")}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGE: RELATÓRIOS
// ═══════════════════════════════════════════════════════════════

const PIE_COLORS = ["#7C3AED", "#D97706", "#0891B2", "#E11D48", "#1D4ED8", "#059669"];

function downloadCreCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Relatorios({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t, locale } = useLang();
  const [exportType, setExportType] = useState<"PDF" | "CSV">("PDF");
  const { data: relatorioReal } = useRelatorioMensal();
  const { data: lotesReais } = useLotesRecentes();
  const { data: pacientesRelatorio } = usePacientesAguardando();
  const { data: triagensRelatorio } = useTriagens();
  const { data: remessasRelatorio } = useRemessasLogistica();
  const { data: kpiRelatorio } = useKpiDashboard();
  const { data: recallsRelatorio } = useRecalls();
  const { data: alertasRelatorio } = useAlertasCriticos();

  const barData = (relatorioReal ?? []).map((r) => ({
    mes: new Date(r.mes).toLocaleDateString(locale, { month: "short" }).replace(".", ""),
    triagens: r.triagens,
    matchings: r.matchings,
    devolucoes: r.devolucoes,
  }));

  const totalTriagens = (relatorioReal ?? []).reduce((s, r) => s + r.triagens, 0);
  const totalMatchings = (relatorioReal ?? []).reduce((s, r) => s + r.matchings, 0);
  const totalDevolucoes = (relatorioReal ?? []).reduce((s, r) => s + r.devolucoes, 0);
  const taxaMatching = totalTriagens > 0 ? Math.round((totalMatchings / totalTriagens) * 100) : 0;

  const tipoCounts = new Map<string, number>();
  (lotesReais ?? []).forEach((l) => tipoCounts.set(l.tipo_item, (tipoCounts.get(l.tipo_item) ?? 0) + 1));
  const pieData = [...tipoCounts.entries()].map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }));

  const kpis = [
    { target: "triagens" as const, icon: Users, bg: "bg-blue-50", color: "text-blue-600", val: String(totalTriagens), label: t("reports.kpi.semester") },
    { target: "triagens" as const, icon: Zap, bg: "bg-emerald-50", color: "text-emerald-600", val: String(totalMatchings), label: t("reports.kpi.matchings") },
    { target: "logistica" as const, icon: RefreshCw, bg: "bg-amber-50", color: "text-amber-600", val: String(totalDevolucoes), label: t("reports.kpi.returns") },
    { target: "triagens" as const, icon: BarChart2, bg: "bg-violet-50", color: "text-violet-600", val: `${taxaMatching}%`, label: t("reports.kpi.rate"), sub: t("reports.kpi.goal") },
  ];

  return (
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 overflow-y-auto">
      {/* kpis */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        {kpis.map(({ target, icon: Icon, bg, color, val, label, sub }) => (
          <button type="button" onClick={() => onNavigate(target)} key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left focus:outline-none focus:ring-2 focus:ring-blue-200">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-[18px] h-[18px] ${color}`} strokeWidth={2.5} />
              </div>
              {sub && <span className="text-xs font-semibold text-slate-400">{sub}</span>}
            </div>
            <p className="text-3xl font-bold text-slate-900 tracking-tight leading-none mb-1">{val}</p>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
          </button>
        ))}
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
        {/* bar chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <BarChart2 className="w-3.5 h-3.5 text-blue-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t("reports.bar.title")}</h2>
                <p className="text-xs text-slate-400">{t("reports.bar.sub")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(["PDF", "CSV"] as const).map((et) => (
                <button
                  key={et}
                  onClick={() => {
                    setExportType(et);
                    if (et === "CSV") downloadCreCsv("umdr-cre-relatorio-mensal.csv", barData);
                    else window.print();
                  }}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${exportType === et ? "bg-blue-700 text-white border-blue-700" : "text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Download className="w-3.5 h-3.5" /> {et}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94A3B8", fontFamily: "Inter" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94A3B8", fontFamily: "Inter" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F8FAFC" }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Inter", paddingTop: 12 }} formatter={(v) => <span className="text-slate-500 font-medium">{v}</span>} />
                <Bar key="triagens"   dataKey="triagens"   name={t("reports.bar.triagens")}  fill="#1D4ED8" radius={[4,4,0,0]} />
                <Bar key="matchings"  dataKey="matchings"  name={t("reports.bar.matchings")} fill="#10B981" radius={[4,4,0,0]} />
                <Bar key="devolucoes" dataKey="devolucoes" name={t("reports.bar.returns")}   fill="#F59E0B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* pie chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                <Package className="w-3.5 h-3.5 text-violet-600" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">{t("reports.pie.title")}</h2>
                <p className="text-xs text-slate-400">{t("reports.pie.sub")}</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 flex flex-col items-center gap-4">
            {pieData.length === 0 ? (
              <p className="text-xs text-slate-400 py-8">—</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {pieData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full space-y-2">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-slate-600 font-medium">{d.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* export section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{t("reports.export.title")}</h2>
            <p className="text-xs text-slate-400">{t("reports.export.sub")}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
          {[
            { kind: "patients", icon: Users, title: t("reports.rep.patients"), sub: t("reports.rep.patientsSub"), color: "text-blue-600", bg: "bg-blue-50" },
            { kind: "triages", icon: Zap, title: t("reports.rep.matchings"), sub: t("reports.rep.matchingsSub"), color: "text-emerald-600", bg: "bg-emerald-50" },
            { kind: "logistics", icon: RefreshCw, title: t("reports.rep.logistics"), sub: t("reports.rep.logisticsSub"), color: "text-amber-600", bg: "bg-amber-50" },
            { kind: "stock", icon: Package, title: t("reports.rep.stock"), sub: t("reports.rep.stockSub"), color: "text-violet-600", bg: "bg-violet-50" },
            { kind: "kpi", icon: Activity, title: t("reports.rep.kpi"), sub: t("reports.rep.kpiSub"), color: "text-rose-600", bg: "bg-rose-50" },
            { kind: "audit", icon: Shield, title: t("reports.rep.audit"), sub: t("reports.rep.auditSub"), color: "text-slate-600", bg: "bg-slate-100" },
          ].map(({ kind, icon: Icon, title, sub, color, bg }) => (
            <button type="button" onClick={() => {
              if (kind === "patients") downloadCreCsv("umdr-cre-pacientes.csv", (pacientesRelatorio ?? []).map((item) => ({ paciente: patientFirstName(item.nome_completo), dispositivo: item.dispositivo, prioridade: item.prioridade_clinica, status: item.status, dias_espera: item.dias_espera_efetivos })));
              else if (kind === "triages") downloadCreCsv("umdr-cre-triagens.csv", (triagensRelatorio ?? []).map((item) => ({ paciente: patientFirstName(item.paciente), profissional: item.profissional, dispositivo: item.dispositivo ?? "", data: item.data_hora, status: item.status, observacao: item.observacao_clinica ?? "" })));
              else if (kind === "logistics") downloadCreCsv("umdr-cre-logistica.csv", (remessasRelatorio ?? []).map((item) => ({ id: item.remessa_id, origem: item.origem, destino: item.fabricante_destino, dispositivo: item.tipo_dispositivo, quantidade: item.quantidade, status: item.status, rastreio: item.codigo_rastreio ?? "" })));
              else if (kind === "stock") downloadCreCsv("umdr-cre-estoque.csv", (lotesReais ?? []).map((item) => ({ lote: item.lote_fabricante ?? item.lote_id, item: item.tipo_item, oficina: item.oficina, quantidade: item.quantidade, validade: item.data_validade ?? "", status: item.status })));
              else if (kind === "kpi") downloadCreCsv("umdr-cre-kpis.csv", [{ fila_ativa: kpiRelatorio?.fila_ativa ?? 0, estoque_proteses: kpiRelatorio?.estoque_proteses ?? 0, logistica_reversa: kpiRelatorio?.em_logistica_reversa ?? 0, matchings_mes: kpiRelatorio?.matchings_mes ?? 0 }]);
              else downloadCreCsv("umdr-cre-auditoria-alertas.csv", [...(recallsRelatorio ?? []).map((item) => ({ tipo: "RECALL", referencia: item.codigo_lote, descricao: item.motivo, status: item.status, data: item.data_abertura })), ...(alertasRelatorio ?? []).map((item) => ({ tipo: "ALERTA", referencia: item.tipo, descricao: item.mensagem, status: "ATIVO", data: item.gerado_em }))]);
            }} key={title} className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group text-left focus:outline-none focus:ring-2 focus:ring-blue-200">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-4 h-4 ${color}`} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 leading-tight">{title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sub}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════

function AppInner() {
  const [page, setPage] = useState<Page>("inicio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [triagePatientId, setTriagePatientId] = useState<number | null>(null);
  const [editingTriage, setEditingTriage] = useState<Triagem | null>(null);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const openNewTriage = (patientId: number | null = null) => { setEditingTriage(null); setTriagePatientId(patientId); setTriageOpen(true); };
  const openEditTriage = (triage: Triagem) => { setEditingTriage(triage); setTriagePatientId(triage.paciente_id); setTriageOpen(true); };
  const refreshData = () => setRefreshKey((value) => value + 1);
  return (
    <div className="flex min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "Inter, sans-serif" }}>
      {mobileNavOpen && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar current={page} onNavigate={setPage} onOpenSettings={() => setSettingsOpen(true)} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar page={page} onNavigate={setPage} onOpenSettings={() => setSettingsOpen(true)} onOpenMenu={() => setMobileNavOpen(true)} />
        {page === "inicio"     && <Dashboard onNavigate={setPage} />}
        {page === "pacientes"  && <PacientesAguardados onStartTriage={(patientId) => openNewTriage(patientId)} refreshKey={refreshKey} />}
        {page === "logistica"  && <LogisticaReversa onNewReturn={() => setShipmentOpen(true)} refreshKey={refreshKey} />}
        {page === "matching"   && <MatchingPage refreshKey={refreshKey} onChanged={refreshData} />}
        {page === "triagens"   && <Triagens onNewTriage={() => openNewTriage()} onEditTriage={openEditTriage} refreshKey={refreshKey} />}
        {page === "relatorios" && <Relatorios onNavigate={setPage} />}
        {page === "atendimentos" && <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto"><CreSupportInbox /></main>}
        {page === "comunicacoes" && <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto"><CommunicationsCenter role="FISCAL_CRE" /></main>}
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TriageModal open={triageOpen} onClose={() => setTriageOpen(false)} onSaved={refreshData} initialPatientId={triagePatientId} triage={editingTriage} />
      <ShipmentModal open={shipmentOpen} onClose={() => setShipmentOpen(false)} onSaved={refreshData} />
    </div>
  );
}

export function CREHomePage() {
  return <AppInner />;
}