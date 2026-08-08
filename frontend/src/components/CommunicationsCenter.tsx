import { useState, type FormEvent } from "react";
import { AlertTriangle, BellRing, CheckCircle2, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { apiPost } from "../lib/api";
import { useApiData } from "../lib/useApiData";
import { useLang } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";

interface RecallRow {
  id: number;
  codigo_lote: string;
  nome_produto: string;
  motivo: string;
  data_abertura: string;
  data_limite: string | null;
  affected_devices: number;
  status: string;
  orgao_notificador: string | null;
}

interface CommunicationsCenterProps {
  role: "GESTOR" | "FISCAL_CRE";
}

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function CommunicationsCenter({ role }: CommunicationsCenterProps) {
  const { t, locale } = useLang();
  const [tab, setTab] = useState<"alert" | "recall">("alert");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const recalls = useApiData<RecallRow[]>("/api/communications/recalls");

  const tr = (key: string) => t(key as TranslationKey);
  const audienceOptions = role === "GESTOR"
    ? [
        ["ALL", tr("communications.audience.all")],
        ["PACIENTES", tr("communications.audience.patients")],
        ["FISCAL_CRE", tr("communications.audience.cre")],
        ["GESTORES", tr("communications.audience.managers")],
      ]
    : [
        ["UNIT_PATIENTS", tr("communications.audience.unitPatients")],
        ["UNIT_STAFF", tr("communications.audience.unitStaff")],
      ];

  const targetOptions = role === "GESTOR"
    ? [
        ["communications", tr("communications.targets.communications")],
        ["manager_lifecycle", tr("communications.targets.lifecycle")],
        ["manager_logistics", tr("communications.targets.logistics")],
        ["manager_reports", tr("communications.targets.reports")],
        ["manager_centers", tr("communications.targets.centers")],
        ["manager_finance", tr("communications.targets.finance")],
        ["manager_equity", tr("communications.targets.equity")],
        ["manager_registrations", tr("communications.targets.registrations")],
        ["patient_orders", tr("communications.targets.patientOrders")],
        ["patient_support", tr("communications.targets.patientSupport")],
      ]
    : [
        ["communications", tr("communications.targets.communications")],
        ["cre_patients", tr("communications.targets.patients")],
        ["cre_logistics", tr("communications.targets.logistics")],
        ["cre_triages", tr("communications.targets.triages")],
        ["cre_reports", tr("communications.targets.reports")],
        ["patient_orders", tr("communications.targets.patientOrders")],
        ["patient_support", tr("communications.targets.patientSupport")],
      ];

  const submitAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiPost<{ recipients: number }>("/api/communications/alerts", {
        titulo: form.get("titulo"),
        mensagem: form.get("mensagem"),
        tipo: form.get("tipo"),
        audiencia: form.get("audiencia"),
        target: form.get("target"),
      });
      formElement.reset();
      setMessage({ ok: true, text: tr("communications.success.alert").replace("{count}", String(response.recipients)) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : tr("communications.error.generic");
      setMessage({ ok: false, text: tr("communications.error.alert").replace("{reason}", reason) });
    } finally {
      setBusy(false);
    }
  };

  const submitRecall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage(null);
    try {
      await apiPost("/api/communications/recalls", {
        codigo_lote: form.get("codigo_lote"),
        nome_produto: form.get("nome_produto"),
        motivo: form.get("motivo"),
        data_limite: form.get("data_limite") || null,
        affected_devices: Number(form.get("affected_devices") || 0),
        status: "ABERTO",
        orgao_notificador: form.get("orgao_notificador") || null,
      });
      formElement.reset();
      setMessage({ ok: true, text: tr("communications.success.recall") });
      void recalls.reload();
    } catch (error) {
      const reason = error instanceof Error ? error.message : tr("communications.error.generic");
      setMessage({ ok: false, text: tr("communications.error.recall").replace("{reason}", reason) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">UMDR</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{tr("communications.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{tr("communications.subtitle")}</p>
        </div>
        <div role="tablist" aria-label={tr("communications.title")} className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button type="button" role="tab" aria-selected={tab === "alert"} onClick={() => setTab("alert")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "alert" ? "bg-blue-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}><BellRing size={14} />{tr("communications.tabs.alert")}</button>
          <button type="button" role="tab" aria-selected={tab === "recall"} onClick={() => setTab("recall")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "recall" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}><ShieldAlert size={14} />{tr("communications.tabs.recall")}</button>
        </div>
      </div>

      {message && <div role={message.ok ? "status" : "alert"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}{message.text}</div>}

      {tab === "alert" ? (
        <form onSubmit={submitAlert} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5"><h2 className="text-sm font-bold text-slate-900">{tr("communications.alertForm.title")}</h2><p className="mt-1 text-xs text-slate-500">{tr("communications.alertForm.subtitle")}</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">{tr("communications.fields.title")}<input name="titulo" required maxLength={255} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.type")}<select name="tipo" defaultValue="ALERTA" className={`${inputClass} mt-1.5`}><option value="INFO">INFO</option><option value="ALERTA">ALERTA</option><option value="LEMBRETE">LEMBRETE</option><option value="URGENTE">URGENTE</option></select></label>
            <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.audience")}<select name="audiencia" className={`${inputClass} mt-1.5`}>{audienceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">{tr("communications.fields.target")}<select name="target" className={`${inputClass} mt-1.5`}>{targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600 md:col-span-2">{tr("communications.fields.message")}<textarea name="mensagem" required maxLength={500} rows={5} className={`${inputClass} mt-1.5 resize-y`} /></label>
          </div>
          <div className="mt-5 flex justify-end"><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"><Send size={14} />{busy ? tr("communications.sending") : tr("communications.sendAlert")}</button></div>
        </form>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <form onSubmit={submitRecall} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5"><h2 className="text-sm font-bold text-slate-900">{tr("communications.recallForm.title")}</h2><p className="mt-1 text-xs text-slate-500">{tr("communications.recallForm.subtitle")}</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.batch")}<input name="codigo_lote" required className={`${inputClass} mt-1.5`} /></label>
              <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.product")}<input name="nome_produto" required className={`${inputClass} mt-1.5`} /></label>
              <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.deadline")}<input name="data_limite" type="date" className={`${inputClass} mt-1.5`} /></label>
              <label className="text-xs font-semibold text-slate-600">{tr("communications.fields.affected")}<input name="affected_devices" type="number" min="0" defaultValue="0" className={`${inputClass} mt-1.5`} /></label>
              <label className="text-xs font-semibold text-slate-600 md:col-span-2">{tr("communications.fields.issuer")}<input name="orgao_notificador" className={`${inputClass} mt-1.5`} placeholder={role === "GESTOR" ? "UMDR" : "CNES"} /></label>
              <label className="text-xs font-semibold text-slate-600 md:col-span-2">{tr("communications.fields.reason")}<textarea name="motivo" required rows={5} className={`${inputClass} mt-1.5 resize-y`} /></label>
            </div>
            <div className="mt-5 flex justify-end"><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"><ShieldAlert size={14} />{busy ? tr("communications.sending") : tr("communications.issueRecall")}</button></div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">{tr("communications.recentRecalls")}</h2><p className="mt-0.5 text-xs text-slate-500">{tr("communications.recentRecallsHint")}</p></div><button type="button" onClick={recalls.reload} aria-label={t("shell.accessibility.refresh")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-blue-600"><RefreshCw size={15} aria-hidden="true" /></button></div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {recalls.loading && !recalls.data ? <p className="p-5 text-xs text-slate-400">…</p> : (recalls.data ?? []).length === 0 ? <p className="p-5 text-xs text-slate-400">{tr("communications.noRecalls")}</p> : (recalls.data ?? []).map((recall) => <div key={recall.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900">{recall.nome_produto}</p><p className="mt-0.5 font-mono text-[11px] text-slate-500">{recall.codigo_lote}</p></div><span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">{recall.status}</span></div><p className="mt-2 text-xs leading-relaxed text-slate-600">{recall.motivo}</p><p className="mt-2 text-[10px] text-slate-400">{new Date(`${recall.data_abertura}T00:00:00`).toLocaleDateString(locale)} · {recall.affected_devices} {tr("communications.devices")}</p></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
