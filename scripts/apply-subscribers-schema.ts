/**
 * Idempotent DDL migration: adds the email_subscribers table.
 * Safe to run multiple times.
 *
 * Run: npm run db:subscribers
 */
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("→ Applying email_subscribers schema…");

  await sql`
    CREATE TABLE IF NOT EXISTS "email_subscribers" (
      "id"              serial PRIMARY KEY,
      "email"           text NOT NULL,
      "name"            text,
      "source"          text NOT NULL DEFAULT 'popup',
      "discount_code"   text,
      "status"          text NOT NULL DEFAULT 'active',
      "subscribed_at"   timestamptz NOT NULL DEFAULT now(),
      "unsubscribed_at" timestamptz
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "email_subscribers_email_idx"
    ON "email_subscribers" ("email")
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS "email_subscribers_status_idx"
    ON "email_subscribers" ("status")
  `;

  console.log("✓ email_subscribers table ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
