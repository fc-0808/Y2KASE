/**
 * Creates the first admin user in the database.
 * Run this ONCE after setting up your Neon database and running db:push.
 *
 *   npm run seed:admin
 *
 * Usage: prompts for email + password, or use env vars:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... npm run seed:admin
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { createInterface } from "node:readline/promises";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
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

  const email =
    process.env.ADMIN_EMAIL || (await prompt("Admin email: "));
  const password =
    process.env.ADMIN_PASSWORD || (await prompt("Admin password (min 8 chars): "));

  if (!email || !password || password.length < 8) {
    throw new Error("Email and password (min 8 chars) are required.");
  }

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email.toLowerCase()),
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
      .where(eq(schema.users.email, email.toLowerCase()));
    console.log(`✓ Updated existing user to admin: ${email}`);
    return;
  }

  // Use Better Auth's internal API to create a user with proper password hashing.
  // Import auth here to avoid circular deps — it lazy-loads the DB.
  const { auth } = await import("../src/lib/auth");

  const result = await auth.api.signUpEmail({
    body: { email, password, name: "Admin" },
  });

  if (result?.user) {
    await db
      .update(schema.users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(schema.users.email, email.toLowerCase()));
    console.log(`✓ Admin user created: ${email}`);
    console.log(`  Sign in at: http://localhost:3000/admin/sign-in`);
  } else {
    throw new Error("Failed to create admin user via Better Auth.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
