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
    <div className="min-h-dvh bg-background">
      <AdminNavbar user={session.user} />
      {/* lg:pl-64 offsets content to the right of the fixed 256px sidebar */}
      <div className="lg:pl-64">
        <main className="min-h-dvh">{children}</main>
      </div>
    </div>
  );
}
