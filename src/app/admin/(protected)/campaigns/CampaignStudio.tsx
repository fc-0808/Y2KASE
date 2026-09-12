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
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  ImagePlus,
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
  Bold,
  Trash2,
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
  marketingSendBlockers,
  renderMarketingEmail,
  validateMarketingDraft,
} from "@/lib/marketing/template";
import { normalizeEmphasisMarkup } from "@/lib/marketing/emphasis";
import { BUNDLE_MARKETING } from "@/lib/marketing/offer";
import {
  MARKETING_HERO_REFERENCE_LIMIT,
  MARKETING_HERO_STYLES,
  isLegacyGenerativeMarketingHeroUrl,
  recommendedMarketingHeroReferenceCount,
  selectMarketingHeroReferenceIds,
  type MarketingHeroStyle,
} from "@/lib/marketing/hero";
import {
  isDeletableMarketingCampaign,
  isEditableMarketingCampaign,
  isRecoverablePreparingCampaign,
} from "@/lib/marketing/campaign-status";
import {
  CAMPAIGN_TYPES,
  EMAIL_STUDIO_VIEWS,
  MARKETING_LIMITS,
  MARKETING_SCHEDULING_ENABLED,
  emailStudioHref,
  type CampaignType,
  type EmailStudioView,
  type MarketingCampaignStatus,
  type MarketingCampaignView,
  type MarketingCapabilities,
  type MarketingDraft,
  type MarketingProductOption,
} from "@/lib/marketing/types";
import {
  evaluateBroadcastCadence,
  type CadenceSnapshot,
} from "@/lib/marketing/cadence";
import { CadenceStatusCard } from "./CadenceStatusCard";
import { ClubCadencePanel } from "./ClubCadencePanel";
import {
  deleteCampaignDraft,
  generateCampaignDraft,
  generateCampaignHero,
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
  cadence,
  initialView,
}: {
  initialCampaignId: string;
  initialCampaigns: MarketingCampaignView[];
  activeSubscriberCount: number;
  products: MarketingProductOption[];
  capabilities: MarketingCapabilities;
  cadence: CadenceSnapshot;
  initialView: EmailStudioView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<EmailStudioView>(initialView);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [draft, setDraft] = useState<MarketingDraft>(() =>
    createStarterDraft("announcement"),
  );
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [offer, setOffer] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>("playful");
  const [heroStyle, setHeroStyle] =
    useState<MarketingHeroStyle>("pastel-flatlay");
  const [heroReferenceIds, setHeroReferenceIds] = useState<number[]>([]);
  const [heroReferenceCandidate, setHeroReferenceCandidate] = useState("");
  const [subjectAlternatives, setSubjectAlternatives] = useState<string[]>([]);
  const [busy, setBusy] = useState<
    | "generate"
    | "hero"
    | "save"
    | "test"
    | "prepare"
    | "launch"
    | "refresh"
    | "delete"
    | null
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
  const [deleteTarget, setDeleteTarget] =
    useState<MarketingCampaignView | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const headingInputRef = useRef<HTMLInputElement>(null);
  const dismissConfirmation = useCallback(() => {
    if (busy !== "launch") setConfirmOpen(false);
  }, [busy]);
  const dismissDelete = useCallback(() => {
    if (busy !== "delete") setDeleteTarget(null);
  }, [busy]);

  const selectTab = useCallback((next: EmailStudioView) => {
    setTab(next);
    // Native replaceState, not router.replace: query changes must not re-run
    // the server page (new campaign UUID, refetch, possible remount) and wipe
    // an unsaved draft.
    window.history.replaceState(
      window.history.state,
      "",
      emailStudioHref(next),
    );
  }, []);

  useBodyScrollLock(confirmOpen || Boolean(deleteTarget));
  useModalFocusTrap(confirmDialogRef, confirmOpen, dismissConfirmation);
  useModalFocusTrap(
    deleteDialogRef,
    Boolean(deleteTarget),
    dismissDelete,
  );
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
  const heroReferenceProducts = heroReferenceIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is MarketingProductOption => Boolean(product));
  const availableHeroProducts = products.filter(
    (product) =>
      Boolean(product.imageUrl) && !heroReferenceIds.includes(product.id),
  );
  const recommendedHeroReferenceCount =
    recommendedMarketingHeroReferenceCount({
      campaignType: draft.campaignType,
      campaignText: [
        offer,
        draft.name,
        draft.subject,
        draft.previewText,
        draft.eyebrow,
        draft.heading,
        draft.body,
      ].join(" "),
    });
  const smartHeroReferenceIds = selectMarketingHeroReferenceIds({
    campaignId,
    products,
    targetCount: recommendedHeroReferenceCount,
    featuredProductId: selectedProductId,
  });
  const legacyGenerativeHero = isLegacyGenerativeMarketingHeroUrl(
    draft.heroImageUrl,
  );
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
  const sendBlockers = useMemo(() => marketingSendBlockers(draft), [draft]);
  const draftValidation = useMemo(() => validateMarketingDraft(draft), [draft]);
  const cadenceVerdict = useMemo(
    () =>
      evaluateBroadcastCadence({
        now: new Date(),
        campaignType: draft.campaignType,
        broadcasts: cadence.broadcastsThisWeek,
        ignoreCampaignId: campaignId,
      }),
    [cadence.broadcastsThisWeek, campaignId, draft.campaignType],
  );
  const cadenceBlocked = !cadenceVerdict.allowed;

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

  function wrapEmphasisInField(
    key: "heading" | "body",
    element: HTMLInputElement | HTMLTextAreaElement | null,
  ) {
    if (!element || locked || pending) return;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const value = element.value;
    if (start === end) {
      setError("Select a phrase first, then emphasise it.");
      return;
    }
    const selected = value.slice(start, end);
    if (!selected.trim() || selected.includes("\n") || selected.includes("*")) {
      setError("Select a single-line phrase without * characters to emphasise.");
      return;
    }
    const next = normalizeEmphasisMarkup(
      `${value.slice(0, start)}**${selected.trim()}**${value.slice(end)}`,
    );
    if (next.length > MARKETING_LIMITS[key]) {
      setError(
        `${key === "heading" ? "Heading" : "Body"} is too long after emphasis.`,
      );
      return;
    }
    clearMessages();
    update(key, next);
    requestAnimationFrame(() => {
      element.focus();
      const cursor = start + selected.trim().length + 4;
      element.setSelectionRange(cursor, cursor);
    });
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
    const preserveHero = !isLegacyGenerativeMarketingHeroUrl(
      draft.heroImageUrl,
    );
    setDraft({
      ...next,
      heroImageUrl: preserveHero ? draft.heroImageUrl : "",
      heroImageAlt: preserveHero ? draft.heroImageAlt : "",
    });
    setDirty(true);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setSubjectAlternatives([]);
    setNotice("Starter applied. Customize every field before testing.");
    setError(null);
  }

  function useLiveBundleCampaign() {
    const starter = createStarterDraft("promotion");
    setDraft((current) => ({
      ...starter,
      heroImageUrl: isLegacyGenerativeMarketingHeroUrl(current.heroImageUrl)
        ? ""
        : current.heroImageUrl,
      heroImageAlt: isLegacyGenerativeMarketingHeroUrl(current.heroImageUrl)
        ? ""
        : current.heroImageAlt,
    }));
    setSelectedProductId(null);
    setOffer(
      `${BUNDLE_MARKETING.name}: add any 4 ${BUNDLE_MARKETING.eligibleProductCopy}; the 2 lowest-priced items are free automatically; no code; coupons do not stack.`,
    );
    setBrief(
      "Explain the bundle clearly, emphasize mix-and-match freedom, and send subscribers to the full collection. Do not invent a deadline, exclusivity, or stock urgency.",
    );
    setTone("playful");
    setDirty(true);
    setSaved(false);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setSubjectAlternatives([]);
    setNotice(
      "Loaded the live checkout bundle facts and conversion-focused starter.",
    );
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

  function addHeroReference(productId?: number) {
    const id = productId ?? Number(heroReferenceCandidate);
    if (!Number.isInteger(id) || id <= 0) return;
    if (heroReferenceIds.includes(id)) return;
    if (heroReferenceIds.length >= MARKETING_HERO_REFERENCE_LIMIT) {
      setError(
        `Use at most ${MARKETING_HERO_REFERENCE_LIMIT} products so the composition stays clear.`,
      );
      return;
    }
    const product = products.find((item) => item.id === id);
    if (!product?.imageUrl) {
      setError("That product has no usable primary image.");
      return;
    }
    clearMessages();
    setHeroReferenceIds((current) => [...current, id]);
    setHeroReferenceCandidate("");
  }

  function removeHeroReference(id: number) {
    setHeroReferenceIds((current) =>
      current.filter((productId) => productId !== id),
    );
  }

  function smartSelectHeroReferences() {
    if (smartHeroReferenceIds.length === 0) {
      setError("No active catalogue products with usable images were found.");
      return;
    }
    clearMessages();
    setHeroReferenceIds(smartHeroReferenceIds);
    setHeroReferenceCandidate("");
    setNotice(
      recommendedHeroReferenceCount === 4
        ? "Selected four real products to visually support the Buy 2, Get 2 Free offer. Review the choices before generating."
        : `Selected ${smartHeroReferenceIds.length} relevant product reference${smartHeroReferenceIds.length === 1 ? "" : "s"}. Review before generating.`,
    );
  }

  function generateHeroImage() {
    const referenceProductIds =
      heroReferenceIds.length > 0
        ? heroReferenceIds
        : smartHeroReferenceIds;
    if (referenceProductIds.length === 0) {
      setError("No active catalogue products with usable images were found.");
      return;
    }
    if (heroReferenceIds.length === 0) {
      setHeroReferenceIds(referenceProductIds);
    }
    begin("hero", async () => {
      const result = await generateCampaignHero({
        campaignId,
        currentDraft: draft,
        style: heroStyle,
        referenceProductIds,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft((current) => ({
        ...current,
        heroImageUrl: result.imageUrl,
        heroImageAlt: result.imageAlt,
      }));
      setDirty(true);
      setSaved(false);
      setTested(false);
      setReviewed(false);
      invalidatePreparedAudience();
      setSubjectAlternatives([]);
      setNotice(result.message);
    });
  }

  function clearHeroImage() {
    setDraft((current) => ({
      ...current,
      heroImageUrl: "",
      heroImageAlt: "",
    }));
    setDirty(true);
    setSaved(false);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setSubjectAlternatives([]);
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
    if (sendBlockers.length > 0) {
      setError(sendBlockers[0]!.message);
      return;
    }
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
    setHeroStyle("pastel-flatlay");
    setHeroReferenceIds([]);
    setHeroReferenceCandidate("");
    setSubjectAlternatives([]);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setConfirmation("");
    setLocked(false);
    setDirty(false);
    setSaved(false);
    clearMessages();
    selectTab("compose");
  }

  function editCampaign(campaign: MarketingCampaignView) {
    if (dirty && !confirm("Discard the unsaved campaign changes?")) return;
    setCampaignId(campaign.id);
    setDraft(campaignDraft(campaign));
    setSelectedProductId(null);
    setBrief("");
    setOffer("");
    setHeroStyle("pastel-flatlay");
    setHeroReferenceIds([]);
    setHeroReferenceCandidate("");
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
    setLocked(!isEditableMarketingCampaign(campaign));
    setDirty(false);
    setSaved(true);
    clearMessages();
    selectTab("compose");
  }

  function duplicateCampaign(campaign: MarketingCampaignView) {
    if (dirty && !confirm("Discard the unsaved campaign changes?")) return;
    setCampaignId(globalThis.crypto.randomUUID());
    setDraft({
      ...campaignDraft(campaign),
      name: `${campaign.name} copy`.slice(0, MARKETING_LIMITS.name),
    });
    setSelectedProductId(null);
    setBrief("");
    setOffer("");
    setHeroStyle("pastel-flatlay");
    setHeroReferenceIds([]);
    setHeroReferenceCandidate("");
    setSubjectAlternatives([]);
    setTested(false);
    setReviewed(false);
    invalidatePreparedAudience();
    setConfirmation("");
    setLocked(false);
    setDirty(true);
    setSaved(false);
    clearMessages();
    selectTab("compose");
  }

  function requestCampaignDelete(campaign: MarketingCampaignView) {
    clearMessages();
    setDeleteTarget(campaign);
  }

  function deleteCampaign() {
    const target = deleteTarget;
    if (!target) return;
    begin("delete", async () => {
      const result = await deleteCampaignDraft({
        id: target.id,
        expectedContentHash: target.contentHash,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeleteTarget(null);
      if (target.id === campaignId) {
        setCampaignId(globalThis.crypto.randomUUID());
        setDraft(createStarterDraft("announcement"));
        setSelectedProductId(null);
        setBrief("");
        setOffer("");
        setHeroStyle("pastel-flatlay");
        setHeroReferenceIds([]);
        setHeroReferenceCandidate("");
        setSubjectAlternatives([]);
        setTested(false);
        setReviewed(false);
        invalidatePreparedAudience();
        setConfirmation("");
        setLocked(false);
        setDirty(false);
        setSaved(false);
      }
      setNotice(result.message);
      router.refresh();
    });
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
            Email
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/60">
            Draft Club broadcasts, see this week&apos;s send slots, and review
            what already went out — one workspace, one frequency policy.
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

      {tab !== "cadence" && (
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
      )}

      {tab === "compose" && (
        <CadenceStatusCard
          cadence={cadence}
          campaignType={draft.campaignType}
          campaignId={campaignId}
          onOpenCalendar={() => selectTab("cadence")}
        />
      )}

      {tab !== "cadence" && blockingConfiguration && (
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
        aria-label="Email workspace"
        className="mb-6 flex gap-1 rounded-xl border border-border bg-card p-1"
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          event.preventDefault();
          const index = EMAIL_STUDIO_VIEWS.indexOf(tab);
          const next =
            event.key === "ArrowRight"
              ? EMAIL_STUDIO_VIEWS[(index + 1) % EMAIL_STUDIO_VIEWS.length]
              : EMAIL_STUDIO_VIEWS[
                  (index - 1 + EMAIL_STUDIO_VIEWS.length) %
                    EMAIL_STUDIO_VIEWS.length
                ];
          selectTab(next);
          document.getElementById(`email-tab-${next}`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          id="email-tab-compose"
          aria-controls="email-studio-panel"
          aria-selected={tab === "compose"}
          tabIndex={tab === "compose" ? 0 : -1}
          onClick={() => selectTab("compose")}
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
          id="email-tab-cadence"
          aria-controls="email-studio-panel"
          aria-selected={tab === "cadence"}
          tabIndex={tab === "cadence" ? 0 : -1}
          onClick={() => selectTab("cadence")}
          disabled={pending}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50",
            tab === "cadence"
              ? "bg-primary text-foreground"
              : "text-foreground/60 hover:bg-muted",
          )}
        >
          <CalendarDays className="h-4 w-4" />
          Cadence
        </button>
        <button
          type="button"
          role="tab"
          id="email-tab-history"
          aria-controls="email-studio-panel"
          aria-selected={tab === "history"}
          tabIndex={tab === "history" ? 0 : -1}
          onClick={() => selectTab("history")}
          disabled={pending}
          className={cn(
            "flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-50",
            tab === "history"
              ? "bg-primary text-foreground"
              : "text-foreground/60 hover:bg-muted",
          )}
        >
          History ({initialCampaigns.length})
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

      <div
        role="tabpanel"
        id="email-studio-panel"
        aria-labelledby={`email-tab-${tab}`}
      >
      {tab === "cadence" ? (
        <ClubCadencePanel
          snapshot={cadence}
          onCompose={() => selectTab("compose")}
        />
      ) : tab === "compose" ? (
        <div className="space-y-6">
          {locked && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                This is a read-only delivery record. Its tested content and
                provider audit trail are preserved; use <strong>Duplicate</strong>{" "}
                in Campaign history to create an editable copy.
              </p>
            </div>
          )}
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
                  placeholder="Only verified mechanics, code, and real deadline"
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
                onClick={useLiveBundleCampaign}
                disabled={locked || pending}
                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Load live Buy 2 Get 2 campaign
              </button>
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
                    Structured fields only — wrap key offers in{" "}
                    <code className="rounded bg-foreground/5 px-1 py-0.5 text-[11px]">
                      **Buy 2, Get 2 Free**
                    </code>{" "}
                    for pink emphasis. HTML is never accepted.
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
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold" htmlFor="campaign-heading">
                      Headline
                    </label>
                    <button
                      type="button"
                      disabled={locked || pending}
                      onClick={() =>
                        wrapEmphasisInField("heading", headingInputRef.current)
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground/70 transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                    >
                      <Bold className="h-3 w-3" />
                      Emphasise selection
                    </button>
                  </div>
                  <input
                    id="campaign-heading"
                    ref={headingInputRef}
                    value={draft.heading}
                    maxLength={MARKETING_LIMITS.heading}
                    disabled={locked || pending}
                    onChange={(event) => update("heading", event.target.value)}
                    className={inputClass}
                  />
                  <span className="block text-right text-[11px] font-medium text-foreground/40">
                    {draft.heading.length}/{MARKETING_LIMITS.heading}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold" htmlFor="campaign-body">
                      Body copy
                    </label>
                    <button
                      type="button"
                      disabled={locked || pending}
                      onClick={() =>
                        wrapEmphasisInField("body", bodyTextareaRef.current)
                      }
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground/70 transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                    >
                      <Bold className="h-3 w-3" />
                      Emphasise selection
                    </button>
                  </div>
                  <textarea
                    id="campaign-body"
                    ref={bodyTextareaRef}
                    value={draft.body}
                    onChange={(event) => update("body", event.target.value)}
                    maxLength={MARKETING_LIMITS.body}
                    rows={8}
                    disabled={locked || pending}
                    className={inputClass}
                    placeholder={
                      "Add 4 cases and **Buy 2, Get 2 Free** applies automatically…\n\nSecond paragraph…"
                    }
                  />
                  <div className="flex items-start justify-between gap-3 text-[11px] font-medium text-foreground/45">
                    <p>
                      Use **phrase** once for the offer name. Preview updates live on
                      the right.
                    </p>
                    <span className="shrink-0 text-foreground/40">
                      {draft.body.length}/{MARKETING_LIMITS.body}
                    </span>
                  </div>
                </div>
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
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.035] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <ImagePlus className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black">
                          Product-safe campaign hero
                        </h3>
                        <p className="mt-0.5 max-w-xl text-xs leading-5 text-foreground/55">
                          Arranges the exact product images shown on your
                          website. No generative model receives or repaints the
                          products.
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                        capabilities.heroImageGenerationConfigured
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {capabilities.heroImageGenerationConfigured
                        ? "Pixel-safe"
                        : "Storage unavailable"}
                    </span>
                  </div>

                  <div className="mt-4 max-w-md">
                    <label className="space-y-1.5 text-sm font-bold">
                      Background style
                      <select
                        value={heroStyle}
                        onChange={(event) =>
                          setHeroStyle(event.target.value as MarketingHeroStyle)
                        }
                        disabled={locked || pending}
                        className={inputClass}
                      >
                        {MARKETING_HERO_STYLES.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                      <span className="block text-[11px] font-medium leading-4 text-foreground/45">
                        {
                          MARKETING_HERO_STYLES.find(
                            (style) => style.id === heroStyle,
                          )?.description
                        }
                      </span>
                    </label>
                  </div>

                  <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        className="text-sm font-bold"
                        htmlFor="campaign-hero-reference"
                      >
                        Real product references
                      </label>
                      <span className="text-[11px] font-medium text-foreground/45">
                        {heroReferenceIds.length}/
                        {MARKETING_HERO_REFERENCE_LIMIT} selected
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-background px-3 py-2.5 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-foreground/60">
                        <strong className="text-foreground">
                          Smart recommendation:{" "}
                          {recommendedHeroReferenceCount}
                        </strong>{" "}
                        real product
                        {recommendedHeroReferenceCount === 1 ? "" : "s"}
                        {recommendedHeroReferenceCount === 4
                          ? " — the campaign copy identifies a Buy 2, Get 2 Free bundle."
                          : " based on this campaign type and copy."}
                      </p>
                      <button
                        type="button"
                        onClick={smartSelectHeroReferences}
                        disabled={
                          locked ||
                          pending ||
                          smartHeroReferenceIds.length === 0
                        }
                        className="shrink-0 rounded-full border border-primary/25 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/5 disabled:opacity-50"
                      >
                        Auto-select {smartHeroReferenceIds.length || "products"}
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                      <select
                        id="campaign-hero-reference"
                        value={heroReferenceCandidate}
                        onChange={(event) =>
                          setHeroReferenceCandidate(event.target.value)
                        }
                        disabled={
                          locked ||
                          pending ||
                          heroReferenceIds.length >=
                            MARKETING_HERO_REFERENCE_LIMIT
                        }
                        className={cn(inputClass, "min-w-0 flex-1")}
                      >
                        <option value="">Choose a product with a photo…</option>
                        {availableHeroProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addHeroReference()}
                        disabled={
                          locked ||
                          pending ||
                          !heroReferenceCandidate ||
                          heroReferenceIds.length >=
                            MARKETING_HERO_REFERENCE_LIMIT
                        }
                        className="shrink-0 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold transition hover:border-primary disabled:opacity-50"
                      >
                        Add reference
                      </button>
                      {selectedProduct?.imageUrl &&
                        !heroReferenceIds.includes(selectedProduct.id) && (
                          <button
                            type="button"
                            onClick={() => addHeroReference(selectedProduct.id)}
                            disabled={
                              locked ||
                              pending ||
                              heroReferenceIds.length >=
                                MARKETING_HERO_REFERENCE_LIMIT
                            }
                            className="shrink-0 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold transition hover:border-primary disabled:opacity-50"
                          >
                            Use featured
                          </button>
                        )}
                    </div>
                    {heroReferenceProducts.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {heroReferenceProducts.map((product) => (
                          <span
                            key={product.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-border"
                          >
                            <span className="truncate">{product.title}</span>
                            <button
                              type="button"
                              onClick={() => removeHeroReference(product.id)}
                              disabled={locked || pending}
                              aria-label={`Remove ${product.title}`}
                              className="shrink-0 rounded-full p-0.5 text-foreground/45 hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        The builder uses the smart recommendation above
                        automatically, or choose 1–4 products yourself. Exact
                        website images are arranged without AI repainting.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={generateHeroImage}
                      disabled={
                        locked ||
                        pending ||
                        !capabilities.heroImageGenerationConfigured ||
                        (heroReferenceIds.length === 0 &&
                          smartHeroReferenceIds.length === 0)
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background transition hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === "hero" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                      {draft.heroImageUrl
                        ? "Rebuild with real products"
                        : "Build product-safe hero"}
                    </button>
                    <p className="text-[11px] leading-5 text-foreground/45">
                      Exact catalogue pixels · 1200×720 baseline JPEG · under
                      250 KB.
                    </p>
                  </div>
                </div>

                {draft.heroImageUrl && (
                  <div
                    className={cn(
                      "space-y-3 rounded-xl border bg-background p-4",
                      legacyGenerativeHero
                        ? "border-rose-300"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">Current email hero</p>
                      <button
                        type="button"
                        onClick={clearHeroImage}
                        disabled={locked || pending}
                        className="text-xs font-bold text-rose-700 hover:underline disabled:opacity-50"
                      >
                        Remove image
                      </button>
                    </div>
                    <Field
                      label="Hero image alt text"
                      value={draft.heroImageAlt}
                      max={MARKETING_LIMITS.imageAlt}
                      disabled={locked || pending}
                      onChange={(value) => update("heroImageAlt", value)}
                    />
                    <details className="text-xs text-foreground/55">
                      <summary className="cursor-pointer font-bold">
                        Hosted image URL
                      </summary>
                      <div className="mt-2">
                        <Field
                          label="Image URL"
                          value={draft.heroImageUrl}
                          max={MARKETING_LIMITS.url}
                          type="url"
                          disabled={locked || pending}
                          onChange={(value) =>
                            update("heroImageUrl", value)
                          }
                        />
                      </div>
                    </details>
                    {legacyGenerativeHero ? (
                      <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-800">
                        Blocked: this image came from the retired AI product
                        repainting path and may contain fake merchandise.
                        Rebuild it with real products or remove it before
                        testing/sending.
                      </p>
                    ) : (
                      <p className="text-[11px] leading-5 text-emerald-700">
                        Product-safe composition: source product images were
                        only resized and arranged; no generative model altered
                        their designs.
                      </p>
                    )}
                  </div>
                )}
                {!draft.heroImageUrl && (
                  <details className="rounded-xl border border-border bg-background p-4 text-sm">
                    <summary className="cursor-pointer font-bold">
                      Use an existing hosted image instead
                    </summary>
                    <div className="mt-3">
                      <Field
                        label="Hero image URL"
                        value={draft.heroImageUrl}
                        max={MARKETING_LIMITS.url}
                        type="url"
                        disabled={locked || pending}
                        onChange={(value) =>
                          update("heroImageUrl", value)
                        }
                      />
                    </div>
                  </details>
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
            ) : sendBlockers.length > 0 ? (
              <div
                role="alert"
                className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"
              >
                <div className="flex items-center gap-2 text-sm font-black">
                  <AlertTriangle className="h-4 w-4" />
                  Resolve before testing or sending
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                  {sendBlockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.message}</li>
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
                    !draftValidation.ok ||
                    sendBlockers.length > 0
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
                    mobile preview, test inbox rendering, and verified that
                    every pictured product matches its live website listing.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={prepare}
                  disabled={
                    locked ||
                    pending ||
                    blockingConfiguration ||
                    sendBlockers.length > 0 ||
                    !tested ||
                    !reviewed ||
                    cadenceBlocked
                  }
                  title={
                    cadenceBlocked
                      ? cadenceVerdict.blockers[0]?.message
                      : undefined
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
                Draft lifecycle, review evidence, and linked Resend broadcasts.
                Launched records are retained for audit.
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
              <table className="w-full min-w-300 text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-foreground/45">
                  <tr>
                    <th className="px-5 py-3 font-bold">Campaign</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Created</th>
                    <th className="px-4 py-3 font-bold">Updated</th>
                    <th className="px-4 py-3 font-bold">Tested</th>
                    <th className="px-4 py-3 font-bold">Audience</th>
                    <th className="px-4 py-3 font-bold">Delivery</th>
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
                      <td className="px-4 py-4">
                        <DateCell value={campaign.createdAt} />
                      </td>
                      <td className="px-4 py-4">
                        <DateCell value={campaign.updatedAt} />
                      </td>
                      <td className="px-4 py-4">
                        <DateCell value={campaign.lastTestSentAt} />
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {campaign.recipientCount ??
                          campaign.preparedRecipientCount ??
                          "—"}
                      </td>
                      <td className="px-4 py-4">
                        <DateCell
                          value={
                            campaign.sentAt ??
                            campaign.scheduledAt ??
                            campaign.launchedAt
                          }
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editCampaign(campaign)}
                            disabled={pending}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50"
                          >
                            {campaign.status === "preparing" &&
                            isRecoverablePreparingCampaign(campaign)
                              ? "Recover"
                              : isEditableMarketingCampaign(campaign)
                                ? "Edit"
                                : "View"}
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateCampaign(campaign)}
                            disabled={pending}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-50"
                          >
                            Duplicate
                          </button>
                          {isDeletableMarketingCampaign(campaign) && (
                            <button
                              type="button"
                              onClick={() => requestCampaignDelete(campaign)}
                              disabled={pending}
                              className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
                            >
                              Delete
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
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-delete-title"
          aria-describedby="campaign-delete-description"
        >
          <div
            ref={deleteDialogRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <h2 id="campaign-delete-title" className="text-xl font-black">
                  Delete draft?
                </h2>
              </div>
              <button
                type="button"
                onClick={dismissDelete}
                disabled={busy === "delete"}
                aria-label="Close delete confirmation"
                className="rounded-lg p-1 text-foreground/40 hover:bg-muted disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p
              id="campaign-delete-description"
              className="mt-4 text-sm leading-6 text-foreground/60"
            >
              This permanently removes the local draft and its test/review
              metadata. Campaigns that reached Resend cannot be deleted and
              remain available as audit records.
            </p>
            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-border bg-muted/50 p-4">
              <p className="truncate font-black">{deleteTarget.name}</p>
              <p className="mt-1 truncate text-xs text-foreground/55">
                {deleteTarget.subject}
              </p>
              <p className="mt-2 text-xs text-foreground/45">
                Created {displayDate(deleteTarget.createdAt)}
              </p>
            </div>
            {dirty && deleteTarget.id === campaignId && (
              <p className="mt-3 text-xs font-semibold leading-5 text-amber-700">
                This is the campaign currently open in the composer. Its
                unsaved changes will also be discarded.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={dismissDelete}
                disabled={busy === "delete"}
                className="rounded-full border border-border px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                Keep draft
              </button>
              <button
                type="button"
                onClick={deleteCampaign}
                disabled={busy === "delete"}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === "delete" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete draft
              </button>
            </div>
          </div>
        </div>
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
              {cadenceVerdict.warnings[0] && (
                <p className="mt-3 text-xs leading-5 text-amber-800">
                  {cadenceVerdict.warnings[0].message}
                </p>
              )}
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

function DateCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-foreground/35">—</span>;
  return (
    <time
      dateTime={value}
      title={new Date(value).toISOString()}
      className="whitespace-nowrap text-xs text-foreground/60"
    >
      {displayDate(value)}
    </time>
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

