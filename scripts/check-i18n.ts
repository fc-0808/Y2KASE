/**
 * Message catalogue integrity check — run via `npm run i18n:check`.
 *
 * Catalogue drift is the defining failure mode of a multi-locale project: a key
 * gets added in English, nobody translates it, and six months later a shopper in
 * Osaka hits a raw `popup.headingClaim` where a heading should be. TypeScript
 * cannot catch it because the catalogues are JSON, so it gets caught here.
 *
 * Three classes of bug, in increasing order of how easy they are to miss:
 *
 *   1. MISSING / EXTRA KEYS — English is the source of truth; every other
 *      catalogue must have exactly the same key set.
 *   2. EMPTY VALUES — a key that exists but is blank renders as nothing, which
 *      looks like a layout bug rather than a translation bug.
 *   3. PLACEHOLDER MISMATCH — the subtle one. If English says
 *      "Copy discount code {code}" and a translation drops `{code}`, the string
 *      renders with the interpolation silently missing. Comparing placeholder
 *      sets per key is the only way to see it without reading every line.
 *
 * Exits non-zero on any failure so it can gate a build.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { LOCALES, DEFAULT_LOCALE } from "../src/i18n/locales";

const MESSAGES_DIR = path.join(process.cwd(), "src", "messages");

type Json = { [key: string]: string | Json };

function load(locale: string): Json {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Json;
}

/** Flatten nested catalogues into `a.b.c` → value pairs. */
function flatten(obj: Json, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(full, value);
    else for (const [k, v] of flatten(value, full)) out.set(k, v);
  }
  return out;
}

/** ICU placeholders used in a message, e.g. "{code}" → {"code"}. */
function placeholders(message: string): Set<string> {
  return new Set(
    [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]).filter(Boolean),
  );
}

const problems: string[] = [];
function fail(message: string) {
  problems.push(message);
}

// Every declared locale must have a catalogue, and every catalogue must be a
// declared locale — an orphan file is dead weight nobody will remember to keep
// translated.
const onDisk = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

for (const locale of LOCALES) {
  if (!onDisk.includes(locale)) fail(`Missing catalogue: src/messages/${locale}.json`);
}
for (const file of onDisk) {
  if (!(LOCALES as readonly string[]).includes(file)) {
    fail(`Orphan catalogue not in the locale registry: src/messages/${file}.json`);
  }
}

if (problems.length > 0) {
  console.error("i18n check failed:\n" + problems.map((p) => `  • ${p}`).join("\n"));
  process.exit(1);
}

const source = flatten(load(DEFAULT_LOCALE));
console.log(
  `Source locale "${DEFAULT_LOCALE}": ${source.size} keys across ${LOCALES.length} locales.\n`,
);

for (const locale of LOCALES) {
  if (locale === DEFAULT_LOCALE) continue;

  const target = flatten(load(locale));
  const localeProblems: string[] = [];

  for (const [key, sourceValue] of source) {
    const value = target.get(key);

    if (value === undefined) {
      localeProblems.push(`missing key "${key}"`);
      continue;
    }
    if (value.trim() === "") {
      localeProblems.push(`empty value for "${key}"`);
      continue;
    }

    const expected = placeholders(sourceValue);
    const actual = placeholders(value);
    const dropped = [...expected].filter((p) => !actual.has(p));
    const invented = [...actual].filter((p) => !expected.has(p));

    if (dropped.length > 0) {
      localeProblems.push(`"${key}" drops placeholder(s): ${dropped.join(", ")}`);
    }
    if (invented.length > 0) {
      localeProblems.push(
        `"${key}" adds unknown placeholder(s): ${invented.join(", ")}`,
      );
    }
  }

  for (const key of target.keys()) {
    if (!source.has(key)) localeProblems.push(`extra key not in ${DEFAULT_LOCALE}: "${key}"`);
  }

  if (localeProblems.length === 0) {
    console.log(`  PASS  ${locale}  (${target.size} keys)`);
  } else {
    console.log(`  FAIL  ${locale}`);
    for (const p of localeProblems) console.log(`          ${p}`);
    problems.push(...localeProblems.map((p) => `${locale}: ${p}`));
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log("\nAll catalogues are consistent.");
