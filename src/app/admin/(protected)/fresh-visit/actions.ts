"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { freshVisitPath, mintFreshVisitToken } from "@/lib/preview/fresh-visit";
import { normalizeLandingPath } from "@/lib/preview/visitor-state";

export type FreshVisitLink = {
  /** Root-relative link the console renders and copies. */
  href: string;
  /** The normalised path the visit will land on. */
  path: string;
  /** Whether the resulting session is excluded from Visitors analytics. */
  excludeFromAnalytics: boolean;
  /** Epoch milliseconds at which the link stops working. */
  expiresAt: number;
};

export type FreshVisitLinkResult =
  | { ok: true; link: FreshVisitLink }
  | { ok: false; message: string };

/**
 * Mint a fresh-visit link for the operator.
 *
 * A Server Action is a public endpoint of its own, so the admin check is
 * repeated here rather than inherited from the layout that renders the form.
 * Without it, the analytics-exclusion flag would be mintable by anyone who
 * knows the action id.
 */
export async function createFreshVisitLink(input: {
  path: string;
  excludeFromAnalytics: boolean;
}): Promise<FreshVisitLinkResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }

  const path = normalizeLandingPath(input.path);
  if (!path) {
    return {
      ok: false,
      message:
        "Enter a storefront path that starts with “/” — /admin and /api pages can't be previewed as a shopper.",
    };
  }

  const excludeFromAnalytics = input.excludeFromAnalytics === true;
  const minted = mintFreshVisitToken({ path, excludeFromAnalytics });

  return {
    ok: true,
    link: {
      href: freshVisitPath(minted.token),
      path,
      excludeFromAnalytics,
      expiresAt: minted.expiresAt,
    },
  };
}
