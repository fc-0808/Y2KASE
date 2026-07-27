import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { normalizeThumbnail } from "@/lib/catalog/normalize-thumbnail";
import { makeR2Client, uploadWebpToR2 } from "@/lib/catalog/r2";
import { setUploadedProposal } from "@/lib/admin/thumbnails";

// Sharp needs the Node runtime (not edge).
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

/**
 * Admin-only manual thumbnail upload. Accepts a multipart image, normalizes it
 * to the standard 4:5 white thumbnail, stores it in R2, and records it as a
 * "proposed" proposal so it's approved through the same review flow.
 */
export async function POST(request: NextRequest) {
  const session = await requireAdmin(request.headers);
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Not authorized." },
      { status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid upload." },
      { status: 400 },
    );
  }

  const productId = Number(form.get("productId"));
  const file = form.get("file");
  if (!Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json(
      { ok: false, message: "Invalid product." },
      { status: 400 },
    );
  }
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, message: "Please choose an image file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, message: "Image is too large (max 15 MB)." },
      { status: 400 },
    );
  }

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    return NextResponse.json(
      { ok: false, message: "Storage is not configured." },
      { status: 500 },
    );
  }

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeThumbnail(input);
    const r2 = makeR2Client();
    const key = `products/manual/${productId}-${Date.now()}.webp`;
    const url = await uploadWebpToR2(r2, bucket, key, normalized);
    await setUploadedProposal(productId, url);
    revalidatePath("/admin/products/thumbnails");
    return NextResponse.json({ ok: true, message: "Uploaded — review it below." });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 },
    );
  }
}
