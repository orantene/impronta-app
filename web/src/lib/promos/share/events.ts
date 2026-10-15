import { isUuid } from "./cookies";
import { parseVia, type ViaTag } from "./links";

/**
 * promo_events writer (L4). The decision logic, with every effect injected so
 * it is testable without a database: load, token check, rate limit, insert.
 */
export const EVENT_KINDS = ["view", "link_open", "share"] as const;
export type PromoEventKind = (typeof EVENT_KINDS)[number];

export type EventPromoRef = {
  id: string;
  tenant_id: string;
  is_draft: boolean;
  archived_at: string | null;
  personal: boolean;
};

export type PromoEventDeps = {
  loadPromo(promoId: string): Promise<EventPromoRef | null>;
  verifyToken(token: string | null, promoId: string): Promise<boolean>;
  /** true = allowed. Keyed by the caller. */
  allow(key: string): Promise<boolean>;
  insert(row: {
    promo_id: string;
    tenant_id: string;
    kind: PromoEventKind;
    session_hash: string;
    via: ViaTag | null;
  }): Promise<boolean>;
};

export type PromoEventInput = {
  promoId: unknown;
  kind: unknown;
  via: unknown;
  token?: unknown;
  sessionHash: string;
  ip: string | null;
};

export type PromoEventOutcome =
  | { ok: true; applyCookie: boolean; via: ViaTag | null; promoId: string }
  | { ok: false; status: 400 | 404 | 429 | 500 };

export async function handlePromoEvent(deps: PromoEventDeps, input: PromoEventInput): Promise<PromoEventOutcome> {
  if (!isUuid(input.promoId)) return { ok: false, status: 400 };
  if (typeof input.kind !== "string" || !(EVENT_KINDS as readonly string[]).includes(input.kind)) {
    return { ok: false, status: 400 };
  }
  const kind = input.kind as PromoEventKind;
  const via = parseVia(input.via);
  const token = typeof input.token === "string" && input.token.length <= 600 ? input.token : null;

  if (!(await deps.allow(`${input.sessionHash}:${input.ip ?? "-"}`))) return { ok: false, status: 429 };

  const promo = await deps.loadPromo(input.promoId);
  if (!promo || promo.is_draft) return { ok: false, status: 404 };

  const tokenOk = promo.personal ? await deps.verifyToken(token, promo.id) : true;
  // A personal promo never leaks through the analytics path either.
  if (!tokenOk) return { ok: false, status: 404 };

  const stored = await deps.insert({
    promo_id: promo.id,
    tenant_id: promo.tenant_id,
    kind,
    session_hash: input.sessionHash,
    via,
  });
  if (!stored) return { ok: false, status: 500 };
  // Only an opened link pins the promo; a share tap by the talent must not.
  return { ok: true, applyCookie: kind === "link_open" && !promo.archived_at, via, promoId: promo.id };
}
