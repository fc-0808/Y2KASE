import type { Metadata } from "next";
import Link from "next/link";
import { isDbConfigured } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getProductsByStatus } from "@/lib/products";
import {
  getCreatives,
  getCreativeStatusCounts,
  CREATIVE_STATUSES,
} from "@/lib/social/creatives";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import { isPinterestConfigured } from "@/lib/social/pinterest";
import { SocialStudio } from "./SocialStudio";

export const metadata: Metadata = { title: "Admin · Social Studio" };
export const dynamic = "force-dynamic";

export default async function AdminSocialPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const sp = await searchParams;
  const activeStatus =
    sp.status && (CREATIVE_STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : undefined;

  const [creatives, counts, products] = await Promise.all([
    getCreatives(activeStatus),
    getCreativeStatusCounts(),
    getProductsByStatus("active"),
  ]);

  const total =
    counts.draft +
    counts.approved +
    counts.scheduled +
    counts.published +
    counts.rejected;
  const tabs = [
    { key: undefined as string | undefined, label: "All", count: total },
    { key: "draft", label: "draft", count: counts.draft },
    { key: "approved", label: "approved", count: counts.approved },
    { key: "scheduled", label: "scheduled", count: counts.scheduled },
    { key: "published", label: "published", count: counts.published },
    { key: "rejected", label: "rejected", count: counts.rejected },
  ];

  const spend = (counts.totalCostCents / 100).toFixed(2);
  const apiReady = isImageGenConfigured();
  const pinterestReady = isPinterestConfigured();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Social Studio ✨</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Generate on-brand marketing creatives with AI, review them, then post.
          {" "}
          <span className="font-semibold">≈ ${spend} spent</span> on generation
          so far.
        </p>
      </div>

      {!apiReady && (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-bold">OPENAI_API_KEY is not set.</span> Add it to
          your environment to enable image generation.
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = activeStatus === t.key;
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/social?status=${t.key}` : "/admin/social"}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                isActive
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
              )}
            >
              {t.label}
              <span className="ml-1.5 opacity-70">{t.count}</span>
            </Link>
          );
        })}
      </div>

      <SocialStudio
        creatives={creatives}
        pinterestReady={pinterestReady}
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          imageUrl: p.imageUrl,
        }))}
      />
    </div>
  );
}
