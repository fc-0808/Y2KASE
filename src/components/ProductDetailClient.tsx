"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, Check, Play } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/utils";
import { STYLE_OPTION_NAME, getStylePrice, defaultStyleFor } from "@/lib/pricing";
import {
  trackCartAdd,
  trackProductView,
} from "@/lib/analytics/commerce";
import { Stars } from "@/components/reviews/Stars";
import { ProductOptions } from "@/components/product/ProductOptions";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";

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
  compareAtPrice,
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
  compareAtPrice?: number | null;
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
  const addButtonRef = useRef<HTMLButtonElement>(null);
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
  // Tracks the Style the gallery last reacted to, so switching Style can reveal
  // that style's first photo (see below) without an effect / cascading render.
  const [styleAtSlideReset, setStyleAtSlideReset] = useState(
    selected[STYLE_OPTION_NAME],
  );

  const allSelected = options.every((o) => selected[o.name]);
  const selectedStyle = selected[STYLE_OPTION_NAME];

  // The video is spliced into the slide list at this slot, so an image's index
  // within `images` shifts by one for slides at/after it. -1 = no video.
  const videoSlot = videoUrl
    ? Math.max(0, Math.min(videoPosition ?? 1, images.length))
    : -1;
  const imageIndexToSlideIndex = (imgIdx: number) =>
    videoSlot >= 0 && imgIdx >= videoSlot ? imgIdx + 1 : imgIdx;

  // The FULL gallery is always shown so shoppers see every angle at a glance.
  // Switching Style never hides images — it simply reveals the first photo
  // tagged for the newly chosen style (like Apple / CASETiFY variant galleries).
  // If the style has no dedicated photo, the current slide is left untouched.
  // Uses the render-time "adjust state on dependency change" pattern (no effect).
  if (selectedStyle !== styleAtSlideReset) {
    setStyleAtSlideReset(selectedStyle);
    const imgIdx = selectedStyle
      ? images.findIndex((img) => img.styleTags.includes(selectedStyle))
      : -1;
    if (imgIdx >= 0) setActiveSlide(imageIndexToSlideIndex(imgIdx));
  }

  // Price is driven by the selected Style (iPhone cases). Other product types
  // fall back to the stored base price until their own pricing is wired.
  const isIphoneCase = productType === "iphone_case";
  const currentPrice = useMemo(
    () => (isIphoneCase ? getStylePrice(selectedStyle, currency) : price),
    [isIphoneCase, selectedStyle, currency, price],
  );
  const onSale =
    compareAtPrice !== null &&
    compareAtPrice !== undefined &&
    compareAtPrice > currentPrice;

  // Every image is a slide (plus the optional video) — nothing is filtered out.
  const slides = useMemo<Slide[]>(() => {
    const imgSlides: Slide[] = images.map((img) => ({
      kind: "image",
      id: img.id,
      url: img.url,
      alt: img.altText ?? title,
    }));
    if (!videoUrl) return imgSlides;

    // Insert the video at its configured slot (default: second slide, index 1).
    return [
      ...imgSlides.slice(0, videoSlot),
      { kind: "video", url: videoUrl },
      ...imgSlides.slice(videoSlot),
    ];
  }, [images, videoUrl, videoSlot, title]);

  const current = slides[activeSlide] ?? slides[0];

  // Commerce view event — fire exactly once when the PDP is first viewed.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackProductView(
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
      // Cart thumbnail reflects the chosen Style (its first tagged photo),
      // falling back to the hero image when the style has no dedicated shot.
      imageUrl:
        (selectedStyle
          ? images.find((img) => img.styleTags.includes(selectedStyle))?.url
          : undefined) ??
        images[0]?.url ??
        null,
      options: selected,
    });
    trackCartAdd(
      { productId, slug, title, price: currentPrice, options: selected, quantity: 1 },
      currency,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="grid gap-8 pb-[max(5rem,calc(80px+env(safe-area-inset-bottom)))] lg:grid-cols-2 lg:pb-0">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--product-surface)]">
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
              quality={82}
              unoptimized
              loading={activeSlide === 0 ? "eager" : "lazy"}
              fetchPriority={activeSlide === 0 ? "high" : "auto"}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center text-6xl">🎀</div>
          )}
        </div>

        {slides.length > 1 && (
          <>
            <div
              className="flex justify-center gap-1.5"
              role="tablist"
              aria-label="Product images"
            >
              {slides.map((slide, i) => (
                <button
                  key={
                    slide.kind === "video"
                      ? `dot-video-${slide.url}`
                      : `dot-img-${slide.id}`
                  }
                  type="button"
                  role="tab"
                  aria-selected={i === activeSlide}
                  aria-label={`View image ${i + 1} of ${slides.length}`}
                  onClick={() => setActiveSlide(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === activeSlide
                      ? "w-5 bg-[var(--primary)]"
                      : "w-2 bg-[var(--foreground)]/25 hover:bg-[var(--foreground)]/40"
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {slides.map((slide, i) => (
                <button
                  key={
                    slide.kind === "video"
                      ? `video-${slide.url}`
                      : `img-${slide.id}`
                  }
                  type="button"
                  aria-label={`Show ${
                    slide.kind === "video" ? "product video" : "product image"
                  } ${i + 1} of ${slides.length}`}
                  aria-pressed={i === activeSlide}
                  onClick={() => setActiveSlide(i)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-[var(--product-surface)] sm:h-20 sm:w-20 ${
                    i === activeSlide
                      ? "border-[var(--primary)]"
                      : "border-transparent"
                  }`}
                >
                  {slide.kind === "video" ? (
                    <>
                      {images[0]?.url ? (
                        <Image
                          src={images[0].url}
                          alt=""
                          fill
                          quality={72}
                          unoptimized
                          loading="lazy"
                          sizes="80px"
                          className="object-contain"
                        />
                      ) : null}
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <Play className="h-4 w-4 fill-white text-white sm:h-5 sm:w-5" />
                      </span>
                    </>
                  ) : (
                    <Image
                      src={slide.url}
                      alt={slide.alt}
                      fill
                      quality={82}
                      unoptimized
                      loading="lazy"
                      sizes="80px"
                      className="object-contain"
                    />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
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
          {/* The style cards quote add-on deltas, so this is the only place the
              running total is spelled out — announce it when it moves. */}
          <div
            aria-live="polite"
            className="mt-2 flex flex-wrap items-baseline gap-2"
          >
            <span className="text-2xl font-bold text-[var(--primary)]">
              {formatPrice(currentPrice, currency)}
            </span>
            {onSale && (
              <span className="text-sm font-semibold text-[var(--foreground)]/45 line-through">
                {formatPrice(compareAtPrice, currency)}
              </span>
            )}
          </div>
        </div>

        <ProductOptions
          options={options}
          selected={selected}
          onSelect={(name, value) =>
            setSelected((s) => ({ ...s, [name]: value }))
          }
          currency={currency}
          // Only the iPhone-case axis is priced per style today; other product
          // types would otherwise price every card at the same base number.
          priceForStyle={
            isIphoneCase ? (style) => getStylePrice(style, currency) : undefined
          }
        />

        <button
          ref={addButtonRef}
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

      <StickyBuyBar
        watch={addButtonRef}
        price={currentPrice}
        currency={currency}
        summary={Object.values(selected).filter(Boolean).join(" · ")}
        disabled={!allSelected}
        added={added}
        onAdd={handleAdd}
      />
    </div>
  );
}
