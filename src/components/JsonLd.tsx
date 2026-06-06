/**
 * Renders one or more Schema.org JSON-LD objects as a <script> tag. Server
 * component — the markup ships in the initial HTML so crawlers see it without
 * executing JavaScript.
 *
 * Keys are intentionally machine-generated objects from `@/lib/seo`, so the
 * serialized JSON is trusted. We still escape `<` to defend against any future
 * user-derived field breaking out of the script context.
 */

type JsonLdData = Record<string, unknown>;

function serialize(data: JsonLdData | JsonLdData[]): string {
  const payload = Array.isArray(data) ? data : [data];
  const json = payload.length === 1 ? payload[0] : payload;
  return JSON.stringify(json).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(data) }}
    />
  );
}
