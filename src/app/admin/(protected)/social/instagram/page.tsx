import type { Metadata } from "next";
import { isDbConfigured } from "@/lib/db";
import { isMetaConfigured } from "@/lib/social/meta";
import { isCaptionGenConfigured } from "@/lib/social/caption-gen";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import {
  getMetaCoverage,
  getMetaNextPreview,
  getInstagramDesk,
} from "@/lib/social/meta-autopost";
import { getRecentPostedListings } from "@/lib/social/auto-pin";
import { INSTAGRAM_HANDLE } from "@/lib/social/instagram-strategy";
import { SocialChannelNav } from "../SocialChannelNav";
import { MetaAutopostPanel } from "../MetaAutopostPanel";
import { InstagramPlaybook } from "../InstagramPlaybook";
import { PostingHistory } from "../PostingHistory";
import { ManualInstagramPack } from "../ManualInstagramPack";

export const metadata: Metadata = { title: "Admin · Instagram" };
export const dynamic = "force-dynamic";

export default async function AdminInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ meta_connected?: string; meta_error?: string; meta_no_ig?: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const sp = await searchParams;
  const metaReady = isMetaConfigured();
  const [history, desk, metaCoverage, metaNextPreview] = await Promise.all([
    getRecentPostedListings(20, "instagram"),
    getInstagramDesk(),
    metaReady ? getMetaCoverage() : Promise.resolve(null),
    metaReady ? getMetaNextPreview() : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Instagram</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          @{INSTAGRAM_HANDLE} — a fashion grid, not a catalog. Today&apos;s
          pack is a look. Post in Instagram, then mark it here.
        </p>
      </div>

      <SocialChannelNav active="instagram" />

      {sp.meta_connected && (
        <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {sp.meta_no_ig
            ? "Facebook Page connected, but no Instagram business account was linked. Link IG to the Page in Meta Business Suite, then connect again."
            : "Instagram + Facebook connected."}
        </p>
      )}
      {sp.meta_error && (
        <p className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Could not connect Instagram: {sp.meta_error}
        </p>
      )}

      <ManualInstagramPack
        desk={desk}
        captionReady={isCaptionGenConfigured()}
        imageReady={isImageGenConfigured()}
      />

      {metaReady && metaCoverage && (
        <MetaAutopostPanel
          coverage={metaCoverage}
          nextPreview={metaNextPreview}
          metaConfigured={metaReady}
        />
      )}

      <InstagramPlaybook mix={desk.mix} />

      <PostingHistory
        history={history}
        heading="Instagram posts"
        emptyMessage="Nothing recorded yet. Post today's pack in the Instagram app, then tap I posted this."
      />
    </div>
  );
}
