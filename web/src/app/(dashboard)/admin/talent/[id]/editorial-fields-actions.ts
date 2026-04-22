"use server";

/**
 * M8 — save editorial talent_profiles fields.
 *
 * Saves the 12 M8 columns introduced by
 * `20260629120000_saas_m8_talent_profile_editorial_fields.sql`:
 *   intro_italic, event_styles[], destinations[], languages[],
 *   travels_globally, team_size, lead_time_weeks, starting_from,
 *   booking_note, package_teasers(jsonb), social_links(jsonb),
 *   embedded_media(jsonb), service_category_slug.
 *
 * Guards: admin role + updateTalentProfile-parity auth path (service role
 * via requireAdminClient). No tenant scope here — talent is cross-tenant;
 * tenant-scoped listing is handled by `agency_talent_roster` elsewhere.
 */

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

export type TalentEditorialActionState =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | undefined;

// ---- parsers --------------------------------------------------------------

/** Comma-separated → trimmed, non-empty, deduped. Bounded to 24 items. */
function parseCommaList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(",")) {
    const t = piece.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 24) break;
  }
  return out;
}

/** Parse + validate JSON; empty/undefined returns []. */
function parseJsonArray<T>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
  fieldName: string,
): { ok: true; value: T[] } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: `${fieldName}: expected an array` };
    }
    const arr: T[] = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const r = schema.safeParse(parsed[i]);
      if (!r.success) {
        const msg = r.error.issues
          .map((x) => `[${i}].${x.path.join(".")}: ${x.message}`)
          .join("; ");
        return { ok: false, error: `${fieldName}: ${msg}` };
      }
      arr.push(r.data);
    }
    return { ok: true, value: arr };
  } catch {
    return { ok: false, error: `${fieldName}: not valid JSON` };
  }
}

// ---- schemas for JSONB items ---------------------------------------------

const packageTeaserSchema = z
  .object({
    label: z.string().trim().min(1).max(140),
    detail: z.string().trim().max(360).optional().default(""),
  })
  .strict();

const socialLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    href: z.string().trim().min(1).max(500),
  })
  .strict();

const embeddedMediaSchema = z
  .object({
    provider: z.enum(["spotify", "soundcloud", "vimeo", "youtube"]),
    url: z.string().trim().min(1).max(500),
    label: z.string().trim().max(120).optional(),
  })
  .strict();

// ---- action ---------------------------------------------------------------

function single(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function saveTalentEditorialFields(
  _prev: TalentEditorialActionState,
  formData: FormData,
): Promise<TalentEditorialActionState> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const talentId = single(formData, "talent_id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(talentId)) {
    return { ok: false, error: "Missing or invalid talent id." };
  }

  const fieldErrors: Record<string, string> = {};

  const packages = parseJsonArray(
    single(formData, "package_teasers"),
    packageTeaserSchema,
    "package_teasers",
  );
  if (!packages.ok) fieldErrors.package_teasers = packages.error;

  const socials = parseJsonArray(
    single(formData, "social_links"),
    socialLinkSchema,
    "social_links",
  );
  if (!socials.ok) fieldErrors.social_links = socials.error;

  const embedded = parseJsonArray(
    single(formData, "embedded_media"),
    embeddedMediaSchema,
    "embedded_media",
  );
  if (!embedded.ok) fieldErrors.embedded_media = embedded.error;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Some editorial fields need attention.",
      fieldErrors,
    };
  }

  const event_styles = parseCommaList(single(formData, "event_styles"));
  const destinations = parseCommaList(single(formData, "destinations"));
  const languages = parseCommaList(single(formData, "languages"));

  const update = {
    intro_italic: single(formData, "intro_italic").trim() || null,
    event_styles,
    destinations,
    languages,
    travels_globally: single(formData, "travels_globally") === "on",
    team_size: single(formData, "team_size").trim() || null,
    lead_time_weeks: single(formData, "lead_time_weeks").trim() || null,
    starting_from: single(formData, "starting_from").trim() || null,
    booking_note: single(formData, "booking_note").trim() || null,
    service_category_slug:
      single(formData, "service_category_slug").trim() || null,
    package_teasers: (packages as { ok: true; value: unknown[] }).value,
    social_links: (socials as { ok: true; value: unknown[] }).value,
    embedded_media: (embedded as { ok: true; value: unknown[] }).value,
  };

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return { ok: false, error: "Server is missing service-role credentials." };
  }
  const { error } = await supabase
    .from("talent_profiles")
    .update(update)
    .eq("id", talentId);
  if (error) {
    logServerError("admin/saveTalentEditorialFields", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/admin/talent/${talentId}`);
  return { ok: true, message: "Editorial fields saved." };
}
