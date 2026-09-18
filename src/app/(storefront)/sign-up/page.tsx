import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

/** Alias for `/sign-in`. Password self-registration is closed; this is the public account path. */
export default function SignUpAliasPage() {
  redirect(ROUTES.signIn);
}
