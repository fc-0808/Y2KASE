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

  // Persist first with the catalog-photo fallback cover, so a slow or failed
  // hero-image step can never block the article from being saved/published.
  const postId = await insertPost({
    slug: article.slug,
    title: article.title,
    description: article.description,
    excerpt: article.excerpt,
    body: article.body,
    cover: article.cover,
    tags: article.tags,
    status,
    faq: article.faq.length > 0 ? article.faq : null,
    keyword: article.keyword,
    source: "ai",
    model: article.model,
    readingMinutes: article.readingMinutes,
  });

  // Best-effort bespoke hero via Nano Banana Pro; upgrade the cover if it lands.
  if (isCoverGenEnabled()) {
    const coverUrl = await generateBlogCover({
      title: article.title,
      theme: article.collectionName ?? article.keyword,
    });
    if (coverUrl) await updatePost(postId, { cover: coverUrl });
  }

  return { postId, slug: article.slug, status };
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
