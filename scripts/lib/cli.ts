/**
 * Shared CLI conventions for the catalogue maintenance scripts.
 *
 * ── Why writes are opt-in ───────────────────────────────────────────────────
 * `npm run <script> -- --flag` does not reliably forward the flag: on some
 * setups (npm on Windows in particular) the arguments after `--` are dropped
 * before the script ever sees them. A script that WRITES by default and treats
 * `--preview` as the safety valve will therefore quietly mutate production the
 * moment that flag goes missing — which is exactly what happened here.
 *
 * So the polarity is inverted: every script that touches the catalogue previews
 * by default and writes only when `--apply` is unambiguously present. A lost
 * flag now degrades to "did nothing", not "rewrote 115 listings".
 *
 * Because flags are unreliable through `npm run`, each mode also gets its own
 * entry in package.json (`audit:copy` vs `audit:copy:apply`), where the flag is
 * part of the command string and cannot be stripped. For ad-hoc combinations,
 * invoke the script directly:
 *
 *   npx tsx scripts/audit-catalog-copy.ts --apply --regenerate --limit 10
 */

/** True when `--name` was passed, or `NAME=1` is set in the environment. */
export function hasFlag(name: string): boolean {
  if (process.argv.includes(`--${name}`)) return true;
  const env = process.env[name.toUpperCase().replace(/-/g, "_")];
  return env === "1" || env === "true";
}

/** Read `--name <value>` as a positive integer, or undefined. */
export function readCount(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const raw = i !== -1 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : undefined;
}

export type RunMode = {
  /** True when the script may write. */
  apply: boolean;
  /** True when it must not — the default. */
  preview: boolean;
  /** Prefix for log lines, e.g. `would update` vs `updated`. */
  verb: (past: string, conditional: string) => string;
};

/**
 * Resolve and announce the run mode. Call this once, before any work, so the
 * operator can see which mode is active in the very first line of output.
 */
export function resolveRunMode(scriptLabel: string): RunMode {
  const apply = hasFlag("apply");
  console.log(
    apply
      ? `\n${scriptLabel} — APPLY MODE: changes will be written.\n`
      : `\n${scriptLabel} — PREVIEW: nothing will be written. Re-run with --apply to commit.\n`,
  );
  return {
    apply,
    preview: !apply,
    verb: (past, conditional) => (apply ? past : conditional),
  };
}
