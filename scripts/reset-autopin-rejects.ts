/**
 * Reset auto-pin rows rejected by auth outages or invalid local destination URLs.
 *   npx tsx scripts/reset-autopin-rejects.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    UPDATE social_creatives
    SET attempts = 0, last_error = NULL, status = 'rejected', updated_at = now()
    WHERE platform = 'pinterest'
      AND model = 'auto-pin'
      AND status = 'rejected'
      AND (
        last_error ILIKE '%localhost%'
        OR last_error ILIKE '%not a valid URL%'
        OR last_error ILIKE '%Authentication failed%'
        OR last_error ILIKE '%API 401%'
        OR last_error ILIKE '%unauthorized%'
      )
    RETURNING id, left(product_title, 40) AS title
  `;
  console.log(`Reset ${rows.length} creative(s).`);
  console.log(rows.slice(0, 15));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
