/**
 * Idempotent DDL for Club cadence: per-inbox marketing send log.
 *
 * Run: npm run db:cadence
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }

  console.log("→ Applying marketing cadence schema…");

  await sql`
    CREATE TABLE IF NOT EXISTS "marketing_send_events" (
      "id"                   text PRIMARY KEY,
      "email"                text NOT NULL,
      "kind"                 text NOT NULL,
      "step_key"             text NOT NULL,
      "campaign_id"          text REFERENCES "marketing_campaigns" ("id") ON DELETE SET NULL,
      "provider_message_id"  text,
      "sent_at"              timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "marketing_send_events_idempotency_idx"
    ON "marketing_send_events" ("email", "kind", "step_key")
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "marketing_send_events_email_sent_idx"
    ON "marketing_send_events" ("email", "sent_at")
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "marketing_send_events_kind_sent_idx"
    ON "marketing_send_events" ("kind", "sent_at")
  `;

  await sql`
    ALTER TABLE "marketing_send_events"
      DROP CONSTRAINT IF EXISTS "marketing_send_events_kind_check"
  `;
  await sql`
    ALTER TABLE "marketing_send_events"
      ADD CONSTRAINT "marketing_send_events_kind_check"
      CHECK (
        "kind" IN (
          'campaign',
          'welcome',
          'welcome-followup',
          'abandoned-cart',
          'review-request'
        )
      )
  `;

  console.log("✓ marketing cadence schema ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
