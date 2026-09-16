/** order_lookup — code + e-mail → a status card; resend / transfer a ticket. */

import type { StorefrontRefusal } from "./refusals";

export type OrderLookupProps = {
  title?: string | null;
  /** The receipt code (or its last 4) and the e-mail, once the person typed them. */
  code?: string | null;
  email?: string | null;
  locale?: string | null;
};

export type LookedUpTicket = {
  code: string;
  /** `/ticket/<code>` on this host. */
  path: string;
  holderName: string | null;
  sessionId: string | null;
  startsAtIso: string | null;
  status: string;
};

export type LookedUpOrder = {
  receiptCode: string;
  /** `/r/<code>` on this host. */
  path: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAtIso: string;
  lines: Array<{ label: string; units: number; totalCents: number }>;
};

export type OrderLookupData = {
  title: string | null;
  /** Null until code + e-mail were given. */
  result: { order: LookedUpOrder | null; tickets: LookedUpTicket[] } | null;
};

export type OrderLookupInput =
  | { op: "resend"; tenantId: string; code: string; locale?: string | null }
  | { op: "transfer"; tenantId: string; code: string; toName: string; toEmail: string; locale?: string | null };

export type OrderLookupDone =
  | { ok: true; op: "resend" }
  | { ok: true; op: "transfer"; code: string; path: string };

export type OrderLookupResult = OrderLookupDone | StorefrontRefusal;
