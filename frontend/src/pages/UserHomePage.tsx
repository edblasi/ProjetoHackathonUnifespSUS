import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  Package,
  QrCode,
  FileDown,
  History,
  AlertTriangle,
  Phone,
  HelpCircle,
  Shield,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../i18n/LanguageContext";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { SettingsModal } from "../components/SettingsModal";
import { DeviceHistoryModal } from "../components/DeviceHistoryModal";
import { exportDeviceCardPdf } from "../components/DeviceIdentityCard";
import { PatientSupportModal, type PatientSupportMode } from "../components/PatientSupportModal";
import { Card } from "../components/Card";
import { DashboardCustomizer, useDashboardCardPreferences } from "../components/DashboardCustomizer";
import { Avatar } from "../components/Avatar";
import { StatusBadge } from "../components/StatusBadge";
import { QRCodePlaceholder } from "../components/QRCode";
import {
  usePedidos,
  useHistoricoSolicitacao,
  useUsuarioAtual,
  usePacientePerfil,
  useNotificacoes,
  useCurrentDevice,
  type PedidoAtual,
  type PatientDevice,
  type HistoricoStatus,
} from "../hooks/FetchData";
import type { TranslationKey } from "../i18n/translations";
import { patientSectionForAlert } from "../lib/alertRouting";
import { useSeenAlerts } from "../hooks/useSeenAlerts";
import { useAccessiblePage } from "../components/Accessibility";

const USER_HOME_CARD_IDS = ["request", "timeline", "digitalId", "support"] as const;
type UserHomeCardId = (typeof USER_HOME_CARD_IDS)[number];

// Devolve a chave de tradução do status (funciona tanto pra status de
// solicitacao_ortese quanto de ordem_producao — os dois compartilham o
// mesmo namespace home.pedido.status.*, ver src/i18n/locales/*.json).
function statusKey(status: string): TranslationKey {
  return `home.pedido.status.${status}` as TranslationKey;
}

function statusColor(status: string): "green" | "blue" | "amber" | "red" {
  if (status === "ENTREGUE") return "green";
  if (status === "NEGADA" || status === "CANCELADA") return "red";
  if (status === "EM_PRODUCAO" || status === "CONTROLE_QUALIDADE" || status === "PRONTA_PARA_ENTREGA") return "blue";
  return "amber";
}

function OrteseIcon() {
  return (
    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
      <Package className="w-9 h-9 text-primary" strokeWidth={1.6} />
    </div>
  );
}

function WelcomeSection({ nomeExibicao }: { nomeExibicao: string }) {
  const { t, locale } = useLang();
  const now = new Date();
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hour = now.getHours();
  const greeting =
    hour < 12 ? t("home.welcome.morning") : hour < 18 ? t("home.welcome.afternoon") : t("home.welcome.evening");
  const firstName = nomeExibicao.split(" ")[0];

  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-sm text-muted-foreground font-medium mb-1 capitalize">{dateStr}</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          {greeting}, <span className="text-primary">{firstName}</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("home.welcome.subtitle")}</p>
      </div>
    </div>
  );
}

function PedidoStatusCard({ pedido, onOpenTimeline }: { pedido: PedidoAtual; onOpenTimeline: () => void }) {
  const { t, locale } = useLang();
  const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(locale) : null);
  const delivered = pedido.status_solicitacao === "ENTREGUE" || Boolean(pedido.data_entrega);

  const details = [
    { label: t("home.pedido.procedureLabel"), value: pedido.nome_procedimento },
    { label: t("home.pedido.productLabel"), value: pedido.nome_produto ?? t("home.pedido.productPending") },
    { label: t("home.pedido.workshopLabel"), value: pedido.oficina_nome ?? t("home.pedido.workshopPending") },
    ...(!delivered && pedido.cre_destino_cnes ? [{ label: t("home.pedido.assignedCre"), value: pedido.cre_destino_nome ?? pedido.cre_destino_cnes }] : []),
    ...(delivered ? [
      { label: t("home.pedido.exactModel"), value: pedido.modelo_exato ?? "—" },
      { label: t("home.pedido.manufacturer"), value: pedido.fabricante ?? "—" },
      { label: t("home.pedido.manufacturedAt"), value: fmtDate(pedido.data_manufatura) ?? "—" },
      { label: t("home.pedido.serialNumber"), value: pedido.numero_serie ?? "—" },
    ] : [
      { label: t("home.pedido.requestedOn"), value: fmtDate(pedido.data_solicitacao) ?? "—" },
    ]),
  ];

  return (
    <button type="button" onClick={onOpenTimeline} className="block w-full text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30">
      <Card className="hover:border-primary/30 hover:shadow-md transition-all">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                {t("home.pedido.title")}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground">{pedido.nome_procedimento}</h2>
          </div>
          <StatusBadge label={t(statusKey(pedido.status_solicitacao))} color={statusColor(pedido.status_solicitacao)} />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <div className="flex-shrink-0 flex flex-col items-center justify-center bg-secondary rounded-xl px-4 py-4 border border-blue-100 sm:px-5">
            <OrteseIcon />
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 content-center">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">{value}</dd>
              </div>
            ))}

            {pedido.data_entrega ? (
              <div className="col-span-2 mt-2 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-accent" aria-hidden="true" />
                  <span className="text-sm text-emerald-700 font-medium">
                    {t("home.pedido.deliveredOn")} {fmtDate(pedido.data_entrega)}
                  </span>
                </div>
              </div>
            ) : pedido.data_prevista_entrega ? (
              <div className="col-span-2 mt-2 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" aria-hidden="true" />
                  <span className="text-sm text-amber-700 font-medium">
                    {t("home.pedido.expectedDelivery")}: {fmtDate(pedido.data_prevista_entrega)}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </Card>
    </button>
  );
}

function TimelineCard({ pedido, historico }: { pedido: PedidoAtual; historico: HistoricoStatus[] }) {
  const { t, locale } = useLang();
  type JourneyState = "completed" | "current" | "future";

  const historyDate = (status: string) => historico.find((item) => item.status_novo === status)?.data_alteracao ?? null;
  const cancelled = pedido.status_solicitacao === "CANCELADA" || pedido.triagem_status === "CANCELADA" || pedido.status_producao === "CANCELADA";
  const cancellation = [...historico].reverse().find((item) => item.status_novo === "CANCELADA");
  const delivered = pedido.status_solicitacao === "ENTREGUE" || pedido.status_producao === "ENTREGUE" || Boolean(pedido.data_entrega);
  const creLinked = Boolean(pedido.cre_destino_cnes);
  const hasTriage = Boolean(pedido.triagem_status || pedido.triagem_data_hora);
  const activeProductionStatuses = ["EM_PRODUCAO", "CONTROLE_QUALIDADE", "PRONTA_PARA_ENTREGA", "ENTREGUE"];
  const productionStarted = activeProductionStatuses.includes(pedido.status_producao ?? "") || ["EM_PRODUCAO", "ENTREGUE"].includes(pedido.status_solicitacao);
  const triageComplete = pedido.triagem_status === "CONCLUIDA" || productionStarted || delivered;
  const readyForPickup = pedido.status_producao === "PRONTA_PARA_ENTREGA";
  const productionComplete = delivered || readyForPickup;

  const baseSteps: Array<{ key: string; label: string; completed: boolean; current: boolean; date: string | null; currentText?: string }> = [
    { key: "received", label: t("home.timeline.stages.received"), completed: true, current: false, date: pedido.data_solicitacao },
    {
      key: "sisreg",
      label: t("home.timeline.stages.sisreg"),
      completed: Boolean(pedido.sisreg_autorizado_em) || pedido.status_solicitacao !== "AGUARDANDO_AUTORIZACAO",
      current: !cancelled && pedido.status_solicitacao === "AGUARDANDO_AUTORIZACAO",
      date: pedido.sisreg_autorizado_em ?? historyDate("AUTORIZADA"),
    },
    {
      key: "cre",
      label: t("home.timeline.stages.cre"),
      completed: creLinked,
      current: !cancelled && Boolean(pedido.sisreg_autorizado_em) && !creLinked,
      date: creLinked ? (pedido.sisreg_autorizado_em ?? historyDate("AUTORIZADA")) : null,
    },
    {
      key: "queue",
      label: t("home.timeline.stages.queue"),
      completed: hasTriage || triageComplete || productionStarted || delivered,
      current: !cancelled && creLinked && pedido.status_solicitacao === "EM_FILA" && !hasTriage,
      date: historyDate("EM_FILA"),
    },
    {
      key: "triage",
      label: t("home.timeline.stages.triage"),
      completed: triageComplete,
      current: !cancelled && hasTriage && !triageComplete,
      date: pedido.triagem_data_hora ?? null,
    },
    {
      key: "production",
      label: t("home.timeline.stages.productionShort"),
      completed: productionComplete,
      current: !cancelled && (productionStarted && !productionComplete || triageComplete && !productionStarted),
      date: pedido.producao_data_abertura ?? historyDate("EM_PRODUCAO"),
    },
    {
      key: "delivery",
      label: t("home.timeline.stages.deliveryShort"),
      completed: delivered,
      current: !cancelled && readyForPickup,
      date: pedido.data_entrega ?? historyDate("ENTREGUE"),
      currentText: readyForPickup ? t("home.timeline.readyForPickup") : undefined,
    },
  ];

  // Se não houver uma regra específica e o caso estiver ativo, a primeira etapa
  // futura é marcada como a etapa que o paciente está aguardando.
  let currentAssigned = cancelled || baseSteps.some((step) => step.current);
  const steps = baseSteps.map((step) => {
    let state: JourneyState = step.completed ? "completed" : step.current ? "current" : "future";
    if (!currentAssigned && state === "future") {
      state = "current";
      currentAssigned = true;
    }
    return { ...step, state };
  });

  const stateClass: Record<JourneyState, string> = {
    completed: "bg-emerald-500 border-emerald-500 text-white",
    current: "bg-amber-400 border-amber-400 text-white ring-4 ring-amber-100",
    future: "bg-slate-100 border-slate-300 text-slate-400",
  };
  const lineClass = (state: JourneyState) => state === "completed" ? "bg-emerald-400" : state === "current" ? "bg-amber-300" : "bg-slate-200";

  return (
    <Card>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-base font-bold text-foreground">{t("home.timeline.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("home.timeline.updated")}</p>
        </div>

        {cancelled && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-red-800">{t("home.timeline.cancelledTitle")}</p>
                <p className="mt-1 text-sm text-red-700">{cancellation?.observacao || t("home.timeline.cancelledFallback")}</p>
              </div>
            </div>
          </div>
        )}

        <div className="relative">
          <ol className="space-y-0">
            {steps.map((step, idx) => (
              <li key={step.key} className="relative flex gap-4">
                {idx < steps.length - 1 && (
                  <div className={`absolute left-[17px] top-9 bottom-0 w-0.5 ${lineClass(step.state)}`} aria-hidden="true" />
                )}
                <div className="relative z-10 mt-0.5 flex-shrink-0">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${stateClass[step.state]}`}>
                    {step.state === "completed" ? <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
                  </div>
                </div>
                <div className={`flex-1 ${idx < steps.length - 1 ? "pb-6" : "pb-0"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${step.state === "future" ? "text-slate-400" : "text-foreground"}`}>{step.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      step.state === "completed" ? "bg-emerald-50 text-emerald-700" : step.state === "current" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-400"
                    }`}>
                      {t(`home.timeline.state.${step.state}` as TranslationKey)}
                    </span>
                  </div>
                  {step.date ? (
                    <p className="mt-1 text-xs font-mono text-muted-foreground">{new Date(step.date).toLocaleString(locale)}</p>
                  ) : step.state === "current" ? (
                    <p className="mt-1 text-xs text-amber-700">{step.currentText ?? t("home.timeline.waiting")}</p>
                  ) : step.state === "future" ? (
                    <p className="mt-1 text-xs text-slate-400">{t("home.timeline.future")}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}

function DigitalIDCard({ device, nomeExibicao, iniciais, onViewHistory }: { device: PatientDevice | null; nomeExibicao: string; iniciais: string; onViewHistory: () => void }) {
  const { t, locale } = useLang();
  const [copied, setCopied] = useState(false);
  const idValue = device ? `DEV-${device.id}` : "—";

  const handleCopy = () => {
    if (!device) return;
    void navigator.clipboard?.writeText(device.numero_serie || idValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <div className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <QrCode className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-bold text-foreground">{t("home.id.title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("home.id.subtitle")}</p>

        {device ? <>
          <div className="flex flex-col items-center gap-3 py-2">
            <QRCodePlaceholder value={device.qr_token || device.numero_serie} />
            <button
              onClick={handleCopy}
              className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
              aria-label={t("home.id.copyAria")}
            >
              {copied ? t("home.id.copied") : device.numero_serie}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-[10px]">
            <div><p className="font-bold uppercase tracking-wider text-slate-400">{t("home.deviceCard.model")}</p><p className="mt-0.5 font-semibold text-slate-700">{device.modelo_exato}</p></div>
            <div><p className="font-bold uppercase tracking-wider text-slate-400">{t("home.deviceCard.manufacturer")}</p><p className="mt-0.5 font-semibold text-slate-700">{device.fabricante}</p></div>
            <div><p className="font-bold uppercase tracking-wider text-slate-400">{t("home.deviceCard.uses")}</p><p className="mt-0.5 font-semibold text-slate-700">{device.numero_usos}</p></div>
            <div><p className="font-bold uppercase tracking-wider text-slate-400">{t("home.deviceCard.deliveredAt")}</p><p className="mt-0.5 font-semibold text-slate-700">{device.data_entrega ? new Date(device.data_entrega).toLocaleDateString(locale) : "—"}</p></div>
          </div>

          <div className="mt-4 space-y-2">
            <button type="button" onClick={onViewHistory} className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-secondary text-primary text-sm font-semibold hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">
              <History className="w-4 h-4" aria-hidden="true" />
              {t("home.id.viewHistory")}
            </button>
            <button type="button" onClick={() => exportDeviceCardPdf(device, nomeExibicao, locale)} className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[#0B5394] text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">
              <FileDown className="w-4 h-4" aria-hidden="true" />
              {t("home.id.exportPdf")}
            </button>
          </div>
        </> : <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center"><Package className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-xs font-semibold text-slate-600">{t("home.id.noDeliveredDevice")}</p><p className="mt-1 text-[10px] text-slate-400">{t("home.id.noDeliveredDeviceDesc")}</p></div>}

        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            <Avatar initials={iniciais} size="sm" />
            <div>
              <p className="text-xs font-semibold text-foreground leading-none">{nomeExibicao}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                {t("home.id.idLabel")} {idValue}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SupportCard({ onPain, onContact, hasCre }: { onPain: () => void; onContact: () => void; hasCre: boolean }) {
  const { t } = useLang();
  const links = [
    ...(hasCre ? [
      {
        icon: AlertTriangle,
        label: t("home.support.report.label"),
        description: t("home.support.report.desc"),
        color: "text-destructive",
        bg: "hover:bg-red-50 focus:ring-destructive/30",
        action: onPain,
      },
      {
        icon: Phone,
        label: t("home.support.cre.label"),
        description: t("home.support.cre.desc"),
        color: "text-primary",
        bg: "hover:bg-secondary focus:ring-primary/30",
        action: onContact,
      },
    ] : []),
    {
      icon: HelpCircle,
      label: t("home.support.contact.label"),
      description: t("home.support.contact.desc"),
      color: "text-muted-foreground",
      bg: "hover:bg-secondary focus:ring-primary/30",
      action: () => window.open("https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus", "_blank", "noopener,noreferrer"),
    },
  ];

  return (
    <Card>
      <div className="p-5">
        <h2 className="text-sm font-bold text-foreground mb-1">{t("home.support.title")}</h2>
        <p className="text-xs text-muted-foreground mb-4">{t("home.support.subtitle")}</p>
        {!hasCre && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            {t("home.support.awaitingCre")}
          </div>
        )}

        <ul className="space-y-2" role="list">
          {links.map(({ icon: Icon, label, description, color, bg, action }) => (
            <li key={label}>
              <button
                type="button"
                onClick={action}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border border-border text-left transition-colors focus:outline-none focus:ring-2 ${bg}`}
                aria-label={label}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-border/40 flex items-center justify-center ${color}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-none">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t("home.support.privacyNote")}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function UserHomePage() {
  const { signOut, user } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportMode, setSupportMode] = useState<PatientSupportMode>("pain");
  const { t, locale } = useLang();
  useAccessiblePage(t("shell.accessibility.patientPortal"), t("home.welcome.subtitle"));
  const navigate = useNavigate();
  const { visibleIds, toggle, reset, isVisible } = useDashboardCardPreferences<UserHomeCardId>(
    `umdr:patient:${user?.id ?? "anonymous"}:home-cards`,
    USER_HOME_CARD_IDS,
  );

  const { data: usuario, loading: loadingUsuario } = useUsuarioAtual();
  const { data: perfil } = usePacientePerfil();
  const { data: pedidos, loading: loadingPedidos, error: erroPedidos } = usePedidos();
  const { data: currentDevice, loading: loadingDevice } = useCurrentDevice();
  const pedidoAtivo = pedidos?.find((pedido) => !["ENTREGUE", "CANCELADA", "NEGADA"].includes(pedido.status_solicitacao)) ?? pedidos?.find((pedido) => pedido.status_solicitacao === "ENTREGUE") ?? pedidos?.[0] ?? null;
  const hasCreSupport = Boolean(currentDevice?.cnes_cre || pedidoAtivo?.cre_destino_cnes);
  const { data: historico } = useHistoricoSolicitacao(pedidoAtivo?.solicitacao_id ?? null);
  const { data: notificacoes, marcarComoLida } = useNotificacoes();
  const { isSeen, markSeen } = useSeenAlerts(`umdr:patient:${user?.id ?? "anonymous"}:seen-alerts`);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const nomeExibicao = usuario?.nome_exibicao ?? "";
  const iniciais =
    nomeExibicao
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  const alertasRecentes = (notificacoes ?? []).slice(0, 5).map((n) => {
    const seenId = `notification-${n.id}`;
    return {
    id: n.id,
    title: n.titulo,
    description: n.mensagem ?? "",
    time: new Date(n.criado_em).toLocaleString(locale),
    unread: !n.lida && !isSeen(seenId),
    onClick: () => {
      markSeen(seenId);
      if (!n.lida) void marcarComoLida(n.id);
      const target = patientSectionForAlert(n.destino_ui);
      if (target === "patient-notifications") window.scrollTo({ top: 0, behavior: "smooth" });
      else if (target === "patient-support-card") { setSupportMode("contact"); setSupportOpen(true); }
      else document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  };
  });

  const loading = loadingUsuario || loadingPedidos || loadingDevice;
  const cardOptions = [
    { id: "request" as const, label: t("home.pedido.title") },
    { id: "timeline" as const, label: t("home.timeline.title") },
    { id: "digitalId" as const, label: t("home.id.title") },
    { id: "support" as const, label: t("home.support.title") },
  ];
  const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const hasLeftColumn = isVisible("request") || isVisible("timeline");
  const hasRightColumn = isVisible("digitalId") || isVisible("support");

  return (
    <div className="min-h-screen bg-background font-[Inter,_system-ui,_sans-serif]">
      <Navbar
        userName={nomeExibicao || "—"}
        userInitials={iniciais}
        userEmail={user?.email}
        notifications={alertasRecentes}
        profileDetails={[
          { label: t("shell.profile.role"), value: t("shell.navbar.userRoleLabel") },
          { label: t("shell.profile.cns"), value: perfil?.cns ?? "—" },
          { label: t("shell.profile.cpf"), value: perfil?.cpf ?? "—" },
          { label: t("shell.profile.phone"), value: perfil?.telefone_contato ?? "—" },
          { label: t("shell.profile.location"), value: [perfil?.nome_municipio, perfil?.uf_sigla].filter(Boolean).join(" / ") || "—" },
        ]}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={handleSignOut}
      />

      <main id="main-content" tabIndex={-1} className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <section className="mb-5" aria-labelledby="welcome-heading">
          <WelcomeSection nomeExibicao={nomeExibicao || "—"} />
        </section>
        <div className="mb-5 flex justify-start sm:justify-end">
          <DashboardCustomizer options={cardOptions} visibleIds={visibleIds} onToggle={toggle} onReset={reset} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">…</div>
        ) : erroPedidos ? (
          <Card>
            <p className="p-6 text-sm text-destructive">{erroPedidos}</p>
          </Card>
        ) : (
          <div className={`grid gap-5 ${hasLeftColumn && hasRightColumn ? "lg:grid-cols-[65fr_35fr]" : "grid-cols-1"}`}>
            {hasLeftColumn && <div className="space-y-5">
              {isVisible("request") && <section id="patient-request-card" aria-labelledby="pedido-status-heading" className="scroll-mt-24">
                <h2 id="pedido-status-heading" className="sr-only">{t("home.pedido.title")}</h2>
                {pedidoAtivo ? <PedidoStatusCard pedido={pedidoAtivo} onOpenTimeline={() => scrollToSection("patient-timeline-card")} /> : <Card><p className="p-6 text-sm text-muted-foreground">{t("home.pedido.noPedido")}</p></Card>}
              </section>}
              {isVisible("timeline") && pedidoAtivo && <section id="patient-timeline-card" aria-labelledby="timeline-heading" className="scroll-mt-24">
                <h2 id="timeline-heading" className="sr-only">{t("home.timeline.title")}</h2>
                <TimelineCard pedido={pedidoAtivo} historico={historico ?? []} />
              </section>}
            </div>}

            {hasRightColumn && <div className="space-y-5">
              {isVisible("digitalId") && <section id="patient-digital-id-card" aria-labelledby="digital-id-heading" className="scroll-mt-24">
                <h2 id="digital-id-heading" className="sr-only">{t("home.id.title")}</h2>
                <DigitalIDCard device={currentDevice} nomeExibicao={nomeExibicao || "—"} iniciais={iniciais} onViewHistory={() => setHistoryOpen(true)} />
              </section>}
              {isVisible("support") && <section id="patient-support-card" aria-labelledby="support-heading" className="scroll-mt-24">
                <h2 id="support-heading" className="sr-only">{t("home.support.title")}</h2>
                <SupportCard hasCre={hasCreSupport} onPain={() => { setSupportMode("pain"); setSupportOpen(true); }} onContact={() => { setSupportMode("contact"); setSupportOpen(true); }} />
              </section>}
            </div>}
          </div>
        )}
      </main>

      <Footer />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DeviceHistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} device={currentDevice} patientName={nomeExibicao || "—"} />
      {supportOpen && <PatientSupportModal open={supportOpen} mode={supportMode} onClose={() => setSupportOpen(false)} />}
    </div>
  );
}