import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  shipped: "bg-sky-100 text-sky-700",
  delivered: "bg-violet-100 text-violet-700",
  cancelled: "bg-gray-200 text-gray-600",
  refunded: "bg-rose-100 text-rose-700",
  active: "bg-emerald-100 text-emerald-700",
  unsubscribed: "bg-gray-200 text-gray-600",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STATUS_STYLES[status] ?? "bg-[var(--muted)] text-[var(--foreground)]/70",
        className,
      )}
    >
      {status}
    </span>
  );
}
