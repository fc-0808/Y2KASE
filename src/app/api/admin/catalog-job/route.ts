/**
 * GET /api/admin/catalog-job
 *
 * The upload page's live job dock. Returns the catalog ingest or classification
 * job holding ./data/catalog-job.lock, including the log the progress panel polls.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { getDisplayedCatalogJob } from "@/lib/catalog/job-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ job: getDisplayedCatalogJob() });
}
