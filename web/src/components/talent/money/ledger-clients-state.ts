/**
 * TUL-1242: the client ledger ("Te deben" / Owed to you) is fetched on mount by
 * two surfaces (Today card, Money page). Both used to treat "not loaded yet" and
 * "failed to load" as something else:
 *   - Today turned a failed or cut-short read into `[]`, so the card showed $0
 *     and then $500 on the next load (the flip).
 *   - Money called the server action with no catch, so a rejected or stalled
 *     call left `clients === null` forever ("Cargando" for ever).
 * One state machine, three honest states. Display and fetch only: nothing here
 * changes how an amount is computed or charged.
 */
import type { TalentClientRow } from "@/lib/talent/clients-merge";

export type LedgerClientsState =
  | { status: "loading" }
  | { status: "ready"; items: TalentClientRow[] }
  | { status: "error" };

export const LEDGER_CLIENTS_LOADING: LedgerClientsState = { status: "loading" };

type LedgerLoadResult = { ok: true; items: TalentClientRow[] } | { ok: false; error?: string };

/** Never rejects: a thrown, stalled-then-rejected or `ok:false` read all become `error`. */
export async function resolveLedgerClients(
  load: () => Promise<LedgerLoadResult>,
): Promise<LedgerClientsState> {
  try {
    const res = await load();
    return res.ok ? { status: "ready", items: res.items } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** What the "Owed to you" figure shows: a dash until the ledger is really known, never a 0 stand-in. */
export const OWED_UNKNOWN_TEXT = "—";

/**
 * Display text for the owed figure. `loading` and `error` NEVER render a number (the $500/$0
 * flip was a not-yet-loaded ledger drawn as an agenda-only figure or $0). Once `ready`, the
 * summary's own cents/currency are formatted unchanged, a real zero included.
 */
export function owedAmountText(
  state: LedgerClientsState,
  summary: { cents: number; currency: string | null },
  format: (cents: number, currency: string) => string,
  fallbackCurrency: string,
): string {
  if (state.status !== "ready") return OWED_UNKNOWN_TEXT;
  return format(summary.cents, summary.currency ?? fallbackCurrency);
}

/** Rows to feed the owed summary: `null` until the ledger is really known. */
export function ledgerClientsForSummary(state: LedgerClientsState): TalentClientRow[] | null {
  return state.status === "ready" ? state.items : null;
}
