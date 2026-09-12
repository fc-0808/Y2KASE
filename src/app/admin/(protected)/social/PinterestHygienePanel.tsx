"use client";

/**
 * Account hygiene for the Pinterest recovery plan: topical boards, 0-save
 * duplicate cleanup, and a slow follow drip. Saving other people's pins stays
 * a home-feed habit — the API is not a safe mass-repin tool.
 */

import { useState, useTransition } from "react";
import {
  LayoutGrid,
  UserPlus,
  Trash2,
  ScanSearch,
  AlertTriangle,
  CheckCircle2,
  Hash,
} from "lucide-react";
import type { BoardPlan } from "@/lib/social/pinterest-hygiene";
import type { FollowSnapshot } from "@/lib/social/pinterest-follow";
import {
  applyPinterestBoardHygiene,
  applyPinterestDuplicateDeletes,
  runPinterestFollowNow,
  scanPinterestDuplicates,
} from "./actions";

type ScanPreview = {
  id: string;
  title: string | null;
  reason: string;
  productKey: string;
};

export function PinterestHygienePanel({
  pinterestReady,
  boardPlan,
  follow,
  loadError,
}: {
  pinterestReady: boolean;
  boardPlan: BoardPlan | null;
  follow: FollowSnapshot | null;
  loadError?: string | null;
}) {
  const [boardPending, startBoard] = useTransition();
  const [followPending, startFollow] = useTransition();
  const [scanPending, startScan] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [boardMsg, setBoardMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [followMsg, setFollowMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [scan, setScan] = useState<{
    deleteCount: number;
    pinCount: number;
    preview: ScanPreview[];
  } | null>(null);

  const updates = boardPlan?.actions.filter((a) => a.action === "update") ?? [];
  const creates = boardPlan?.actions.filter((a) => a.action === "create") ?? [];

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-sm font-black">Pinterest hygiene</h3>
        <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
          Follow a few niche accounts a day, tighten boards to keyword titles,
          and remove 0-save duplicate stills of the same SKU. Bio rewrite and
          saving other people&apos;s pins still happen on pinterest.com — the
          API cannot patch your profile, and mass-repinning is a ban risk.
        </p>
      </div>

      {loadError && (
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs font-semibold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {loadError}
        </p>
      )}

      <div className="grid gap-0 md:grid-cols-3">
        {/* Follow */}
        <div className="border-b border-[var(--border)] px-5 py-4 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
            <UserPlus className="h-3.5 w-3.5" /> Follow drip
          </div>
          <p className="text-xl font-black tabular-nums">
            {follow ? follow.followingCount.toLocaleString() : "—"}
            <span className="ml-1 text-xs font-semibold text-[var(--foreground)]/40">
              following
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--foreground)]/55">
            {follow?.needsReconnect
              ? "Reconnect Pinterest so the token can follow (user_accounts:write)."
              : follow
                ? `${follow.followedToday}/${follow.perDay} today · ${follow.remaining.length} niche accounts left in the list.`
                : "Connect Pinterest to start a 5/day drip toward 50–100 real accounts."}
          </p>
          {follow && follow.nextUsernames.length > 0 && !follow.needsReconnect && (
            <p className="mt-1 truncate text-[11px] text-[var(--foreground)]/45">
              Next: {follow.nextUsernames.map((u) => `@${u}`).join(", ")}
            </p>
          )}
          <button
            type="button"
            disabled={
              followPending ||
              !pinterestReady ||
              !follow ||
              follow.needsReconnect ||
              !follow.enabled ||
              follow.nextUsernames.length === 0
            }
            onClick={() => {
              setFollowMsg(null);
              startFollow(async () => {
                const res = await runPinterestFollowNow();
                setFollowMsg({ ok: res.ok, text: res.message });
              });
            }}
            className="mt-3 inline-flex h-8 items-center rounded-full bg-[#E60023] px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {followPending ? "Following…" : "Follow next batch"}
          </button>
          {followMsg && (
            <p
              className={
                "mt-2 text-[11px] font-semibold " +
                (followMsg.ok ? "text-emerald-600" : "text-red-500")
              }
            >
              {followMsg.text}
            </p>
          )}
        </div>

        {/* Boards */}
        <div className="border-b border-[var(--border)] px-5 py-4 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
            <LayoutGrid className="h-3.5 w-3.5" /> Boards
          </div>
          <p className="text-xl font-black tabular-nums">
            {boardPlan ? boardPlan.publicCount : "—"}
            <span className="ml-1 text-xs font-semibold text-[var(--foreground)]/40">
              public
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--foreground)]/55">
            {boardPlan
              ? `${boardPlan.wouldUpdate} rename${boardPlan.wouldUpdate === 1 ? "" : "s"}, ${boardPlan.wouldCreate} new topical board${boardPlan.wouldCreate === 1 ? "" : "s"}. Nothing is deleted.`
              : "Keyword titles + real descriptions. 3–8 public boards."}
          </p>
          {(updates.length > 0 || creates.length > 0) && (
            <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-[var(--foreground)]/60">
              {updates.slice(0, 6).map((a) =>
                a.action === "update" ? (
                  <li key={a.id} className="truncate">
                    <Hash className="mr-1 inline h-2.5 w-2.5" />
                    {a.fromName} → {a.name}
                  </li>
                ) : null,
              )}
              {creates.slice(0, 6).map((a) =>
                a.action === "create" ? (
                  <li key={a.name} className="truncate">
                    + {a.name}
                  </li>
                ) : null,
              )}
            </ul>
          )}
          <button
            type="button"
            disabled={
              boardPending ||
              !pinterestReady ||
              !boardPlan ||
              boardPlan.wouldUpdate + boardPlan.wouldCreate === 0
            }
            onClick={() => {
              setBoardMsg(null);
              startBoard(async () => {
                const res = await applyPinterestBoardHygiene();
                setBoardMsg({ ok: res.ok, text: res.message });
              });
            }}
            className="mt-3 inline-flex h-8 items-center rounded-full border border-[var(--border)] px-3 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {boardPending ? "Updating…" : "Apply board titles"}
          </button>
          {boardMsg && (
            <p
              className={
                "mt-2 text-[11px] font-semibold " +
                (boardMsg.ok ? "text-emerald-600" : "text-red-500")
              }
            >
              {boardMsg.text}
            </p>
          )}
        </div>

        {/* Duplicates */}
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
            <Trash2 className="h-3.5 w-3.5" /> 0-save duplicates
          </div>
          <p className="text-xl font-black tabular-nums">
            {scan ? scan.deleteCount.toLocaleString() : "—"}
            <span className="ml-1 text-xs font-semibold text-[var(--foreground)]/40">
              {scan ? "to remove" : "scan first"}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--foreground)]/55">
            Keeps every video and the best still of each product. Will not empty
            the Created tab.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={scanPending || !pinterestReady}
              onClick={() => {
                setScanMsg(null);
                startScan(async () => {
                  const res = await scanPinterestDuplicates();
                  setScanMsg({ ok: res.ok, text: res.message });
                  if (res.ok && res.deleteCount != null && res.pinCount != null) {
                    setScan({
                      deleteCount: res.deleteCount,
                      pinCount: res.pinCount,
                      preview: res.preview ?? [],
                    });
                  }
                });
              }}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ScanSearch className="h-3 w-3" />
              {scanPending ? "Scanning…" : "Scan duplicates"}
            </button>
            <button
              type="button"
              disabled={
                deletePending || !scan || scan.deleteCount === 0 || !pinterestReady
              }
              onClick={() => {
                const n = scan?.deleteCount ?? 0;
                if (
                  !window.confirm(
                    `Delete ${n} 0-save duplicate still${n === 1 ? "" : "s"}? Videos and the best still of each SKU stay. This cannot be undone.`,
                  )
                ) {
                  return;
                }
                setScanMsg(null);
                startDelete(async () => {
                  const res = await applyPinterestDuplicateDeletes();
                  setScanMsg({ ok: res.ok, text: res.message });
                  if (res.ok) setScan(null);
                });
              }}
              className="inline-flex h-8 items-center rounded-full bg-rose-600 px-3 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletePending ? "Deleting…" : "Delete duplicates"}
            </button>
          </div>
          {scan && scan.preview.length > 0 && (
            <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-[var(--foreground)]/55">
              {scan.preview.slice(0, 8).map((row) => (
                <li key={row.id} className="truncate">
                  {row.title || row.productKey} — {row.reason}
                </li>
              ))}
            </ul>
          )}
          {scanMsg && (
            <p
              className={
                "mt-2 text-[11px] font-semibold " +
                (scanMsg.ok ? "text-emerald-600" : "text-red-500")
              }
            >
              {scanMsg.ok ? (
                <CheckCircle2 className="mr-1 inline h-3 w-3" />
              ) : null}
              {scanMsg.text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
