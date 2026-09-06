/**
 * The shape test for "a table policy that lets anon write", kept in JavaScript
 * so it can be exercised without a database. The SQL gathers candidates; this
 * decides. Putting the judgement in the query would have made the guard
 * untestable, and an untested guard is one nobody has seen fail.
 */

/** Postgres renders a trivially-true predicate as `true` or `(true)`. */
export function isTriviallyTrue(expression) {
  if (expression === null || expression === undefined || expression === "") return true;
  return ["true", "(true)"].includes(String(expression).trim().toLowerCase());
}

/**
 * BOTH halves are required, and that is the whole point.
 *
 *   a trivially-true policy with no matching grant  → grant-without-reach, RLS
 *                                                     would allow it but the
 *                                                     grant refuses first
 *   a grant with no permissive policy               → RLS refuses
 *
 * Requiring both is what cut a 201-table sweep to the 3 tables that were
 * genuinely open on 2026-09-06. A guard that reports 201 problems on a database
 * with 3 is a guard people learn to skip.
 */
export function letsAnonWrite(row) {
  const writeCommands = ["INSERT", "UPDATE", "DELETE", "ALL"];
  if (!writeCommands.includes(String(row.cmd ?? "").toUpperCase())) return false;
  if (!row.reaches_anon) return false;
  if (!row.anon_holds_grant) return false;
  return isTriviallyTrue(row.using_expr) && isTriviallyTrue(row.check_expr);
}
