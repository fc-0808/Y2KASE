import Link from "next/link";
import Image from "next/image";
import { listPublishedPosts, formatPostDate, readingMinutes } from "@/lib/blog";
import { JsonLd } from "@/components/JsonLd";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";

// Newly published posts invalidate on demand; this is only a 24h safety net.
export const revalidate = 86400;

export const metadata = publicPageMetadata({
  title: PAGE_COPY.blog.title,
  description: PAGE_COPY.blog.description,
  path: "/blog",
});

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts();
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
            "@id": absoluteUrl("/blog#blog"),
            name: "The Y2KASE Edit",
            description: PAGE_COPY.blog.description,
            url: absoluteUrl("/blog"),
            publisher: { "@id": absoluteUrl("/#organization") },
            isPartOf: { "@id": absoluteUrl("/#website") },
            inLanguage: "en",
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
          {PAGE_COPY.blog.heading}
        </h1>
        <p className="mt-3 text-[var(--foreground)]/70">
          Everything you need to style your phone like a main character —
          straight from the Y2KASE team. ✨ First-party catalog counts live on{" "}
          <Link href="/insights" className="font-semibold text-[var(--primary)]">
            What&apos;s in the catalog
          </Link>
          . How we actually badge MagSafe is in{" "}
          <Link
            href="/blog/how-we-verify-magsafe"
            className="font-semibold text-[var(--primary)]"
          >
            How we verify MagSafe
          </Link>
          .
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
                    preload
                    unoptimized
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
                        unoptimized
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
