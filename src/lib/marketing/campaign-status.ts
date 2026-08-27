/**
 * Pure campaign-status helpers — safe in both server and client bundles.
 *
 * Kept free of `server-only` so the admin UI can decide whether a stranded
 * `preparing` row is editable without importing the database module.
 */

/** How long a `preparing` claim may sit before another launch may recover it. */
export const LAUNCH_CLAIM_STALE_MS = 5 * 60_000;

/**
 * A `preparing` row whose claim has aged past the recovery window.
 *
 * Without this, a function timeout between claim and launch persistence leaves
 * a campaign permanently unlaunchable: save rejected `preparing`, so the
 * recovery branch in the claim path was unreachable.
 */
export function isRecoverablePreparingCampaign(input: {
  status: string;
  updatedAt: Date | string;
  now?: number;
}): boolean {
  if (input.status !== "preparing") return false;
  const updatedAt =
    input.updatedAt instanceof Date
      ? input.updatedAt.getTime()
      : Date.parse(input.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  return (input.now ?? Date.now()) - updatedAt >= LAUNCH_CLAIM_STALE_MS;
}

export function isDeletableMarketingCampaign(input: {
  status: string;
  resendBroadcastId?: string | null;
}): boolean {
  return (
    (input.status === "draft" || input.status === "failed") &&
    !input.resendBroadcastId
  );
}

export function isEditableMarketingCampaign(input: {
  status: string;
  resendBroadcastId?: string | null;
  updatedAt: Date | string;
  now?: number;
}): boolean {
  return (
    isDeletableMarketingCampaign(input) ||
    isRecoverablePreparingCampaign(input)
  );
}
