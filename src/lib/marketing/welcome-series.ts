/**
 * Welcome series steps 2 and 3.
 *
 * Step 1 is owned by POST /api/subscribe (the coupon email). This module
 * only advances people who already have a logged welcome-1 send, so a failed
 * first delivery cannot start a drip they never opted into seeing.
 */
import "server-only";

import { render } from "@react-email/components";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers, marketingSendEvents, orders } from "@/lib/db/schema";
import { ClubNurtureEmail } from "@/emails/ClubNurtureEmail";
import { EMAIL_REPLY_TO, getResend, senderFor } from "@/lib/email";
import { MARKETING_SENDABLE_STATUS } from "@/lib/marketing/audience";
import {
  clubEmailUrl,
  welcomeFollowupDue,
} from "@/lib/marketing/cadence";
import {
  configuredMarketingTopicId,
  isMarketingSendEnabled,
  isMarketingSenderConfigured,
  marketingPostalAddress,
} from "@/lib/marketing/compliance";
import { recordMarketingSend } from "@/lib/marketing/send-log";
import { getBestsellers } from "@/lib/products";
import { resolveLocalCoupon } from "@/lib/promotions";
import { listUnsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";

const MAX_SENDS_PER_RUN = 40;

export type WelcomeSeriesRunResult = {
  scanned: number;
  sent: number;
  skipped: number;
  purchased: number;
};

async function clubProductPicks(step: 2 | 3) {
  const featured = await getBestsellers();
  return featured
    .filter((product) => product.status === "active" && product.imageUrl)
    .slice(0, 3)
    .map((product) => ({
      title: product.title,
      imageUrl: product.imageUrl as string,
      href: clubEmailUrl(`/products/${product.slug}`, `welcome-${step}`, product.slug),
    }));
}

async function sendWelcomeFollowup(input: {
  email: string;
  name: string | null;
  discountCode: string | null;
  step: 2 | 3;
  products: Awaited<ReturnType<typeof clubProductPicks>>;
}): Promise<boolean> {
  const resend = getResend();
  const postalAddress = marketingPostalAddress();
  const topicId = configuredMarketingTopicId();
  if (
    !resend ||
    !postalAddress ||
    !isMarketingSenderConfigured() ||
    !topicId ||
    !isMarketingSendEnabled()
  ) {
    return false;
  }

  const coupon = resolveLocalCoupon(input.discountCode);
  const unsubUrl = unsubscribeUrl(input.email);
  const shopUrl = clubEmailUrl("/products", `welcome-${input.step}`, "shop");
  const element = ClubNurtureEmail({
    name: input.name ?? undefined,
    step: input.step,
    code: input.step === 3 ? coupon?.code : undefined,
    percentOff: input.step === 3 ? coupon?.percentOff : undefined,
    products: input.products,
    shopUrl,
    unsubscribeUrl: unsubUrl,
    postalAddress,
  });
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  const subject =
    input.step === 2
      ? "Inside the Y2KASE Club"
      : `${coupon?.percentOff ?? 10}% off is still waiting`;

  const { error } = await resend.emails.send(
    {
      from: senderFor("marketing"),
      replyTo: EMAIL_REPLY_TO,
      to: input.email,
      subject,
      topicId,
      html,
      text,
      headers: listUnsubscribeHeaders(input.email),
    },
    { idempotencyKey: `welcome-${input.step}-${input.email}` },
  );
  if (error) {
    console.error(
      `[welcome-series] Resend rejected step ${input.step} for ${input.email}:`,
      error,
    );
    return false;
  }

  await recordMarketingSend({
    email: input.email,
    kind: "welcome-followup",
    stepKey: String(input.step),
  });
  return true;
}

export async function runWelcomeSeries(now: Date = new Date()): Promise<WelcomeSeriesRunResult> {
  const result: WelcomeSeriesRunResult = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    purchased: 0,
  };

  const subscribers = await db
    .select({
      email: emailSubscribers.email,
      name: emailSubscribers.name,
      discountCode: emailSubscribers.discountCode,
    })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.status, MARKETING_SENDABLE_STATUS));

  if (subscribers.length === 0) return result;

  const emails = subscribers.map((row) => row.email.trim().toLowerCase());
  const [eventRows, paidRows, products2, products3] = await Promise.all([
    db
      .select({
        email: marketingSendEvents.email,
        kind: marketingSendEvents.kind,
        stepKey: marketingSendEvents.stepKey,
        sentAt: marketingSendEvents.sentAt,
      })
      .from(marketingSendEvents)
      .where(inArray(marketingSendEvents.email, emails)),
    db
      .select({ email: sql<string>`lower(${orders.email})`.as("email") })
      .from(orders)
      .where(
        and(
          inArray(orders.status, ["paid", "shipped", "delivered"]),
          sql`lower(${orders.email}) in (${sql.join(
            emails.map((email) => sql`${email}`),
            sql`, `,
          )})`,
        ),
      ),
    clubProductPicks(2),
    clubProductPicks(3),
  ]);

  const eventsByEmail = new Map<string, typeof eventRows>();
  for (const row of eventRows) {
    const list = eventsByEmail.get(row.email) ?? [];
    list.push(row);
    eventsByEmail.set(row.email, list);
  }
  const purchased = new Set(
    paidRows.map((row) => row.email.trim().toLowerCase()).filter(Boolean),
  );

  for (const subscriber of subscribers) {
    if (result.sent >= MAX_SENDS_PER_RUN) break;
    const email = subscriber.email.trim().toLowerCase();
    const events = eventsByEmail.get(email) ?? [];

    const welcome1 = events.find(
      (event) => event.kind === "welcome" && event.stepKey === "1",
    );
    if (!welcome1) {
      continue;
    }
    result.scanned += 1;

    const lastSentAt = events.reduce<Date | null>((latest, event) => {
      if (!latest || event.sentAt > latest) return event.sentAt;
      return latest;
    }, null);

    const hasStep2 = events.some(
      (event) => event.kind === "welcome-followup" && event.stepKey === "2",
    );
    const hasStep3 = events.some(
      (event) => event.kind === "welcome-followup" && event.stepKey === "3",
    );

    const dueStep: 2 | 3 | null = !hasStep2
      ? welcomeFollowupDue({
          step: 2,
          previousSentAt: welcome1.sentAt,
          lastMarketingSentAt: lastSentAt,
          now,
        })
        ? 2
        : null
      : !hasStep3
        ? welcomeFollowupDue({
            step: 3,
            previousSentAt:
              events.find(
                (event) =>
                  event.kind === "welcome-followup" && event.stepKey === "2",
              )?.sentAt ?? welcome1.sentAt,
            lastMarketingSentAt: lastSentAt,
            now,
          })
          ? 3
          : null
        : null;

    if (!dueStep) {
      result.skipped += 1;
      continue;
    }

    if (purchased.has(email)) {
      result.purchased += 1;
      continue;
    }

    const sent = await sendWelcomeFollowup({
      email,
      name: subscriber.name,
      discountCode: subscriber.discountCode,
      step: dueStep,
      products: dueStep === 2 ? products2 : products3,
    });
    if (sent) result.sent += 1;
    else result.skipped += 1;
  }

  return result;
}

