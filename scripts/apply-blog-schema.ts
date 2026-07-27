/**
 * One-off, idempotent DDL for the AI blog engine (blog_posts + blog_topics).
 * Mirrors the Drizzle schema and the style of apply-social-schema.ts.
 * Safe to re-run.
 *
 *   npm run db:blog
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  // Database-backed blog posts (rendered alongside the static MDX flagship posts).
  await sql`
    CREATE TABLE IF NOT EXISTS "blog_posts" (
      "id" serial PRIMARY KEY,
      "slug" text NOT NULL,
      "title" text NOT NULL,
      "description" text NOT NULL,
      "excerpt" text NOT NULL,
      "body" text NOT NULL,
      "cover" text,
      "tags" text[] NOT NULL DEFAULT '{}',
      "author" text NOT NULL DEFAULT 'The Y2KASE Team',
      "status" text NOT NULL DEFAULT 'draft',
      "faq" jsonb,
      "keyword" text,
      "source" text NOT NULL DEFAULT 'ai',
      "model" text,
      "reading_minutes" integer,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "published_at" timestamptz
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_slug_idx" ON "blog_posts" ("slug")`;
  await sql`CREATE INDEX IF NOT EXISTS "blog_posts_status_idx" ON "blog_posts" ("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "blog_posts_published_idx" ON "blog_posts" ("published_at")`;

  // Content backlog / generation queue.
  await sql`
    CREATE TABLE IF NOT EXISTS "blog_topics" (
      "id" serial PRIMARY KEY,
      "title" text NOT NULL,
      "angle" text,
      "collection_slug" text,
      "status" text NOT NULL DEFAULT 'queued',
      "priority" integer NOT NULL DEFAULT 0,
      "source" text NOT NULL DEFAULT 'auto',
      "result_post_id" integer,
      "error" text,
      "attempts" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "processed_at" timestamptz
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "blog_topics_title_idx" ON "blog_topics" ("title")`;
  await sql`CREATE INDEX IF NOT EXISTS "blog_topics_status_idx" ON "blog_topics" ("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "blog_topics_priority_idx" ON "blog_topics" ("priority")`;

  console.log("✓ Blog engine schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
