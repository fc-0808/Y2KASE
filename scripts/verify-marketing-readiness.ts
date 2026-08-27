/**
 * Marketing env + Resend resource verification (no server-only imports).
 * Usage: npx tsx scripts/verify-marketing-readiness.ts
 */
import { config } from "dotenv";
import { Resend } from "resend";
import {
  createStarterDraft,
  renderMarketingEmail,
} from "../src/lib/marketing/template";

config({ path: ".env.local" });

type Check = { label: string; ok: boolean; detail: string };

function check(label: string, ok: boolean, detail: string): Check {
  return { label, ok, detail };
}

function mailbox(sender: string): string {
  const value = sender.trim();
  return (value.match(/<([^<>]+)>\s*$/)?.[1]?.trim() || value).toLowerCase();
}

function isUuid(value: string | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value?.trim() ?? "",
  );
}

async function main() {
  const checks: Check[] = [];
  const postal = process.env.MARKETING_POSTAL_ADDRESS?.trim() ?? "";
  const marketing = mailbox(process.env.EMAIL_FROM_MARKETING?.trim() ?? "");
  const transactional = mailbox(
    process.env.EMAIL_FROM?.trim() || "Y2KASE <orders@send.y2kase.com>",
  );
  const segmentId = process.env.RESEND_MARKETING_SEGMENT_ID?.trim() ?? "";
  const topicId = process.env.RESEND_MARKETING_TOPIC_ID?.trim() ?? "";
  const sendEnabled = process.env.MARKETING_SEND_ENABLED === "true";
  const heroImageReady = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL,
  );

  checks.push(
    check(
      "Resend delivery",
      Boolean(process.env.RESEND_API_KEY?.trim()),
      process.env.RESEND_API_KEY?.trim() ? "API key present" : "RESEND_API_KEY missing",
    ),
  );
  checks.push(
    check(
      "Compliance footer",
      postal.length >= 6,
      postal.length >= 6 ? postal : "MARKETING_POSTAL_ADDRESS missing or too short",
    ),
  );
  checks.push(
    check(
      "Sender reputation",
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(marketing) && marketing !== transactional,
      marketing !== transactional
        ? (process.env.EMAIL_FROM_MARKETING ?? "").trim()
        : "EMAIL_FROM_MARKETING must differ from EMAIL_FROM",
    ),
  );
  checks.push(
    check(
      "Audience resources",
      isUuid(segmentId) && isUuid(topicId),
      isUuid(segmentId) && isUuid(topicId)
        ? `segment ${segmentId.slice(0, 8)}… · topic ${topicId.slice(0, 8)}…`
        : "RESEND_MARKETING_SEGMENT_ID / RESEND_MARKETING_TOPIC_ID missing",
    ),
  );
  checks.push(
    check(
      "Consent webhook",
      Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      process.env.RESEND_WEBHOOK_SECRET?.trim()
        ? "Signing secret configured"
        : "RESEND_WEBHOOK_SECRET missing",
    ),
  );
  checks.push(
    check(
      "Production switch",
      sendEnabled,
      sendEnabled
        ? `Enabled · cap ${process.env.MARKETING_MAX_RECIPIENTS ?? "25"}`
        : "MARKETING_SEND_ENABLED=false (intentional until launch)",
    ),
  );
  checks.push(
    check(
      "Product-safe campaign hero",
      heroImageReady,
      heroImageReady
        ? "Deterministic catalogue renderer + R2 storage configured"
        : "Configure all R2 storage variables",
    ),
  );

  const rendered = renderMarketingEmail(createStarterDraft("announcement"), {
    postalAddress: postal || "MISSING",
  });
  checks.push(
    check(
      "Footer renders in template",
      postal.length >= 6 &&
        rendered.html.includes(postal) &&
        rendered.text.includes(postal),
      postal.length >= 6
        ? "Postal address appears in HTML + text footers"
        : "Cannot render without postal address",
    ),
  );

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey && isUuid(segmentId) && isUuid(topicId)) {
    const resend = new Resend(apiKey);
    try {
      const [segment, topic] = await Promise.all([
        resend.segments.get(segmentId),
        resend.topics.get(topicId),
      ]);
      const segmentOk = !segment.error && segment.data?.id === segmentId;
      const topicOk =
        !topic.error &&
        topic.data?.id === topicId &&
        topic.data?.default_subscription === "opt_out";
      checks.push(
        check(
          "Resend segment resolves",
          segmentOk,
          segmentOk
            ? `Y2KASE Subscribers (${segmentId})`
            : segment.error?.message ?? "Segment lookup failed",
        ),
      );
      checks.push(
        check(
          "Resend topic resolves (opt_out)",
          topicOk,
          topicOk
            ? `Y2KASE News & Offers (${topicId})`
            : topic.error?.message ??
                `Topic must default to opt_out (got ${topic.data?.default_subscription ?? "unknown"})`,
        ),
      );
    } catch (error) {
      checks.push(
        check(
          "Resend API lookup",
          false,
          error instanceof Error ? error.message : "Provider lookup failed",
        ),
      );
    }
  }

  const launchReady =
    postal.length >= 6 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(marketing) &&
    marketing !== transactional &&
    isUuid(segmentId) &&
    isUuid(topicId) &&
    Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()) &&
    sendEnabled;

  checks.push(
    check(
      "Launch-ready (all six gates)",
      launchReady,
      launchReady
        ? "Safe to enable production sends"
        : sendEnabled
          ? "Unexpected: send enabled but another gate failed"
          : "Five of six configured — flip MARKETING_SEND_ENABLED=true when ready",
    ),
  );

  console.log("\nMarketing readiness\n");
  for (const item of checks) {
    console.log(`${item.ok ? "✓" : "✗"} ${item.label}: ${item.detail}`);
  }

  const failed = checks.filter(
    (item) =>
      !item.ok &&
      item.label !== "Production switch" &&
      item.label !== "Launch-ready (all six gates)",
  );
  if (failed.length > 0) {
    console.log(`\n${failed.length} blocking check(s) failed.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nConfiguration verified. Production sending is ${sendEnabled ? "enabled" : "still intentionally disabled"}.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
