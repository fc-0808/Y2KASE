"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  setPostStatus,
  deletePost,
  updatePost,
  enqueueTopics,
  deleteTopic,
  getPostById,
} from "@/lib/blog/store";
import {
  runBlogGeneration,
  generateAndStore,
  ensureQueue,
  BLOG_AUTOPUBLISH,
} from "@/lib/blog/engine";
import {
  isBlogGenConfigured,
  isBlogDailyLimitReached,
  BLOG_DAILY_LIMIT,
} from "@/lib/blog/generate";

export type BlogActionResult = {
  ok: boolean;
  message: string;
  slug?: string;
};

async function guard(): Promise<boolean> {
  return Boolean(await requireAdmin(await headers()));
}

/** Refresh both the admin console and the public blog surfaces. */
function revalidateBlog(slug?: string): void {
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the next queued topic(s) right now — mirrors exactly what the cron
 * does, for instant feedback and to seed the pipeline without waiting.
 */
export async function generateNow(max = 1): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!isBlogGenConfigured()) {
    return { ok: false, message: "OPENAI_API_KEY is not set." };
  }

  const res = await runBlogGeneration({ max: Math.min(3, Math.max(1, max)) });
  revalidateBlog();

  if (res.generated === 0) {
    if (res.stoppedReason === "daily-limit") {
      return { ok: false, message: `Daily limit reached (${BLOG_DAILY_LIMIT}).` };
    }
    if (res.stoppedReason === "no-topics") {
      return { ok: false, message: "No topics to generate. Add one below." };
    }
    return {
      ok: false,
      message: res.errors[0] ?? "Nothing was generated.",
    };
  }

  const where = BLOG_AUTOPUBLISH ? "published" : "saved as drafts";
  const tail = res.failed ? ` · ${res.failed} failed` : "";
  return {
    ok: true,
    message: `Generated ${res.generated} article${res.generated === 1 ? "" : "s"} (${where}) ✨${tail}`,
  };
}

/**
 * Generate an article for a specific keyword/topic immediately (bypasses the
 * queue). `publish` overrides BLOG_AUTOPUBLISH for this one post.
 */
export async function generateFromKeyword(input: {
  title: string;
  angle?: string;
  collectionSlug?: string;
  publish?: boolean;
}): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!isBlogGenConfigured()) {
    return { ok: false, message: "OPENAI_API_KEY is not set." };
  }
  const title = input.title.trim();
  if (title.length < 5) {
    return { ok: false, message: "Enter a topic (at least 5 characters)." };
  }
  if (await isBlogDailyLimitReached()) {
    return { ok: false, message: `Daily limit reached (${BLOG_DAILY_LIMIT}).` };
  }

  try {
    const autoPublish = input.publish ?? BLOG_AUTOPUBLISH;
    const { slug, status } = await generateAndStore(
      {
        title,
        angle: input.angle?.trim() || null,
        collectionSlug: input.collectionSlug?.trim() || null,
      },
      autoPublish,
    );
    revalidateBlog(slug);
    return {
      ok: true,
      slug,
      message:
        status === "published"
          ? "Article generated & published ✨"
          : "Draft generated — review & publish below 📝",
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Generation failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Moderation
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATUS = new Set(["draft", "published", "archived"]);

/** Publish / unpublish (draft) / archive a post. */
export async function setStatus(
  id: number,
  status: string,
): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(id) || !VALID_STATUS.has(status)) {
    return { ok: false, message: "Invalid request." };
  }
  const post = await getPostById(id);
  await setPostStatus(id, status as "draft" | "published" | "archived");
  revalidateBlog(post?.slug);
  return { ok: true, message: `Post ${status}.` };
}

/** Edit a post's copy. Tags are a comma/space separated string. */
export async function editPost(input: {
  id: number;
  title: string;
  description: string;
  excerpt: string;
  body: string;
  cover?: string;
  tagsCsv?: string;
}): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(input.id)) {
    return { ok: false, message: "Invalid post." };
  }
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || body.length < 50) {
    return { ok: false, message: "Title and a longer body are required." };
  }
  const tags = (input.tagsCsv ?? "")
    .split(/[\n,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  const post = await getPostById(input.id);
  await updatePost(input.id, {
    title,
    description: input.description.trim().slice(0, 200),
    excerpt: input.excerpt.trim().slice(0, 200),
    body,
    cover: input.cover?.trim() || null,
    tags,
  });
  revalidateBlog(post?.slug);
  return { ok: true, message: "Post updated." };
}

export async function removePost(id: number): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(id)) return { ok: false, message: "Invalid post." };
  const post = await getPostById(id);
  await deletePost(id);
  revalidateBlog(post?.slug);
  return { ok: true, message: "Post deleted." };
}

// ─────────────────────────────────────────────────────────────────────────────
// Topic backlog
// ─────────────────────────────────────────────────────────────────────────────

/** Add a high-priority topic to the queue (generated by the next run). */
export async function addTopic(input: {
  title: string;
  angle?: string;
  collectionSlug?: string;
}): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const title = input.title.trim();
  if (title.length < 5) {
    return { ok: false, message: "Enter a topic (at least 5 characters)." };
  }
  const n = await enqueueTopics([
    {
      title,
      angle: input.angle?.trim() || null,
      collectionSlug: input.collectionSlug?.trim() || null,
      priority: 100,
      source: "manual",
    },
  ]);
  revalidateBlog();
  return n > 0
    ? { ok: true, message: "Topic queued 📌" }
    : { ok: false, message: "That topic is already in the queue." };
}

/** Top up the backlog from the live catalog. */
export async function refillQueue(): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const n = await ensureQueue();
  revalidateBlog();
  return {
    ok: true,
    message:
      n > 0
        ? `Added ${n} topic${n === 1 ? "" : "s"} from your catalog 🧠`
        : "Backlog is already full.",
  };
}

export async function removeTopic(id: number): Promise<BlogActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(id)) return { ok: false, message: "Invalid topic." };
  await deleteTopic(id);
  revalidateBlog();
  return { ok: true, message: "Topic removed." };
}
