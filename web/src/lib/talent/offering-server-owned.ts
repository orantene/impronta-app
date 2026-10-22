/**
 * TUL-1633: the fields of a `talent_offerings` row the browser never decides.
 *
 * Both editor saves (`upsertTalentOffering`, `upsertWorkspaceMenuItem`) build
 * their row from a whole client-sent `TalentOffering`, so without this a
 * crafted request could self-approve a rejected service (`moderation_state`),
 * put it in Favorites (`is_featured`) or move it on or off the public site
 * (`visibility`). The server decides them here instead:
 *
 *   - moderation_state: never from the client, on any path. A new row gets the
 *     policy default (the column default, `approved`: there is no moderation
 *     queue today and editing content has never reset it to `pending`); an
 *     existing row keeps its stored value. No app path writes it today.
 *   - is_featured, visibility: kept (existing row) or defaulted (new row),
 *     unless the caller is a curator. The talent path is never a curator: the
 *     talent Services editor has no Favorites or website control. The workspace
 *     catalog is the curation path (Favorites, the Website switch) and needs
 *     `curate_catalog` (TUL-1715: manager and above, the role scope's "curation of what is
 *     sold"); a workspace member without it who tries to change either is refused.
 *
 * Fails closed: when the current row cannot be read the save is refused, never
 * written with the client's values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferingModerationState, OfferingVisibility } from "@/lib/talent/offerings-types";

export type ServerOwnedOfferingFields = {
  moderation_state: OfferingModerationState;
  is_featured: boolean;
  visibility: OfferingVisibility;
};

/** A new row: the column defaults of `talent_offerings` (migration 20260708161910). */
export const NEW_OFFERING_SERVER_OWNED: Readonly<ServerOwnedOfferingFields> = Object.freeze({
  moderation_state: "approved",
  is_featured: false,
  visibility: "public",
});

/** The capability (manager and above) that may change Favorites and website visibility on the workspace catalog. */
export const OFFERING_CURATION_CAPABILITY = "curate_catalog";

/**
 * - "ignore": client values for featured and visibility are dropped (talent path).
 * - "refuse_change": a client value that differs from the server's is refused (workspace member without the capability).
 * - "curator": client featured and visibility are applied (manager and above). Moderation stays server-owned.
 */
export type OfferingCuration = "ignore" | "refuse_change" | "curator";

export type ResolveServerOwnedInput = {
  /** Empty or null means a new row. */
  offeringId: string | null;
  /** Extra equality filters the current row must match (the save's own scope). */
  scope: Readonly<Record<string, string>>;
  /** What the browser sent. Never trusted for moderation. */
  requested: { moderation_state?: unknown; is_featured?: unknown; visibility?: unknown };
  curation: OfferingCuration;
  /** New rows only, and only from server-read data (a duplicate keeps its source's moderation and visibility). */
  insertSeed?: Partial<ServerOwnedOfferingFields>;
};

export type ResolveServerOwnedResult =
  | { ok: true; fields: ServerOwnedOfferingFields }
  | { ok: false; code: "read_failed" | "not_found" | "forbidden"; error: string };

const MODERATION: readonly OfferingModerationState[] = ["pending", "approved", "rejected"];
const VISIBILITY: readonly OfferingVisibility[] = ["public", "agency_only", "on_request"];

function asModeration(v: unknown): OfferingModerationState | null {
  return typeof v === "string" && (MODERATION as readonly string[]).includes(v) ? (v as OfferingModerationState) : null;
}
function asVisibility(v: unknown): OfferingVisibility | null {
  return typeof v === "string" && (VISIBILITY as readonly string[]).includes(v) ? (v as OfferingVisibility) : null;
}

type StoredRow = { moderation_state?: unknown; is_featured?: unknown; visibility?: unknown };

async function readStored(
  db: SupabaseClient,
  offeringId: string,
  scope: Readonly<Record<string, string>>,
): Promise<ResolveServerOwnedResult> {
  let q = db.from("talent_offerings").select("moderation_state, is_featured, visibility").eq("id", offeringId);
  for (const [col, value] of Object.entries(scope)) q = q.eq(col, value);
  const { data, error } = await q.maybeSingle();
  if (error) return { ok: false, code: "read_failed", error: "Failed to save." };
  const row = data as StoredRow | null;
  if (!row) return { ok: false, code: "not_found", error: "Failed to save." };
  // A stored value outside the enum (should not exist; the column CHECK forbids it)
  // falls back to the most restrictive reading rather than the client's.
  return {
    ok: true,
    fields: {
      moderation_state: asModeration(row.moderation_state) ?? "pending",
      is_featured: row.is_featured === true,
      visibility: asVisibility(row.visibility) ?? "agency_only",
    },
  };
}

export async function resolveServerOwnedOfferingFields(
  db: SupabaseClient,
  input: ResolveServerOwnedInput,
): Promise<ResolveServerOwnedResult> {
  let base: ServerOwnedOfferingFields;
  if (input.offeringId) {
    const stored = await readStored(db, input.offeringId, input.scope);
    if (!stored.ok) return stored;
    base = stored.fields;
  } else {
    const seed = input.insertSeed ?? {};
    base = {
      moderation_state: asModeration(seed.moderation_state) ?? NEW_OFFERING_SERVER_OWNED.moderation_state,
      is_featured: seed.is_featured === true,
      visibility: asVisibility(seed.visibility) ?? NEW_OFFERING_SERVER_OWNED.visibility,
    };
  }

  const wantFeatured = typeof input.requested.is_featured === "boolean" ? input.requested.is_featured : null;
  const wantVisibility = asVisibility(input.requested.visibility);

  if (input.curation === "curator") {
    return {
      ok: true,
      fields: {
        moderation_state: base.moderation_state,
        is_featured: wantFeatured ?? base.is_featured,
        visibility: wantVisibility ?? base.visibility,
      },
    };
  }
  if (input.curation === "refuse_change") {
    const changes =
      (wantFeatured !== null && wantFeatured !== base.is_featured) ||
      (wantVisibility !== null && wantVisibility !== base.visibility);
    if (changes) {
      return {
        ok: false,
        code: "forbidden",
        error: "Only a manager or admin can change Favorites or where an item shows.",
      };
    }
  }
  return { ok: true, fields: base };
}
