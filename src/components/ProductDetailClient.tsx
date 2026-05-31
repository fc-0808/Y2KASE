"use client";

import Image from "next/image";
import { useState } from "react";
import { ShoppingBag, Check } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/utils";

type Option = { id: number; name: string; values: string[] };
type Img = { id: number; url: string; altText: string | null };

export function ProductDetailClient({
  productId,
  slug,
  title,
  price,
  currency,
  images,
  options,
}: {
  productId: number;
  slug: string;
  title: string;
  price: number;
  currency: string;
  images: Img[];
  options: Option[];
}) {
  const addItem = useCart((s) => s.addItem);
  const [activeImage, setActiveImage] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      options.map((o) => [o.name, o.values[0] ?? ""]).filter(([, v]) => v),
    ),
  );
  const [added, setAdded] = useState(false);

  const allSelected = options.every((o) => selected[o.name]);

  function handleAdd() {
    if (!allSelected) return;
    addItem({
      productId,
      slug,
      title,
      price,
      currency,
      imageUrl: images[0]?.url ?? null,
      options: selected,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--muted)]">
          {images[activeImage] ? (
            <Image
              src={images[activeImage].url}
              alt={images[activeImage].altText ?? title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-6xl">🎀</div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => setActiveImage(i)}
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${
                  i === activeImage
                    ? "border-[var(--primary)]"
                    : "border-transparent"
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.altText ?? `${title} ${i + 1}`}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-black leading-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-2xl font-bold text-[var(--primary)]">
            {formatPrice(price, currency)}
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
          className="flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-4 text-base font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
