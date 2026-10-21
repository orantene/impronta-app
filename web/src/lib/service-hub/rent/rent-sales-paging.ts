/**
 * TUL-1466 · The member's sales base is summed page by page. A single unpaged read is silently cut at the API row cap
 * (1,000), which under-bills rent; here every page is read, any failed page fails the whole base (null), and a month
 * bigger than the safety cap also fails closed instead of returning a partial number.
 */
export const PAGE_SIZE = 1_000;
export const MAX_PAGES = 50;

type Row = { total_cents: number | string; refunded_cents: number | string | null };

export async function sumSalesPages(
  fetchPage: (from: number, to: number) => Promise<{ rows: Row[] | null; error: boolean }>,
): Promise<number | null> {
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { rows, error } = await fetchPage(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error || !rows) return null;
    for (const r of rows) total += Math.max(0, (Number(r.total_cents) || 0) - (Number(r.refunded_cents) || 0));
    if (rows.length < PAGE_SIZE) return Number.isSafeInteger(total) ? total : null;
  }
  return null; // more than MAX_PAGES full pages: refuse rather than under-bill
}
