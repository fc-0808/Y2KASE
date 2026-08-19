/**
 * Blog engine — orchestrates the autonomous content pipeline.
 *
 * Ties together the topic planner, the article generator and the store: it
 * keeps the backlog topped up from the live catalog, claims topics atomically,
 * writes each article, and either publishes it immediately (BLOG_AUTOPUBLISH)
 * or files it as a draft for human review. Shared by the generation cron and
 * the admin "Generate now" action so both behave identically.
 */
import {
  claimNextTopic,
  countQueuedTopics,
  enqueueTopics,
  getPostById,
  getPostCollectionSlug,
  insertPost,
  updatePost,
  markTopicDone,
  markTopicFailed,
} from "./store";
import { planTopics } from "./topics";
import {
  generateArticle,
  isBlogDailyLimitReached,
  type TopicSeed,
} from "./generate";
import { generateBlogCover, isCoverGenEnabled } from "./cover";
import { resolveCoverReferences, resolvePostFigures } from "./media";

/**
 * Generated editorial is draft-first. Publishing is an explicit production
 * decision because factual errors, topic cannibalization and thin copy are
 * quality risks that static validation cannot fully detect.
 */
export const BLOG_AUTOPUBLISH = process.env.BLOG_AUTOPUBLISH === "true";

/** Keep at least this many topics queued so the pipeline never starves. */
export const BLOG_QUEUE_TARGET = Number(process.env.BLOG_QUEUE_TARGET ?? 12);

/** Posts generated per cron run (bounded to fit the function timeout). */
export const BLOG_CRON_BATCH = Number(process.env.BLOG_CRON_BATCH ?? 1);

/**
 * Ensure the queue holds at least `target` topics, planning fresh ones from the
 * catalog when it runs low. Returns how many new topics were enqueued.
 */
export async function ensureQueue(
  target = BLOG_QUEUE_TARGET,
): Promise<number> {
  const queued = await countQueuedTopics();
  if (queued >= target) return 0;
  const planned = await planTopics(target - queued);
  if (planned.length === 0) return 0;
  return enqueueTopics(planned.map((p) => ({ ...p, source: "auto" as const })));
}

/**
 * Generate a hero conditioned on the article's own catalog photos, and store it.
 *
 * Best-effort in both directions. Generation is skipped outright when no
 * catalog references resolve, because an unreferenced hero is exactly the
 * invented-product image this pipeline exists to prevent — the post keeps its
 * real catalog-photo cover instead, which is always the safer of the two.
 * Returns the new cover URL, or null when nothing changed.
 */
async function refreshCover(opts: {
  postId: number;
  title: string;
  body: string;
  collectionSlug?: string | null;
  theme?: string | null;
  fallbackCover?: string | null;
}): Promise<string | null> {
  if (!isCoverGenEnabled()) return null;

  const referenceImages = await resolveCoverReferences({
    body: opts.body,
    collectionSlug: opts.collectionSlug,
    fallbackCover: opts.fallbackCover,
  });
  if (referenceImages.length === 0) return null;

  const cover = await generateBlogCover({
    title: opts.title,
    theme: opts.theme,
    referenceImages,
  });
  if (cover) await updatePost(opts.postId, { cover });
  return cover;
}

/**
 * Generate one article from a seed and persist it. Returns the new post id +
 * slug. Shared by the batch loop and the admin "Generate now" action so both
 * produce identical, validated output. Throws on generation failure.
 */
export async function generateAndStore(
  seed: TopicSeed,
  autoPublish: boolean,
): Promise<{ postId: number; slug: string; status: "published" | "draft" }> {
  const article = await generateArticle(seed);
  const status = autoPublish ? "published" : "draft";

  // In-body illustrations, resolved from the products the copy links to. Cheap
  // (one query, no generation) and authentic — these are the actual listings.
  const figures = await resolvePostFigures({
    body: article.body,
    collectionSlug: seed.collectionSlug,
  });

  // Persist first with the catalog-photo fallback cover, so a slow or failed
  // hero-image step can never block the article from being saved/published.
  const postId = await insertPost({
    slug: article.slug,
    title: article.title,
    description: article.description,
    excerpt: article.excerpt,
    body: article.body,
    cover: article.cover,
    images: figures.length > 0 ? figures : null,
    tags: article.tags,
    status,
    faq: article.faq.length > 0 ? article.faq : null,
    keyword: article.keyword,
    source: "ai",
    model: article.model,
    readingMinutes: article.readingMinutes,
  });

  await refreshCover({
    postId,
    title: article.title,
    body: article.body,
    collectionSlug: seed.collectionSlug,
    theme: article.collectionName ?? article.keyword,
    fallbackCover: article.cover,
  });

  return { postId, slug: article.slug, status };
}

export type RegenerateResult = {
  slug: string;
  words: number;
  figures: number;
  coverRegenerated: boolean;
};

/**
 * Rewrite an existing post in place, from the topic it was originally written
 * for.
 *
 * Slug, title, status and publication date are preserved: this refreshes the
 * content behind a URL that may already be indexed rather than minting a new
 * one, so inbound links and rankings survive. Only the body and everything
 * derived from it changes.
 *
 * The rewrite runs through the same validation as a fresh article, which is the
 * point: posts written before a quality gate existed either come up to the
 * current standard or throw and are left exactly as they were.
 */
export async function regeneratePost(
  postId: number,
  opts?: { regenerateCover?: boolean },
): Promise<RegenerateResult> {
  const post = await getPostById(postId);
  if (!post) throw new Error(`Post ${postId} not found.`);

  const collectionSlug = await getPostCollectionSlug(postId);

  // The article's own freshly-minted slug is discarded — see above.
  const article = await generateArticle({
    title: post.keyword ?? post.title,
    collectionSlug,
  });

  const figures = await resolvePostFigures({
    body: article.body,
    collectionSlug,
  });

  await updatePost(postId, {
    description: article.description,
    excerpt: article.excerpt,
    body: article.body,
    tags: article.tags,
    faq: article.faq.length > 0 ? article.faq : null,
    images: figures.length > 0 ? figures : null,
    model: article.model,
    readingMinutes: article.readingMinutes,
  });

  const cover = opts?.regenerateCover
    ? await refreshCover({
        postId,
        title: post.title,
        body: article.body,
        collectionSlug,
        theme: article.collectionName ?? article.keyword,
        fallbackCover: post.cover,
      })
    : null;

  return {
    slug: post.slug,
    words: article.body.split(/\s+/).filter(Boolean).length,
    figures: figures.length,
    coverRegenerated: Boolean(cover),
  };
}

export type BlogGenResult = {
  generated: number;
  published: number;
  drafted: number;
  failed: number;
  /** Set when the run stopped early: "daily-limit" | "no-topics". */
  stoppedReason?: "daily-limit" | "no-topics";
  slugs: string[];
  errors: string[];
};

/**
 * Generate up to `max` articles. Each iteration claims a topic atomically,
 * writes the article, stores it, and marks the topic done; failures requeue the
 * topic (up to its retry cap) so one bad topic never blocks the pipeline. Honors
 * the rolling daily cap.
 */
export async function runBlogGeneration(opts: {
  max: number;
  autoPublish?: boolean;
}): Promise<BlogGenResult> {
  const autoPublish = opts.autoPublish ?? BLOG_AUTOPUBLISH;
  const res: BlogGenResult = {
    generated: 0,
    published: 0,
    drafted: 0,
    failed: 0,
    slugs: [],
    errors: [],
  };

  // Top the backlog up first so a claim below can succeed.
  await ensureQueue();

  for (let i = 0; i < opts.max; i++) {
    if (await isBlogDailyLimitReached()) {
      res.stoppedReason = "daily-limit";
      break;
    }

    const topic = await claimNextTopic();
    if (!topic) {
      if (res.generated === 0) res.stoppedReason = "no-topics";
      break;
    }

    const seed: TopicSeed = {
      title: topic.title,
      angle: topic.angle,
      collectionSlug: topic.collectionSlug,
    };

    try {
      const { postId, slug } = await generateAndStore(seed, autoPublish);
      await markTopicDone(topic.id, postId);
      res.generated++;
      res.slugs.push(slug);
      if (autoPublish) res.published++;
      else res.drafted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      await markTopicFailed(topic.id, msg);
      res.failed++;
      res.errors.push(`${topic.title}: ${msg}`);
    }
  }

  return res;
}
