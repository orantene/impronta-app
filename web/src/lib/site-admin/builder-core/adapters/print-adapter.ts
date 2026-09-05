/**
 * The print surface adapter, bound to the real server actions — the CLIENT
 * mount imports `createBoundPrintAdapter` and the bound adapter calls the
 * "use server" actions across the RSC boundary. Mirrors
 * createBoundSiteShellAdapter. Tests import the `-core` with a spy, so they
 * never pull the server actions.
 */
import {
  createPrintAdapter,
  type PrintAdapterActions,
} from "./print-adapter-core";
import {
  loadPrintDesignAction,
  savePrintDesignAction,
} from "./print-actions";

function makeProductionPrintActions(): PrintAdapterActions {
  return {
    loadPrintDesign: (input) => loadPrintDesignAction(input),
    savePrintDesign: (input) => savePrintDesignAction(input),
  };
}

export function createBoundPrintAdapter() {
  return createPrintAdapter(makeProductionPrintActions());
}

export { createPrintAdapter } from "./print-adapter-core";
export type {
  PrintAdapterActions,
  PrintDesignRow,
  PrintDesignSaveOutcome,
} from "./print-adapter-core";
