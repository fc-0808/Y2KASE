"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Wand2,
  RefreshCw,
  Trash2,
  Pencil,
  Eye,
  Send,
  Undo2,
  Archive,
  Plus,
  AlertTriangle,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateNow,
  generateFromKeyword,
  setStatus,
  editPost,
  removePost,
  addTopic,
  refillQueue,
  removeTopic,
  type BlogActionResult,
} from "./actions";

export type PostRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  body: string;
  cover: string | null;
  tags: string[];
  status: string;
  source: string;
  model: string | null;
  keyword: string | null;
  createdAt: string;
  publishedAt: string | null;
};

export type TopicRow = {
  id: number;
  title: string;
  angle: string | null;
  collectionSlug: string | null;
  status: string;
  priority: number;
  source: string;
  error: string | null;
  attempts: number;
};

type CollectionOption = { slug: string; label: string };

type Props = {
  posts: PostRow[];
  topics: TopicRow[];
  collections: CollectionOption[];
  dbConfigured: boolean;
  genConfigured: boolean;
  autoPublish: boolean;
  dailyLimit: number;
};

type Msg = { ok: boolean; text: string } | null;

const STATUS_TABS = ["all", "published", "draft", "archived"] as const;
type Tab = (typeof STATUS_TABS)[number];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    archived: "bg-zinc-500/15 text-zinc-500",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        styles[status] ?? "bg-muted text-foreground/60",
      )}
    >
      {status}
    </span>
  );
}

export function BlogConsole({
  posts,
  topics,
  collections,
  dbConfigured,
  genConfigured,
  autoPublish,
  dailyLimit,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [tab, setTab] = useState<Tab>("all");

  // Generate panel state
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState("");
  const [collectionSlug, setCollectionSlug] = useState("");

  // Inline editor state
  const [editing, setEditing] = useState<PostRow | null>(null);

  const queued = topics.filter((t) => t.status === "queued");
  const failedTopics = topics.filter((t) => t.status === "failed");

  const filtered =
    tab === "all" ? posts : posts.filter((p) => p.status === tab);

  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
    archived: posts.filter((p) => p.status === "archived").length,
  };

  function run(fn: () => Promise<BlogActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  const disabled = pending || !dbConfigured || !genConfigured;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Sparkles className="h-6 w-6 text-primary" />
            Blog Studio
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            AI writes catalog-grounded articles to grow organic traffic — you
            approve what goes live.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-3 py-1 font-semibold",
              autoPublish
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {autoPublish ? "Auto-publish ON" : "Review mode (drafts)"}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground/60">
            Limit {dailyLimit}/day
          </span>
        </div>
      </div>

      {/* Config warnings */}
      {!dbConfigured && (
        <Banner
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warn"
          text="DATABASE_URL is not set — run npm run db:blog after configuring the database."
        />
      )}
      {dbConfigured && !genConfigured && (
        <Banner
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warn"
          text="No text-model key set (VISION_API_KEY / OPENAI_API_KEY) — article generation is disabled."
        />
      )}

      {/* Action result */}
      {msg && (
        <Banner
          icon={msg.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          tone={msg.ok ? "ok" : "err"}
          text={msg.text}
          onClose={() => setMsg(null)}
        />
      )}

      {/* Generate panel */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/70">
          <Wand2 className="h-4 w-4 text-primary" /> Generate an article
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic or keyword, e.g. “Hello Kitty phone case ideas”"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <select
            value={collectionSlug}
            onChange={(e) => setCollectionSlug(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Feature a collection (optional)</option>
            {collections.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Angle / guidance (optional)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary sm:col-span-2"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={disabled || topic.trim().length < 5}
            onClick={() =>
              run(async () => {
                const r = await generateFromKeyword({
                  title: topic,
                  angle,
                  collectionSlug,
                  publish: false,
                });
                if (r.ok) {
                  setTopic("");
                  setAngle("");
                  setCollectionSlug("");
                }
                return r;
              })
            }
            className="btn-candy inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" /> Generate draft
          </button>
          <button
            disabled={disabled || topic.trim().length < 5}
            onClick={() =>
              run(async () => {
                const r = await generateFromKeyword({
                  title: topic,
                  angle,
                  collectionSlug,
                  publish: true,
                });
                if (r.ok) {
                  setTopic("");
                  setAngle("");
                  setCollectionSlug("");
                }
                return r;
              })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Generate &amp; publish
          </button>
          <button
            disabled={disabled}
            onClick={() => run(() => generateNow(1))}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Generate next queued
          </button>
          <button
            disabled={pending || !dbConfigured}
            onClick={() => run(() => refillQueue())}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />{" "}
            Refill backlog
          </button>
        </div>
      </section>

      {/* Posts */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition",
                tab === t
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/50 hover:bg-muted",
              )}
            >
              {t} ({counts[t]})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-foreground/50">
            No posts here yet. Generate one above ✨
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.source === "ai" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        AI
                      </span>
                    )}
                    <span className="text-[11px] text-foreground/40">
                      {p.publishedAt
                        ? `Published ${fmtDate(p.publishedAt)}`
                        : `Created ${fmtDate(p.createdAt)}`}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold">{p.title}</p>
                  <p className="truncate text-xs text-foreground/50">
                    /blog/{p.slug}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/blog/${p.slug}`}
                    target="_blank"
                    className="rounded-lg p-2 text-foreground/50 hover:bg-muted hover:text-foreground"
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg p-2 text-foreground/50 hover:bg-muted hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {p.status !== "published" ? (
                    <button
                      disabled={pending}
                      onClick={() => run(() => setStatus(p.id, "published"))}
                      className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                      title="Publish"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() => run(() => setStatus(p.id, "draft"))}
                      className="rounded-lg p-2 text-amber-600 hover:bg-amber-500/10 disabled:opacity-50"
                      title="Unpublish"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    disabled={pending}
                    onClick={() => run(() => setStatus(p.id, "archived"))}
                    className="rounded-lg p-2 text-foreground/50 hover:bg-muted disabled:opacity-50"
                    title="Archive"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete “${p.title}”? This cannot be undone.`))
                        run(() => removePost(p.id));
                    }}
                    className="rounded-lg p-2 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Topic backlog */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/70">
          <Plus className="h-4 w-4 text-primary" /> Topic backlog
          <span className="font-normal text-foreground/40">
            ({queued.length} queued)
          </span>
        </h2>

        <div className="mt-3">
          <TopicAdder
            collections={collections}
            disabled={pending || !dbConfigured}
            onAdd={(t) => run(() => addTopic(t))}
          />
        </div>

        {queued.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {queued.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">{t.title}</span>
                {t.source === "manual" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    manual
                  </span>
                )}
                <button
                  disabled={pending}
                  onClick={() => run(() => removeTopic(t.id))}
                  className="rounded p-1 text-foreground/40 hover:text-rose-500 disabled:opacity-50"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {failedTopics.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-rose-500/80">
              Failed
            </p>
            <ul className="mt-2 space-y-1.5">
              {failedTopics.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg bg-rose-500/5 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    {t.error && (
                      <span className="block truncate text-xs text-rose-500/70">
                        {t.error}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={pending}
                    onClick={() => run(() => removeTopic(t.id))}
                    className="rounded p-1 text-foreground/40 hover:text-rose-500 disabled:opacity-50"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {editing && (
        <EditModal
          post={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={(fields) =>
            run(async () => {
              const r = await editPost(fields);
              if (r.ok) setEditing(null);
              return r;
            })
          }
        />
      )}
    </div>
  );
}

function Banner({
  icon,
  text,
  tone,
  onClose,
}: {
  icon: React.ReactNode;
  text: string;
  tone: "ok" | "err" | "warn";
  onClose?: () => void;
}) {
  const tones = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    err: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium",
        tones[tone],
      )}
    >
      {icon}
      <span className="flex-1">{text}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function TopicAdder({
  collections,
  disabled,
  onAdd,
}: {
  collections: CollectionOption[];
  disabled: boolean;
  onAdd: (t: { title: string; angle?: string; collectionSlug?: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <div className="flex w-full flex-wrap gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a topic to the queue…"
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <select
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">No collection</option>
        {collections.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        disabled={disabled || title.trim().length < 5}
        onClick={() => {
          onAdd({ title, collectionSlug: slug });
          setTitle("");
          setSlug("");
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Add
      </button>
    </div>
  );
}

function EditModal({
  post,
  pending,
  onClose,
  onSave,
}: {
  post: PostRow;
  pending: boolean;
  onClose: () => void;
  onSave: (fields: {
    id: number;
    title: string;
    description: string;
    excerpt: string;
    body: string;
    cover?: string;
    tagsCsv?: string;
  }) => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [cover, setCover] = useState(post.cover ?? "");
  const [tagsCsv, setTagsCsv] = useState(post.tags.join(", "));
  const [body, setBody] = useState(post.body);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black">Edit post</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-foreground/50 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Meta description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Excerpt (card summary)">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cover image URL">
              <input
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                placeholder="/brand/hero-1.webp or https://…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input
                value={tagsCsv}
                onChange={(e) => setTagsCsv(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="Body (Markdown)">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            onClick={() =>
              onSave({
                id: post.id,
                title,
                description,
                excerpt,
                body,
                cover,
                tagsCsv,
              })
            }
            className="btn-candy inline-flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">
        {label}
      </span>
      {children}
    </label>
  );
}
