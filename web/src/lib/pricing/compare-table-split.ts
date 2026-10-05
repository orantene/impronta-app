import type { CompareTableRow, SharedCapability } from "./pricing-types";

/**
 * Split comparison rows into "this differs between plans" and "every plan has
 * this".
 *
 * WHY DERIVED, NOT FLAGGED
 * ------------------------
 * A `shared` column on `product_features` would be a second opinion about the
 * product, maintained by hand, and wrong from the moment a capability became a
 * real paid gate. Deriving it means a row joins the comparison on the day it
 * starts differing and leaves on the day it stops. The page follows the
 * product.
 *
 * WHAT COUNTS AS SHARED
 * ---------------------
 * Included on EVERY tier, with no tier showing a different value. Both halves
 * matter:
 *
 *   - "People profiles" is included on every tier and still belongs in the
 *     comparison, because 5 / 15 / unlimited is the ladder.
 *   - A row missing from a tier entirely is NOT shared. Absence is not
 *     agreement, and treating a gap as "everyone has it" is how a table starts
 *     claiming more than the product does.
 */
export function splitSharedRows(
  rows: CompareTableRow[],
  tierSlugs: string[],
): { comparison: CompareTableRow[]; shared: SharedCapability[] } {
  const comparison: CompareTableRow[] = [];
  const shared: SharedCapability[] = [];

  for (const row of rows) {
    if (isShared(row, tierSlugs)) {
      shared.push({ label: row.label, category: row.category });
    } else {
      comparison.push(row);
    }
  }
  return { comparison, shared };
}

function isShared(row: CompareTableRow, tierSlugs: string[]): boolean {
  // A row that does not cover every column cannot be "every plan has this".
  if (row.cells.length !== tierSlugs.length) return false;

  const values = new Set<string>();
  for (const cell of row.cells) {
    // `missing: true` means no row was stored for that tier at all. That is a
    // gap in the data, not a statement that the tier includes the feature.
    if ("missing" in cell && cell.missing) return false;
    if (!("included" in cell) || !cell.included) return false;
    values.add(cell.value ?? "");
  }

  // Any difference in the value keeps it in the comparison: "Up to 5" versus
  // "Unlimited" is exactly the thing a customer is trying to read.
  return values.size <= 1;
}
