import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db";
import { senderFor } from "@/lib/email";
import { getSubscriberStats } from "@/lib/admin/subscribers";
import { getAdminProductOverviews } from "@/lib/products";
import { getMarketingCampaigns } from "@/lib/marketing/campaigns";
import { getCadenceSnapshot } from "@/lib/marketing/cadence-audience";
import { isMarketingAiConfigured } from "@/lib/marketing/ai";
import { isMarketingHeroGenerationConfigured } from "@/lib/marketing/hero-config";
import {
  configuredMarketingSegmentId,
  configuredMarketingTopicId,
  isMarketingSendEnabled,
  isMarketingSenderConfigured,
  marketingMaxRecipients,
  marketingPostalAddress,
} from "@/lib/marketing/compliance";
import {
  parseEmailStudioView,
  type MarketingCapabilities,
  type MarketingProductOption,
} from "@/lib/marketing/types";
import { CampaignStudio } from "./CampaignStudio";

export const metadata: Metadata = { title: "Admin · Email" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const session = await requireAdmin(await headers());
  if (!session) return null;

  const view = parseEmailStudioView((await searchParams).view);
  const [campaigns, stats, products, cadence] = await Promise.all([
    getMarketingCampaigns(),
    getSubscriberStats(),
    getAdminProductOverviews(),
    getCadenceSnapshot(),
  ]);
  const productOptions: MarketingProductOption[] = products
    .filter((product) => product.status === "active")
    .map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      price: product.price,
      currency: product.currency,
      imageUrl: product.imageUrl,
    }));
  const postalAddress = marketingPostalAddress() ?? "";
  const capabilities: MarketingCapabilities = {
    aiConfigured: isMarketingAiConfigured(),
    heroImageGenerationConfigured: isMarketingHeroGenerationConfigured(),
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    postalAddressConfigured: postalAddress.length >= 6,
    dedicatedMarketingSenderConfigured: isMarketingSenderConfigured(),
    providerResourcesConfigured: Boolean(
      configuredMarketingSegmentId() && configuredMarketingTopicId(),
    ),
    webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    sendEnabled: isMarketingSendEnabled(),
    maxRecipients: marketingMaxRecipients(),
    sender: senderFor("marketing"),
    adminEmail: session.user.email,
    postalAddress:
      postalAddress || "Postal address required before production sending",
  };

  return (
    <CampaignStudio
      initialCampaignId={randomUUID()}
      initialCampaigns={campaigns}
      activeSubscriberCount={stats.active}
      products={productOptions}
      capabilities={capabilities}
      cadence={cadence}
      initialView={view}
    />
  );
}

