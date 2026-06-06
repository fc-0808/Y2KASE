import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getPost,
  getAllPostSlugs,
  getRelatedPosts,
  formatPostDate,
  readingMinutes,
} from "@/lib/blog";
import { JsonLd } from "@/components/JsonLd";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Not found" };
  const canonical = `/blog/${slug}`;
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.meta.title,
      description: post.meta.description,
      url: canonical,
      publishedTime: post.meta.date,
      authors: [post.meta.author],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { meta, Content } = post;
  const related = getRelatedPosts(slug);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <JsonLd
        data={[
          articleJsonLd({
            title: meta.title,
            description: meta.description,
            url: `/blog/${slug}`,
            image: meta.cover,
            datePublished: meta.date,
            author: meta.author,
          }),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Blog", url: "/blog" },
            { name: meta.title, url: `/blog/${slug}` },
          ]),
        ]}
      />

      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ChevronLeft className="h-4 w-4" /> The Y2KASE Edit
      </Link>

      <header>
        {meta.tags.length > 0 && (
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">
            {meta.tags[0]}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
          {meta.title}
        </h1>
        <p className="mt-3 text-sm font-semibold text-[var(--foreground)]/55">
          {meta.author} · {formatPostDate(meta.date)} · {readingMinutes(meta)} min
          read
        </p>
      </header>

      {meta.cover && (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-3xl border border-[var(--border)] bg-holo">
          <Image
            src={meta.cover}
            alt={meta.title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {/* MDX body — styled via src/mdx-components.tsx */}
      <div className="mt-2">
        <Content />
      </div>

      {/* Related reading */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-[var(--border)] pt-8">
          <h2 className="mb-5 text-xl font-black">Keep reading</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]"
              >
                <p className="text-sm font-bold leading-snug transition group-hover:text-[var(--primary)]">
                  {r.meta.title}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--foreground)]/60">
                  {r.meta.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Conversion nudge */}
      <section className="mt-12 rounded-3xl border-2 border-white bg-holo-shimmer p-8 text-center">
        <h2 className="font-display text-2xl font-extrabold">
          Ready to express your vibe?
        </h2>
        <p className="mt-2 text-[var(--foreground)]/75">
          Shop kawaii & Y2K phone cases, charms and accessories.
        </p>
        <Link
          href="/products"
          className="btn-candy mt-5 inline-flex items-center gap-2 px-7 py-3"
        >
          Shop the collection ✨
        </Link>
      </section>
    </article>
  );
}
