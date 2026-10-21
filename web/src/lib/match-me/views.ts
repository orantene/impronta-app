/**
 * TUL-1598: what the client and the professional SEE of a match-me job. Pure.
 * The professional sees the job text with any phone or email hidden (always, whatever the
 * masking flag says) until they accept; the client sees their own requests and, once someone
 * accepted, that professional's name only.
 */
import { maskContactDetails } from "@/lib/coordinator/contact-masking";

export type RequestRow = { id: string; description: string; zone: string | null; status: string; created_at: string; winner_talent_id: string | null };

export type MyMatchRequest = {
  id: string;
  description: string;
  zone: string | null;
  status: "open" | "accepted" | "cancelled";
  createdAt: string;
  offeredCount: number;
  proName: string | null;
};

export function shapeMyRequests(input: {
  requests: readonly RequestRow[];
  offeredCounts: Readonly<Record<string, number>>;
  winnerNames: Readonly<Record<string, string | null>>;
}): MyMatchRequest[] {
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
        description: maskContactDetails(r.description).text,
        zone: r.zone,
        workspaceName: input.workspaceNames[r.tenant_id] ?? null,
        offeredAt: o.offered_at,
      }];
    })
    .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
}
