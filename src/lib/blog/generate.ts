/**
 * Blog article generator.
 *
 * Writes a full, SEO-optimised article from a topic using the chat model,
 * grounded in the real catalog so the copy references and links to pages that
 * actually exist. Output is validated hard: the Markdown is constrained to the
 * subset our renderer supports, every internal link is checked against a
 * whitelist of real routes (hallucinated/external links are demoted to plain
 * text), and the slug is made unique before it can be stored.
 *
 * Shared by the generation cron and the admin "Generate now" action so both
 * paths produce identical, brand-safe results.
 */
import OpenAI from "openai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products, productCollections, productImages } from "@/lib/db/schema";
import { slugify } from "@/lib/ai";
import { getCollectionBySlug, resolveCollectionFilterIds } from "@/lib/collections";
import { countPostsSince, slugExists } from "./store";
import { estimateReadingMinutes, type PostFaq } from "./types";

/** Max posts generated per rolling 24h — a spend + quality guardrail. */
export const BLOG_DAILY_LIMIT = Number(process.env.BLOG_DAILY_LIMIT ?? 5);
const MIN_ARTICLE_WORDS = 500;
const MAX_ARTICLE_TITLE_LENGTH = 70;

/**
 * Resolve the text-model client for article writing. Defaults to your existing
 * OpenRouter credentials (VISION_BASE_URL / VISION_API_KEY) so the blog is
 * written by Qwen, with a dedicated override for full control. Falls back to
 * OpenAI so existing setups keep working.
 */
function textClient(): { apiKey: string; baseURL?: string; model: string } {
  const apiKey =
    process.env.BLOG_TEXT_API_KEY ??
    process.env.VISION_API_KEY ??
    process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No text-model API key set (BLOG_TEXT_API_KEY / VISION_API_KEY / OPENAI_API_KEY).",
    );
  }
  const baseURL =
    process.env.BLOG_TEXT_BASE_URL || process.env.VISION_BASE_URL || undefined;
  const model = process.env.BLOG_TEXT_MODEL ?? "qwen/qwen3.7-plus";
  return { apiKey, baseURL, model };
}

export function isBlogGenConfigured(): boolean {
  return Boolean(
    process.env.BLOG_TEXT_API_KEY ??
      process.env.VISION_API_KEY ??
      process.env.OPENAI_API_KEY,
  );
}

/**
 * Tolerant JSON-object parse for LLM output. Strips ```json fences and any prose
 * around the object — essential for OpenRouter-hosted models (e.g. Qwen) that
 * may ignore `response_format` and wrap JSON in markdown.
 */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type ChatMessages = Parameters<
  OpenAI["chat"]["completions"]["create"]
>[0]["messages"];

/**
 * Run a chat completion that should return JSON. Requests structured output,
 * then transparently retries once WITHOUT `response_format` if the provider
 * rejects it (some OpenRouter models do). Returns the raw content for tolerant
 * parsing.
 */
async function chatJsonCompletion(
  client: OpenAI,
  model: string,
  messages: ChatMessages,
  temperature: number,
): Promise<string> {
  try {
    const res = await client.chat.completions.create({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages,
    });
    return res.choices[0]?.message?.content ?? "";
  } catch {
    const res = await client.chat.completions.create({
      model,
      temperature,
      messages,
    });
    return res.choices[0]?.message?.content ?? "";
  }
}

/** True if generating one more post would exceed the daily cap. */
export async function isBlogDailyLimitReached(): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return (await countPostsSince(since)) >= BLOG_DAILY_LIMIT;
}

export type TopicSeed = {
  title: string;
  angle?: string | null;
  collectionSlug?: string | null;
};

export type GeneratedArticle = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  body: string;
  tags: string[];
  faq: PostFaq[];
  cover: string | null;
  /** Featured collection name, when any — used as the hero-image theme. */
  collectionName: string | null;
  keyword: string;
  model: string;
  readingMinutes: number;
};

type CatalogContext = {
  /** Human-readable lines describing the grounding catalog data. */
  brief: string;
  /** Internal routes the article is allowed to link to. */
  allowedLinks: Set<string>;
  /** A representative product image to use as the cover, when available. */
  cover: string | null;
  /** The featured collection's display name, when resolved. */
  collectionName: string | null;
};

/** Always-valid storefront routes any post may link to. */
const BASE_LINKS = ["/", "/products", "/collections", "/blog"];

/**
 * Gather real catalog data around the topic so the model links to live pages.
 * Fails soft: with no DB (or an empty collection) the article still generates,
 * limited to the base storefront links.
 */
async function buildCatalogContext(
  collectionSlug?: string | null,
): Promise<CatalogContext> {
  const allowedLinks = new Set<string>(BASE_LINKS);
  const lines: string[] = [];
  let cover: string | null = null;
  let collectionName: string | null = null;

  if (!isDbConfigured() || !collectionSlug) {
    return {
      brief:
        "Link only to /products and /collections (no specific catalog data available).",
      allowedLinks,
      cover,
      collectionName,
    };
  }

  try {
    const collection = await getCollectionBySlug(collectionSlug);
    if (collection) {
      collectionName = collection.name;
      const path = `/collections/${collection.slug}`;
      allowedLinks.add(path);
      lines.push(
        `Featured collection: "${collection.name}" → ${path}${
          collection.description ? ` — ${collection.description}` : ""
        }`,
      );

      const ids = await resolveCollectionFilterIds(collection.slug);
      if (ids.length > 0) {
        const prod = await db
          .select({ slug: products.slug, title: products.title })
          .from(productCollections)
          .innerJoin(products, eq(products.id, productCollections.productId))
          .where(
            and(
              inArray(productCollections.collectionId, ids),
              eq(products.status, "active"),
            ),
          )
          .limit(6);

        for (const p of prod) {
          const path = `/products/${p.slug}`;
          allowedLinks.add(path);
          lines.push(`Product: "${p.title}" → ${path}`);
        }

        // Use a representative in-collection product photo as the post cover —
        // real product imagery makes the blog cards far more clickable than a
        // blank gradient, which lifts CTR into the storefront.
        const [img] = await db
          .select({ url: productImages.url })
          .from(productImages)
          .innerJoin(products, eq(products.id, productImages.productId))
          .innerJoin(
            productCollections,
            eq(productCollections.productId, products.id),
          )
          .where(
            and(
              inArray(productCollections.collectionId, ids),
              eq(products.status, "active"),
            ),
          )
          .orderBy(asc(productImages.position))
          .limit(1);
        if (img?.url) cover = img.url;
      }
    }
  } catch {
    // Degrade to base links on any DB hiccup.
  }

  return {
    brief:
      lines.length > 0
        ? lines.join("\n")
        : "Link only to /products and /collections (no specific catalog data available).",
    allowedLinks,
    cover,
    collectionName,
  };
}

const SYSTEM_PROMPT = `You are the senior content & SEO strategist for Y2KASE, a Gen-Z / Kawaii / Y2K aesthetic phone-accessories brand (phone cases, grips, charms, straps). You write genuinely useful, engaging blog articles that rank in Google and turn readers into shoppers. Voice: warm, trendy, confident, a little playful, emoji-sparing (0-3 in the whole article). Never keyword-stuff. Never invent products, prices, reviews, or facts.

Return STRICT JSON matching this TypeScript type:
{
  "title": string,        // compelling H1, <= 65 chars, includes the main keyword naturally
  "slug": string,         // lowercase, hyphenated, url-safe, <= 70 chars
  "description": string,  // meta description, 140-160 chars, includes the keyword, reads like ad copy
  "excerpt": string,      // one-sentence card summary, <= 160 chars
  "tags": string[],       // 3-6 lowercase topical tags, no '#'
  "body": string,         // the article in Markdown (see STRICT rules below)
  "faq": [ { "question": string, "answer": string } ]  // 3-4 concise, genuinely helpful Q&As
}

STRICT Markdown rules for "body":
- 600-900 words, scannable and genuinely helpful.
- Do NOT include the H1 title (it is rendered separately). Start with a short 1-2 sentence intro paragraph.
- Use ONLY these elements: '## ' and '### ' headings, paragraphs, '**bold**', '*italic*', '- ' bullet lists, '1. ' numbered lists, '> ' blockquotes, and '---' horizontal rules.
- Do NOT use images, tables, code blocks, HTML, or H1 (#).
- Include 2-4 internal links using EXACTLY the routes provided in CATALOG DATA (e.g. [Hello Kitty collection](/collections/hello-kitty)). Do NOT link to any other path and do NOT link to external websites.
- End with a short, natural call-to-action paragraph linking to /products or the featured collection.

Return ONLY the JSON object, no markdown fences.`;

/**
 * Convert any link to allowed internal targets only. Links whose href isn't in
 * the whitelist (hallucinated internal paths or external URLs) are demoted to
 * their plain anchor text — the article stays readable and can never leak a
 * broken or off-brand link.
 */
function sanitizeLinks(markdown: string, allowed: Set<string>): string {
  return markdown.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_match, text: string, href: string) => {
      const clean = href.split("#")[0].split("?")[0];
      return allowed.has(clean) || allowed.has(clean.replace(/\/$/, ""))
        ? `[${text}](${href})`
        : text;
    },
  );
}

function coerceFaq(raw: unknown): PostFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PostFaq | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const question = typeof o.question === "string" ? o.question.trim() : "";
      const answer = typeof o.answer === "string" ? o.answer.trim() : "";
      return question && answer ? { question, answer } : null;
    })
    .filter((x): x is PostFaq => x !== null)
    .slice(0, 6);
}

function coerceTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}

/** Ensure the slug is unique by suffixing -2, -3, … if needed. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || `post-${Date.now()}`;
  let candidate = root;
  for (let i = 2; i < 50 && (await slugExists(candidate)); i++) {
    candidate = `${root}-${i}`;
  }
  return candidate;
}

/**
 * Generate one complete, validated article from a topic. Throws on
 * misconfiguration or if the model returns unusable output; callers handle the
 * error (requeue the topic, surface a message).
 */
export async function generateArticle(
  topic: TopicSeed,
): Promise<GeneratedArticle> {
  const { apiKey, baseURL, model } = textClient();
  const client = new OpenAI({ apiKey, baseURL });

  const ctx = await buildCatalogContext(topic.collectionSlug);

  const userPrompt = [
    `TOPIC: ${topic.title}`,
    topic.angle ? `ANGLE: ${topic.angle}` : "",
    "",
    "CATALOG DATA (link ONLY to these routes, plus /products, /collections, /blog):",
    ctx.brief,
    "",
    "Write the article now. Return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatJsonCompletion(
    client,
    model,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    0.8,
  );

  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error(
      `Text model (${model}) returned unparseable output — check the model slug and OpenRouter credits.`,
    );
  }

  const title =
    typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : topic.title;
  if (Array.from(title).length > MAX_ARTICLE_TITLE_LENGTH) {
    throw new Error(
      `Model returned a title longer than ${MAX_ARTICLE_TITLE_LENGTH} characters.`,
    );
  }

  const rawBody = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const wordCount = rawBody.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_ARTICLE_WORDS) {
    throw new Error(
      `Model returned a thin article (${wordCount} words; minimum ${MIN_ARTICLE_WORDS}).`,
    );
  }
  const body = sanitizeLinks(rawBody, ctx.allowedLinks);

  const description = (
    typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim()
      : title
  ).slice(0, 200);

  const excerpt = (
    typeof parsed.excerpt === "string" && parsed.excerpt.trim()
      ? parsed.excerpt.trim()
      : description
  ).slice(0, 200);

  const slugBase =
    typeof parsed.slug === "string" && parsed.slug.trim()
      ? parsed.slug
      : title;
  const slug = await uniqueSlug(slugBase);

  return {
    slug,
    title,
    description,
    excerpt,
    body,
    tags: coerceTags(parsed.tags),
    faq: coerceFaq(parsed.faq),
    cover: ctx.cover,
    collectionName: ctx.collectionName,
    keyword: topic.title,
    model,
    readingMinutes: estimateReadingMinutes(body),
  };
}
