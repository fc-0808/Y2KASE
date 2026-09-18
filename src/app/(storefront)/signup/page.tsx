import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  robots: PRIVATE_PAGE_ROBOTS,
};

/** Compact alias for `/sign-in`. */
export default function SignupAliasPage() {
  redirect(ROUTES.signIn);
}
