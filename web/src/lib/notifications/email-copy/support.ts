/**
 * Support email subjects (EN + ES), aggregated by `../email-copy.ts`.
 *
 * Only the REQUESTER-facing support mail is localized (staff alerts stay in
 * English). Brand voice is "Tulala Support", never a personal name. The name
 * comes from `SUPPORT_AGENT` so it lives in exactly one place.
 *
 * `SUPPORT_ES: typeof SUPPORT_EN` enforces key + shape parity at build time.
 * Spanish is natural Mexican Spanish using "tú". Placeholders mirror the event
 * payload keys (`subject`, `ticketNumber`), see `catalog-entries-support.ts`.
 */
import { SUPPORT_AGENT } from "@/lib/support/support-persona";

const AGENT = SUPPORT_AGENT.name;

export const SUPPORT_EN = {
  "support.message.agent": {
    subject: `${AGENT} replied - {subject} [Tulala #{ticketNumber}]`,
  },
  "support.ticket.resolved": {
    subject: "Resolved: {subject} [Tulala #{ticketNumber}]",
  },
  "support.message.received": {
    subject: "We have your message (#{ticketNumber})",
  },
  "support.ticket.autoclose": {
    subject: "Still need help on #{ticketNumber}?",
  },
  "support.ticket.fixed": {
    subject: "The issue you reported is fixed [Tulala #{ticketNumber}]",
  },
};

export const SUPPORT_ES: typeof SUPPORT_EN = {
  "support.message.agent": {
    subject: `${AGENT} te respondió - {subject} [Tulala #{ticketNumber}]`,
  },
  "support.ticket.resolved": {
    subject: "Resuelto: {subject} [Tulala #{ticketNumber}]",
  },
  "support.message.received": {
    subject: "Recibimos tu mensaje (#{ticketNumber})",
  },
  "support.ticket.autoclose": {
    subject: "¿Sigues necesitando ayuda con el #{ticketNumber}?",
  },
  "support.ticket.fixed": {
    subject: "Ya quedó resuelto el problema que reportaste [Tulala #{ticketNumber}]",
  },
};
