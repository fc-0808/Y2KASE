/**
 * Creates the first admin user in the database.
 * Run this ONCE after setting up your Neon database and running db:push.
 *
 *   npm run seed:admin
 *
 * Usage: prompts for email + password, or use env vars:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run seed:admin
 *
 * The rows are written directly rather than through `auth.api.signUpEmail()`,
 * for two reasons:
 *
 *  1. Public email/password registration is disabled (see `disableSignUp` in
 *     src/lib/auth.ts). Going through the sign-up route would mean leaving an
 *     open registration endpoint on the internet purely so a one-off setup
 *     script could work. Better Auth's password hashing is still the single
 *     source of truth — we borrow it from `auth.$context`.
 *
 *  2. The sign-up route marks new accounts `emailVerified: false`. Better Auth
 *     refuses to link an OAuth provider into an unverified local account (an
 *     anti-hijacking rule), so a seeded admin could never later sign in with
 *     Google — it failed with `account_not_linked`. We own this mailbox by
 *     definition, so the seeded row is created verified.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** 32-char id, matching the format Better Auth generates for its own rows. */
function generateId(): string {
  return randomBytes(16).toString("hex");
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const db = drizzle(neon(databaseUrl), { schema });

  const rawEmail = process.env.ADMIN_EMAIL || (await prompt("Admin email: "));
  const password =
    process.env.ADMIN_PASSWORD ||
    (await prompt("Admin password (min 8 chars): "));
  const email = rawEmail.toLowerCase();

  if (!email || !password || password.length < 8) {
    throw new Error("Email and password (min 8 chars) are required.");
  }

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
    columns: { id: true, role: true },
  });

  if (existing) {
    if (existing.role === "admin") {
      console.log(`✓ Admin already exists: ${email}`);
      return;
    }
    await db
      .update(schema.users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(schema.users.email, email));
    console.log(`✓ Updated existing user to admin: ${email}`);
    return;
  }

  // Borrow Better Auth's configured hasher so the stored credential is byte-for
  // byte what its own sign-in route will verify against.
  const { auth } = await import("../src/lib/auth");
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(password);

  const userId = generateId();

  await db.insert(schema.users).values({
    id: userId,
    name: "Admin",
    email,
    emailVerified: true,
    role: "admin",
    isAnonymous: false,
  });

  // Better Auth models an email/password credential as an account row whose
  // providerId is "credential" and whose accountId mirrors the user id.
  await db.insert(schema.accounts).values({
    id: generateId(),
    issuer: "local:credential",
    accountId: userId,
    providerId: "credential",
    userId,
    password: passwordHash,
  });

  console.log(`✓ Admin user created: ${email}`);
  console.log(`  Sign in at: http://localhost:3000/admin/sign-in`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
