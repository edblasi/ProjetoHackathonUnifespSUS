import { CalendarDays, Factory, Hash, Package, ShieldCheck, Store, Wrench } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import type { PatientDevice } from "../hooks/FetchData";
import { QRCodePlaceholder } from "./QRCode";

interface Props {
  device: PatientDevice;
  patientName: string;
  className?: string;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function seededBits(value: string): boolean[] {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i += 1) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619) >>> 0;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967295;
  };
  return Array.from({ length: 21 * 21 }, (_, index) => {
    const row = Math.floor(index / 21);
    const col = index % 21;
    const finder = (r0: number, c0: number) => row >= r0 && row < r0 + 7 && col >= c0 && col < c0 + 7;
    const inFinder = finder(0, 0) || finder(0, 14) || finder(14, 0);
    if (inFinder) {
      const localRow = row % 14;
      const localCol = col % 14;
      const rr = row >= 14 ? row - 14 : row;
      const cc = col >= 14 ? col - 14 : col;
      return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) || (localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4);
    }
    return rand() > 0.52;
  });
}

export function exportDeviceCardPdf(device: PatientDevice, patientName: string, locale: string) {
  const popup = window.open("", "_blank", "width=940,height=760");
  if (!popup) return;
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(locale) : "—";
  const bits = seededBits(device.qr_token || device.numero_serie);
  const qr = bits.map((dark) => `<i style="display:block;background:${dark ? "#0f172a" : "#fff"}"></i>`).join("");
  const rows = [
    ["Paciente", patientName],
    ["Tipo", device.nome_produto],
    ["Modelo", device.modelo_exato],
    ["Fabricante", device.fabricante],
    ["Fornecedora", device.fornecedor_nome],
    ["Oficina responsável", device.oficina_nome],
    ["CER", device.cre_nome],
    ["Número de série", device.numero_serie],
    ["Data de manufatura", date(device.data_manufatura)],
    ["Data de entrega", date(device.data_entrega)],
    ["Usos registrados", device.numero_usos],
  ];
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carteirinha ${htmlEscape(device.numero_serie)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;background:#eef4fa;margin:0;padding:32px;color:#0f172a}.sheet{max-width:820px;margin:auto}.card{background:#fff;border:1px solid #cbd5e1;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.12)}.top{padding:24px 28px;background:linear-gradient(135deg,#0b5394,#1565c0);color:#fff;display:flex;justify-content:space-between;align-items:center}.brand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.78}.title{font-size:24px;font-weight:800;margin-top:5px}.status{font-size:12px;font-weight:700;background:#fff2;padding:8px 12px;border-radius:999px}.body{display:grid;grid-template-columns:180px 1fr;gap:28px;padding:28px}.qr{width:164px;height:164px;display:grid;grid-template-columns:repeat(21,1fr);gap:1px;padding:10px;background:#fff;border:1px solid #dbe3ec;border-radius:14px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:15px 24px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:700}.value{font-size:13px;font-weight:650;margin-top:3px}.foot{border-top:1px solid #e2e8f0;padding:14px 28px;font-size:10px;color:#64748b;display:flex;justify-content:space-between}.actions{margin:20px auto;text-align:center}.actions button{border:0;background:#0b5394;color:#fff;border-radius:10px;padding:11px 18px;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}.actions{display:none}.card{box-shadow:none}}
  </style></head><body><div class="sheet"><div class="card"><div class="top"><div><div class="brand">UMDR · SUS</div><div class="title">Carteirinha digital do dispositivo</div></div><div class="status">${htmlEscape(device.status)}</div></div><div class="body"><div><div class="qr">${qr}</div><div style="font-family:monospace;font-size:10px;text-align:center;margin-top:8px;color:#64748b">${htmlEscape(device.numero_serie)}</div></div><div class="meta">${rows.map(([label,value])=>`<div><div class="label">${htmlEscape(label)}</div><div class="value">${htmlEscape(value)}</div></div>`).join("")}</div></div><div class="foot"><span>Identidade digital UMDR</span><span>${htmlEscape(device.qr_token)}</span></div></div><div class="actions"><button onclick="window.print()">Salvar / imprimir PDF</button></div></div></body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    try { popup.print(); } catch { /* O botão da janela permanece disponível como fallback. */ }
  }, 250);
}

export function DeviceIdentityCard({ device, patientName, className = "" }: Props) {
  const { t, locale } = useLang();
  const fmt = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString(locale) : "—";
  const fields = [
    { icon: Package, label: t("home.deviceCard.type"), value: device.nome_produto ?? "—" },
    { icon: ShieldCheck, label: t("home.deviceCard.model"), value: device.modelo_exato },
    { icon: Factory, label: t("home.deviceCard.manufacturer"), value: device.fabricante },
    { icon: Store, label: t("home.deviceCard.provider"), value: device.fornecedor_nome ?? "—" },
    { icon: Wrench, label: t("home.deviceCard.workshop"), value: device.oficina_nome ?? "—" },
    { icon: CalendarDays, label: t("home.deviceCard.manufacturedAt"), value: fmt(device.data_manufatura) },
    { icon: Hash, label: t("home.deviceCard.serial"), value: device.numero_serie },
  ];
  return <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
    <div className="flex items-center justify-between bg-gradient-to-br from-[#0B5394] to-[#1565C0] px-5 py-4 text-white">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">UMDR · SUS</p><h3 className="mt-1 text-base font-bold">{t("home.deviceCard.title")}</h3><p className="mt-0.5 text-xs text-white/75">{patientName}</p></div>
      <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold">{t(`home.deviceCard.status.${device.status}` as any)}</span>
    </div>
    <div className="grid gap-5 p-5 sm:grid-cols-[150px_1fr]">
      <div className="flex flex-col items-center"><QRCodePlaceholder size={138} value={device.qr_token || device.numero_serie} /><span className="mt-2 font-mono text-[10px] text-slate-500">{device.numero_serie}</span></div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">{fields.map(({ icon: Icon, label, value }) => <div key={label}><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400"><Icon className="h-3 w-3" />{label}</div><p className="mt-0.5 text-xs font-semibold text-slate-800">{value}</p></div>)}</div>
    </div>
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500"><span>{t("home.deviceCard.uses")}: <strong className="text-slate-700">{device.numero_usos}</strong></span><span>{t("home.deviceCard.deliveredAt")}: <strong className="text-slate-700">{fmt(device.data_entrega)}</strong></span></div>
  </div>;
}
