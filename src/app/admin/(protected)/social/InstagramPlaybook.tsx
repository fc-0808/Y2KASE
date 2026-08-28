import { CheckCircle2, ExternalLink, MessageCircle, Sparkles, StickyNote } from "lucide-react";
import {
  INSTAGRAM_BOOTSTRAP_POSTS,
  INSTAGRAM_HANDLE,
  INSTAGRAM_PROFILE_URL,
} from "@/lib/social/instagram-strategy";

/**
 * The work the cron cannot do. Kept as a playbook, not a fake checklist with
 * no persistence — operators run a 1-person shop and need the duties in one
 * place, not another database of unchecked boxes.
 */
const DUTIES = [
  {
    icon: StickyNote,
    title: "Bio is the only link",
    body: "Instagram does not make caption URLs clickable. y2kase.com + the offer stay in the bio.",
  },
  {
    icon: Sparkles,
    title: "Highlights",
    body: "Empty rings look unfinished. Add Shop, New, and the offer using real product stills.",
  },
  {
    icon: MessageCircle,
    title: "Reply to everything",
    body: "A 1-follower account that talks back outranks a silent catalog. Same-day replies.",
  },
  {
    icon: CheckCircle2,
    title: `Fill ${INSTAGRAM_BOOTSTRAP_POSTS} posts before raising volume`,
    body: "The pack is one real Reel or carousel per day. Do not add a second post until the first 3×4 grid looks like a shop.",
  },
] as const;

export function InstagramPlaybook() {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h3 className="text-sm font-black">Operator desk</h3>
          <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
            The pack fills the grid. This is the rest of the job — bio,
            highlights, and talking back.
          </p>
        </div>
        <a
          href={INSTAGRAM_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold text-[var(--foreground)]/70 transition hover:border-[#E1306C] hover:text-[#E1306C]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          @{INSTAGRAM_HANDLE}
        </a>
      </div>
      <ul className="grid gap-px bg-[var(--border)] sm:grid-cols-2">
        {DUTIES.map((d) => (
          <li key={d.title} className="bg-[var(--card)] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E1306C]/10 text-[#E1306C]">
                <d.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold">{d.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--foreground)]/55">
                  {d.body}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
