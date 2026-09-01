import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  getPublishedPost,
  listPublishedSlugs,
  getRelatedPosts,
  formatPostDate,
  readingMinutes,
} from "@/lib/blog";
import { JsonLd } from "@/components/JsonLd";
import { Markdown } from "@/components/Markdown";
import {
  absoluteUrl,
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  truncateDescription,
} from "@/lib/seo";

// Allow posts published after build (AI-generated) to render on-demand, then be
// cached via ISR. Editorial MDX posts are still prerendered at build time.
export const dynamicParams = true;
export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await listPublishedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Not found" };
  const canonical = `/blog/${slug}`;
  const description = truncateDescription(post.meta.description);
  const image = post.meta.cover ?? "/brand/og.webp";
  return {
    title: post.meta.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: "Y2KASE",
      locale: "en_US",
      title: post.meta.title,
      description,
      url: canonical,
      publishedTime: post.meta.date,
      modifiedTime: post.meta.modified ?? post.meta.date,
      ...(/y2kase/i.test(post.meta.author)
        ? { authors: [absoluteUrl("/about")] }
        : {}),
      section: post.meta.tags[0],
      tags: post.meta.tags,
      images: [{ url: image, alt: post.meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description,
      images: [image],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const { meta, Content, body, faq, images } = post;
  const related = await getRelatedPosts(slug);

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
            dateModified: meta.modified,
            author: meta.author,
          }),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Blog", url: "/blog" },
            { name: meta.title, url: `/blog/${slug}` },
          ]),
          ...(faq && faq.length > 0 ? [faqJsonLd(faq)] : []),
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
          {/y2kase/i.test(meta.author) ? (
            <Link
              href="/about"
              rel="author"
              className="hover:text-[var(--primary)]"
            >
              {meta.author}
            </Link>
          ) : (
            <span>{meta.author}</span>
          )}{" "}
          · {formatPostDate(meta.date)} · {readingMinutes(meta)} min read
        </p>
      </header>

      {meta.cover && (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-3xl border border-[var(--border)] bg-holo">
          <Image
            src={meta.cover}
            alt={meta.title}
            fill
            preload
            unoptimized
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {/* Body — MDX flagship posts render a component; DB posts render Markdown.
          Both inherit the same styles (see src/mdx-components.tsx). DB posts
          also carry catalog photography, interleaved between their sections. */}
      <div className="mt-2">
        {Content ? (
          <Content />
        ) : body ? (
          <Markdown source={body} figures={images} />
        ) : null}
      </div>

      {/* FAQ (DB posts) — mirrors the FAQPage structured data above. */}
      {faq && faq.length > 0 && (
        <section className="mt-14 border-t border-[var(--border)] pt-8">
          <h2 className="mb-5 text-2xl font-black">Frequently asked questions</h2>
          <div className="space-y-5">
            {faq.map((item, i) => (
              <div key={i}>
                <h3 className="text-lg font-extrabold">{item.question}</h3>
                <p className="mt-2 leading-relaxed text-[var(--foreground)]/80">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

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
