import {
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Sparkles,
  StickyNote,
  Tags,
} from "lucide-react";
import {
  INSTAGRAM_BOOTSTRAP_POSTS,
  INSTAGRAM_HANDLE,
  INSTAGRAM_PROFILE_URL,
} from "@/lib/social/instagram-strategy";
import {
  INSTAGRAM_BIO,
  INSTAGRAM_BIO_CATEGORY,
  INSTAGRAM_HIGHLIGHTS,
  INSTAGRAM_TAGLINE,
  type FashionPillar,
} from "@/lib/social/instagram-fashion";
import { InstagramFashionMix } from "./InstagramFashionMix";

/**
 * The work the cron cannot do. Kept as a playbook, not a fake checklist with
 * no persistence — operators run a 1-person shop and need the duties in one
 * place, not another database of unchecked boxes.
 */
const DUTIES = [
  {
    icon: Tags,
    title: `Category is ${INSTAGRAM_BIO_CATEGORY}`,
    body: "Instagram currently reads as a phone shop (手機店). Switch the profile category to Fashion Accessories / Shopping. BURGA and TORRAS sit there. The display name already says Y2K Fashion Accessories — the category has to match.",
  },
  {
    icon: StickyNote,
    title: `Bio stays ${INSTAGRAM_TAGLINE}`,
    body: "Do not turn the bio into a product list. One line of attitude, then y2kase.com. That is BURGA's 'ESCAPE BORING' shape, in your voice. Caption URLs are not clickable.",
  },
  {
    icon: Sparkles,
    title: "Highlights: Looks, Shop, Characters, New",
    body: INSTAGRAM_HIGHLIGHTS.map((h) => `${h.label} — ${h.cover}`).join(" "),
  },
  {
    icon: MessageCircle,
    title: "Reply to everything",
    body: "A 1-follower account that talks back outranks a silent catalog. Same-day replies. The mix fills the grid; a person holds the comments.",
  },
  {
    icon: CheckCircle2,
    title: `Fill ${INSTAGRAM_BOOTSTRAP_POSTS} mixed posts before raising volume`,
    body: "The pack is one considered tile per day. Looks, stills, graphics, worlds, details. Do not add a second post until the first 3×4 looks like a magazine, not a shop.",
  },
] as const;

export function InstagramPlaybook({ mix }: { mix: readonly FashionPillar[] }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h3 className="text-sm font-black">Operator desk</h3>
          <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
            The pack fills the grid. This is the rest of the job — category,
            bio, highlights, and talking back.
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

      <div className="grid gap-px bg-[var(--border)] lg:grid-cols-[minmax(0,1fr)_16rem]">
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
        <div className="bg-[var(--card)] px-5 py-4">
          <InstagramFashionMix mix={mix} caption="Next 3×4 mix" />
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              Paste this bio
            </p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--foreground)]/80">
              {INSTAGRAM_BIO}
            </pre>
            <p className="mt-2 text-[11px] text-[var(--foreground)]/45">
              Category: {INSTAGRAM_BIO_CATEGORY}. Link: y2kase.com
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
