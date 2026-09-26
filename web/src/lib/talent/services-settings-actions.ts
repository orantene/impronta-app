"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  parseSellingBookingSettings,
  type TalentBookingPosture,
  type WhoPrimaryCta,
} from "@/lib/talent/selling-booking-settings";

export type SellingDefaults = {
  depositPct: number | null;
  cancelHours: number | null;
  rescheduleHours: number | null;
  where: string[];
  travelRadiusKm: number | null;
  travelFeeCents: number | null;
  /** Preparation minutes blocked before each start (slot engine). */
  bufferBeforeMin: number | null;
  bufferAfterMin: number | null;
  minNoticeMin: number | null;
  /** Talent-wide on-demand vs contact/inquiry. */
  bookingPosture: TalentBookingPosture;
  /** Who-step primary CTA vocabulary. */
  whoPrimaryCta: WhoPrimaryCta;
};

export type AddonGroup = {
  id: string;
  name: string;
  amountCents: number;
  durationMinutes: number | null;
  mediaUrl: string | null;
  offeringIds: string[];
};

export type OfferingDestination = {
  id: string;
  label: string;
  href: string | null;
  enquiryTo: string;
};

async function requireOwner(talentProfileId: string) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "Server configuration error." };
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, user_id, display_name, category_order, selling_defaults, category_rename_log, profile_code")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("talent.servicesSettings.requireOwner", error);
    return { ok: false as const, error: "Could not verify ownership." };
  }
  if (!data || data.user_id !== session.user.id) return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, admin, profile: data };
}

export async function loadSellingDefaults(
  talentProfileId: string,
): Promise<{ ok: true; defaults: SellingDefaults } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const raw = (auth.profile.selling_defaults ?? {}) as Record<string, unknown>;
  const booking = parseSellingBookingSettings(raw);
  return {
    ok: true,
    defaults: {
      depositPct: typeof raw.depositPct === "number" ? raw.depositPct : null,
      cancelHours: typeof raw.cancelHours === "number" ? raw.cancelHours : 24,
      rescheduleHours: typeof raw.rescheduleHours === "number" ? raw.rescheduleHours : 24,
      where: Array.isArray(raw.where) ? raw.where.filter((v): v is string => typeof v === "string") : ["studio"],
      travelRadiusKm: typeof raw.travelRadiusKm === "number" ? raw.travelRadiusKm : null,
      travelFeeCents: typeof raw.travelFeeCents === "number" ? raw.travelFeeCents : null,
      bufferBeforeMin: booking.bufferBeforeMin,
      bufferAfterMin: typeof raw.bufferAfterMin === "number" ? raw.bufferAfterMin : null,
      minNoticeMin: typeof raw.minNoticeMin === "number" ? raw.minNoticeMin : null,
      bookingPosture: booking.bookingPosture,
      whoPrimaryCta: booking.whoPrimaryCta,
    },
  };
}

export async function saveSellingDefaults(
  talentProfileId: string,
  defaults: SellingDefaults,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const prev =
    auth.profile.selling_defaults &&
    typeof auth.profile.selling_defaults === "object" &&
    !Array.isArray(auth.profile.selling_defaults)
      ? (auth.profile.selling_defaults as Record<string, unknown>)
      : {};
  // Merge so non-form keys (e.g. categoryNotes) survive a Defaults save.
  const selling_defaults = { ...prev, ...defaults };
  const { error } = await auth.admin
    .from("talent_profiles")
    .update({ selling_defaults, updated_at: new Date().toISOString() })
    .eq("id", talentProfileId);
  if (error) {
    logServerError("talent.sellingDefaults.save", error);
    return { ok: false, error: "Could not save defaults." };
  }
  revalidatePath("/talent/services");
  return { ok: true };
}

export async function loadCategoryOrder(
  talentProfileId: string,
): Promise<{ ok: true; order: string[] } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  return { ok: true, order: (auth.profile.category_order as string[] | null) ?? [] };
}

export async function saveCategoryOrder(
  talentProfileId: string,
  order: string[],
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const { error } = await auth.admin
    .from("talent_profiles")
    .update({ category_order: order })
    .eq("id", talentProfileId);
  if (error) return { ok: false, error: "Could not save category order." };
  revalidatePath("/talent/services");
  return { ok: true };
}

export async function renameCategory(
  talentProfileId: string,
  from: string,
  to: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const next = to.trim().slice(0, 80);
  if (!next) return { ok: false, error: "Give the category a name." };
  const { data: rows, error: rowsError } = await auth.admin
    .from("talent_offerings")
    .select("id, category")
    .eq("talent_profile_id", talentProfileId)
    .eq("category", from);
  if (rowsError) return { ok: false, error: "Could not rename." };
  const ids = (rows ?? []).map((row) => row.id as string);
  if (ids.length > 0) {
    const { error } = await auth.admin
      .from("talent_offerings")
      .update({ category: next })
      .in("id", ids);
    if (error) return { ok: false, error: "Could not rename." };
  }
  const order = ((auth.profile.category_order as string[] | null) ?? []).map((name) =>
    name === from ? next : name,
  );
  const log = [
    ...(((auth.profile.category_rename_log as unknown[]) ?? []) as unknown[]),
    { from, to: next, at: new Date().toISOString(), count: ids.length },
  ].slice(-40);
  await auth.admin
    .from("talent_profiles")
    .update({ category_order: order, category_rename_log: log })
    .eq("id", talentProfileId);
  revalidatePath("/talent/services");
  return { ok: true, count: ids.length };
}

export async function mergeCategories(
  talentProfileId: string,
  from: string,
  into: string,
): Promise<{ ok: boolean; error?: string }> {
  return (await renameCategory(talentProfileId, from, into)).ok
    ? { ok: true }
    : { ok: false, error: "Could not merge." };
}

export async function loadOfferingDestinations(
  talentProfileId: string,
): Promise<{ ok: true; destinations: OfferingDestination[] } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const destinations: OfferingDestination[] = [];
  const code = auth.profile.profile_code as string | null;
  if (code) {
    destinations.push({
      id: "directory",
      label: "Tulala profile",
      href: `/t/${code}`,
      enquiryTo: auth.profile.display_name ?? "You",
    });
  }
  const { data: roster, error: rosterError } = await auth.admin
    .from("agency_talent_roster")
    .select("tenant_id, agencies:tenant_id ( name, slug )")
    .eq("talent_profile_id", talentProfileId)
    .neq("status", "removed");
  if (rosterError) {
    logServerError("talent.servicesSettings.destinations.roster", rosterError);
    return { ok: false, error: "Could not load destinations." };
  }
  for (const row of roster ?? []) {
    const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
    if (!agency) continue;
    destinations.push({
      id: `agency:${row.tenant_id}`,
      label: agency.name ?? "Agency listing",
      href: agency.slug ? `/${agency.slug}` : null,
      enquiryTo: agency.name ?? "The agency",
    });
  }
  const { data: site, error: siteError } = await auth.admin
    .from("talent_sites")
    .select("status, site_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (siteError) {
    logServerError("talent.servicesSettings.destinations.site", siteError);
    return { ok: false, error: "Could not load destinations." };
  }
  if (site?.status === "published" && site.site_slug) {
    destinations.push({
      id: "website",
      label: "Your website",
      href: `https://${site.site_slug}.tulala.digital/`,
      enquiryTo: auth.profile.display_name ?? "You",
    });
  }
  return { ok: true, destinations };
}

export async function loadAddonGroups(
  talentProfileId: string,
): Promise<{ ok: true; groups: AddonGroup[] } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const { data: groups, error: groupsError } = await auth.admin
    .from("talent_addon_groups")
    .select("id, name, amount_cents, duration_minutes, media_asset_id")
    .eq("talent_profile_id", talentProfileId)
    .order("name");
  if (groupsError) {
    logServerError("talent.servicesSettings.addonGroups", groupsError);
    return { ok: false, error: "Could not load extras." };
  }
  const ids = (groups ?? []).map((g) => g.id as string);
  const attachments =
    ids.length === 0
      ? []
      : ((
          await auth.admin
            .from("talent_addon_group_attachments")
            .select("addon_group_id, offering_id")
            .in("addon_group_id", ids)
        ).data ?? []);
  const byGroup = new Map<string, string[]>();
  for (const row of attachments) {
    const list = byGroup.get(row.addon_group_id) ?? [];
    list.push(row.offering_id);
    byGroup.set(row.addon_group_id, list);
  }
  return {
    ok: true,
    groups: (groups ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      amountCents: (g.amount_cents as number) ?? 0,
      durationMinutes: (g.duration_minutes as number | null) ?? null,
      mediaUrl: null,
      offeringIds: byGroup.get(g.id as string) ?? [],
    })),
  };
}

export async function upsertAddonGroup(
  talentProfileId: string,
  input: {
    id?: string;
    name: string;
    amountCents: number;
    durationMinutes: number | null;
    offeringIds: string[];
    mediaAssetId?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireOwner(talentProfileId);
  if (!auth.ok) return auth;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name the extra." };
  let groupId = input.id ?? "";
  const mediaAssetId = input.mediaAssetId === undefined ? undefined : input.mediaAssetId;
  if (!groupId) {
    const { data, error } = await auth.admin
      .from("talent_addon_groups")
      .insert({
        talent_profile_id: talentProfileId,
        name,
        amount_cents: Math.max(0, Math.round(input.amountCents)),
        duration_minutes: input.durationMinutes,
        ...(mediaAssetId !== undefined ? { media_asset_id: mediaAssetId } : {}),
      })
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Could not create extra." };
    groupId = data.id as string;
  } else {
    const { error } = await auth.admin
      .from("talent_addon_groups")
      .update({
        name,
        amount_cents: Math.max(0, Math.round(input.amountCents)),
        duration_minutes: input.durationMinutes,
        ...(mediaAssetId !== undefined ? { media_asset_id: mediaAssetId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", groupId)
      .eq("talent_profile_id", talentProfileId);
    if (error) return { ok: false, error: "Could not save extra." };
    await auth.admin.from("talent_addon_group_attachments").delete().eq("addon_group_id", groupId);
  }
  if (input.offeringIds.length > 0) {
    await auth.admin.from("talent_addon_group_attachments").insert(
      input.offeringIds.map((offeringId) => ({ addon_group_id: groupId, offering_id: offeringId })),
    );
  }
  revalidatePath("/talent/services");
  return { ok: true, id: groupId };
}
