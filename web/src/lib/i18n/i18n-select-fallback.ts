/**
 * Read `*_i18n` columns without depending on the migration being applied.
 *
 * `run(true)` selects the i18n columns; when that fails with a missing-column
 * error (migration 20261231299520 not applied yet) the same query runs once
 * more with `run(false)`, which reads exactly what it read before the columns
 * existed. Any other error is returned untouched for the caller to log.
 */
import { isPostgrestMissingColumnError } from "@/lib/server/safe-error";

export type SelectResult<T> = { data: T | null; error: unknown };

export async function selectWithI18nFallback<T>(
  run: (withI18n: boolean) => PromiseLike<SelectResult<T>>,
): Promise<SelectResult<T>> {
  const first = await run(true);
  if (first.error && isPostgrestMissingColumnError(first.error)) return run(false);
  return first;
}
