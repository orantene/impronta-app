import type {
  SupportCallbackPref,
  SupportTicketSummary,
} from "@/lib/support/support-types";

export type SupportActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type SupportContract = {
  surface: "workspace" | "talent" | "client";
  tenantSlug: string | null;
  firstName: string;
  userId: string;
  canSeeWorkspaceTickets: boolean;
  observeShellDrawers: boolean;
  initialTickets: SupportTicketSummary[];
  originSlug?: string | null;
  createTicket: (input: {
    tenantSlug: string | null;
    surface: "workspace" | "talent" | "client";
    body: string;
    subject?: string;
    category?: string;
    originSlug?: string;
    contactPhone?: string;
    callbackRequested?: boolean;
    callbackPref?: SupportCallbackPref;
    messageOranDirectly?: boolean;
    diagnostics?: unknown;
  }) => Promise<SupportActionResult<{ ticketId: string; ticketNumber: number }>>;
  sendMessage: (input: {
    ticketId: string;
    body: string;
  }) => Promise<SupportActionResult<{ messageId: string }>>;
  markRead: (input: { ticketId: string }) => Promise<SupportActionResult>;
  requestHuman: (input: { ticketId: string }) => Promise<SupportActionResult>;
  rateTicket: (input: {
    ticketId: string;
    rating: number;
    comment?: string;
  }) => Promise<SupportActionResult>;
  closeTicket: (input: { ticketId: string }) => Promise<SupportActionResult>;
  updateContact: (input: {
    ticketId: string;
    contactPhone?: string;
    callbackRequested?: boolean;
    callbackPref?: SupportCallbackPref;
  }) => Promise<SupportActionResult>;
};
