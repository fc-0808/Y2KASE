import {
  PutObjectCommand,
  DeleteObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export function makeR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function publicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) throw new Error("R2_PUBLIC_URL is not set.");
  return `${base}/${key}`;
}

export async function uploadWebpToR2(
  r2: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

export async function uploadVideoToR2(
  r2: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType = "video/mp4",
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrl(key);
}

/**
 * Recover the bucket object key from a public R2 URL we previously generated.
 * Returns null for URLs that don't belong to our public bucket (e.g. legacy
 * Etsy/Cloudinary CDN links), so callers never try to delete foreign assets.
 */
export function r2KeyFromUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return null;
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return null;
  return decodeURIComponent(url.slice(prefix.length));
}

/**
 * Delete a set of objects from the bucket. Batches into the S3 limit of 1000
 * keys per request. Safe to call with an empty list (no-op).
 */
export async function deleteObjectsFromR2(
  r2: S3Client,
  bucket: string,
  keys: string[],
): Promise<void> {
  const unique = Array.from(new Set(keys.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
