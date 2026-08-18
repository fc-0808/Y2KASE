/**
 * Idempotent DDL migration: adds the subscriber consent ledger and durable
 * marketing-campaign review/send records.
 * Safe to run multiple times.
 *
 * Run: npm run db:subscribers
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("→ Applying subscriber marketing schema…");

  await sql`
    CREATE TABLE IF NOT EXISTS "email_subscribers" (
      "id"              serial PRIMARY KEY,
      "email"           text NOT NULL,
      "name"            text,
      "source"          text NOT NULL DEFAULT 'popup',
      "discount_code"   text,
      "status"          text NOT NULL DEFAULT 'active',
      "consent_version" text,
      "consent_recorded_at" timestamptz,
      "consent_ip_hash" text,
      "consent_user_agent" text,
      "consent_locale"  text,
      "consent_country" text,
      "subscribed_at"   timestamptz NOT NULL DEFAULT now(),
      "resubscribed_at" timestamptz,
      "unsubscribed_at" timestamptz,
      "unsubscribe_reason" text
    )
  `;

  await sql`
    ALTER TABLE "email_subscribers"
      ADD COLUMN IF NOT EXISTS "consent_version" text,
      ADD COLUMN IF NOT EXISTS "consent_recorded_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "consent_ip_hash" text,
      ADD COLUMN IF NOT EXISTS "consent_user_agent" text,
      ADD COLUMN IF NOT EXISTS "consent_locale" text,
      ADD COLUMN IF NOT EXISTS "consent_country" text,
      ADD COLUMN IF NOT EXISTS "resubscribed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "unsubscribe_reason" text
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "email_subscribers_email_idx"
    ON "email_subscribers" ("email")
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "email_subscribers_status_idx"
    ON "email_subscribers" ("status")
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
      "id"                    text PRIMARY KEY,
      "created_by"            text REFERENCES "user" ("id") ON DELETE SET NULL,
      "name"                  text NOT NULL,
      "campaign_type"         text NOT NULL DEFAULT 'announcement',
      "subject"               text NOT NULL,
      "preview_text"          text NOT NULL,
      "eyebrow"               text NOT NULL,
      "heading"               text NOT NULL,
      "body"                  text NOT NULL,
      "cta_label"             text NOT NULL,
      "cta_url"               text NOT NULL,
      "hero_image_url"        text,
      "hero_image_alt"        text,
      "promo_code"            text,
      "status"                text NOT NULL DEFAULT 'draft',
      "content_hash"          text NOT NULL,
      "tested_content_hash"   text,
      "last_test_sent_at"     timestamptz,
      "reviewed_content_hash" text,
      "reviewed_by"           text REFERENCES "user" ("id") ON DELETE SET NULL,
      "reviewed_at"           timestamptz,
      "prepared_audience_hash" text,
      "prepared_recipient_count" integer,
      "prepared_at"           timestamptz,
      "launched_by"           text REFERENCES "user" ("id") ON DELETE SET NULL,
      "launch_attempt_id"     text,
      "launch_started_at"     timestamptz,
      "launched_at"           timestamptz,
      "resend_broadcast_id"   text,
      "resend_segment_id"     text,
      "resend_topic_id"       text,
      "recipient_count"       integer,
      "scheduled_at"          timestamptz,
      "sent_at"               timestamptz,
      "last_error"            text,
      "created_at"            timestamptz NOT NULL DEFAULT now(),
      "updated_at"            timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    ALTER TABLE "marketing_campaigns"
      ADD COLUMN IF NOT EXISTS "prepared_audience_hash" text,
      ADD COLUMN IF NOT EXISTS "reviewed_content_hash" text,
      ADD COLUMN IF NOT EXISTS "reviewed_by" text REFERENCES "user" ("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "prepared_recipient_count" integer,
      ADD COLUMN IF NOT EXISTS "prepared_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "launched_by" text REFERENCES "user" ("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "launch_attempt_id" text,
      ADD COLUMN IF NOT EXISTS "launch_started_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "launched_at" timestamptz
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "marketing_campaigns_resend_broadcast_idx"
    ON "marketing_campaigns" ("resend_broadcast_id")
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "marketing_campaigns_status_idx"
    ON "marketing_campaigns" ("status")
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "marketing_campaigns_created_idx"
    ON "marketing_campaigns" ("created_at")
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS "resend_webhook_events" (
      "id"           text PRIMARY KEY,
      "event_type"   text NOT NULL,
      "received_at"  timestamptz NOT NULL,
      "processed_at" timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "resend_webhook_events_processed_idx"
    ON "resend_webhook_events" ("processed_at")
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_subscribers_status_check'
      ) THEN
        ALTER TABLE "email_subscribers"
          ADD CONSTRAINT "email_subscribers_status_check"
          CHECK ("status" IN ('active', 'unsubscribed'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_subscribers_country_check'
      ) THEN
        ALTER TABLE "email_subscribers"
          ADD CONSTRAINT "email_subscribers_country_check"
          CHECK ("consent_country" IS NULL OR char_length("consent_country") = 2);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'email_subscribers_unsubscribe_reason_check'
      ) THEN
        ALTER TABLE "email_subscribers"
          ADD CONSTRAINT "email_subscribers_unsubscribe_reason_check"
          CHECK (
            "unsubscribe_reason" IS NULL
            OR "unsubscribe_reason" IN (
              'customer_one_click',
              'admin',
              'provider_opt_out',
              'bounce',
              'complaint',
              'suppressed'
            )
          );
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'marketing_campaigns_status_check'
      ) THEN
        ALTER TABLE "marketing_campaigns"
          ADD CONSTRAINT "marketing_campaigns_status_check"
          CHECK ("status" IN ('draft', 'preparing', 'queued', 'scheduled', 'sent', 'cancelled', 'failed'));
      END IF;
    END
    $$
  `;
  await sql`
    ALTER TABLE "marketing_campaigns"
      DROP CONSTRAINT IF EXISTS "marketing_campaigns_status_check"
  `;
  await sql`
    ALTER TABLE "marketing_campaigns"
      ADD CONSTRAINT "marketing_campaigns_status_check"
      CHECK (
        "status" IN (
          'draft',
          'preparing',
          'queued',
          'scheduled',
          'sent',
          'cancelled',
          'failed'
        )
      )
  `;
  await sql`
    ALTER TABLE "marketing_campaigns"
      DROP CONSTRAINT IF EXISTS "marketing_campaigns_recipient_count_check"
  `;
  await sql`
    ALTER TABLE "marketing_campaigns"
      ADD CONSTRAINT "marketing_campaigns_recipient_count_check"
      CHECK (
        ("recipient_count" IS NULL OR "recipient_count" >= 0)
        AND
        ("prepared_recipient_count" IS NULL OR "prepared_recipient_count" >= 0)
      )
  `;

  console.log("✓ subscriber marketing schema ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
