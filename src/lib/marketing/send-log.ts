/**
 * Durable marketing-send log.
 *
 * Club cadence is per inbox, not per campaign. A Resend broadcast does not
 * tell us who was on the snapshot unless we write it ourselves. Inserts are
 * idempotent on (email, kind, step) so a retried cron or a double-clicked
 * launch cannot fabricate a second quiet-window stamp.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { and, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { marketingSendEvents } from "@/lib/db/schema";
import {
  isMarketingSendKind,
  type MarketingSendKind,
} from "@/lib/marketing/cadence";

export type RecordMarketingSendInput = {
  email: string;
  kind: MarketingSendKind;
  stepKey: string;
  campaignId?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function recordMarketingSend(
  input: RecordMarketingSendInput,
): Promise<{ recorded: boolean }> {
  if (!isMarketingSendKind(input.kind)) {
    throw new Error(`Unsupported marketing send kind "${input.kind}".`);
  }
  const email = normalizeEmail(input.email);
  if (!email) return { recorded: false };
  const stepKey = input.stepKey.trim();
  if (!stepKey) {
    throw new Error("Marketing send log requires a step key.");
  }

  const inserted = await db
    .insert(marketingSendEvents)
    .values({
      id: randomUUID(),
      email,
      kind: input.kind,
      stepKey,
      campaignId: input.campaignId ?? null,
      providerMessageId: input.providerMessageId ?? null,
      sentAt: input.sentAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: marketingSendEvents.id });

  return { recorded: inserted.length > 0 };
}

export async function recordMarketingSends(
  inputs: RecordMarketingSendInput[],
): Promise<number> {
  let recorded = 0;
  for (const input of inputs) {
    const result = await recordMarketingSend(input);
    if (result.recorded) recorded += 1;
  }
  return recorded;
}

export async function latestMarketingSendByEmail(
  emails: string[],
  since: Date,
): Promise<Map<string, Date>> {
  const normalized = [
    ...new Set(emails.map(normalizeEmail).filter(Boolean)),
  ];
  const latest = new Map<string, Date>();
  if (normalized.length === 0) return latest;

  const rows = await db
    .select({
      email: marketingSendEvents.email,
      sentAt: sql<Date>`max(${marketingSendEvents.sentAt})`.as("sent_at"),
    })
    .from(marketingSendEvents)
    .where(
      and(
        inArray(marketingSendEvents.email, normalized),
        gte(marketingSendEvents.sentAt, since),
      ),
    )
    .groupBy(marketingSendEvents.email);

  for (const row of rows) {
    latest.set(row.email, new Date(row.sentAt));
  }
  return latest;
}
