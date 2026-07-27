/**
 * GET /api/cron/blog-generate — autonomous blog publishing (Vercel Cron).
 *
 * Each run tops up the topic backlog from the live catalog, then writes up to
 * BLOG_CRON_BATCH articles. With BLOG_AUTOPUBLISH=true they go live immediately;
 * otherwise they're filed as drafts for review in /admin/blog. The blog index
 * and any new post paths are revalidated so published posts appear without a
 * deploy.
 *
 * `maxDuration` is raised so a run can comfortably finish its batch (article
 * generation is a single chat call, but we leave headroom).
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { isDbConfigured } from "@/lib/db";
import { isBlogGenConfigured } from "@/lib/blog/generate";
import { runBlogGeneration, BLOG_CRON_BATCH } from "@/lib/blog/engine";

export const runtime = "nodejs";
// Article writing is one chat call, but Nano Banana Pro hero generation polls
// the KIE gateway for up to ~2-3 min — give the run generous headroom.
export const maxDuration = 300; // seconds (Vercel Pro allows up to 300)

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, generated: 0, reason: "no-db" });
  }
  if (!isBlogGenConfigured()) {
    return NextResponse.json({
      ok: true,
      generated: 0,
      reason: "no-openai-key",
    });
  }

  const res = await runBlogGeneration({ max: BLOG_CRON_BATCH });

  // Surface newly published posts immediately.
  if (res.published > 0) {
    revalidatePath("/blog");
    for (const slug of res.slugs) revalidatePath(`/blog/${slug}`);
  }

  return NextResponse.json({ ok: true, ...res });
}
