import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

/** Alias for `/sign-in`. Also listed in `REDIRECTS` so a config-aware host 307s first. */
export default function LoginAliasPage() {
  redirect(ROUTES.signIn);
}
