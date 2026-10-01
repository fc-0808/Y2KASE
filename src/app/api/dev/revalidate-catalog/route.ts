import { NextResponse } from "next/server";
import { revalidateStorefrontCatalog } from "@/lib/cache";

/** Local-only cache bust after a catalog script. Not mounted in production. */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  revalidateStorefrontCatalog();
  return NextResponse.json({ ok: true });
}
