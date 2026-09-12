/**
 * Pinterest hygiene CLI — boards, 0-save duplicate stills, follow drip.
 *
 *   npx tsx scripts/pinterest-hygiene.ts
 *   npx tsx scripts/pinterest-hygiene.ts --apply-boards
 *   npx tsx scripts/pinterest-hygiene.ts --apply-deletes
 *   npx tsx scripts/pinterest-hygiene.ts --follow
 *
 * Default is a dry-run. Deletes never empty the Created tab: videos and the
 * best still of each SKU stay. Boards are never deleted.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const applyBoards = flag("--apply-boards");
  const applyDeletes = flag("--apply-deletes");
  const follow = flag("--follow");

  const { previewBoards, previewDuplicateDeletes, applyBoardPlan, applyDuplicateDeletes } =
    await import("../src/lib/social/pinterest-hygiene");
  const { getFollowSnapshot, runFollowDrip } = await import(
    "../src/lib/social/pinterest-follow"
  );

  console.log("=== Boards ===");
  const { boards, plan: boardPlan } = await previewBoards();
  console.log(
    `public boards: ${boardPlan.publicCount} · updates: ${boardPlan.wouldUpdate} · creates: ${boardPlan.wouldCreate}`,
  );
  for (const action of boardPlan.actions) {
    if (action.action === "update") {
      console.log(`  rename  ${action.fromName} → ${action.name}`);
    } else if (action.action === "create") {
      console.log(`  create  ${action.name}`);
    }
  }
  if (applyBoards) {
    const result = await applyBoardPlan(boardPlan);
    console.log("applied:", result);
    if (result.errors.length) process.exitCode = 1;
  } else {
    console.log("(dry-run — pass --apply-boards to write)");
  }

  console.log("\n=== Duplicate stills ===");
  const { pinCount, plan: dupPlan } = await previewDuplicateDeletes();
  console.log(
    `pins scanned: ${pinCount} · groups: ${dupPlan.groupsScanned} · eligible: ${dupPlan.eligibleGroups} · deletes: ${dupPlan.deletes.length}`,
  );
  const byKey = new Map<string, number>();
  for (const d of dupPlan.deletes) {
    byKey.set(d.productKey, (byKey.get(d.productKey) ?? 0) + 1);
  }
  for (const [key, n] of [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${n}× ${key}`);
  }
  if (dupPlan.deletes.length) {
    console.log("sample:");
    for (const d of dupPlan.deletes.slice(0, 8)) {
      console.log(`  - ${d.id} · ${d.title ?? "(no title)"} · ${d.reason}`);
    }
  }
  if (applyDeletes) {
    const result = await applyDuplicateDeletes(dupPlan.deletes);
    console.log("applied:", result);
    if (result.failed) process.exitCode = 1;
  } else {
    console.log("(dry-run — pass --apply-deletes to remove 0-save duplicates)");
  }

  console.log("\n=== Follow drip ===");
  const snap = await getFollowSnapshot();
  console.log({
    following: snap.followingCount,
    remaining: snap.remaining.length,
    followedToday: snap.followedToday,
    perDay: snap.perDay,
    needsReconnect: snap.needsReconnect,
    next: snap.nextUsernames,
    error: snap.error,
  });
  if (follow) {
    const result = await runFollowDrip();
    console.log("applied:", result);
    if (
      result.reason !== "ok" &&
      result.reason !== "daily-cap" &&
      result.reason !== "caught-up" &&
      result.reason !== "disabled"
    ) {
      process.exitCode = 1;
    }
  } else {
    console.log("(dry-run — pass --follow to follow today's batch)");
  }

  console.log("\nBoards on account:");
  for (const b of boards) {
    console.log(`  [${b.privacy ?? "PUBLIC"}] ${b.name} (${b.id})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
