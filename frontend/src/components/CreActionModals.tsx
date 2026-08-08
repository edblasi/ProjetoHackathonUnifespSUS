import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardPlus, PackagePlus, X } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import type { AdminCatalogs } from "../types/api";
import type { PacienteAguardando, Triagem, TriageWorkflowStatus } from "../hooks/FetchData";
import { useLang } from "../i18n/LanguageContext";
import type { TranslationKey } from "../i18n/translations";
import { patientOperationalLabel } from "../lib/patientPrivacy";
import { useDialogAccessibility } from "./Accessibility";

const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const TRIAGE_WORKFLOW_SEQUENCE: TriageWorkflowStatus[] = [
  "PENDENTE",
  "EM_ANDAMENTO",
  "CONCLUIDA",
  "EM_PRODUCAO",
  "PRONTA_PARA_ENTREGA",
  "ENTREGUE",
];

function availableWorkflowStatuses(current: TriageWorkflowStatus): TriageWorkflowStatus[] {
  if (current === "ENTREGUE" || current === "CANCELADA") return [current];
  const index = TRIAGE_WORKFLOW_SEQUENCE.indexOf(current);
  if (index < 0) return [current];
  const next = TRIAGE_WORKFLOW_SEQUENCE[index + 1];
  return next ? [current, next, "CANCELADA"] : [current];
}

function workflowLabel(status: TriageWorkflowStatus, tr: (key: string) => string): string {
  const labels: Record<TriageWorkflowStatus, string> = {
    PENDENTE: tr("triage.status.pending"),
    EM_ANDAMENTO: tr("triage.status.progress"),
    CONCLUIDA: tr("triage.status.done"),
    EM_PRODUCAO: tr("triage.status.production"),
    PRONTA_PARA_ENTREGA: tr("triage.status.ready"),
    ENTREGUE: tr("triage.status.delivered"),
    CANCELADA: tr("triage.status.cancelled"),
  };
  return labels[status];
}

interface TriageModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialPatientId?: number | null;
  triage?: Triagem | null;
}

export function TriageModal({ open, onClose, onSaved, initialPatientId = null, triage = null }: TriageModalProps) {
  const { t } = useLang();
  const tr = (key: string) => t(key as TranslationKey);
  const [catalogs, setCatalogs] = useState<AdminCatalogs | null>(null);
  const [crePatients, setCrePatients] = useState<PacienteAguardando[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<TriageWorkflowStatus>(triage?.workflow_status ?? triage?.status ?? "PENDENTE");
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage(null);
    setWorkflowStatus(triage?.workflow_status ?? triage?.status ?? "PENDENTE");
    Promise.all([
      apiGet<AdminCatalogs>("/api/admin/catalogs"),
      apiGet<PacienteAguardando[]>("/api/cre/patients"),
    ])
      .then(([catalogData, patientData]) => { setCatalogs(catalogData); setCrePatients(patientData); })
      .catch((error: unknown) => setMessage({ ok: false, text: error instanceof Error ? error.message : tr("cre.actions.genericError") }))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage(null);
    try {
      const procedure = String(form.get("procedimento_sigtap_proposto") || "") || null;
      const notes = String(form.get("observacao_clinica") || "") || null;
      if (triage) {
        await apiPatch(`/api/cre/triages/${triage.triagem_id}`, {
          procedimento_sigtap_proposto: procedure,
          workflow_status: String(form.get("workflow_status")),
          motivo_cancelamento: String(form.get("motivo_cancelamento") || "") || null,
          observacao_clinica: notes,
        });
      } else {
        await apiPost("/api/cre/triages", {
          paciente_id: Number(form.get("paciente_id")),
          procedimento_sigtap_proposto: procedure,
          status: String(form.get("status")),
          observacao_clinica: notes,
        });
      }
      setMessage({ ok: true, text: triage ? tr("cre.actions.triageUpdated") : tr("cre.actions.triageCreated") });
      onSaved();
      window.setTimeout(onClose, 650);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : tr("cre.actions.genericError") });
    } finally {
      setSaving(false);
    }
  };

  const selectedPatient = triage?.paciente_id ?? initialPatientId ?? undefined;
  const selectedProcedure = triage?.procedimento_sigtap_proposto ?? "";
  const workflowOptions = triage ? availableWorkflowStatuses(triage.workflow_status ?? triage.status) : ["PENDENTE" as TriageWorkflowStatus];
  const eligiblePatients = Array.from(
    new Map(
      crePatients
        .filter((patient) => ["AUTORIZADA", "EM_FILA"].includes(patient.status) && !patient.triagem_status)
        .map((patient) => [patient.paciente_id, patient]),
    ).values(),
  );

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="triage-dialog-title" tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-blue-50 p-2 text-blue-700"><ClipboardPlus size={17} /></div><div><h2 id="triage-dialog-title" className="text-sm font-bold text-slate-900">{triage ? tr("cre.actions.editTriage") : tr("cre.actions.newTriage")}</h2><p className="mt-0.5 text-xs text-slate-500">{tr("cre.actions.triageHint")}</p></div></div><button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} aria-hidden="true" /></button></div>
        {loading && !catalogs ? <div className="p-8 text-center text-sm text-slate-400">…</div> : (
          <form onSubmit={submit}>
            <div className="space-y-4 p-5">
              {message && <div role={message.ok ? "status" : "alert"} aria-live="polite" className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.ok && <CheckCircle2 size={15} />}{message.text}</div>}
              <label className="block text-xs font-semibold text-slate-600">{tr("cre.actions.patient")}<select name="paciente_id" required defaultValue={selectedPatient ?? ""} disabled={Boolean(triage)} className={inputClass}><option value="">{tr("cre.actions.select")}</option>{eligiblePatients.map((patient) => <option key={patient.paciente_id} value={patient.paciente_id}>{patientOperationalLabel(patient.nome_completo, patient.dispositivo)}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-600">{tr("cre.actions.procedure")}<select name="procedimento_sigtap_proposto" defaultValue={selectedProcedure} className={inputClass}><option value="">{tr("cre.actions.select")}</option>{(catalogs?.procedures ?? []).map((procedure) => <option key={procedure.codigo} value={procedure.codigo}>{procedure.codigo} · {procedure.nome_procedimento}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-600">{tr("cre.actions.status")}{triage ? (
                <select name="workflow_status" value={workflowStatus} onChange={(event) => setWorkflowStatus(event.target.value as TriageWorkflowStatus)} className={inputClass}>
                  {workflowOptions.map((status) => <option key={status} value={status}>{workflowLabel(status, tr)}</option>)}
                </select>
              ) : (
                <>
                  <input type="hidden" name="status" value="PENDENTE" />
                  <select value="PENDENTE" disabled className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-500`}>
                    <option value="PENDENTE">{tr("triage.status.pending")}</option>
                  </select>
                </>
              )}</label>
              {triage && <p className="-mt-2 text-[11px] leading-relaxed text-slate-400">{tr("cre.actions.workflowHint")}</p>}
              {triage && workflowStatus === "CANCELADA" && <label className="block text-xs font-semibold text-red-700">{tr("cre.actions.cancelReason")}<textarea name="motivo_cancelamento" required minLength={5} rows={3} className={`${inputClass} border-red-200 focus:border-red-500 focus:ring-red-100`} placeholder={tr("cre.actions.cancelReasonPlaceholder")} /></label>}
              <label className="block text-xs font-semibold text-slate-600">{tr("cre.actions.notes")}<textarea name="observacao_clinica" defaultValue={triage?.observacao_clinica ?? ""} rows={5} className={`${inputClass} resize-y`} /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("cre.actions.cancel")}</button><button disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? tr("cre.actions.saving") : tr("cre.actions.saveTriage")}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

interface ShipmentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ShipmentModal({ open, onClose, onSaved }: ShipmentModalProps) {
  const { t } = useLang();
  const tr = (key: string) => t(key as TranslationKey);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open, onClose);
  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage(null);
    try {
      await apiPost("/api/cre/shipments", {
        tipo_dispositivo: form.get("tipo_dispositivo"),
        quantidade: Number(form.get("quantidade") || 1),
        fabricante_destino: form.get("fabricante_destino"),
        endereco_destino: form.get("endereco_destino") || null,
        codigo_rastreio: form.get("codigo_rastreio") || null,
        status: form.get("status"),
      });
      setMessage({ ok: true, text: tr("cre.actions.returnCreated") });
      onSaved();
      window.setTimeout(onClose, 650);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : tr("cre.actions.genericError") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shipment-dialog-title" tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-start gap-3"><div className="rounded-lg bg-amber-50 p-2 text-amber-700"><PackagePlus size={17} /></div><div><h2 id="shipment-dialog-title" className="text-sm font-bold text-slate-900">{tr("cre.actions.newReturn")}</h2><p className="mt-0.5 text-xs text-slate-500">{tr("cre.actions.returnHint")}</p></div></div><button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} aria-hidden="true" /></button></div>
        <form onSubmit={submit}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {message && <div role={message.ok ? "status" : "alert"} aria-live="polite" className={`sm:col-span-2 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.ok && <CheckCircle2 size={15} />}{message.text}</div>}
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{tr("cre.actions.deviceType")}<input name="tipo_dispositivo" required className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-600">{tr("cre.actions.quantity")}<input name="quantidade" type="number" min="1" defaultValue="1" required className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-600">{tr("cre.actions.shipmentStatus")}<select name="status" defaultValue="AGUARDANDO_COLETA" className={inputClass}><option value="AGUARDANDO_COLETA">AGUARDANDO COLETA</option><option value="EM_TRANSITO">EM TRÂNSITO</option><option value="ENTREGUE">ENTREGUE</option></select></label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{tr("cre.actions.destinationManufacturer")}<input name="fabricante_destino" required className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{tr("cre.actions.destinationAddress")}<input name="endereco_destino" className={inputClass} /></label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">{tr("cre.actions.trackingCode")}<input name="codigo_rastreio" className={inputClass} /></label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{tr("cre.actions.cancel")}</button><button disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">{saving ? tr("cre.actions.saving") : tr("cre.actions.saveReturn")}</button></div>
        </form>
      </div>
    </div>
  );
}
