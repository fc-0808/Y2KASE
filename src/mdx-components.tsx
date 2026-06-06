import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Global MDX component map (required by @next/mdx in the App Router).
 *
 * Maps raw markdown elements to brand-styled components so every blog post
 * inherits the Y2KASE look without per-post styling, and routes internal links
 * through next/link for client-side navigation + prefetch.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props: ComponentPropsWithoutRef<"h2">) => (
      <h2
        className="mt-10 scroll-mt-24 text-2xl font-black sm:text-3xl"
        {...props}
      />
    ),
    h3: (props: ComponentPropsWithoutRef<"h3">) => (
      <h3 className="mt-8 text-xl font-extrabold" {...props} />
    ),
    p: (props: ComponentPropsWithoutRef<"p">) => (
      <p className="mt-4 leading-relaxed text-[var(--foreground)]/80" {...props} />
    ),
    ul: (props: ComponentPropsWithoutRef<"ul">) => (
      <ul className="mt-4 list-disc space-y-2 pl-6 text-[var(--foreground)]/80" {...props} />
    ),
    ol: (props: ComponentPropsWithoutRef<"ol">) => (
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-[var(--foreground)]/80" {...props} />
    ),
    li: (props: ComponentPropsWithoutRef<"li">) => (
      <li className="leading-relaxed" {...props} />
    ),
    blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
      <blockquote
        className="mt-6 border-l-4 border-[var(--primary)] bg-[var(--muted)] px-5 py-3 italic text-[var(--foreground)]/75"
        {...props}
      />
    ),
    strong: (props: ComponentPropsWithoutRef<"strong">) => (
      <strong className="font-bold text-[var(--foreground)]" {...props} />
    ),
    hr: () => <hr className="my-10 border-[var(--border)]" />,
    img: (props: ComponentPropsWithoutRef<"img">) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mt-6 w-full rounded-2xl border border-[var(--border)]"
        alt={props.alt ?? ""}
        {...props}
      />
    ),
    a: ({ href = "#", ...rest }: ComponentPropsWithoutRef<"a">) => {
      const isInternal = href.startsWith("/") || href.startsWith("#");
      if (isInternal) {
        return (
          <Link
            href={href}
            className="font-semibold text-[var(--primary)] underline underline-offset-2"
            {...rest}
          />
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--primary)] underline underline-offset-2"
          {...rest}
        />
      );
    },
    ...components,
  };
}
