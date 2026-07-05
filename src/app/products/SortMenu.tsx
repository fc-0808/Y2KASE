"use client";

/**
 * SortMenu — the storefront catalog sort control.
 *
 * The catalog query (`getProducts`) already understands a `sort` param; this is
 * the missing UI for it. Rendered as a styled native <select> (rather than a
 * bespoke popover) so it stays fully keyboard- and touch-accessible and gets
 * the platform picker on mobile — the pattern every premium store uses.
 *
 * It composes with the rest of the URL state: changing the sort preserves the
 * active search / tag / device / collection filters and resets pagination to
 * page 1 (a re-sorted list invalidates the old page offset).
 */
import { useRouter } from "next/navigation";
import { ArrowDownUp, ChevronDown } from "lucide-react";

export type SortValue = "newest" | "price-asc" | "price-desc";

const OPTIONS: { value: SortValue; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

/** The subset of catalog filters preserved across a sort change. */
export type SortParams = {
  q?: string;
  tag?: string;
  device?: string;
  collection?: string;
};

export function SortMenu({
  value = "newest",
  params,
}: {
  value?: SortValue;
  params: SortParams;
}) {
  const router = useRouter();

  function handleChange(next: string) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.tag) search.set("tag", params.tag);
    if (params.device) search.set("device", params.device);
    if (params.collection) search.set("collection", params.collection);
    // "newest" is the default — keep it out of the URL for clean, canonical links.
    if (next !== "newest") search.set("sort", next);
    const qs = search.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  return (
    <label className="group relative flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] pl-3.5 pr-9 text-sm font-semibold shadow-sm transition focus-within:border-[var(--primary)] hover:border-[var(--primary)]">
      <ArrowDownUp className="h-4 w-4 shrink-0 text-[var(--foreground)]/45" />
      <span className="hidden text-[var(--foreground)]/45 sm:inline">Sort</span>
      <select
        aria-label="Sort products"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent py-2 font-semibold text-[var(--foreground)] outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[var(--foreground)]/45 transition group-focus-within:text-[var(--primary)]" />
    </label>
  );
}
