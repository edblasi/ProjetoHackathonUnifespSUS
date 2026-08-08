import { Clock3, History, X } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import { useDeviceHistory, type PatientDevice } from "../hooks/FetchData";
import { DeviceIdentityCard, exportDeviceCardPdf } from "./DeviceIdentityCard";
import { useDialogAccessibility } from "./Accessibility";

export function formatUsageDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}

export function DeviceHistoryModal({ open, onClose, device, patientName }: { open: boolean; onClose: () => void; device: PatientDevice | null; patientName: string }) {
  const { t, locale } = useLang();
  const { data, loading, error } = useDeviceHistory(open ? device?.id ?? null : null);
  const dialogRef = useDialogAccessibility<HTMLDivElement>(open && Boolean(device), onClose);
  if (!open || !device) return null;
  const summary = data?.summary;
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="device-history-title" tabIndex={-1} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-slate-50 shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div><h2 id="device-history-title" className="text-lg font-bold text-slate-900">{t("home.historyModal.title")}</h2><p className="text-xs text-slate-500">{t("home.historyModal.subtitle")}</p></div><button type="button" onClick={onClose} aria-label={t("shell.accessibility.close")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" aria-hidden="true" /></button></div>
      <div className="space-y-5 p-6">
        <DeviceIdentityCard device={device} patientName={patientName} />
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("home.historyModal.useCount")}</p><p className="mt-1 text-2xl font-bold text-slate-900">{summary?.numero_usos ?? device.numero_usos}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("home.historyModal.totalTime")}</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatUsageDuration(summary?.tempo_total_uso_minutos ?? device.tempo_total_uso_minutos)}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("home.historyModal.avgTime")}</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatUsageDuration(summary?.tempo_medio_uso_minutos ?? 0)}</p></div></div>
        <div className="rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><History className="h-4 w-4 text-[#0B5394]"/><h3 className="text-sm font-bold text-slate-900">{t("home.historyModal.usageHistory")}</h3></div>{loading ? <p className="p-5 text-sm text-slate-500">…</p> : error ? <p className="p-5 text-sm text-red-600">{error}</p> : data?.usages.length ? <div className="divide-y divide-slate-100">{data.usages.map((usage) => <div key={usage.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_1fr_120px]"><div><p className="text-[10px] font-bold uppercase text-slate-400">{t("home.historyModal.started")}</p><p className="text-xs font-semibold text-slate-700">{new Date(usage.inicio_uso).toLocaleString(locale)}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">{t("home.historyModal.context")}</p><p className="text-xs text-slate-700">{usage.contexto || usage.observacao || "—"}</p></div><div className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Clock3 className="h-3.5 w-3.5 text-slate-400"/>{formatUsageDuration(usage.duracao_minutos)}</div></div>)}</div> : <p className="p-5 text-sm text-slate-500">{t("home.historyModal.noUsage")}</p>}</div>
        <div className="flex justify-end"><button type="button" onClick={() => exportDeviceCardPdf(device, patientName, locale)} className="rounded-lg bg-[#0B5394] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#084477]">{t("home.id.exportPdf")}</button></div>
      </div>
    </div>
  </div>;
}
