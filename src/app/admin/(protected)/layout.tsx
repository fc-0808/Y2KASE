import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { AdminNavbar } from "@/components/admin/AdminNavbar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This is the REAL security boundary — not proxy.ts.
  // Every request to /admin/* EXCEPT /admin/sign-in passes through here.
  const session = await requireAdmin(await headers());
  if (!session) {
    redirect("/admin/sign-in");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AdminNavbar user={session.user} />
      <main className="flex-1 bg-[var(--background)]">{children}</main>
    </div>
  );
}
