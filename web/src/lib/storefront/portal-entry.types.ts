/** portal_entry — a button → sheet: sign in by e-mail code, then my bookings / tickets / orders. */

import type { StorefrontRefusal } from "./refusals";

export type PortalEntryProps = { label?: string | null; locale?: string | null };

export type PortalBooking = {
  id: string;
  title: string | null;
  status: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  kind: "upcoming" | "waiting_on_you" | "past";
  /** `/c/<inquiryId>` on this host. */
  path: string;
};

export type PortalTicket = {
  code: string;
  path: string;
  holderName: string | null;
  sessionId: string | null;
  startsAtIso: string | null;
  status: string;
};

export type PortalOrder = {
  id: string;
  receiptCode: string | null;
  path: string | null;
  status: string;
  totalCents: number;
  currency: string;
  createdAtIso: string;
};

export type PortalEntryData =
  | { signedIn: false; label: string | null; signInPath: "/me" }
  | {
      signedIn: true;
      label: string | null;
      customer: { name: string | null; email: string | null };
      bookings: PortalBooking[];
      tickets: PortalTicket[];
      orders: PortalOrder[];
      /** `/me` on this host: the full customer page. */
      portalPath: "/me";
    };

export type PortalEntryInput = { op: "request_code"; tenantId: string; email: string; nextPath?: string | null; locale?: string | null };

export type PortalEntryDone = { ok: true; op: "request_code"; email: string; notice: string };

export type PortalEntryResult = PortalEntryDone | StorefrontRefusal;
