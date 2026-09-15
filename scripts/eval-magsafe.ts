/**
 * Offline evaluation of the MagSafe verifier against a hand-labelled set.
 *
 *   npm run eval:magsafe
 *
 * The verifier is the only thing standing between a hallucinated magnet ring and
 * a customer buying a case their charger falls off. Prompt changes to it are
 * therefore measured, not eyeballed: this runs `verifyMagSafe` over products a
 * human has inspected and reports precision, recall and every disagreement.
 *
 * Labels were established by opening each product's photos and looking for the
 * magnet array. Keep the rationale next to the label — it is the only way a
 * future maintainer can tell a mislabelled fixture from a real regression.
 *
 * LABEL AT FULL RESOLUTION. The first version of this set had two products
 * labelled "not MagSafe" from a contact sheet of 420px thumbnails; at 900px both
 * turned out to have an obvious magnet ring with a grip seated on it. The model
 * was right and the fixtures were wrong, which for a while made a better model
 * look like a precision regression. If a verdict disagrees with a label, re-open
 * the photo at full size before touching the prompt.
 *
 * This costs a few cents per run (high-detail vision over ~8 products), so it is
 * a local tool rather than a CI gate. The pure, free assertions live in
 * `npm run check:guards`.
 *
 * Adding fixtures: pick products where the answer is unambiguous from the
 * photos. Genuinely borderline items make the metric noisy without making the
 * classifier better.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { verifyMagSafe } from "../src/lib/ai";
import { decideMagSafe } from "../src/lib/catalog/magsafe";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import { readCount } from "./lib/cli";

type Fixture = { id: number; magsafe: boolean; why: string };

const FIXTURES: Fixture[] = [
  // ── Positives: a magnet ring or a magnetically-attached accessory is visible ──
  {
    id: 131,
    magsafe: true,
    why: "pink magnet ring centred on the back, plus a star stand shown sticking magnetically",
  },
  {
    id: 133,
    magsafe: true,
    why: "magnet ring visible through the clear back, with a pop-out stand seated on it",
  },
  {
    id: 128,
    magsafe: true,
    why: "Hello Kitty stand mounted on a circular magnet puck, shown attached to the back",
  },
  {
    id: 130,
    magsafe: true,
    why: "heart grip on a circular magnet base, shown seated on the case back",
  },
  {
    id: 20,
    magsafe: true,
    why: "purple magnet ring on the back with a Monchhichi grip seated on it — only legible at full resolution (image 6)",
  },
  {
    id: 98,
    magsafe: true,
    why: "same Monchhichi design as #20 (duplicate ingest); charm sits on a raised circular magnet disc (image 12)",
  },

  // ── Negatives: flat back, decoration only ─────────────────────────────────
  {
    id: 117,
    magsafe: false,
    why: "grid-print case with star confetti; back verified flat and ringless at full resolution",
  },
  {
    id: 105,
    magsafe: false,
    why: "sticker-collage clear case; back verified flat and ringless at full resolution",
  },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const runs = readCount("runs") ?? 1;
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 4);

  const rows = await db.query.products.findMany({
    where: inArray(
      products.id,
      FIXTURES.map((f) => f.id),
    ),
    columns: { id: true, title: true },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (i, { asc }) => asc(i.position),
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  console.log(
    `\nMagSafe verifier evaluation — ${FIXTURES.length} labelled products` +
      `${runs > 1 ? `, ${runs} runs each` : ""}, model ${process.env.OPENAI_VISION_MODEL ?? "qwen/qwen3.8-flash"}\n`,
  );

  // Graded on the routing decision, not the raw boolean, because that is what
  // reaches a customer: `confirmed` publishes the badge, `review` shows a human,
  // `none` is silently dropped.
  const cell = { confirmed: 0, review: 0, none: 0 };
  const tally = { positive: { ...cell }, negative: { ...cell } };
  let missing = 0;
  let unverifiable = 0;
  const badPublishes: string[] = [];

  const work = FIXTURES.flatMap((f) => Array.from({ length: runs }, () => f));

  await mapWithConcurrency(work, concurrency, async (fixture) => {
    const row = byId.get(fixture.id);
    if (!row || row.images.length === 0) {
      missing++;
      console.log(`  ? #${fixture.id} not in catalogue — fixture is stale`);
      return;
    }

    const verdict = await verifyMagSafe(row.images.map((i) => i.url));
    if (!verdict) {
      unverifiable++;
      console.log(`  ? #${fixture.id} verifier unavailable`);
      return;
    }

    const decision = decideMagSafe({ human: false, verifier: verdict });
    tally[fixture.magsafe ? "positive" : "negative"][decision]++;

    // A wrong badge on the storefront is the only unacceptable outcome; a
    // borderline product landing in the review queue is the system working.
    const wrongPublish = !fixture.magsafe && decision === "confirmed";
    const silentMiss = fixture.magsafe && decision === "none";
    const mark = wrongPublish ? "✗" : silentMiss ? "–" : "✓";

    const line =
      `  ${mark} #${String(fixture.id).padStart(3)} ` +
      `expected ${fixture.magsafe ? "YES" : "no "} · ` +
      `${decision.padEnd(9)} (${verdict.magsafe ? "yes" : "no"}/${verdict.confidence}/${verdict.evidence}) ` +
      `${row.title.slice(0, 34)}`;
    console.log(line);
    if (wrongPublish) {
      badPublishes.push(`${line}\n        label rationale: ${fixture.why}`);
    }
  });

  const pos = tally.positive;
  const neg = tally.negative;
  const published = pos.confirmed + neg.confirmed;
  const publishPrecision = published > 0 ? pos.confirmed / published : 1;
  const positives = pos.confirmed + pos.review + pos.none;
  const surfaced = positives > 0 ? (pos.confirmed + pos.review) / positives : 1;

  if (badPublishes.length > 0) {
    console.log("\n  Wrongly published:");
    for (const d of badPublishes) console.log(d);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                     confirmed   review   dropped
  truly MagSafe   :  ${String(pos.confirmed).padStart(6)}   ${String(pos.review).padStart(6)}   ${String(pos.none).padStart(7)}
  not MagSafe     :  ${String(neg.confirmed).padStart(6)}   ${String(neg.review).padStart(6)}   ${String(neg.none).padStart(7)}
${missing > 0 ? `  Stale fixtures: ${missing}\n` : ""}${unverifiable > 0 ? `  Unverifiable: ${unverifiable}\n` : ""}
  Badge precision : ${(publishPrecision * 100).toFixed(1)}%   of auto-confirmed products that really are MagSafe
  Surfaced        : ${(surfaced * 100).toFixed(1)}%   of MagSafe products a human at least gets to see
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Badge precision is the number that must stay at 100%: a wrong badge sells a
  case whose charger falls off. A true MagSafe product landing in "review" is
  the system working, not a failure — only "dropped" loses information.
`);

  // Only a wrong badge fails the run. Review-queue placement is a success.
  process.exit(neg.confirmed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
