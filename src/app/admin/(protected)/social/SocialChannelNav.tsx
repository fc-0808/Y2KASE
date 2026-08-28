import Link from "next/link";
import { cn } from "@/lib/utils";

const CHANNELS = [
  {
    href: "/admin/social",
    id: "pinterest" as const,
    label: "Pinterest",
    hint: "Pins & AI",
  },
  {
    href: "/admin/social/instagram",
    id: "instagram" as const,
    label: "Instagram",
    hint: "Daily slot",
  },
];

export function SocialChannelNav({
  active,
}: {
  active: "pinterest" | "instagram";
}) {
  return (
    <nav
      aria-label="Social channels"
      className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-4"
    >
      {CHANNELS.map((ch) => {
        const isActive = ch.id === active;
        return (
          <Link
            key={ch.id}
            href={ch.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
              isActive
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
            )}
          >
            {ch.label}
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide",
                isActive ? "text-white/70" : "text-[var(--foreground)]/40",
              )}
            >
              {ch.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
