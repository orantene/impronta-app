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

/** Rows to feed the owed summary: `null` until the ledger is really known. */
export function ledgerClientsForSummary(state: LedgerClientsState): TalentClientRow[] | null {
  return state.status === "ready" ? state.items : null;
}
