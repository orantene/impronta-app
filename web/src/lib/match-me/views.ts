/**
 * TUL-1598: what the client and the professional SEE of a match-me job. Pure.
 * The professional sees the job text with any phone, email, link or @handle hidden (always,
 * whatever the chat masking flag says) until they accept, on the screen AND in the bell; the
 * client sees their own requests and, once someone accepted, that professional's name only.
 */
import { maskContactDetails } from "@/lib/coordinator/contact-masking";

const LINK = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
// "instagram.com/ana", "ana.mx": a bare domain with a common ending (after emails are already hidden).
const BARE_DOMAIN = /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|net|org|io|co|me|mx|app|dev|info|link|ly|gg|es|us|site|online|store)\b(?:\/[^\s]*)?/gi;
const HANDLE = /(^|[\s(])@[A-Za-z0-9_.]{2,}/g;

/** The client's free text as a professional may see it before accepting: no way to reach the client. */
export function maskJobText(input: string | null | undefined): string {
  const { text } = maskContactDetails((input ?? "").replace(LINK, "[link hidden]"));
  return text.replace(BARE_DOMAIN, "[link hidden]").replace(HANDLE, (_m, pre: string) => `${pre}[handle hidden]`);
}

export const MATCH_SUMMARY_MAX = 140;

/** The bell's one-line summary: masked FIRST (so a cut can never expose half an address), then trimmed. */
export function matchOfferSummary(description: string): string {
  const flat = maskJobText(description).replace(/\s+/g, " ").trim();
  return flat.length <= MATCH_SUMMARY_MAX ? flat : `${flat.slice(0, MATCH_SUMMARY_MAX - 3).trimEnd()}...`;
}

export type RequestRow = { id: string; description: string; zone: string | null; status: string; created_at: string; winner_talent_id: string | null };

export type MyMatchRequest = {
  id: string;
  description: string;
  zone: string | null;
  status: "open" | "accepted" | "cancelled";
  createdAt: string;
  offeredCount: number;
  proName: string | null;
  /** Still open but nobody was ever offered it: shown as "no one is available", never as waiting. */
  noneAvailable: boolean;
};

export function shapeMyRequests(input: {
  requests: readonly RequestRow[];
  offeredCounts: Readonly<Record<string, number>>;
  winnerNames: Readonly<Record<string, string | null>>;
  /** False when the recipient counts could not be read: then no request claims "no one available". */
  countsKnown?: boolean;
}): MyMatchRequest[] {
  const countsKnown = input.countsKnown ?? true;
  return [...input.requests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({
      id: r.id,
      description: r.description,
      zone: r.zone,
      status: r.status === "accepted" ? "accepted" : r.status === "cancelled" ? "cancelled" : "open",
      createdAt: r.created_at,
      offeredCount: input.offeredCounts[r.id] ?? 0,
      proName: r.status === "accepted" && r.winner_talent_id ? (input.winnerNames[r.winner_talent_id]?.trim() || null) : null,
      noneAvailable: countsKnown && r.status !== "accepted" && r.status !== "cancelled" && (input.offeredCounts[r.id] ?? 0) === 0,
    }));
}

export type MatchOffer = { requestId: string; description: string; zone: string | null; workspaceName: string | null; offeredAt: string };

export function shapeOffers(input: {
  offers: ReadonlyArray<{ request_id: string; offered_at: string; status: string }>;
  requests: readonly (RequestRow & { tenant_id: string })[];
  workspaceNames: Readonly<Record<string, string | null>>;
}): MatchOffer[] {
  const byId = new Map(input.requests.map((r) => [r.id, r]));
  return input.offers
    .filter((o) => o.status === "offered")
    .flatMap((o) => {
      const r = byId.get(o.request_id);
      if (!r || r.status !== "open") return [];
      return [{
        requestId: r.id,
        description: maskJobText(r.description),
        zone: r.zone ? maskJobText(r.zone) : null,
        workspaceName: input.workspaceNames[r.tenant_id] ?? null,
        offeredAt: o.offered_at,
      }];
    })
    .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
}
