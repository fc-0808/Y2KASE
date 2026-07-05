import type { Metadata } from "next";
import { isDbConfigured } from "@/lib/db";
import { getBestsellers, getFeaturableProducts } from "@/lib/products";
import { BestsellersConsole } from "./BestsellersConsole";

export const metadata: Metadata = { title: "Admin · Bestsellers" };
export const dynamic = "force-dynamic";

export default async function BestsellersPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const [current, candidates] = await Promise.all([
    getBestsellers(),
    getFeaturableProducts(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Bestsellers</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/60">
          The hand-picked products shown in the homepage{" "}
          <strong>Bestsellers</strong> rail, in this exact order. This stays
          fixed when you upload new products — it only changes here. Reorder
          with the arrows, add from your catalog, or remove what you don&apos;t
          want.
        </p>
      </div>

      <BestsellersConsole current={current} candidates={candidates} />
    </div>
  );
}
