"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ChevronDown, Star, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitReviewAction } from "@/app/(storefront)/products/[slug]/review-actions";

/** Collapsed until a buyer meant to write one, including from the email link. */
export function WriteReview({
  initialOpen,
  children,
}: {
  initialOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div
      id="write-review"
      className="card-cute scroll-mt-24 overflow-hidden"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
          <Star className="h-4 w-4" style={{ fill: "currentColor" }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-extrabold leading-tight">
            Bought this?
          </span>
          <span className="block text-xs font-semibold text-[var(--foreground)]/55">
            Write a review
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--foreground)]/45 transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-5 py-5">{children}</div>
      )}
    </div>
  );
}

/**
 * "Write a review" form. A signed post-purchase link publishes immediately
 * and marks the review verified. Everyone else is held for moderation.
 */
export function ReviewForm({
  productId,
  slug,
  plain = false,
  initialName = "",
  initialRating = 0,
  reviewToken,
}: {
  productId: number;
  slug: string;
  plain?: boolean;
  initialName?: string;
  initialRating?: number;
  reviewToken?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(initialRating);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "published" | "pending">(null);
  const verifiedInvite = Boolean(reviewToken);

  function submit() {
    setError(null);
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    startTransition(async () => {
      const res = await submitReviewAction({
        productId,
        slug,
        authorName: name,
        authorEmail: verifiedInvite ? undefined : email || undefined,
        rating,
        title: title || undefined,
        body,
        reviewToken,
      });
      if (res.ok) {
        setDone(res.status === "published" ? "published" : "pending");
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="py-2 text-center">
        <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-holo text-[var(--primary)]">
          <Check className="h-5 w-5" />
        </span>
        <p className="font-bold">Thank you for your review.</p>
        <p className="mt-1 text-sm text-[var(--foreground)]/65">
          {done === "published"
            ? "It's live on this page."
            : "We'll publish it after a quick check."}
        </p>
      </div>
    );
  }

  return (
    <div className={plain ? "" : "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"}>
      {!plain && (
        <h3 className="font-display text-lg font-extrabold">Write a review</h3>
      )}
      {verifiedInvite && (
        <p className="mb-3 text-sm text-[var(--foreground)]/70">
          This posts as a verified purchase.
        </p>
      )}

      <div className={cn("flex items-center gap-1", !plain && "mt-3")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5"
          >
            <Star
              className={cn(
                "h-7 w-7 transition",
                (hover || rating) >= n
                  ? "text-amber-400"
                  : "text-[var(--foreground)]/25",
              )}
              style={(hover || rating) >= n ? { fill: "currentColor" } : undefined}
            />
          </button>
        ))}
      </div>

      <div className={cn("grid gap-3", verifiedInvite ? "mt-4" : "mt-4 sm:grid-cols-2")}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
        {!verifiedInvite && (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="email"
            className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
          />
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a headline (optional)"
        className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Does it look like the photos? How's the fit?"
        rows={4}
        className="mt-3 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)]"
      />

      {error && (
        <p className="mt-2 text-sm font-semibold text-red-500">{error}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn-candy mt-4 flex items-center justify-center gap-2 px-6 py-3 text-sm disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit review
      </button>
      {!verifiedInvite && (
        <p className="mt-2 text-xs text-[var(--foreground)]/50">
          A verified badge is added when you review from your order email, or
          while signed in with the same address.
        </p>
      )}
    </div>
  );
}
