import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { Agent, fetch as undiciFetch } from "undici";
import * as schema from "./schema";

/**
 * Node's built-in fetch gives up on a new TCP connection after 10 seconds.
 * Waking a suspended Neon compute often takes longer than that, so the first
 * page after a quiet stretch throws `fetch failed` and 500s. This agent waits.
 */
function createNeonAgent() {
  return new Agent({
    connectTimeout: 30_000,
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
    // Neon closes idle HTTP sockets. Reusing one makes the next query sit
    // until headersTimeout and then throw `fetch failed`.
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
    connections: 8,
    pipelining: 1,
  });
}

let neonAgent = createNeonAgent();

function replaceNeonAgent() {
  const dead = neonAgent;
  neonAgent = createNeonAgent();
  void dead.close().catch(() => undefined);
}

let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * `@neondatabase/serverless` speaks HTTP to the Neon proxy. The `-pooler`
 * hostname is PgBouncer, and that host rejects the HTTP query — the failure
 * is `fetch failed`, then every page that needs the database 500s, including
 * admin session checks. Strip only that hostname suffix. A direct URL is
 * unchanged. The password and the rest of the string are left as written.
 */
export function neonHttpConnectionString(connectionString: string): string {
  return connectionString.replace(/-pooler(?=\.c-)/, "");
}

function isTransientFetch(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (/fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|socket hang up|network/i.test(message)) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/**
 * The Neon HTTP API drops extra simultaneous connections. A homepage fires
 * several catalog queries at once; the extras sit until the connect timeout
 * and then throw `fetch failed`. Two at a time overlaps work without opening
 * a pile of sockets that never connect.
 */
const MAX_NEON_FETCHES = 2;
let neonFetchesInFlight = 0;
const neonFetchQueue: Array<() => void> = [];

function acquireNeonFetch(): Promise<void> {
  if (neonFetchesInFlight < MAX_NEON_FETCHES) {
    neonFetchesInFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    neonFetchQueue.push(() => resolve());
  });
}

function releaseNeonFetch() {
  const next = neonFetchQueue.shift();
  if (next) {
    next();
    return;
  }
  neonFetchesInFlight -= 1;
}

function neonFetch(input: RequestInfo | URL, init?: RequestInit) {
  return undiciFetch(input, {
    ...(init ?? {}),
    dispatcher: neonAgent,
  });
}

async function neonFetchWithRetry(input: RequestInfo | URL, init: RequestInit | undefined, pauseMs: number) {
  try {
    return await neonFetch(input, init);
  } catch (error) {
    if (!isTransientFetch(error)) throw error;
    replaceNeonAgent();
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return neonFetch(input, init);
  }
}

neonConfig.fetchFunction = (async (input: RequestInfo | URL, init?: RequestInit) => {
  await acquireNeonFetch();
  try {
    return await neonFetchWithRetry(input, init, 1_200);
  } finally {
    releaseNeonFetch();
  }
}) as typeof neonConfig.fetchFunction;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to .env.local.",
    );
  }
  _db = drizzle(neon(neonHttpConnectionString(connectionString)), { schema });
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
