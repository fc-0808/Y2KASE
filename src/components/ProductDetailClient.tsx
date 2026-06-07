"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, Check, Play } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/utils";
import { STYLE_OPTION_NAME, getStylePrice, defaultStyleFor } from "@/lib/pricing";
import { trackAddToCart, trackViewItem } from "@/lib/analytics/gtag";
import { Stars } from "@/components/reviews/Stars";

type Option = { id: number; name: string; values: string[] };
type Img = {
  id: number;
  url: string;
  altText: string | null;
  styleTags: string[];
};

/** A gallery slide is either an image or the product video. */
type Slide =
  | { kind: "image"; id: number; url: string; alt: string }
  | { kind: "video"; url: string };

export function ProductDetailClient({
  productId,
  slug,
  title,
  price,
  currency,
  productType,
  ratingAverage = 0,
  ratingCount = 0,
  videoUrl,
  videoPosition,
  images,
  options,
}: {
  productId: number;
  slug: string;
  title: string;
  price: number;
  currency: string;
  productType: string;
  ratingAverage?: number;
  ratingCount?: number;
  videoUrl: string | null;
  videoPosition: number | null;
  images: Img[];
  options: Option[];
}) {
  const addItem = useCart((s) => s.addItem);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options
        .map((o) => [
          o.name,
          // Style axis opens on the cheapest entry style ("Case Only" when offered).
          o.name === STYLE_OPTION_NAME ? defaultStyleFor(o.values) : o.values[0] ?? "",
        ])
        .filter(([, v]) => v),
    ),
  );
  const [activeSlide, setActiveSlide] = useState(0);
  const [added, setAdded] = useState(false);
  // When the shopper switches Style the visible gallery changes, so jump back to
  // the first (now style-matched) slide. Done via the render-time "adjust state
  // on dependency change" pattern rather than an effect — no cascading render.
  const [styleAtSlideReset, setStyleAtSlideReset] = useState(
    selected[STYLE_OPTION_NAME],
  );

  const allSelected = options.every((o) => selected[o.name]);
  const selectedStyle = selected[STYLE_OPTION_NAME];

  if (selectedStyle !== styleAtSlideReset) {
    setStyleAtSlideReset(selectedStyle);
    setActiveSlide(0);
  }

  // Price is driven by the selected Style (iPhone cases). Other product types
  // fall back to the stored base price until their own pricing is wired.
  const isIphoneCase = productType === "iphone_case";
  const currentPrice = useMemo(
    () => (isIphoneCase ? getStylePrice(selectedStyle, currency) : price),
    [isIphoneCase, selectedStyle, currency, price],
  );

  // Gallery: images with empty styleTags are universal (always visible).
  // Images tagged for a specific style only appear when that style is active.
  // This applies consistently for every style — including the default "Case Only".
  // Fallback to all images only if the filter would produce an empty set.
  const visibleImages = useMemo(() => {
    if (!selectedStyle) return images;
    const matching = images.filter(
      (img) => img.styleTags.length === 0 || img.styleTags.includes(selectedStyle),
    );
    return matching.length > 0 ? matching : images;
  }, [images, selectedStyle]);

  const slides = useMemo<Slide[]>(() => {
    const imgSlides: Slide[] = visibleImages.map((img) => ({
      kind: "image",
      id: img.id,
      url: img.url,
      alt: img.altText ?? title,
    }));
    if (!videoUrl) return imgSlides;

    // Insert the video at its configured slot (clamped to a valid index).
    // Null preserves the historical default of "second slide" (index 1).
    const slot = Math.max(
      0,
      Math.min(videoPosition ?? 1, imgSlides.length),
    );
    return [
      ...imgSlides.slice(0, slot),
      { kind: "video", url: videoUrl },
      ...imgSlides.slice(slot),
    ];
  }, [visibleImages, videoUrl, videoPosition, title]);

  const current = slides[activeSlide] ?? slides[0];

  // GA4 view_item — fire exactly once when the PDP is first viewed.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackViewItem(
      { productId, slug, title, price: currentPrice, options: selected },
      currency,
    );
  }, [productId, slug, title, currentPrice, currency, selected]);

  function handleAdd() {
    if (!allSelected) return;
    addItem({
      productId,
      slug,
      title,
      price: currentPrice,
      currency,
      imageUrl: visibleImages[0]?.url ?? images[0]?.url ?? null,
      options: selected,
    });
    trackAddToCart(
      { productId, slug, title, price: currentPrice, options: selected, quantity: 1 },
      currency,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--muted)]">
          {current?.kind === "video" ? (
            <video
              key={current.url}
              src={current.url}
              className="h-full w-full object-contain"
              controls
              autoPlay
              muted
              loop
              playsInline
            />
          ) : current?.kind === "image" ? (
            <Image
              src={current.url}
              alt={current.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center text-6xl">🎀</div>
          )}
        </div>

        {slides.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {slides.map((slide, i) => (
              <button
                key={slide.kind === "video" ? `video-${slide.url}` : `img-${slide.id}`}
                onClick={() => setActiveSlide(i)}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-[var(--muted)] ${
                  i === activeSlide
                    ? "border-[var(--primary)]"
                    : "border-transparent"
                }`}
              >
                {slide.kind === "video" ? (
                  <>
                    <video
                      src={slide.url}
                      className="h-full w-full object-contain"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/30">
                      <Play className="h-5 w-5 fill-white text-white" />
                    </span>
                  </>
                ) : (
                  <Image
                    src={slide.url}
                    alt={slide.alt}
                    fill
                    sizes="80px"
                    className="object-contain"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">
            {title}
          </h1>
          {ratingCount > 0 && (
            <a
              href="#reviews"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/70 hover:text-[var(--primary)]"
            >
              <Stars rating={ratingAverage} size={15} />
              <span>
                {ratingAverage.toFixed(1)} ({ratingCount})
              </span>
            </a>
          )}
          <p className="mt-2 text-2xl font-bold text-[var(--primary)]">
            {formatPrice(currentPrice, currency)}
          </p>
        </div>

        {options.map((opt) => (
          <div key={opt.id}>
            <p className="mb-2 text-sm font-bold">
              {opt.name}
              {selected[opt.name] && (
                <span className="ml-2 font-normal text-[var(--foreground)]/60">
                  {selected[opt.name]}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {opt.values.map((value) => {
                const isActive = selected[opt.name] === value;
                return (
                  <button
                    key={value}
                    onClick={() =>
                      setSelected((s) => ({ ...s, [opt.name]: value }))
                    }
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button
          onClick={handleAdd}
          disabled={!allSelected}
          className="btn-candy flex items-center justify-center gap-2 py-4 text-base disabled:cursor-not-allowed disabled:opacity-50"
        >
          {added ? (
            <>
              <Check className="h-5 w-5" /> Added!
            </>
          ) : (
            <>
              <ShoppingBag className="h-5 w-5" /> Add to Bag
            </>
          )}
        </button>
      </div>
    </div>
  );
}
