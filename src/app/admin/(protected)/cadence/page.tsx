import { redirect } from "next/navigation";
import { emailStudioHref } from "@/lib/marketing/types";

export const metadata = { title: "Admin · Email" };

/** Former standalone calendar. The Email studio owns cadence now. */
export default function AdminCadenceRedirect() {
  redirect(emailStudioHref("cadence"));
}
