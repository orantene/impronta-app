/**
 * The station board's words, in one function. Same reason as `tables-copy.ts`:
 * a test that rebuilt the mapping would prove nothing about the page's wiring.
 */

import type { PreparationCopy } from "./prep-client";

export function preparationCopy(tr: (key: string) => string): PreparationCopy {
  return {
    empty: tr("dashboard.preparation.empty"),
    statusCancelled: tr("dashboard.preparation.statusCancelled"),
    acknowledge: tr("dashboard.preparation.acknowledge"),
    ready: tr("dashboard.preparation.ready"),
    handoff: tr("dashboard.preparation.handoff"),
    revision: tr("dashboard.preparation.revision"),
    destination: tr("dashboard.preparation.destination"),
    destinationTable: tr("dashboard.preparation.destinationTable"),
    destinationPickup: tr("dashboard.preparation.destinationPickup"),
    destinationCounter: tr("dashboard.preparation.destinationCounter"),
    statusQueued: tr("dashboard.preparation.statusQueued"),
    statusAcknowledged: tr("dashboard.preparation.statusAcknowledged"),
    statusReady: tr("dashboard.preparation.statusReady"),
    amended: tr("dashboard.preparation.amended"),
    handedOff: tr("dashboard.preparation.handedOff"),
    promisedBy: tr("dashboard.preparation.promisedBy"),
    refusal: {
      not_found: tr("dashboard.preparation.refusal.notFound"),
      wrong_tenant: tr("dashboard.preparation.refusal.wrongTenant"),
      invalid_state: tr("dashboard.preparation.refusal.invalidState"),
      invalid: tr("dashboard.preparation.refusal.invalid"),
      not_allowed: tr("dashboard.preparation.refusal.notAllowed"),
      unavailable: tr("dashboard.preparation.refusal.unavailable"),
    },
  };
}
