import "server-only";

import type { CatalogEntry } from "./types";
import { eventUser, str } from "./catalog-audiences";

/**
 * TUL-1464: bells for "Match me with a professional". In-app only; each is dispatched directly
 * to ONE user by `producers/match-notify.ts` (eventId carries the request and the person, so a
 * retry is deduped). The client's contact details never appear in any of them.
 */
const isEs = (l: string | null | undefined) => (l ?? "").toLowerCase().startsWith("es");

function entry(input: {
  event: string;
  surface: "talent" | "client";
  title: (es: boolean, p: Record<string, unknown>) => string;
  body: (es: boolean, p: Record<string, unknown>) => string;
}): CatalogEntry {
  return {
    id: `${input.event}.${input.surface}`,
    category: "roster_activity",
    defaultChannels: ["in_app"],
    required: false,
    triggers: [input.event],
    resolveAudience: eventUser(input.surface === "client" ? "client" : "talent"),
    in_app: {
      kind: "booking",
      surface: input.surface,
      title: (e, r) => input.title(isEs(r.locale), e.payload),
      body: (e, r) => input.body(isEs(r.locale), e.payload),
    },
  };
}

export const MATCH_CATALOG_ENTRIES: CatalogEntry[] = [
  entry({
    event: "match.offered",
    surface: "talent",
    title: (es) => (es ? "Nuevo trabajo para ti" : "A new job for you"),
    body: (es, p) => {
      const d = str(p.summary) ?? "";
      return es ? `Un cliente busca un profesional. ${d} El primero en aceptar se queda con el trabajo.` : `A client is looking for a professional. ${d} The first to accept gets the job.`;
    },
  }),
  entry({
    event: "match.taken",
    surface: "talent",
    title: (es) => (es ? "Ese trabajo ya fue tomado" : "That job was taken"),
    body: (es) => (es ? "Otro profesional aceptó primero. Te avisaremos del siguiente." : "Another professional accepted first. We will tell you about the next one."),
  }),
  entry({
    event: "match.accepted",
    surface: "client",
    title: (es, p) => (es ? `${str(p.proName) ?? "Un profesional"} aceptó tu trabajo` : `${str(p.proName) ?? "A professional"} accepted your job`),
    body: (es) => (es ? "Abre tu cuenta para continuar con la reserva." : "Open your account to continue with the booking."),
  }),
];
