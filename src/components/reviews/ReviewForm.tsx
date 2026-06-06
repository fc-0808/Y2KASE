"use client";

import { useState, useTransition } from "react";
import { Star, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitReviewAction } from "@/app/products/[slug]/review-actions";

/**
 * "Write a review" form. Interactive star picker + optimistic feedback. On a
 * verified-purchase submission the review auto-publishes (the PDP revalidates);
 * otherwise we tell the shopper it's pending review.
 */
export function ReviewForm({
  productId,
  slug,
}: {
  productId: number;
  slug: string;
}) {
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "published" | "pending">(null);

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
        authorEmail: email || undefined,
        rating,
        title: title || undefined,
        body,
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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-holo text-[var(--primary)]">
          <Check className="h-5 w-5" />
        </span>
        <p className="font-bold">Thank you for your review! 💕</p>
        <p className="mt-1 text-sm text-[var(--foreground)]/65">
          {done === "published"
            ? "It's now live on this page."
            : "We'll publish it shortly after a quick check."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="font-display text-lg font-extrabold">Write a review</h3>

      {/* Star picker */}
      <div className="mt-3 flex items-center gap-1">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (for verified badge)"
          type="email"
          autoComplete="email"
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-[var(--primary)]"
        />
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
        placeholder="What did you love? How's the quality, fit and shipping?"
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
      <p className="mt-2 text-xs text-[var(--foreground)]/50">
        Tip: use the email from your order to get a “Verified Purchase” badge.
      </p>
    </div>
  );
}
