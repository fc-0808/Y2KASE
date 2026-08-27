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
      {/* lg:pl-64 offsets content to the right of the fixed 256px sidebar.
          min-w-0 + overflow-x-clip stop wide flex/grid children from forcing
          horizontal scroll on the whole admin shell (phones especially). */}
      <div className="min-w-0 lg:pl-64">
        <main className="min-h-dvh min-w-0 overflow-x-clip">{children}</main>
      </div>
    </div>
  );
}
