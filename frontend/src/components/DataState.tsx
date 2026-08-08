import { AlertCircle, Loader2 } from "lucide-react";

export function LoadingState({ message }: { message: string }) {
  return <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-slate-500"><Loader2 aria-hidden="true" className="animate-spin" size={18} />{message}</div>;
}

export function ErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"><AlertCircle aria-hidden="true" className="text-red-600" size={26} /><p className="max-w-md text-sm text-slate-600">{message}</p><button onClick={onRetry} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">{retryLabel}</button></div>;
}

export function EmptyState({ message }: { message: string }) {
  return <p role="status" className="py-8 text-center text-sm text-slate-400">{message}</p>;
}
