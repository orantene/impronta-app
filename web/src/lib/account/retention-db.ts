/** Small read helpers shared by the retention steps. */

export type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;

/** Run a head-count query; any error throws, so a failed read is never read as "zero". */
export async function headCount(q: CountResult, label: string): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
