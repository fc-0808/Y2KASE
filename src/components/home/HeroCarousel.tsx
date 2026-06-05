"use client";

/**
 * HeroCarousel — full-viewport, auto-rotating brand hero (CASETiFY-style).
 *
 * - Fills the viewport below the sticky header on both axes.
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
        Cases that match
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
    image: "/brand/hero-2.webp",
    eyebrow: "Holographic series",
    title: (
      <>
        Shine in
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
        Meet the whole
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
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  // Auto-advance.
  useEffect(() => {
    if (paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = window.setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      INTERVAL,
    );
    return () => window.clearInterval(t);
  }, [paused]);

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
      className="relative h-[calc(100svh-5.75rem)] min-h-[34rem] w-full overflow-hidden"
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
            className={`absolute inset-0 transition-opacity duration-[1100ms] ease-out ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {/* Background art with slow zoom while active */}
            <Image
              src={slide.image}
              alt=""
              fill
              priority={i === 0}
              sizes="100vw"
              className={`object-cover transition-transform duration-[7000ms] ease-out ${
                active ? "scale-110" : "scale-100"
              }`}
            />

            {/* Legibility scrim — directional to match the copy side */}
            <div
              className={`absolute inset-0 ${
                slide.align === "left"
                  ? "bg-gradient-to-r from-white/80 via-white/30 to-transparent"
                  : slide.align === "right"
                    ? "bg-gradient-to-l from-white/80 via-white/30 to-transparent"
                    : "bg-gradient-to-t from-white/85 via-white/25 to-transparent"
              }`}
            />

            {/* Copy */}
            <div className="absolute inset-0">
              <div
                className={`mx-auto flex h-full max-w-[1800px] flex-col px-4 sm:px-6 lg:px-8 ${
                  slide.align === "left"
                    ? "items-start justify-center text-left"
                    : slide.align === "right"
                      ? "items-end justify-center text-right"
                      : "items-center justify-end pb-24 text-center sm:pb-28"
                }`}
              >
                <div
                  className={`max-w-xl ${active ? "animate-float-up" : ""}`}
                  style={{ animationDelay: active ? "150ms" : undefined }}
                >
                  <span className="sticker font-pixel text-[9px] uppercase tracking-tight">
                    {slide.eyebrow}
                  </span>
                  <h1 className="mt-5 font-pixel text-xl leading-[1.5] text-[var(--foreground)] drop-shadow-sm sm:text-3xl sm:leading-[1.45] lg:text-4xl lg:leading-[1.4]">
                    {slide.title}
                  </h1>
                  <p
                    className={`mt-5 text-base text-[var(--foreground)]/75 sm:text-lg ${
                      slide.align === "right" ? "ml-auto" : ""
                    } ${slide.align === "center" ? "mx-auto" : ""} max-w-md`}
                  >
                    {slide.subtitle}
                  </p>
                  <div
                    className={`mt-8 flex flex-wrap items-center gap-3 ${
                      slide.align === "right"
                        ? "justify-end"
                        : slide.align === "center"
                          ? "justify-center"
                          : ""
                    }`}
                  >
                    <Link
                      href={slide.cta.href}
                      className="btn-candy inline-flex items-center gap-2 px-7 py-3.5 text-base"
                      tabIndex={active ? 0 : -1}
                    >
                      {slide.cta.label} <ArrowRight className="h-4 w-4" />
                    </Link>
                    {slide.secondary && (
                      <Link
                        href={slide.secondary.href}
                        tabIndex={active ? 0 : -1}
                        className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--card)]/80 px-6 py-3 font-bold backdrop-blur transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
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
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === index
                ? "w-8 bg-[var(--primary)]"
                : "w-2.5 bg-[var(--foreground)]/25 hover:bg-[var(--foreground)]/50"
            }`}
          />
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
