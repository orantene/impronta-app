import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCatalog } from "@/lib/orders/purchase-catalog";

import { clampQuoteUnits, quoteFromCatalog, quoteReplyText, type QuoteInput, type QuoteResult } from "./quote";

/**
 * TUL-36 slice 2: runs the read-only quote tool. Loads the offering rows through the
 * checkout's own catalog reader (so the quote is the checkout's price) and delegates to the
 * pure core. Read-only: nothing is written. `offeringId` must already be resolved from a
 * grounded service ref by the caller (never a model-typed id).
 */
export type QuoteToolDeps = { loadCatalog: typeof loadCatalog };

export async function runQuoteTool(
  admin: SupabaseClient,
  input: QuoteInput,
  deps: QuoteToolDeps = { loadCatalog },
): Promise<{ result: QuoteResult; reply: string }> {
  const catalog = await deps.loadCatalog(admin, [input.offeringId]);
  const result = quoteFromCatalog(catalog, input);
  return { result, reply: quoteReplyText(result, input.locale, clampQuoteUnits(input.units)) };
}
