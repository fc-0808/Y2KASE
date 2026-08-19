/**
 * Blog database store — all reads/writes for AI-generated posts + the topic
 * queue. Every function degrades gracefully when the DB isn't configured so the
 * storefront still renders (with just the static MDX posts) before/without a
 * database.
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { blogPosts, blogTopics } from "@/lib/db/schema";
import type { BlogPost, BlogTopic, NewBlogPost } from "@/lib/db/schema";
import { coerceFigures } from "./types";
import type { PostMeta, PostSummary, RenderablePost } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Row → view-model mappers
// ─────────────────────────────────────────────────────────────────────────────

function isoDate(row: BlogPost): string {
  const d = row.publishedAt ?? row.createdAt ?? new Date();
  return new Date(d).toISOString().slice(0, 10);
}

function rowToMeta(row: BlogPost): PostMeta {
  return {
    title: row.title,
    description: row.description,
    excerpt: row.excerpt,
    date: isoDate(row),
    modified: new Date(row.updatedAt).toISOString(),
    author: row.author,
    tags: row.tags ?? [],
    cover: row.cover ?? undefined,
    readingMinutes: row.readingMinutes ?? undefined,
    draft: row.status !== "published",
  };
}

export function rowToSummary(row: BlogPost): PostSummary {
  return { slug: row.slug, source: "db", meta: rowToMeta(row) };
}

export function rowToRenderable(row: BlogPost): RenderablePost {
  return {
    slug: row.slug,
    source: "db",
    meta: rowToMeta(row),
    body: row.body,
    faq: row.faq ?? undefined,
    images: coerceFigures(row.images),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Storefront reads (published only)
// ─────────────────────────────────────────────────────────────────────────────

/** Published DB posts as summaries, newest-published first. */
export async function listPublishedDbSummaries(): Promise<PostSummary[]> {
  if (!isDbConfigured()) return [];
  try {
    const rows = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"))
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt));
    return rows.map(rowToSummary);
  } catch {
    return [];
  }
}

/** A single published DB post (renderable) by slug, or null. */
export async function getPublishedDbPost(
  slug: string,
): Promise<RenderablePost | null> {
  if (!isDbConfigured()) return null;
  try {
    const row = await db.query.blogPosts.findFirst({
      where: and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")),
    });
    return row ? rowToRenderable(row) : null;
  } catch {
    return null;
  }
}

/** Slugs of all published DB posts (for generateStaticParams + sitemap). */
export async function listPublishedDbSlugs(): Promise<string[]> {
  if (!isDbConfigured()) return [];
  try {
    const rows = await db
      .select({ slug: blogPosts.slug })
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"));
    return rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin reads
// ─────────────────────────────────────────────────────────────────────────────

/** Every DB post (any status), newest first — for the admin console. */
export async function listAllPosts(): Promise<BlogPost[]> {
  if (!isDbConfigured()) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
}

export async function getPostById(id: number): Promise<BlogPost | null> {
  if (!isDbConfigured()) return null;
  const row = await db.query.blogPosts.findFirst({
    where: eq(blogPosts.id, id),
  });
  return row ?? null;
}

/** True when a slug already exists (any status) — the dedup guard. */
export async function slugExists(slug: string): Promise<boolean> {
  if (!isDbConfigured()) return false;
  const row = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);
  return row.length > 0;
}

/**
 * The collection a post was generated for, taken from the topic that produced
 * it.
 *
 * Recorded provenance, so it stays correct even for an article whose copy links
 * nothing — which is exactly when a fallback for imagery is needed. Returns null
 * for hand-written posts and for topics that have since been deleted.
 */
export async function getPostCollectionSlug(
  postId: number,
): Promise<string | null> {
  if (!isDbConfigured()) return null;
  try {
    const [row] = await db
      .select({ collectionSlug: blogTopics.collectionSlug })
      .from(blogTopics)
      .where(eq(blogTopics.resultPostId, postId))
      .limit(1);
    return row?.collectionSlug ?? null;
  } catch {
    return null;
  }
}

/** Count posts created since `since` — powers the daily generation cap. */
export async function countPostsSince(since: Date): Promise<number> {
  if (!isDbConfigured()) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(blogPosts)
    .where(gte(blogPosts.createdAt, since));
  return rows[0]?.n ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/** Insert a post. Returns the new id. Set status='published' to go live now. */
export async function insertPost(input: NewBlogPost): Promise<number> {
  const publishedAt =
    input.status === "published" ? (input.publishedAt ?? new Date()) : null;
  const [row] = await db
    .insert(blogPosts)
    .values({ ...input, publishedAt })
    .returning({ id: blogPosts.id });
  return row.id;
}

/** Change a post's status, stamping publishedAt the first time it goes live. */
export async function setPostStatus(
  id: number,
  status: "draft" | "published" | "archived",
): Promise<void> {
  const existing = await getPostById(id);
  const publishedAt =
    status === "published"
      ? (existing?.publishedAt ?? new Date())
      : existing?.publishedAt ?? null;
  await db
    .update(blogPosts)
    .set({ status, publishedAt, updatedAt: new Date() })
    .where(eq(blogPosts.id, id));
}

/**
 * Update editable content on a post.
 *
 * Deliberately cannot touch `slug`, `status` or `publishedAt`: a full rewrite
 * (see `regeneratePost`) refreshes the copy of an already-indexed URL, and
 * moving or unpublishing it is a separate, explicit decision.
 */
export async function updatePost(
  id: number,
  fields: Partial<
    Pick<
      BlogPost,
      | "title"
      | "description"
      | "excerpt"
      | "body"
      | "cover"
      | "images"
      | "tags"
      | "faq"
      | "keyword"
      | "model"
      | "readingMinutes"
    >
  >,
): Promise<void> {
  await db
    .update(blogPosts)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(blogPosts.id, id));
}

export async function deletePost(id: number): Promise<void> {
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Topic queue
// ─────────────────────────────────────────────────────────────────────────────

export type TopicInput = {
  title: string;
  angle?: string | null;
  collectionSlug?: string | null;
  priority?: number;
  source?: "auto" | "manual";
};

/**
 * Enqueue topics, skipping any whose title already exists (unique index +
 * ON CONFLICT DO NOTHING). Returns how many rows were actually inserted.
 */
export async function enqueueTopics(topics: TopicInput[]): Promise<number> {
  const clean = topics
    .map((t) => ({
      title: t.title.trim(),
      angle: t.angle?.trim() || null,
      collectionSlug: t.collectionSlug?.trim() || null,
      priority: t.priority ?? 0,
      source: t.source ?? "auto",
    }))
    .filter((t) => t.title.length > 0);
  if (clean.length === 0) return 0;

  const inserted = await db
    .insert(blogTopics)
    .values(clean)
    .onConflictDoNothing({ target: blogTopics.title })
    .returning({ id: blogTopics.id });
  return inserted.length;
}

/** Topics in a given status (default all), highest-priority / oldest first. */
export async function listTopics(status?: string): Promise<BlogTopic[]> {
  if (!isDbConfigured()) return [];
  const base = db.select().from(blogTopics);
  const rows = status
    ? await base
        .where(eq(blogTopics.status, status))
        .orderBy(desc(blogTopics.priority), asc(blogTopics.createdAt))
    : await base.orderBy(desc(blogTopics.priority), asc(blogTopics.createdAt));
  return rows;
}

/** Number of topics still waiting in the queue. */
export async function countQueuedTopics(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(blogTopics)
    .where(eq(blogTopics.status, "queued"));
  return rows[0]?.n ?? 0;
}

/**
 * Atomically claim the next queued topic (queued → processing). The conditional
 * UPDATE (`AND status='queued'`) makes the claim race-safe: if two cron runs
 * overlap, only one wins the row and the other retries the next candidate.
 * Returns the claimed topic, or null when the queue is empty.
 */
export async function claimNextTopic(): Promise<BlogTopic | null> {
  if (!isDbConfigured()) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [candidate] = await db
      .select({ id: blogTopics.id })
      .from(blogTopics)
      .where(eq(blogTopics.status, "queued"))
      .orderBy(desc(blogTopics.priority), asc(blogTopics.createdAt))
      .limit(1);
    if (!candidate) return null;

    const claimed = await db
      .update(blogTopics)
      .set({ status: "processing", processedAt: new Date() })
      .where(
        and(eq(blogTopics.id, candidate.id), eq(blogTopics.status, "queued")),
      )
      .returning();
    if (claimed.length > 0) return claimed[0];
    // Lost the race — try the next candidate.
  }
  return null;
}

export async function markTopicDone(
  id: number,
  resultPostId: number,
): Promise<void> {
  await db
    .update(blogTopics)
    .set({ status: "done", resultPostId, processedAt: new Date() })
    .where(eq(blogTopics.id, id));
}

/** Mark a topic failed; requeue for retry until attempts hits the cap. */
export async function markTopicFailed(
  id: number,
  error: string,
  maxAttempts = 3,
): Promise<void> {
  const existing = await db.query.blogTopics.findFirst({
    where: eq(blogTopics.id, id),
  });
  const attempts = (existing?.attempts ?? 0) + 1;
  await db
    .update(blogTopics)
    .set({
      status: attempts >= maxAttempts ? "failed" : "queued",
      error: error.slice(0, 500),
      attempts,
      processedAt: new Date(),
    })
    .where(eq(blogTopics.id, id));
}

export async function deleteTopic(id: number): Promise<void> {
  await db.delete(blogTopics).where(eq(blogTopics.id, id));
}
