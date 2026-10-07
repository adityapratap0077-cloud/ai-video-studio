import type { ProviderStatus } from "@/lib/types";

const STYLES: Record<ProviderStatus, { label: string; className: string }> = {
  connected: {
    label: "Connected",
    className: "border-ok/40 bg-ok/10 text-ok",
  },
  not_configured: {
    label: "Not configured",
    className: "border-line bg-raise text-dim",
  },
  invalid_key: {
    label: "Invalid key",
    className: "border-rec/50 bg-rec/10 text-rec",
  },
  rate_limited: {
    label: "Rate limited",
    className: "border-warn/50 bg-warn/10 text-warn",
  },
  unavailable: {
    label: "Unavailable",
    className: "border-line bg-raise text-faint",
  },
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${className}`}
      role="status"
      aria-label={`Provider status: ${label}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
