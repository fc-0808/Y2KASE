import type { Metadata } from "next";
import { isDbConfigured } from "@/lib/db";
import { listAllPosts, listTopics } from "@/lib/blog/store";
import { isBlogGenConfigured, BLOG_DAILY_LIMIT } from "@/lib/blog/generate";
import { BLOG_AUTOPUBLISH } from "@/lib/blog/engine";
import { getAdminCollectionOptions } from "@/lib/collections";
import { BlogConsole, type PostRow, type TopicRow } from "./BlogConsole";

export const metadata: Metadata = { title: "Blog · Admin" };

// Always render fresh so newly generated drafts appear immediately.
export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const dbConfigured = isDbConfigured();

  const [posts, topics, collectionOptions] = dbConfigured
    ? await Promise.all([listAllPosts(), listTopics(), getAdminCollectionOptions()])
    : [[], [], []];

  const postRows: PostRow[] = posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    excerpt: p.excerpt,
    body: p.body,
    cover: p.cover,
    tags: p.tags ?? [],
    status: p.status,
    source: p.source,
    model: p.model,
    keyword: p.keyword,
    createdAt: (p.createdAt ?? new Date()).toISOString(),
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  }));

  const topicRows: TopicRow[] = topics.map((t) => ({
    id: t.id,
    title: t.title,
    angle: t.angle,
    collectionSlug: t.collectionSlug,
    status: t.status,
    priority: t.priority,
    source: t.source,
    error: t.error,
    attempts: t.attempts,
  }));

  const collections = collectionOptions.map((c) => ({
    slug: c.slug,
    label: c.pathLabel,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <BlogConsole
        posts={postRows}
        topics={topicRows}
        collections={collections}
        dbConfigured={dbConfigured}
        genConfigured={isBlogGenConfigured()}
        autoPublish={BLOG_AUTOPUBLISH}
        dailyLimit={BLOG_DAILY_LIMIT}
      />
    </div>
  );
}
