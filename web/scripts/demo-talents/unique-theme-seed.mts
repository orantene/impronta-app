/**
 * TUL-38 unique-theme seed (slice 1).
 *
 * Dry-run by default. Demo profiles only; refuses any non-demo / forbidden
 * code (including TAL-93938 and TAL-93900). PM runs --apply.
 *
 * From web/:
 *   DEMO_SEED_TARGET_REF=<ref> npx tsx --env-file=.env.local \
 *     scripts/demo-talents/unique-theme-seed.mts
 *   ... unique-theme-seed.mts --apply
 *   ... unique-theme-seed.mts --only TAL-93020,TAL-93011
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { DEMO_BATCH } from "../../src/lib/talent-site/theme-catalog/demo-account";
import { queryLifestyleStockForType } from "../../src/lib/media/platform-stock";
import { run, type AuthMeta, type Io, type ProfileRow, type SiteRow, type StockPhoto } from "./unique-theme-seed-lib";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  throw new Error("REFUSE: SUPABASE_SERVICE_ROLE_KEY is required");
}

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "media-public";

function makeIo(sb: SupabaseClient): Io {
  return {
    async findProfile(code) {
      const { data, error } = await sb
        .from("talent_profiles")
        .select("id, profile_code, is_demo, user_id, display_name, short_bio, bio_i18n, preferred_locale")
        .eq("profile_code", code)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
    async findSite(talentProfileId) {
      const { data, error } = await sb
        .from("talent_sites")
        .select("id, site_slug, theme_design_slug, status")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle();
      if (error) throw error;
      return (data as SiteRow | null) ?? null;
    },
    async findAuth(userId) {
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (error) throw error;
      const u = data.user;
      if (!u) return null;
      const meta = (u.app_metadata ?? {}) as { demo_batch?: string; demo?: boolean };
      return {
        email: u.email ?? null,
        demo_batch: meta.demo_batch ?? null,
        demo: meta.demo ?? null,
      } satisfies AuthMeta;
    },
    async listStock(input) {
      const rows = await queryLifestyleStockForType(sb, {
        businessType: input.businessType,
        family: input.family,
      });
      return rows.map(
        (r): StockPhoto => ({
          id: r.id,
          assetId: r.assetId,
          url: r.url,
          role: r.role,
          businessType: r.businessType,
          family: r.family,
          alt: r.alt,
        }),
      );
    },
    async writeProfile({ id, patch }) {
      // Re-check is_demo immediately before write.
      const { data: row, error: readErr } = await sb
        .from("talent_profiles")
        .select("id, profile_code, is_demo")
        .eq("id", id)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!row || row.is_demo !== true) return { ok: false, error: "REFUSE: profile is not is_demo=true at write time" };
      const { error } = await sb
        .from("talent_profiles")
        .update({
          short_bio: patch.short_bio,
          bio_i18n: patch.bio_i18n,
          preferred_locale: patch.preferred_locale,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("is_demo", true);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async writeSiteTheme({ siteId, theme }) {
      const { data: site, error: readErr } = await sb
        .from("talent_sites")
        .select("id, talent_profile_id")
        .eq("id", siteId)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!site) return { ok: false, error: "site not found" };
      const { data: tp, error: tpErr } = await sb
        .from("talent_profiles")
        .select("is_demo, profile_code")
        .eq("id", site.talent_profile_id)
        .maybeSingle();
      if (tpErr) return { ok: false, error: tpErr.message };
      if (!tp || tp.is_demo !== true) return { ok: false, error: "REFUSE: site owner is not a demo profile" };
      const { error } = await sb
        .from("talent_sites")
        .update({ theme_design_slug: theme, updated_at: new Date().toISOString() })
        .eq("id", siteId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async attachStock({ talentProfileId, userId, picks }) {
      const { data: tp, error: tpErr } = await sb
        .from("talent_profiles")
        .select("id, profile_code, is_demo, user_id")
        .eq("id", talentProfileId)
        .maybeSingle();
      if (tpErr) return { ok: false, error: tpErr.message };
      if (!tp || tp.is_demo !== true || tp.user_id !== userId) {
        return { ok: false, error: "REFUSE: attach target is not the expected demo profile" };
      }

      const { data: roster } = await sb
        .from("agency_talent_roster")
        .select("tenant_id")
        .eq("talent_profile_id", talentProfileId)
        .limit(1)
        .maybeSingle();
      const tenantId = (roster as { tenant_id: string } | null)?.tenant_id;
      if (!tenantId) return { ok: false, error: "no roster tenant for demo" };

      let attached = 0;
      for (const pick of picks) {
        const { data: src, error: srcErr } = await sb
          .from("media_assets")
          .select("id, storage_path, bucket_id, width, height, mime_type, alt, file_size")
          .eq("id", pick.photo.assetId)
          .maybeSingle();
        if (srcErr) return { ok: false, error: srcErr.message };
        if (!src?.storage_path) return { ok: false, error: `stock asset missing: ${pick.photo.assetId}` };

        const variant =
          pick.key.startsWith("gallery") || pick.key === "detail"
            ? "gallery"
            : pick.key === "hero" || pick.key === "wide"
              ? "banner"
              : pick.key === "portrait"
                ? "card"
                : "gallery";

        // Reference the stock object in place (same storage_path). Bytes stay on
        // the tulala stock tenant; the demo row only points at them.
        const { error: insErr } = await sb.from("media_assets").insert({
          id: randomUUID(),
          tenant_id: tenantId,
          owner_talent_profile_id: talentProfileId,
          bucket_id: src.bucket_id ?? BUCKET,
          storage_path: src.storage_path,
          variant_kind: variant,
          approval_state: "approved",
          purpose: "talent",
          sort_order: attached,
          file_size: src.file_size ?? 0,
          mime_type: src.mime_type ?? "image/jpeg",
          width: src.width,
          height: src.height,
          alt: pick.photo.alt.es || src.alt || pick.photo.alt.en,
          attribution_note: `platform-stock:${pick.photo.id}`,
          metadata: {
            source: "platform-stock",
            demo_batch: DEMO_BATCH,
            stock_id: pick.photo.id,
            stock_role: pick.photo.role,
            unique_theme_slot: pick.key,
            seeded_by: "unique-theme-seed.mts",
          },
          ownership_kind: "talent",
          owner_tenant_id: null,
          uploaded_by_user_id: userId,
          created_by: userId,
        });
        if (insErr) return { ok: false, error: insErr.message };
        attached += 1;
      }
      return { ok: true, attached };
    },
  };
}

const result = await run(process.argv.slice(2), makeIo(admin));
process.exit(result.exitCode);
