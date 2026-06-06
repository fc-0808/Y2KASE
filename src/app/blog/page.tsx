import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getAllPosts, formatPostDate, readingMinutes } from "@/lib/blog";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "The Y2KASE Edit — Blog",
  description:
    "Style guides, trend reports and how-tos for kawaii & Y2K phone cases, charms and accessories — from the Y2KASE team.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    title: "The Y2KASE Edit — Blog",
    description:
      "Style guides, trend reports and how-tos for kawaii & Y2K phone cases and accessories.",
    url: "/blog",
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Blog", url: "/blog" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "The Y2KASE Edit",
            url: absoluteUrl("/blog"),
            blogPost: posts.map((p) => ({
              "@type": "BlogPosting",
              headline: p.meta.title,
              url: absoluteUrl(`/blog/${p.slug}`),
              datePublished: p.meta.date,
            })),
          },
        ]}
      />

      <header className="mb-10 max-w-2xl">
        <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
          The Y2KASE Edit
        </p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">
          Style guides, trends & how-tos
        </h1>
        <p className="mt-3 text-[var(--foreground)]/70">
          Everything you need to style your phone like a main character —
          straight from the Y2KASE team. ✨
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-[var(--foreground)]/60">No posts yet — check back soon!</p>
      ) : (
        <>
          {/* Featured post */}
          {featured && (
            <Link
              href={`/blog/${featured.slug}`}
              className="group mb-10 grid overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] transition hover:border-[var(--primary)] md:grid-cols-2"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-holo md:aspect-auto">
                {featured.meta.cover && (
                  <Image
                    src={featured.meta.cover}
                    alt={featured.meta.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">
                  Featured
                </span>
                <h2 className="mt-2 text-2xl font-black leading-tight">
                  {featured.meta.title}
                </h2>
                <p className="mt-3 text-[var(--foreground)]/70">
                  {featured.meta.excerpt}
                </p>
                <p className="mt-4 text-xs font-semibold text-[var(--foreground)]/50">
                  {formatPostDate(featured.meta.date)} ·{" "}
                  {readingMinutes(featured.meta)} min read
                </p>
              </div>
            </Link>
          )}

          {/* Rest */}
          {rest.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] transition hover:-translate-y-1 hover:border-[var(--primary)]"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-holo">
                    {post.meta.cover && (
                      <Image
                        src={post.meta.cover}
                        alt={post.meta.title}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-lg font-black leading-snug transition group-hover:text-[var(--primary)]">
                      {post.meta.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--foreground)]/70">
                      {post.meta.excerpt}
                    </p>
                    <p className="mt-auto pt-4 text-xs font-semibold text-[var(--foreground)]/50">
                      {formatPostDate(post.meta.date)} ·{" "}
                      {readingMinutes(post.meta)} min read
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
