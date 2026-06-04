import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { listProductTypes } from "@/lib/catalog/product-types";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "Admin · Upload" };
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const types = listProductTypes().map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    enabled: t.enabled,
  }));

  const defaultDir = process.env.LOCAL_CATALOG_ROOT ?? "./bestListings";

  const recent = isDbConfigured()
    ? await db.query.products.findMany({
        orderBy: desc(products.createdAt),
        limit: 12,
        columns: {
          id: true,
          title: true,
          slug: true,
          status: true,
          productType: true,
          sourceFolder: true,
        },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black">Upload products</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Ingest a folder of product folders. Images are optimised to WebP,
          analysed by AI for copy + style, uploaded to R2, and added as drafts.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <UploadForm types={types} defaultDir={defaultDir} />
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--foreground)]/70">
        <p className="font-semibold">CLI equivalent</p>
        <code className="mt-1 block rounded bg-[var(--muted)] px-2 py-1 text-xs">
          npm run build:catalog -- --dir &quot;C:\path\to\folders&quot; --type iphone_case
        </code>
        <p className="mt-2 text-xs text-[var(--foreground)]/50">
          The ingest is resumable — re-running skips folders already pushed.
        </p>
      </div>

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Recently ingested</h2>
          <div className="space-y-2">
            {recent.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.title}
                </span>
                <span className="shrink-0 text-xs text-[var(--foreground)]/50">
                  {p.productType} · {p.sourceFolder ?? "—"}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
