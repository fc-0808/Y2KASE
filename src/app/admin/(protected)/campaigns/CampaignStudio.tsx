"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  Mail,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";
import {
  createStarterDraft,
  marketingPreflight,
  renderMarketingEmail,
  validateMarketingDraft,
} from "@/lib/marketing/template";
import { isRecoverablePreparingCampaign } from "@/lib/marketing/campaign-status";
import {
  CAMPAIGN_TYPES,
  MARKETING_LIMITS,
  MARKETING_SCHEDULING_ENABLED,
  type CampaignType,
  type MarketingCampaignStatus,
  type MarketingCampaignView,
  type MarketingCapabilities,
  type MarketingDraft,
  type MarketingProductOption,
} from "@/lib/marketing/types";
import {
  generateCampaignDraft,
  launchCampaign,
  prepareCampaignAudience,
  refreshCampaignStatuses,
  saveCampaignDraft,
  sendCampaignTest,
} from "./actions";

const TYPE_LABELS: Record<CampaignType, string> = {
  announcement: "Announcement",
  "product-launch": "Product launch",
  promotion: "Subscriber offer",
  restock: "Restock",
  newsletter: "Newsletter",
  seasonal: "Seasonal edit",
};

const TONES = [
  { value: "playful", label: "Playful & on-brand" },
  { value: "polished", label: "Polished & minimal" },
  { value: "warm", label: "Warm & personal" },
  { value: "energetic", label: "Energetic & punchy" },
] as const;

const STATUS_STYLE: Record<MarketingCampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  preparing: "bg-amber-100 text-amber-800",
  queued: "bg-sky-100 text-sky-800",
  scheduled: "bg-violet-100 text-violet-800",
  sent: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
  failed: "bg-rose-100 text-rose-800",
};

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition placeholder:text-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60";

function displayDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function defaultScheduleValue(): string {
  const hour = 60 * 60_000;
  const date = new Date(Math.ceil((Date.now() + hour) / hour) * hour);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function campaignDraft(campaign: MarketingCampaignView): MarketingDraft {
  return {
    name: campaign.name,
    campaignType: campaign.campaignType,
    subject: campaign.subject,
    previewText: campaign.previewText,
    eyebrow: campaign.eyebrow,
    heading: campaign.heading,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
    heroImageUrl: campaign.heroImageUrl,
    heroImageAlt: campaign.heroImageAlt,
    promoCode: campaign.promoCode,
  };
}

export function CampaignStudio({
  initialCampaignId,
  initialCampaigns,
  activeSubscriberCount,
  products,
  capabilities,
}: {
  initialCampaignId: string;
  initialCampaigns: MarketingCampaignView[];
  activeSubscriberCount: number;
  products: MarketingProductOption[];
  capabilities: MarketingCapabilities;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"compose" | "history">("compose");
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [draft, setDraft] = useState<MarketingDraft>(() =>
    createStarterDraft("announcement"),
  );
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [offer, setOffer] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>("playful");
  const [subjectAlternatives, setSubjectAlternatives] = useState<string[]>([]);
  const [busy, setBusy] = useState<
    "generate" | "save" | "test" | "prepare" | "launch" | "refresh" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [preparedCount, setPreparedCount] = useState<number | null>(null);
  const [preparedFingerprint, setPreparedFingerprint] = useState<string | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const dismissConfirmation = useCallback(() => {
    if (busy !== "launch") setConfirmOpen(false);
  }, [busy]);

  useBodyScrollLock(confirmOpen);
  useModalFocusTrap(confirmDialogRef, confirmOpen, dismissConfirmation);
  useEffect(() => {
    if (!dirty) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? null;
  const preview = useMemo(() => {
    try {
      return renderMarketingEmail(draft, {
        postalAddress: capabilities.postalAddress,
        unsubscribeUrl: "#preview-unsubscribe",
        campaignId,
      }).html;
    } catch {
      return renderMarketingEmail(
        { ...draft, ctaUrl: "https://y2kase.com/products" },
        {
          postalAddress: capabilities.postalAddress,
          unsubscribeUrl: "#preview-unsubscribe",
          campaignId,
        },
      ).html;
    }
  }, [campaignId, capabilities.postalAddress, draft]);
  const preflightWarnings = useMemo(() => marketingPreflight(draft), [draft]);
  const draftValidation = useMemo(() => validateMarketingDraft(draft), [draft]);

  const testDeliveryBlocked = !(
    capabilities.emailConfigured &&
    capabilities.postalAddressConfigured &&
    capabilities.dedicatedMarketingSenderConfigured
  );
  const blockingConfiguration =
    testDeliveryBlocked ||
    !capabilities.providerResourcesConfigured ||
    !capabilities.webhookConfigured ||
    !capabilities.sendEnabled;
  const expectedCommand =
    preparedCount === null
      ? ""
      : `${sendMode === "schedule" ? "SCHEDULE" : "SEND"} ${preparedCount}`;

  function clearMessages() {
    setNotice(null);
    setError(null);
  }

  function invalidatePreparedAudience() {
    setPreparedCount(null);
    setPreparedFingerprint(null);
  }

  function update<K extends keyof MarketingDraft>(
    key: K,
    value: MarketingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setSubjectAlternatives([]);
  }

  function begin(
    kind: NonNullable<typeof busy>,
    operation: () => Promise<void>,
  ) {
    clearMessages();
    setBusy(kind);
    startTransition(async () => {
      try {
        await operation();
      } catch {
        setError(
          "The request could not be completed. Refresh and try again safely.",
        );
      } finally {
        setBusy(null);
      }
    });
  }

  function useStarter() {
    const next = createStarterDraft(draft.campaignType, selectedProduct);
    setDraft(next);
    setDirty(true);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setSubjectAlternatives([]);
    setNotice("Starter applied. Customize every field before testing.");
    setError(null);
  }

  function generate() {
    begin("generate", async () => {
      const result = await generateCampaignDraft({
        campaignType: draft.campaignType,
        brief,
        offer,
        tone,
        promoCode: draft.promoCode,
        productId: selectedProductId,
        currentDraft: draft,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(result.draft);
      setDirty(true);
      setSubjectAlternatives(result.subjectAlternatives);
      setTested(false);
      setReviewed(false);
      invalidatePreparedAudience();
      setNotice(result.message);
    });
  }

  function save() {
    begin("save", async () => {
      const result = await saveCampaignDraft(campaignId, draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(campaignDraft(result.campaign));
      setTested(
        Boolean(
          result.campaign.testedContentHash &&
            result.campaign.testedContentHash === result.campaign.contentHash,
        ),
      );
      setDirty(false);
      setSaved(true);
      setNotice(result.message);
      router.refresh();
    });
  }

  function sendTest() {
    begin("test", async () => {
      const result = await sendCampaignTest(campaignId, draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(campaignDraft(result.campaign));
      setTested(true);
      setDirty(false);
      setSaved(true);
      setReviewed(false);
      invalidatePreparedAudience();
      setNotice(result.message);
      router.refresh();
    });
  }

  function prepare() {
    if (!tested) {
      setError("Send a test of the current version first.");
      return;
    }
    if (!reviewed) {
      setError("Complete the final review acknowledgement first.");
      return;
    }
    if (sendMode === "schedule" && !scheduledLocal) {
      setError("Choose a date and time for the scheduled send.");
      return;
    }
    begin("prepare", async () => {
      const result = await prepareCampaignAudience(campaignId, draft, reviewed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPreparedCount(result.recipientCount);
      setPreparedFingerprint(result.audienceFingerprint);
      setConfirmation("");
      setConfirmOpen(true);
      setNotice(result.message);
    });
  }

  function launch() {
    if (preparedCount === null || preparedFingerprint === null) return;
    let scheduledAt: string | null = null;
    if (sendMode === "schedule") {
      const parsed = new Date(scheduledLocal);
      if (Number.isNaN(parsed.getTime())) {
        setError("Choose a valid schedule.");
        return;
      }
      scheduledAt = parsed.toISOString();
    }

    begin("launch", async () => {
      const result = await launchCampaign({
        id: campaignId,
        draft,
        expectedRecipientCount: preparedCount,
        expectedAudienceFingerprint: preparedFingerprint,
        scheduledAt,
        confirmation,
      });
      if (!result.ok) {
        setError(result.message);
        if (result.audienceChanged) {
          if (
            typeof result.recipientCount === "number" &&
            result.recipientCount > 0 &&
            result.audienceFingerprint
          ) {
            setPreparedCount(result.recipientCount);
            setPreparedFingerprint(result.audienceFingerprint);
            setConfirmation("");
          } else {
            invalidatePreparedAudience();
            setConfirmOpen(false);
          }
        }
        return;
      }
      setConfirmOpen(false);
      setLocked(true);
      setDirty(false);
      setSaved(true);
      setNotice(result.message);
      router.refresh();
    });
  }

  function newCampaign() {
    if (dirty && !confirm("Discard the unsaved campaign changes?")) return;
    const id = globalThis.crypto.randomUUID();
    setCampaignId(id);
    setDraft(createStarterDraft("announcement"));
    setSelectedProductId(null);
    setBrief("");
    setOffer("");
    setSubjectAlternatives([]);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setConfirmation("");
    setLocked(false);
    setDirty(false);
    setSaved(false);
    clearMessages();
    setTab("compose");
  }

  function editCampaign(campaign: MarketingCampaignView) {
    if (dirty && !confirm("Discard the unsaved campaign changes?")) return;
    setCampaignId(campaign.id);
    setDraft(campaignDraft(campaign));
    setSelectedProductId(null);
    setSubjectAlternatives([]);
    setTested(
      Boolean(
        campaign.testedContentHash &&
          campaign.testedContentHash === campaign.contentHash,
      ),
    );
    setReviewed(false);
    invalidatePreparedAudience();
    setConfirmation("");
    setLocked(false);
    setDirty(false);
    setSaved(true);
    clearMessages();
    setTab("compose");
  }

  function duplicateCampaign(campaign: MarketingCampaignView) {
    if (dirty && !confirm("Discard the unsaved campaign changes?")) return;
    setCampaignId(globalThis.crypto.randomUUID());
    setDraft({
      ...campaignDraft(campaign),
      name: `${campaign.name} copy`.slice(0, MARKETING_LIMITS.name),
    });
    setSelectedProductId(null);
    setSubjectAlternatives([]);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setConfirmation("");
    setLocked(false);
    setDirty(true);
    setSaved(false);
    clearMessages();
    setTab("compose");
  }

  function refreshStatuses() {
    begin("refresh", async () => {
      const result = await refreshCampaignStatuses();
      if (!result.ok) setError(result.message);
      else {
        setNotice(result.message);
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-4 w-4" />
            Human-reviewed lifecycle marketing
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Email Campaigns
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">
            Draft with AI, review the exact email, test it in your inbox, then
            reconcile consent before a guarded send through Resend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            {activeSubscriberCount} active
          </div>
          <button
            type="button"
            onClick={newCampaign}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-foreground transition hover:brightness-95 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        </div>
      </header>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Capability
          ok={capabilities.emailConfigured}
          title="Resend delivery"
          detail={capabilities.emailConfigured ? "Connected" : "API key missing"}
          blocking
        />
        <Capability
          ok={capabilities.postalAddressConfigured}
          title="Compliance footer"
          detail={
            capabilities.postalAddressConfigured
              ? "Postal address configured"
              : "Postal address required"
          }
          blocking
        />
        <Capability
          ok={capabilities.dedicatedMarketingSenderConfigured}
          title="Sender reputation"
          detail={
            capabilities.dedicatedMarketingSenderConfigured
              ? capabilities.sender
              : "Dedicated sender required"
          }
          blocking
        />
        <Capability
          ok={capabilities.providerResourcesConfigured}
          title="Audience resources"
          detail={
            capabilities.providerResourcesConfigured
              ? "Dedicated segment + topic pinned"
              : "Segment/topic IDs required"
          }
          blocking
        />
        <Capability
          ok={capabilities.webhookConfigured}
          title="Consent webhook"
          detail={
            capabilities.webhookConfigured
              ? "Real-time sync ready"
              : "Pre-send sync remains active"
          }
          blocking
        />
        <Capability
          ok={capabilities.sendEnabled}
          title="Production switch"
          detail={
            capabilities.sendEnabled
              ? `Enabled · cap ${capabilities.maxRecipients}`
              : "MARKETING_SEND_ENABLED=false"
          }
          blocking
        />
      </div>

      {blockingConfiguration && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {testDeliveryBlocked
              ? "Drafting and preview remain available. Inbox tests and production sends are disabled until delivery, sender, and footer configuration is complete."
              : "Inbox tests are available. Production sends remain disabled until audience resources, the signed webhook, and the explicit send switch are ready."}
          </p>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Campaign workspace"
        className="mb-6 flex gap-1 rounded-xl border border-border bg-card p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "compose"}
          onClick={() => setTab("compose")}
          disabled={pending}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50",
            tab === "compose"
              ? "bg-primary text-foreground"
              : "text-foreground/60 hover:bg-muted",
          )}
        >
          Compose & review
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
          disabled={pending}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50",
            tab === "history"
              ? "bg-primary text-foreground"
              : "text-foreground/60 hover:bg-muted",
          )}
        >
          Campaign history ({initialCampaigns.length})
        </button>
      </div>

      {(notice || error) && (
        <div
          role="status"
          className={cn(
            "mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            error
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {error ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{error ?? notice}</span>
          <button
            type="button"
            onClick={clearMessages}
            aria-label="Dismiss message"
            className="rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {tab === "compose" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  Step 1
                </p>
                <h2 className="mt-1 text-xl font-black">Build the brief</h2>
                <p className="mt-1 text-sm text-foreground/55">
                  Give AI verified facts only. It cannot send or publish anything.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                AI-assisted
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5 text-sm font-bold">
                Campaign type
                <select
                  value={draft.campaignType}
                  onChange={(event) =>
                    update("campaignType", event.target.value as CampaignType)
                  }
                  disabled={locked || pending}
                  className={inputClass}
                >
                  {CAMPAIGN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-bold">
                Featured product
                <select
                  value={selectedProductId ?? ""}
                  onChange={(event) =>
                    setSelectedProductId(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  disabled={locked || pending}
                  className={inputClass}
                >
                  <option value="">No single product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-bold">
                Tone
                <select
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value as typeof tone)
                  }
                  disabled={locked || pending}
                  className={inputClass}
                >
                  {TONES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-bold">
                Verified offer
                <input
                  value={offer}
                  onChange={(event) => setOffer(event.target.value)}
                  maxLength={500}
                  disabled={locked || pending}
                  placeholder="e.g. 15% off through Friday"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1.5 text-sm font-bold">
              Goal and key facts
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                maxLength={MARKETING_LIMITS.brief}
                rows={3}
                disabled={locked || pending}
                placeholder="What happened, why subscribers should care, and anything the copy must or must not say."
                className={inputClass}
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={useStarter}
                disabled={locked || pending}
                className="rounded-full border border-border px-4 py-2 text-sm font-bold transition hover:border-primary hover:text-primary disabled:opacity-50"
              >
                Use professional starter
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={
                  locked ||
                  pending ||
                  !capabilities.aiConfigured
                }
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-50"
              >
                {busy === "generate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate AI draft
              </button>
              {!capabilities.aiConfigured && (
                <span className="self-center text-xs text-amber-700">
                  OPENAI_API_KEY is not configured.
                </span>
              )}
            </div>
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)]">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">
                    Step 2
                  </p>
                  <h2 className="mt-1 text-xl font-black">Edit the message</h2>
                  <p className="mt-1 text-sm text-foreground/55">
                    Plain structured fields keep AI-generated code out of the email.
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                    dirty
                      ? "bg-amber-100 text-amber-800"
                      : saved
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600",
                  )}
                >
                  {dirty ? "Unsaved changes" : saved ? "Saved" : "Not saved"}
                </span>
              </div>

              <div className="space-y-4">
                <Field
                  label="Internal campaign name"
                  value={draft.name}
                  max={MARKETING_LIMITS.name}
                  disabled={locked || pending}
                  onChange={(value) => update("name", value)}
                />
                <Field
                  label="Subject line"
                  value={draft.subject}
                  max={MARKETING_LIMITS.subject}
                  disabled={locked || pending}
                  onChange={(value) => update("subject", value)}
                />
                {subjectAlternatives.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground/45">
                      AI alternatives
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {subjectAlternatives.map((subject) => (
                        <button
                          type="button"
                          key={subject}
                          onClick={() => update("subject", subject)}
                          disabled={locked || pending}
                          className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-left text-xs font-semibold hover:border-primary disabled:opacity-50"
                        >
                          {subject}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Field
                  label="Inbox preview text"
                  value={draft.previewText}
                  max={MARKETING_LIMITS.previewText}
                  disabled={locked || pending}
                  onChange={(value) => update("previewText", value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Eyebrow"
                    value={draft.eyebrow}
                    max={MARKETING_LIMITS.eyebrow}
                    disabled={locked || pending}
                    onChange={(value) => update("eyebrow", value)}
                  />
                  <Field
                    label="Promo code (optional)"
                    value={draft.promoCode}
                    max={MARKETING_LIMITS.promoCode}
                    disabled={locked || pending}
                    onChange={(value) => update("promoCode", value)}
                  />
                </div>
                <Field
                  label="Headline"
                  value={draft.heading}
                  max={MARKETING_LIMITS.heading}
                  disabled={locked || pending}
                  onChange={(value) => update("heading", value)}
                />
                <label className="block space-y-1.5 text-sm font-bold">
                  Body copy
                  <textarea
                    value={draft.body}
                    onChange={(event) => update("body", event.target.value)}
                    maxLength={MARKETING_LIMITS.body}
                    rows={8}
                    disabled={locked || pending}
                    className={inputClass}
                  />
                  <span className="block text-right text-[11px] font-medium text-foreground/40">
                    {draft.body.length}/{MARKETING_LIMITS.body}
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Button label"
                    value={draft.ctaLabel}
                    max={MARKETING_LIMITS.ctaLabel}
                    disabled={locked || pending}
                    onChange={(value) => update("ctaLabel", value)}
                  />
                  <Field
                    label="Button URL"
                    value={draft.ctaUrl}
                    max={MARKETING_LIMITS.url}
                    type="url"
                    disabled={locked || pending}
                    onChange={(value) => update("ctaUrl", value)}
                  />
                </div>
                <p className="-mt-2 text-xs text-foreground/45">
                  HTTPS links on y2kase.com only. UTM source, medium, and campaign
                  parameters are added automatically.
                </p>
                <Field
                  label="Hero image URL (optional)"
                  value={draft.heroImageUrl}
                  max={MARKETING_LIMITS.url}
                  type="url"
                  disabled={locked || pending}
                  onChange={(value) => update("heroImageUrl", value)}
                />
                {draft.heroImageUrl && (
                  <Field
                    label="Hero image alt text"
                    value={draft.heroImageAlt}
                    max={MARKETING_LIMITS.imageAlt}
                    disabled={locked || pending}
                    onChange={(value) => update("heroImageAlt", value)}
                  />
                )}
              </div>
            </section>

            <section className="xl:sticky xl:top-6">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    <span className="text-sm font-black">Live email preview</span>
                  </div>
                  <div className="flex rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setPreviewMode("desktop")}
                      aria-label="Desktop preview"
                      aria-pressed={previewMode === "desktop"}
                      className={cn(
                        "rounded-md p-1.5",
                        previewMode === "desktop"
                          ? "bg-card text-primary shadow-sm"
                          : "text-foreground/45",
                      )}
                    >
                      <Monitor className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode("mobile")}
                      aria-label="Mobile preview"
                      aria-pressed={previewMode === "mobile"}
                      className={cn(
                        "rounded-md p-1.5",
                        previewMode === "mobile"
                          ? "bg-card text-primary shadow-sm"
                          : "text-foreground/45",
                      )}
                    >
                      <Smartphone className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-100 p-3 sm:p-5">
                  <iframe
                    title="Marketing email preview"
                    sandbox=""
                    srcDoc={preview}
                    className={cn(
                      "mx-auto block h-[720px] w-full border-0 bg-white shadow-lg transition-all",
                      previewMode === "mobile" ? "max-w-[390px]" : "max-w-[760px]",
                    )}
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Step 3
              </p>
              <h2 className="mt-1 text-xl font-black">Test, review, launch</h2>
              <p className="mt-1 text-sm text-foreground/55">
                Sending is deliberately multi-step and retry-safe.
              </p>
            </div>

            {!draftValidation.ok ? (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"
              >
                <div className="flex items-center gap-2 text-sm font-black">
                  <AlertTriangle className="h-4 w-4" />
                  Complete the required campaign fields
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                  {draftValidation.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : preflightWarnings.length > 0 ? (
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-center gap-2 text-sm font-black">
                  <AlertTriangle className="h-4 w-4" />
                  {preflightWarnings.length} preflight suggestion
                  {preflightWarnings.length === 1 ? "" : "s"}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                  {preflightWarnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Copy and links pass automated preflight checks.
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <ReviewCard
                number="1"
                title="Save the draft"
                detail="Creates a durable audit record without contacting subscribers."
              >
                <button
                  type="button"
                  onClick={save}
                  disabled={locked || pending || !draftValidation.ok}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {busy === "save" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save draft
                </button>
              </ReviewCard>

              <ReviewCard
                number="2"
                title="Send a real test"
                detail={`Delivers the exact design to ${capabilities.adminEmail}. Any edit after testing requires another test.`}
              >
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={
                    locked ||
                    pending ||
                    testDeliveryBlocked ||
                    !draftValidation.ok
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "test" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send test
                </button>
                {tested && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Current version tested
                  </span>
                )}
              </ReviewCard>

              <ReviewCard
                number="3"
                title="Confirm the audience"
                detail="Resend opt-outs win, unknown contacts are excluded, and any membership change stops the launch."
              >
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    aria-pressed={sendMode === "now"}
                    onClick={() => {
                      setSendMode("now");
                      setReviewed(false);
                      invalidatePreparedAudience();
                    }}
                    disabled={pending}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50",
                      sendMode === "now"
                        ? "bg-primary text-foreground"
                        : "bg-muted text-foreground/60",
                    )}
                  >
                    Send now
                  </button>
                  <button
                    type="button"
                    aria-pressed={sendMode === "schedule"}
                    onClick={() => {
                      setSendMode("schedule");
                      if (!scheduledLocal) {
                        setScheduledLocal(defaultScheduleValue());
                      }
                      setReviewed(false);
                      invalidatePreparedAudience();
                    }}
                    disabled={pending || !MARKETING_SCHEDULING_ENABLED}
                    title={
                      MARKETING_SCHEDULING_ENABLED
                        ? undefined
                        : "Available after durable suppression retries are implemented"
                    }
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40",
                      sendMode === "schedule"
                        ? "bg-primary text-foreground"
                        : "bg-muted text-foreground/60",
                    )}
                  >
                    Schedule
                  </button>
                </div>
                {!MARKETING_SCHEDULING_ENABLED && (
                  <p className="mb-3 text-xs leading-5 text-amber-700">
                    Scheduling stays disabled until opt-out retries are backed by
                    a durable worker. Immediate sends remain protected by a final
                    consent reconciliation.
                  </p>
                )}
                {sendMode === "schedule" && (
                  <label className="mb-3 block text-xs font-bold">
                    Date and time in this device&apos;s timezone
                    <input
                      type="datetime-local"
                      value={scheduledLocal}
                      disabled={pending}
                      onChange={(event) => {
                        setScheduledLocal(event.target.value);
                        setReviewed(false);
                        invalidatePreparedAudience();
                      }}
                      className={cn(inputClass, "mt-1")}
                    />
                    <span className="mt-1 block font-medium text-foreground/45">
                      Stored and scheduled in UTC after confirmation.
                    </span>
                  </label>
                )}
                <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs leading-5">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={pending}
                    onChange={(event) => {
                      setReviewed(event.target.checked);
                      invalidatePreparedAudience();
                    }}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    I reviewed the subject, offer, dates, links, image alt text,
                    mobile preview, and test inbox rendering.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={prepare}
                  disabled={
                    locked ||
                    pending ||
                    blockingConfiguration ||
                    !tested ||
                    !reviewed
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-foreground hover:brightness-95 disabled:opacity-50"
                >
                  {busy === "prepare" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Review audience & {sendMode === "schedule" ? "schedule" : "send"}
                </button>
              </ReviewCard>
            </div>
          </section>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black">Campaign history</h2>
              <p className="text-sm text-foreground/50">
                Local review records linked to their Resend broadcasts.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshStatuses}
              disabled={pending || !capabilities.emailConfigured}
              className="inline-flex items-center gap-2 self-start rounded-full border border-border px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  busy === "refresh" && "animate-spin",
                )}
              />
              Refresh statuses
            </button>
          </div>
          {initialCampaigns.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Mail className="mx-auto h-9 w-9 text-foreground/20" />
              <p className="mt-3 font-bold">No campaigns yet</p>
              <p className="mt-1 text-sm text-foreground/50">
                Your first saved draft will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-foreground/45">
                  <tr>
                    <th className="px-5 py-3 font-bold">Campaign</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Audience</th>
                    <th className="px-4 py-3 font-bold">Tested</th>
                    <th className="px-4 py-3 font-bold">Send time</th>
                    <th className="px-5 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {initialCampaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-muted/25">
                      <td className="max-w-[330px] px-5 py-4">
                        <p className="truncate font-black">{campaign.name}</p>
                        <p className="mt-0.5 truncate text-xs text-foreground/50">
                          {campaign.subject}
                        </p>
                        {campaign.lastError && (
                          <p className="mt-1 line-clamp-2 text-xs text-rose-600">
                            {campaign.lastError}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-bold capitalize",
                            STATUS_STYLE[campaign.status],
                          )}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {campaign.recipientCount ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-xs text-foreground/60">
                        {displayDate(campaign.lastTestSentAt)}
                      </td>
                      <td className="px-4 py-4 text-xs text-foreground/60">
                        {displayDate(
                          campaign.sentAt ??
                            campaign.scheduledAt ??
                            campaign.launchedAt,
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => duplicateCampaign(campaign)}
                            disabled={pending}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50"
                          >
                            Duplicate
                          </button>
                          {(campaign.status === "draft" ||
                            campaign.status === "failed" ||
                            isRecoverablePreparingCampaign(campaign)) && (
                            <button
                              type="button"
                              onClick={() => editCampaign(campaign)}
                              disabled={pending}
                              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50"
                            >
                              {campaign.status === "preparing"
                                ? "Recover"
                                : "Edit"}
                            </button>
                          )}
                          {campaign.resendBroadcastId && (
                            <a
                              href={`https://resend.com/broadcasts/${campaign.resendBroadcastId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary"
                            >
                              Resend
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {confirmOpen && preparedCount !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-confirm-title"
        >
          <div
            ref={confirmDialogRef}
            tabIndex={-1}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  {sendMode === "schedule" ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </div>
                <h2 id="campaign-confirm-title" className="text-xl font-black">
                  Final production confirmation
                </h2>
              </div>
              <button
                type="button"
                onClick={dismissConfirmation}
                aria-label="Close confirmation"
                className="rounded-lg p-1 text-foreground/40 hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-foreground/55">Eligible recipients</span>
                <strong>{preparedCount}</strong>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-foreground/55">Delivery</span>
                <strong>
                  {sendMode === "schedule"
                    ? displayDate(
                        scheduledLocal
                          ? new Date(scheduledLocal).toISOString()
                          : null,
                      )
                    : "Immediately"}
                </strong>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-foreground/55">Subject</span>
                <strong className="max-w-[260px] truncate">{draft.subject}</strong>
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <label className="mt-5 block text-sm font-bold">
              Type{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-primary">
                {expectedCommand}
              </code>{" "}
              to continue
              <input
                autoFocus
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={cn(inputClass, "mt-2 font-mono")}
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-foreground/50">
              The server reconciles consent once more. Any membership change
              stops the launch; the approved audience is then frozen for this
              campaign so later signups are not added to a scheduled send.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismissConfirmation}
                disabled={busy === "launch"}
                className="rounded-full border border-border px-4 py-2 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={launch}
                disabled={busy === "launch" || confirmation !== expectedCommand}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === "launch" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : sendMode === "schedule" ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sendMode === "schedule" ? "Schedule campaign" : "Send campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Capability({
  ok,
  title,
  detail,
  blocking = false,
}: {
  ok: boolean;
  title: string;
  detail: string;
  blocking?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle
            className={cn(
              "h-4 w-4",
              blocking ? "text-rose-600" : "text-amber-600",
            )}
          />
        )}
        <p className="text-xs font-bold uppercase tracking-wide text-foreground/45">
          {title}
        </p>
      </div>
      <p className="mt-2 truncate text-sm font-black" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  max,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: "text" | "url";
}) {
  return (
    <label className="block space-y-1.5 text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={max}
        disabled={disabled}
        className={inputClass}
      />
      <span className="block text-right text-[11px] font-medium text-foreground/40">
        {value.length}/{max}
      </span>
    </label>
  );
}

function ReviewCard({
  number,
  title,
  detail,
  children,
}: {
  number: string;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
          {number}
        </span>
        <h3 className="font-black">{title}</h3>
      </div>
      <p className="mb-4 min-h-10 text-xs leading-5 text-foreground/50">{detail}</p>
      {children}
    </div>
  );
}

