export const CAMPAIGN_TYPES = [
  "announcement",
  "product-launch",
  "promotion",
  "restock",
  "newsletter",
  "seasonal",
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/**
 * Provider-side schedules resolve suppressions outside our request lifecycle.
 * Keep disabled until a durable opt-out outbox/worker guarantees propagation.
 */
export const MARKETING_SCHEDULING_ENABLED = false;

/**
 * Deliberately structured campaign content.
 *
 * AI is allowed to draft these plain-text fields, never executable HTML. The
 * deterministic renderer owns escaping, branding, accessibility and the
 * unsubscribe footer.
 */
export type MarketingDraft = {
  name: string;
  campaignType: CampaignType;
  subject: string;
  previewText: string;
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  heroImageUrl: string;
  heroImageAlt: string;
  promoCode: string;
};

export type MarketingProductOption = {
  id: number;
  title: string;
  slug: string;
  price: string;
  currency: string;
  imageUrl: string | null;
};

export type MarketingCampaignStatus =
  | "draft"
  | "preparing"
  | "queued"
  | "scheduled"
  | "sent"
  | "cancelled"
  | "failed";

export type MarketingCampaignView = MarketingDraft & {
  id: string;
  status: MarketingCampaignStatus;
  contentHash: string;
  testedContentHash: string | null;
  lastTestSentAt: string | null;
  preparedRecipientCount: number | null;
  preparedAt: string | null;
  launchedAt: string | null;
  resendBroadcastId: string | null;
  recipientCount: number | null;
  scheduledAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingCapabilities = {
  aiConfigured: boolean;
  emailConfigured: boolean;
  postalAddressConfigured: boolean;
  dedicatedMarketingSenderConfigured: boolean;
  providerResourcesConfigured: boolean;
  webhookConfigured: boolean;
  sendEnabled: boolean;
  maxRecipients: number;
  sender: string;
  adminEmail: string;
  postalAddress: string;
};

export const MARKETING_LIMITS = {
  name: 100,
  subject: 120,
  previewText: 160,
  eyebrow: 60,
  heading: 120,
  body: 2_500,
  ctaLabel: 50,
  url: 1_000,
  imageAlt: 160,
  promoCode: 40,
  brief: 2_000,
} as const;

