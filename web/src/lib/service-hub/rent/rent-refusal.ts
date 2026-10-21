import type { RentCopy } from "./rent-copy";

/**
 * TUL-1613: its own module so a client component can map a refusal reason to the text it already
 * received as a prop WITHOUT importing the EN + ES copy tables (`rent-copy.ts`) into the browser.
 */
export function rentRefusalText(reason: string, c: RentCopy): string {
  switch (reason) {
    case "disabled": return c.off;
    case "not_test_mode": return c.notTest;
    case "not_accepted": return c.notAccepted;
    case "not_active": return c.notActive;
    case "needs_approval": return c.needsApproval;
    default: return c.unavailable;
  }
}
