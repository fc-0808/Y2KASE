import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * A tiny, safe Markdown renderer for database-backed blog posts.
 *
 * MDX flagship posts render through @next/mdx at build time; AI-generated posts
 * are stored as plain Markdown and rendered here at request time. Rather than
 * pull in a runtime MDX compiler (heavy, fragile on serverless) or convert to
 * HTML + sanitize (an XSS surface), this parser builds React elements directly
 * from a constrained Markdown subset — the same subset the generator is
 * instructed to emit — so untrusted model output can never inject markup. The
 * element styling matches `src/mdx-components.tsx` so DB and MDX posts look
 * identical.
 *
 * Supported: '## '/'### ' headings, paragraphs, '**bold**', '*italic*'/'_italic_',
 * '[text](href)' links, '- '/'* ' bullet lists, '1. ' ordered lists,
 * '> ' blockquotes, and '---' horizontal rules.
 */

const LINK_CLASS =
  "font-semibold text-[var(--primary)] underline underline-offset-2";

/** Parse inline spans (links, bold, italic) into React nodes. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let idx = 0;

  const patterns: { type: "link" | "bold" | "italic"; re: RegExp }[] = [
    { type: "link", re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
    { type: "bold", re: /\*\*([^*]+?)\*\*/ },
    { type: "italic", re: /\*([^*]+?)\*|_([^_]+?)_/ },
  ];

  while (rest.length > 0) {
    let best: { type: string; match: RegExpExecArray } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (best === null || m.index < best.match.index)) {
        best = { type: p.type, match: m };
      }
    }

    if (!best) {
      nodes.push(rest);
      break;
    }

    const { type, match } = best;
    if (match.index > 0) nodes.push(rest.slice(0, match.index));

    const key = `${keyBase}-${idx++}`;
    if (type === "link") {
      const label = match[1];
      const href = match[2];
      const isInternal = href.startsWith("/") || href.startsWith("#");
      nodes.push(
        isInternal ? (
          <Link key={key} href={href} className={LINK_CLASS}>
            {renderInline(label, key)}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(label, key)}
          </a>
        ),
      );
    } else if (type === "bold") {
      nodes.push(
        <strong key={key} className="font-bold text-[var(--foreground)]">
          {renderInline(match[1], key)}
        </strong>,
      );
    } else {
      const inner = match[1] ?? match[2] ?? "";
      nodes.push(<em key={key}>{renderInline(inner, key)}</em>);
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return nodes;
}

type Block =
  | { kind: "h2" | "h3" | "p" | "blockquote"; text: string }
  | { kind: "hr" }
  | { kind: "ul" | "ol"; items: string[] };

const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.*)$/;

/** Group raw Markdown lines into block-level structures. */
function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ kind: "blockquote", text: quote.join(" ").trim() });
      quote = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push(list);
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushAll();
      continue;
    }
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      flushAll();
      blocks.push({ kind: "hr" });
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushAll();
      blocks.push({ kind: "h3", text: trimmed.slice(4).trim() });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushAll();
      blocks.push({ kind: "h2", text: trimmed.slice(3).trim() });
      continue;
    }
    // Strip a stray H1 (title is rendered separately) → treat as h2.
    if (trimmed.startsWith("# ")) {
      flushAll();
      blocks.push({ kind: "h2", text: trimmed.slice(2).trim() });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (!list || list.kind !== "ul") {
        flushList();
        list = { kind: "ul", items: [] };
      }
      list.items.push(bullet[1].trim());
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (!list || list.kind !== "ol") {
        flushList();
        list = { kind: "ol", items: [] };
      }
      list.items.push(ordered[1].trim());
      continue;
    }

    // Plain text → accumulate into the current paragraph.
    flushQuote();
    flushList();
    paragraph.push(trimmed);
  }

  flushAll();
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <>
      {blocks.map((block, i) => {
        const key = `b-${i}`;
        switch (block.kind) {
          case "h2":
            return (
              <h2
                key={key}
                className="mt-10 scroll-mt-24 text-2xl font-black sm:text-3xl"
              >
                {renderInline(block.text, key)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} className="mt-8 text-xl font-extrabold">
                {renderInline(block.text, key)}
              </h3>
            );
          case "p":
            return (
              <p
                key={key}
                className="mt-4 leading-relaxed text-[var(--foreground)]/80"
              >
                {renderInline(block.text, key)}
              </p>
            );
          case "blockquote":
            return (
              <blockquote
                key={key}
                className="mt-6 border-l-4 border-[var(--primary)] bg-[var(--muted)] px-5 py-3 italic text-[var(--foreground)]/75"
              >
                {renderInline(block.text, key)}
              </blockquote>
            );
          case "hr":
            return <hr key={key} className="my-10 border-[var(--border)]" />;
          case "ul":
            return (
              <ul
                key={key}
                className="mt-4 list-disc space-y-2 pl-6 text-[var(--foreground)]/80"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="leading-relaxed">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={key}
                className="mt-4 list-decimal space-y-2 pl-6 text-[var(--foreground)]/80"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="leading-relaxed">
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          default:
            return <Fragment key={key} />;
        }
      })}
    </>
  );
}
