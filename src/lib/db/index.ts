import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Lazily create the Drizzle client. We don't throw at import time so that
 * pages can render gracefully (with empty states) before the database is
 * configured. The error only surfaces when a query is actually attempted.
 */
function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
    );
  }
  _db = drizzle(neon(connectionString), { schema });
  return _db;
}

export const isDbConfigured = () => Boolean(process.env.DATABASE_URL);

/** Proxy so existing `db.query...` call sites keep working with lazy init. */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
