import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import { findDuplicateClusters } from "@/lib/catalog/duplicates";
import { DUPLICATE_THRESHOLD } from "@/lib/catalog/phash";
import { DuplicatesReview } from "./DuplicatesReview";

export const metadata: Metadata = { title: "Admin · Duplicate products" };
export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          Add <code>DATABASE_URL</code> to use the admin panel.
        </p>
      </div>
    );
  }

  const clusters = await findDuplicateClusters();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-black">Possible duplicates</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/60">
          Products whose main photo is visually near-identical to
          another&apos;s, grouped together. This catches the same product
          re-uploaded (including resized or re-compressed photos) so you can
          remove repeats before they go live. Matched on a perceptual
          fingerprint — no AI cost.
        </p>
      </div>

      <DuplicatesReview clusters={clusters} threshold={DUPLICATE_THRESHOLD} />
    </div>
  );
}
