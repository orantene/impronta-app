"use server";

/**
 * L13 wave 5 · the business's catalog for the guest dock's Items tab.
 *
 * The same reader the workspace picker uses (`loadItemsCatalog`, L5), scoped
 * to the tenant of the public host and filtered to what a client may see:
 * title, sub, price, availability, ids. No cost, no margin, no staff notes.
 * Read only. Adding goes through `messagingClientAddItem` (token) for
 * priced items and the inquiry cart for talent.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadItemsCatalog } from "@/lib/messages-v5/items-catalog";
import { categoryOrderForPreset, groupCatalog, type CatalogGroup, type ItemCategory } from "@/lib/messages-v5/items-picker";
import { logServerError } from "@/lib/server/safe-error";

export type GuestCatalogRow = {
  id: string;
  category: ItemCategory;
  title: string;
  sub: string | null;
  amountCents: number | null;
  available: boolean;
  /** Why it cannot be added, when it cannot. */
  busy: string | null;
  talentProfileId: string | null;
  profileCode: string | null;
  offeringId: string | null;
  sessionId: string | null;
  startsAt: string | null;
  partySize: number | null;
};

export type GuestCatalogGroup = { category: ItemCategory; rows: GuestCatalogRow[] };

export type GetGuestCatalogResult =
  | { ok: true; groups: GuestCatalogGroup[] }
  | { ok: false; error: string };

const inputSchema = z.object({
  tenantSlug: z.string().min(1),
  inquiryId: z.string().uuid().nullable().optional(),
});

export async function getGuestItemsCatalog(raw: { tenantSlug: string; inquiryId?: string | null }): Promise<GetGuestCatalogResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "unavailable" };
  const { data: tenant } = await admin
    .from("agencies")
    .select("id, status")
    .eq("slug", parsed.data.tenantSlug.trim().toLowerCase())
    .limit(1)
    .maybeSingle();
  const tenantId = (tenant as { id?: string; status?: string } | null)?.id ?? null;
  if (!tenantId) return { ok: false, error: "not_found" };
  try {
    // A missing inquiry only means "no date": the catalog still loads.
    const catalog = await loadItemsCatalog(admin, { tenantId, inquiryId: parsed.data.inquiryId ?? "00000000-0000-0000-0000-000000000000" });
    const codes = await profileCodes(admin, catalog.rows.map((r) => r.talentProfileId).filter((v): v is string => Boolean(v)));
    const groups: CatalogGroup[] = groupCatalog(catalog.rows, categoryOrderForPreset(catalog.preset));
    return {
      ok: true,
      groups: groups.map((g) => ({
        category: g.category,
        rows: g.rows.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          sub: r.sub,
          amountCents: r.amountCents,
          available: r.availability.kind !== "busy",
          busy: r.availability.kind === "busy" ? r.availability.reason : null,
          talentProfileId: r.talentProfileId ?? null,
          profileCode: r.talentProfileId ? (codes.get(r.talentProfileId) ?? null) : null,
          offeringId: r.offeringId ?? null,
          sessionId: r.sessionId ?? null,
          startsAt: r.startsAt ?? null,
          partySize: r.partySize ?? null,
        })),
      })),
    };
  } catch (err) {
    logServerError("guest-catalog-actions.getGuestItemsCatalog", err);
    return { ok: false, error: "unavailable" };
  }
}

async function profileCodes(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await admin.from("talent_profiles").select("id, profile_code").in("id", ids);
  for (const row of (data ?? []) as Array<{ id: string; profile_code: string | null }>) {
    if (row.profile_code) out.set(row.id, row.profile_code);
  }
  return out;
}
