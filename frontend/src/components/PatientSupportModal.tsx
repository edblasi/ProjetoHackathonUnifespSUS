import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, MessageCircle, Phone, Send, X } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import {
  createPatientSupportTicket,
  getPatientSupportMessages,
  replyPatientSupport,
  usePatientSupportContext,
  usePatientSupportTickets,
  type SupportMessage,
  type SupportTicket,
} from "../hooks/FetchData";
import { useDialogAccessibility } from "./Accessibility";

export type PatientSupportMode = "pain" | "contact";

export function PatientSupportModal({ open, mode, onClose }: { open: boolean; mode: PatientSupportMode; onClose: () => void }) {
  const { t, locale } = useLang();
  const { data: context, loading: contextLoading, error: contextError } = usePatientSupportContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: tickets } = usePatientSupportTickets(refreshKey);
  const [channel, setChannel] = useState<"choice" | "message" | "direct" | "thread">("choice");
  const [severity, setSeverity] = useState<"LEVE" | "MODERADA" | "INTENSA">("MODERADA");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open, onClose);
  const category = mode === "pain" ? "DOR" : "SUPORTE";
  const subject = mode === "pain" ? t("home.supportModal.painSubject") : t("home.supportModal.contactSubject");

  useEffect(() => {
    if (!open) return;
    setChannel("choice");
    setSelected(null);
    setThread([]);
    setMessage("");
    setReply("");
    setFeedback(null);
  }, [open, mode]);

  const recentTickets = useMemo(() => (tickets ?? []).slice(0, 8), [tickets]);

  const openThread = async (ticket: SupportTicket) => {
    setBusy(true);
    setFeedback(null);
    try {
      const messages = await getPatientSupportMessages(ticket.id);
      setSelected(ticket);
      setThread(messages);
      setChannel("thread");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("home.supportModal.genericError"));
    } finally { setBusy(false); }
  };

  const sendTicket = async (direct = false) => {
    if (!direct && message.trim().length < 3) {
      setFeedback(t("home.supportModal.messageRequired"));
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const created = await createPatientSupportTicket({
        categoria: category,
        gravidade: mode === "pain" ? severity : "NAO_INFORMADA",
        canal: direct ? "CONTATO_DIRETO" : "MENSAGEM",
        assunto: subject,
        mensagem: direct ? undefined : message.trim(),
      });
      setRefreshKey((v) => v + 1);
      if (direct) {
        setSelected(created);
        setChannel("direct");
        setFeedback(t("home.supportModal.creNotified"));
      } else {
        const messages = await getPatientSupportMessages(created.id);
        setSelected(created);
        setThread(messages);
        setMessage("");
        setChannel("thread");
        setFeedback(t("home.supportModal.sent"));
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("home.supportModal.genericError"));
    } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await replyPatientSupport(selected.id, reply.trim());
      setReply("");
      setThread(await getPatientSupportMessages(selected.id));
      setRefreshKey((v) => v + 1);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("home.supportModal.genericError"));
    } finally { setBusy(false); }
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="patient-support-title" tabIndex={-1} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4"><div><h2 id="patient-support-title" className="text-lg font-bold text-slate-900">{mode === "pain" ? t("home.supportModal.painTitle") : t("home.supportModal.contactTitle")}</h2><p className="mt-0.5 text-xs text-slate-500">{t("home.supportModal.subtitle")}</p></div><button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" aria-hidden="true" /></button></div>
      <div className="space-y-5 p-6">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">{t("home.supportModal.relatedCre")}</p>{contextLoading ? <p className="mt-1 text-sm text-slate-500">…</p> : contextError ? <p className="mt-1 text-sm text-red-600">{contextError}</p> : <><p className="mt-1 text-sm font-bold text-slate-900">{context?.nome ?? "—"}</p><p className="text-xs text-slate-500">CNES {context?.cnes ?? "—"}{context?.endereco ? ` · ${context.endereco}` : ""}</p></>}</div>

        {mode === "pain" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"/><div><p className="text-sm font-bold text-amber-900">{t("home.supportModal.safetyTitle")}</p><p className="mt-1 text-xs leading-relaxed text-amber-800">{t("home.supportModal.safetyText")}</p></div></div></div>}

        {channel === "choice" && <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setChannel("message")} className="rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:bg-blue-50/50"><MessageCircle className="h-5 w-5 text-[#0B5394]"/><p className="mt-3 text-sm font-bold text-slate-900">{t("home.supportModal.sendMessage")}</p><p className="mt-1 text-xs text-slate-500">{t("home.supportModal.sendMessageDesc")}</p></button><button type="button" onClick={() => void sendTicket(true)} disabled={busy || !context} className="rounded-xl border border-slate-200 p-5 text-left hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50"><Phone className="h-5 w-5 text-emerald-600"/><p className="mt-3 text-sm font-bold text-slate-900">{t("home.supportModal.directContact")}</p><p className="mt-1 text-xs text-slate-500">{t("home.supportModal.directContactDesc")}</p></button></div>}

        {channel === "message" && <div className="space-y-4 rounded-xl border border-slate-200 p-5">{mode === "pain" && <label className="block text-xs font-bold text-slate-700">{t("home.supportModal.severity")}<select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="LEVE">{t("home.supportModal.severityLight")}</option><option value="MODERADA">{t("home.supportModal.severityModerate")}</option><option value="INTENSA">{t("home.supportModal.severityIntense")}</option></select></label>}<label className="block text-xs font-bold text-slate-700">{t("home.supportModal.messageLabel")}<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={3000} placeholder={mode === "pain" ? t("home.supportModal.painPlaceholder") : t("home.supportModal.messagePlaceholder")} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setChannel("choice")} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{t("common.back")}</button><button type="button" onClick={() => void sendTicket(false)} disabled={busy} className="flex items-center gap-2 rounded-lg bg-[#0B5394] px-4 py-2 text-sm font-bold text-white hover:bg-[#084477] disabled:opacity-50"><Send className="h-4 w-4"/>{t("home.supportModal.send")}</button></div></div>}

        {channel === "direct" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600"/><div className="flex-1"><p className="text-sm font-bold text-emerald-900">{t("home.supportModal.creNotified")}</p><p className="mt-1 text-xs text-emerald-800">{t("home.supportModal.directInfo")}</p><div className="mt-4 flex flex-wrap gap-2">{context?.telefone ? <a href={`tel:${context.telefone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"><Phone className="h-4 w-4"/>{context.telefone}</a> : <span className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600">{t("home.supportModal.phoneUnavailable")}</span>}<button type="button" onClick={() => setChannel("choice")} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600">{t("home.supportModal.otherOption")}</button></div></div></div></div>}

        {channel === "thread" && selected && <div className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-900">{selected.assunto}</p><p className="text-[11px] text-slate-500">#{selected.id} · {t(`home.supportModal.status.${selected.status}` as any)}</p></div><button type="button" onClick={() => setChannel("choice")} className="text-xs font-semibold text-blue-700">{t("home.supportModal.newContact")}</button></div></div><div className="max-h-72 space-y-3 overflow-y-auto bg-slate-50 p-4">{thread.map((item) => <div key={item.id} className={`max-w-[85%] rounded-xl px-4 py-3 ${item.autor_papel === "PACIENTE" ? "ml-auto bg-[#0B5394] text-white" : "bg-white border border-slate-200 text-slate-800"}`}><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{item.autor_papel === "PACIENTE" ? t("home.supportModal.you") : t("home.supportModal.creTeam")}</p><p className="mt-1 whitespace-pre-wrap text-sm">{item.mensagem}</p>{item.orientacao !== "NENHUMA" && <p className="mt-2 text-[10px] font-bold uppercase opacity-80">{t(`home.supportModal.guidance.${item.orientacao}` as any)}</p>}<p className="mt-1 text-[10px] opacity-60">{new Date(item.criado_em).toLocaleString(locale)}</p></div>)}</div>{selected.status !== "ENCERRADO" && <div className="flex gap-2 border-t border-slate-100 p-4"><textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder={t("home.supportModal.replyPlaceholder")} className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm"/><button type="button" onClick={() => void sendReply()} disabled={busy || !reply.trim()} className="self-end rounded-lg bg-[#0B5394] p-3 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button></div>}</div>}

        {feedback && <p role="status" aria-live="polite" className={`rounded-lg px-3 py-2 text-xs font-medium ${feedback === t("home.supportModal.sent") || feedback === t("home.supportModal.creNotified") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{feedback}</p>}

        {!!recentTickets.length && channel !== "thread" && <div><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("home.supportModal.myConversations")}</h3><span className="text-[10px] text-slate-400">{recentTickets.length}</span></div><div className="space-y-2">{recentTickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => void openThread(ticket)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"><div><p className="text-xs font-bold text-slate-800">{ticket.assunto}</p><p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{ticket.ultima_mensagem?.mensagem ?? "—"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">{t(`home.supportModal.status.${ticket.status}` as any)}</span></button>)}</div></div>}

        <a href="https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><span>{t("home.supportModal.ministryLink")}</span><ExternalLink className="h-4 w-4 text-slate-400"/></a>
      </div>
    </div>
  </div>;
}
