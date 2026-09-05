/**
 * The print surface adapter, bound to the real DB actions. Mirrors
 * site-shell-adapter.ts. The `-core` (createPrintAdapter) is imported by tests
 * with a spy so they never pull the server-only `print-actions`.
 */
import { createPrintAdapter } from "./print-adapter-core";
import { printAdapterActions } from "./print-actions";

export const printAdapter = createPrintAdapter(printAdapterActions);

export { createPrintAdapter } from "./print-adapter-core";
export type {
  PrintAdapterActions,
  PrintDesignRow,
  PrintDesignSaveOutcome,
} from "./print-adapter-core";
