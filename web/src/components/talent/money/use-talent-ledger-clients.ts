"use client";

import { useCallback, useEffect, useState } from "react";

import { settleServerAction } from "@/lib/client/settle-server-action";
import { loadTalentClients } from "@/lib/talent/clients-actions";

import {
  LEDGER_CLIENTS_LOADING,
  resolveLedgerClients,
  type LedgerClientsState,
} from "./ledger-clients-state";

/**
 * Loads the talent's client ledger with a settle budget (a server action can be
 * discarded and never resolve when history is written mid-flight), reports
 * failures honestly, and offers a retry. See ledger-clients-state.ts.
 */
export function useTalentLedgerClients(
  talentId: string | null,
  area: string,
): { state: LedgerClientsState; retry: () => void } {
  const [state, setState] = useState<LedgerClientsState>(LEDGER_CLIENTS_LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!talentId) return;
    let cancelled = false;
    void resolveLedgerClients(() =>
      settleServerAction(() => loadTalentClients(talentId), { label: "loadTalentClients", area }),
    ).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [talentId, area, attempt]);

  const retry = useCallback(() => {
    setState(LEDGER_CLIENTS_LOADING);
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
