"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, Check, Play } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/utils";
import {
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  defaultStyleFor,
  defaultModelFor,
} from "@/lib/pricing";
import { getProductType, priceAxisFor } from "@/lib/catalog/product-types";
import {
  AIRPODS_MODEL_OPTION_NAME,
  defaultAirpodsModelFor,
  extendAirpodsSharedFits,
} from "@/lib/catalog/airpods";
import { selectStorefrontImages, storefrontVideoUrl } from "@/lib/catalog/storefront-media";
import {
  trackCartAdd,
  trackProductView,
} from "@/lib/analytics/commerce";
import { Stars } from "@/components/reviews/Stars";
import { ProductMedia } from "@/components/ProductMedia";
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

/**
 * Storefront option values as the shopper should see them.
 *
 * AirPods 4 and 5 share a mould. Legacy rows (and a stale ISR entry) may
 * still store `"AirPods 4"`; folding that onto `"AirPods 4 / 5"` here keeps
 * the picker, the default selection and the cart line on the same string
 * even before the backfill lands. AirPods Max is not in the catalogue; the
 * same fold drops it so a leftover chip cannot reappear on the picker.
 */
function storefrontOptions(options: Option[]): Option[] {
  return options.map((option) =>
    option.name === AIRPODS_MODEL_OPTION_NAME
      ? { ...option, values: extendAirpodsSharedFits(option.values) }
      : option,
  );
}

function defaultValueFor(option: Option): string {
  if (option.name === STYLE_OPTION_NAME) return defaultStyleFor(option.values);
  if (option.name === MODEL_OPTION_NAME) return defaultModelFor(option.values);
  if (option.name === AIRPODS_MODEL_OPTION_NAME) {
    return defaultAirpodsModelFor(option.values);
  }
  return option.values[0] ?? "";
}

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
  trackCommerce = true,
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
  /**
   * Commerce pixels (view + add-to-cart). Off on unpublished admin previews
   * so draft inspections do not pollute storefront analytics.
   */
  trackCommerce?: boolean;
}) {
  const addItem = useCart((s) => s.addItem);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const axes = useMemo(() => storefrontOptions(options), [options]);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      storefrontOptions(options)
        .map((o) => [o.name, defaultValueFor(o)])
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
  // Runtime 404s (objects deleted after ingest, flaky CDN) are dropped from
  // the gallery so a native broken-image icon never stays on the PDP.
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [mediaProductId, setMediaProductId] = useState(productId);
  if (mediaProductId !== productId) {
    setMediaProductId(productId);
    setActiveSlide(0);
    setFailedUrls(new Set());
  }

  const gallery = useMemo(
    () =>
      selectStorefrontImages(images).filter((img) => !failedUrls.has(img.url)),
    [images, failedUrls],
  );
  const playableVideoUrl =
    storefrontVideoUrl(videoUrl) && videoUrl && !failedUrls.has(videoUrl)
      ? videoUrl
      : null;

  const allSelected = axes.every((o) => selected[o.name]);
  const selectedStyle = selected[STYLE_OPTION_NAME];

  // The video is spliced into the slide list at this slot, so an image's index
  // within `gallery` shifts by one for slides at/after it. -1 = no video.
  const videoSlot = playableVideoUrl
    ? Math.max(0, Math.min(videoPosition ?? 1, gallery.length))
    : -1;
  const imageIndexToSlideIndex = (imgIdx: number) =>
    videoSlot >= 0 && imgIdx >= videoSlot ? imgIdx + 1 : imgIdx;

  // The FULL live gallery is always shown so shoppers see every angle at a
  // glance. Switching Style never hides images — it simply reveals the first
  // photo tagged for the newly chosen style (like Apple / CASETiFY variant
  // galleries). If the style has no dedicated live photo, the current slide is
  // left untouched. Uses the render-time "adjust state on dependency change"
  // pattern (no effect).
  if (selectedStyle !== styleAtSlideReset) {
    setStyleAtSlideReset(selectedStyle);
    const imgIdx = selectedStyle
      ? gallery.findIndex((img) => img.styleTags.includes(selectedStyle))
      : -1;
    if (imgIdx >= 0) setActiveSlide(imageIndexToSlideIndex(imgIdx));
  }

  function noteBrokenImage(url: string) {
    setFailedUrls((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  // Price is driven by the selected Style when the type has a price axis.
  // Flat types fall back to the stored base price.
  const priceAxis = priceAxisFor(productType);
  const currentPrice = useMemo(() => {
    if (!priceAxis) return price;
    return getProductType(productType).getPriceFromOptions(
      selected,
      currency,
    );
  }, [priceAxis, productType, selected, currency, price]);
  const onSale =
    compareAtPrice !== null &&
    compareAtPrice !== undefined &&
    compareAtPrice > currentPrice;

  // Every live image is a slide (plus the optional video) — retired 404
  // objects never enter the strip.
  const slides = useMemo<Slide[]>(() => {
    const imgSlides: Slide[] = gallery.map((img) => ({
      kind: "image",
      id: img.id,
      url: img.url,
      alt: img.altText ?? title,
    }));
    if (!playableVideoUrl) return imgSlides;

    // Insert the video at its configured slot (default: second slide, index 1).
    return [
      ...imgSlides.slice(0, videoSlot),
      { kind: "video", url: playableVideoUrl },
      ...imgSlides.slice(videoSlot),
    ];
  }, [gallery, playableVideoUrl, videoSlot, title]);

  const lastSlide = Math.max(0, slides.length - 1);
  if (activeSlide > lastSlide) setActiveSlide(lastSlide);

  const current = slides[Math.min(activeSlide, lastSlide)] ?? slides[0];

  // Commerce view event — fire exactly once when the PDP is first viewed.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!trackCommerce) return;
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackProductView(
      { productId, slug, title, price: currentPrice, options: selected },
      currency,
    );
  }, [trackCommerce, productId, slug, title, currentPrice, currency, selected]);

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
          ? gallery.find((img) => img.styleTags.includes(selectedStyle))?.url
          : undefined) ??
        gallery[0]?.url ??
        null,
      options: selected,
    });
    if (trackCommerce) {
      trackCartAdd(
        {
          productId,
          slug,
          title,
          price: currentPrice,
          options: selected,
          quantity: 1,
        },
        currency,
      );
    }
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
              onError={() => noteBrokenImage(current.url)}
            />
          ) : current?.kind === "image" ? (
            <ProductMedia
              key={current.url}
              src={current.url}
              alt={current.alt}
              fit="contain"
              loading={activeSlide === 0 ? "eager" : "lazy"}
              fetchPriority={activeSlide === 0 ? "high" : "auto"}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-full w-full"
              onImageError={noteBrokenImage}
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
                      {gallery[0]?.url ? (
                        <ProductMedia
                          src={gallery[0].url}
                          alt=""
                          fit="contain"
                          loading="lazy"
                          sizes="80px"
                          className="h-full w-full"
                          onImageError={noteBrokenImage}
                        />
                      ) : null}
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <Play className="h-4 w-4 fill-white text-white sm:h-5 sm:w-5" />
                      </span>
                    </>
                  ) : (
                    <ProductMedia
                      src={slide.url}
                      alt={slide.alt}
                      fit="contain"
                      loading="lazy"
                      sizes="80px"
                      className="h-full w-full"
                      onImageError={noteBrokenImage}
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
          options={axes}
          selected={selected}
          onSelect={(name, value) =>
            setSelected((s) => ({ ...s, [name]: value }))
          }
          currency={currency}
          priceForStyle={
            priceAxis
              ? (style) =>
                  getProductType(productType).getPriceFromOptions(
                    { ...selected, [priceAxis.name]: style },
                    currency,
                  )
              : undefined
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
