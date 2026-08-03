/**
 * Refresh the Pinterest access token and verify the API works.
 *   npx tsx scripts/refresh-pinterest-token.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { ensurePinterestAccessToken } = await import(
    "../src/lib/social/pinterest-auth"
  );
  const { recoverAuthFailedAutoPins } = await import(
    "../src/lib/social/auto-pin"
  );
  const { listBoards } = await import("../src/lib/social/pinterest");
  const { getToken } = await import("../src/lib/social/token-store");

  console.log("=== Before ===");
  const before = await getToken("pinterest");
  console.log({
    expiresAt: before?.expiresAt,
    refreshExpiresAt: before?.refreshExpiresAt,
    updatedAt: before?.updatedAt,
    accountName: before?.accountName,
  });

  console.log("\n=== Ensuring access token (force refresh) ===");
  const result = await ensurePinterestAccessToken({ force: true });
  console.log(result.ok ? { ok: true, refreshed: result.refreshed, reason: result.reason } : result);

  if (!result.ok) {
    console.error("FAILED — reconnect Pinterest at /admin/social");
    process.exit(1);
  }

  console.log("\n=== After ===");
  const after = await getToken("pinterest");
  console.log({
    expiresAt: after?.expiresAt,
    refreshExpiresAt: after?.refreshExpiresAt,
    updatedAt: after?.updatedAt,
    tokPrefix: after?.accessToken?.slice(0, 12),
  });

  console.log("\n=== API probe: list boards ===");
  const boards = await listBoards();
  console.log(
    `OK — ${boards.length} board(s):`,
    boards.slice(0, 5).map((b) => b.name),
  );

  console.log("\n=== Recovering auth-failed auto-pins ===");
  const recovered = await recoverAuthFailedAutoPins();
  console.log(`Recovered ${recovered} creative(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
