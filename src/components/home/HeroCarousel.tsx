"use client";

/**
 * HeroCarousel — auto-rotating brand hero (CASETiFY-style).
 *
 * Desktop fills the viewport below the sticky header and cross-fades slides
 * over the art. On a phone the same photo is the hero background all the way
 * down to the slide dots, with the headline and buttons sitting on a soft
 * bottom scrim so the type stays readable.
 *
 * - Cross-fades between slides with a slow Ken-Burns zoom for a premium feel.
 * - Auto-advances every 6s; pauses on hover/focus; respects reduced-motion.
 * - Keyboard + swipe navigable, with dot indicators and edge arrows.
 *
 * Hero art lives in /public/brand/hero-*.webp. Swap those files (or this config)
 * to refresh the campaign — copy/CTAs are data-driven below.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { BUNDLE } from "@/lib/promotions";
import { ROUTES } from "@/lib/routes";

type Slide = {
  image: string;
  eyebrow: string;
  title: React.ReactNode;
  subtitle: string;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Where the copy sits, chosen to fall on each image's negative space. */
  align: "left" | "right" | "center";
};

const SLIDES: Slide[] = [
  {
    image: "/brand/hero-1.webp",
    eyebrow: "New season ✨",
    title: (
      <>
        Cases that match{" "}
        <br />
        <span className="text-holo">your vibe</span>.
      </>
    ),
    subtitle:
      "Kawaii, Y2K & holographic phone cases — designed to make every glance a little cuter.",
    cta: { label: "Shop the collection", href: "/products" },
    secondary: { label: "Browse characters", href: "/collections" },
    align: "left",
  },
  {
    image: "/brand/hero-3.webp",
    eyebrow: "Bundle & save 🎁",
    title: (
      <>
        Buy 2,{" "}
        <br />
        get <span className="text-holo">2 free</span>.
      </>
    ),
    subtitle:
      `Add any ${BUNDLE.groupSize} ${BUNDLE.eligibleProductCopy} to your bag — the ${BUNDLE.freePerGroup} cheapest are on us. Automatically.`,
    cta: { label: "Start your bundle", href: BUNDLE.landingPath },
    secondary: { label: "How it works", href: ROUTES.welcomeGift },
    align: "left",
  },
  {
    image: "/brand/hero-2.webp",
    eyebrow: "Holographic series",
    title: (
      <>
        Shine in{" "}
        <br />
        <span className="text-holo">every light</span>.
      </>
    ),
    subtitle:
      "Iridescent finishes, 3D charms and pearl details. Protection that turns heads.",
    cta: { label: "Shop holographic", href: "/collections/y2k" },
    align: "right",
  },
  {
    image: "/brand/hero-3.webp",
    eyebrow: "Your faves, together",
    title: (
      <>
        Meet the whole{" "}
        <br />
        <span className="text-holo">crew</span>.
      </>
    ),
    subtitle:
      "From Hello Kitty to Kuromi — find the character that's so totally you.",
    cta: { label: "Shop characters", href: "/collections" },
    align: "center",
  },
];

const INTERVAL = 6000;

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoPlayArmed, setAutoPlayArmed] = useState(false);
  // Only the current slide and its successor need media. Keeping already-seen
  // slides mounted preserves the crossfade, while progressively adding one
  // successor avoids downloading the full carousel immediately after hydration.
  const [loadedSlides, setLoadedSlides] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    const next = (index + 1) % SLIDES.length;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedSlides((loaded) => {
      if (loaded.has(index) && loaded.has(next)) return loaded;
      return new Set([...loaded, index, next]);
    });
  }, [index]);

  // Rotating a full-viewport image before the first user input creates a new,
  // later LCP candidate. Arm autoplay only after interaction has finalized LCP;
  // manual controls and swipe remain available immediately.
  useEffect(() => {
    const arm = () => {
      setAutoPlayArmed(true);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
    window.addEventListener("pointerdown", arm, { once: true, passive: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  // Auto-advance after the visitor has interacted with the document.
  useEffect(() => {
    if (!autoPlayArmed || paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      INTERVAL,
    );
    return () => window.clearInterval(t);
  }, [autoPlayArmed, paused]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative w-full overflow-hidden md:h-[calc(100svh-5.75rem)] md:min-h-[34rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {SLIDES.map((slide, i) => {
        const active = i === index;
        return (
          <div
            key={i}
            aria-hidden={!active}
            className={`md:absolute md:inset-0 md:transition-opacity md:duration-[1100ms] md:ease-out ${
              active
                ? "relative z-10 opacity-100"
                : "pointer-events-none hidden opacity-0 md:block"
            }`}
          >
            {/* Photo fills the hero, including the area behind the copy, and
                stops at the dots. Desktop keeps the full-viewport crop. */}
            <div className="absolute inset-0">
              {(active || loadedSlides.has(i)) && (
                <Image
                  src={slide.image}
                  alt=""
                  fill
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "low"}
                  sizes="100vw"
                  className={`object-cover object-[center_32%] transition-transform duration-[7000ms] ease-out md:object-center ${
                    active && autoPlayArmed ? "md:scale-110" : "scale-100"
                  }`}
                />
              )}
              {/* Phone: fade the lower half so the headline can sit on the
                  photo. Desktop: directional wash matching the copy side. */}
              <div className="absolute inset-0 bg-[linear-gradient(to_top,#fff6fb_0%,rgba(255,246,251,0.94)_30%,rgba(255,246,251,0.45)_48%,transparent_66%)] md:hidden" />
              <div
                className={`absolute inset-0 hidden md:block ${
                  slide.align === "left"
                    ? "bg-gradient-to-r from-white/80 via-white/30 to-transparent"
                    : slide.align === "right"
                      ? "bg-gradient-to-l from-white/80 via-white/30 to-transparent"
                      : "bg-gradient-to-t from-white/85 via-white/25 to-transparent"
                }`}
              />
            </div>

            {/* Copy. In normal flow on a phone so the photo (absolute) has a
                height to cover, down to the dots. */}
            <div className="relative z-10 md:absolute md:inset-0">
              <div
                className={`mx-auto flex min-h-[34rem] max-w-[1800px] flex-col justify-end px-4 pb-14 pt-28 md:h-full md:min-h-0 md:justify-center md:px-6 md:pb-0 md:pt-0 lg:px-8 ${
                  slide.align === "left"
                    ? "items-start text-left"
                    : slide.align === "right"
                      ? "items-start text-left md:items-end md:text-right"
                      : "items-start text-left md:items-center md:justify-end md:pb-28 md:text-center"
                }`}
              >
                <div
                  className={`w-full max-w-xl ${active ? "animate-float-up" : ""}`}
                  style={{ animationDelay: active ? "150ms" : undefined }}
                >
                  <span className="sticker font-pixel text-[9px] uppercase tracking-tight">
                    {slide.eyebrow}
                  </span>
                  <h2 className="mt-3 font-pixel text-base leading-snug text-[var(--foreground)] sm:mt-5 sm:text-3xl sm:leading-[1.45] sm:drop-shadow-sm lg:text-4xl lg:leading-[1.4]">
                    {slide.title}
                  </h2>
                  <p
                    className={`mt-2 text-sm leading-relaxed text-[var(--foreground)]/75 sm:mt-5 sm:text-lg ${
                      slide.align === "right" ? "md:ml-auto" : ""
                    } ${slide.align === "center" ? "md:mx-auto" : ""} max-w-md`}
                  >
                    {slide.subtitle}
                  </p>
                  <div
                    className={`mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:mt-8 ${
                      slide.align === "right"
                        ? "md:justify-end"
                        : slide.align === "center"
                          ? "md:justify-center"
                          : ""
                    }`}
                  >
                    <Link
                      href={slide.cta.href}
                      className="btn-candy inline-flex w-full items-center justify-center gap-2 px-7 py-3 text-base sm:w-auto sm:py-3.5"
                      tabIndex={active ? 0 : -1}
                    >
                      {slide.cta.label} <ArrowRight className="h-4 w-4" />
                    </Link>
                    {slide.secondary && (
                      <Link
                        href={slide.secondary.href}
                        tabIndex={active ? 0 : -1}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--card)] px-6 py-3 font-bold transition hover:border-[var(--primary)] hover:text-[var(--primary)] sm:w-auto md:bg-[var(--card)]/80 md:backdrop-blur"
                      >
                        {slide.secondary.label}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Controls live in the bottom band so they never overlap the headline. */}
      {/* Dot indicators — bottom centre */}
      <div className="absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center md:bottom-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className="grid h-10 w-10 place-items-center md:h-8 md:w-8"
          >
            <span
              aria-hidden
              className={`h-2.5 rounded-full shadow-[0_1px_4px_rgba(52,32,59,0.25)] transition-all duration-300 ${
                i === index
                  ? "w-8 bg-[var(--primary)]"
                  : "w-2.5 bg-white/80"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Prev / next — bottom-right cluster (desktop), clear of the copy */}
      <div className="absolute bottom-4 right-4 hidden items-center gap-2 sm:right-6 md:flex lg:right-8">
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="Previous slide"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] backdrop-blur transition hover:bg-[var(--card)] hover:text-[var(--primary)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="Next slide"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] backdrop-blur transition hover:bg-[var(--card)] hover:text-[var(--primary)]"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
