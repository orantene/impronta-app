/**
 * THEME RELEASES (Phase 3): "Open to talents" fan-out plan. Pure.
 *
 * One `talent_site_theme_updates` row (state `available`) per site inside the
 * rollout bucket, and one bell entry per talent. The bell row is a solo-talent
 * row: `tenant_id` NULL (the column is nullable since migration
 * 20261015000000), `surface` "talent", read by the tenant-free
 * `loadTalentSurfaceNotifications`. `origin_event_id` is the release id, so the
 * (origin_event_id, user_id) unique index makes a re-run a no-op.
 */
import { deterministicBucket } from "@/lib/site-admin/builder-core/templates/rollout";
import type { ThemeRelease } from "../types";

export interface FanOutSite {
  siteId: string;
  talentProfileId: string;
  userId: string;
  designTitle: string;
  /** talent_profiles.preferred_locale */
  locale: string | null;
}

export interface UpdateRow {
  talent_site_id: string;
  talent_profile_id: string;
  release_id: string;
  state: "available";
}

export interface BellRow {
  user_id: string;
  tenant_id: null;
  kind: "system";
  surface: "talent";
  title: string;
  body: string;
  /** Page target (`NOTIFICATION_PAGE_TARGETS`): opens My presence with the notice. */
  target_drawer: "theme-update";
  target_payload: { kind: "theme_update"; releaseId: string; design: string; toVersion: number };
  origin_event_id: string;
  origin_kind: "theme_release";
}

export function inRolloutBucket(siteId: string, releaseId: string, pct: number): boolean {
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return deterministicBucket(siteId, releaseId) < pct;
}

export function themeUpdateCopy(designTitle: string, locale: string | null): { title: string; body: string } {
  return (locale ?? "").toLowerCase().startsWith("es")
    ? {
        title: `${designTitle} tiene una actualización`,
        body: "Mira qué hay de nuevo y pruébala en tu sitio antes de aplicarla. Tu contenido y tus cambios se conservan.",
      }
    : {
        title: `${designTitle} has an update`,
        body: "See what is new and preview it on your site before you apply it. Your content and your edits are kept.",
      };
}

export function planFanOut(
  release: Pick<ThemeRelease, "id" | "design_slug" | "to_version" | "rollout_pct">,
  sites: ReadonlyArray<FanOutSite>,
): { updates: UpdateRow[]; bells: BellRow[] } {
  const picked = sites.filter((s) => inRolloutBucket(s.siteId, release.id, release.rollout_pct));
  const updates: UpdateRow[] = picked.map((s) => ({
    talent_site_id: s.siteId,
    talent_profile_id: s.talentProfileId,
    release_id: release.id,
    state: "available",
  }));
  // One bell per talent even if a talent somehow holds two sites.
  const seen = new Set<string>();
  const bells: BellRow[] = [];
  for (const s of picked) {
    if (seen.has(s.userId)) continue;
    seen.add(s.userId);
    const copy = themeUpdateCopy(s.designTitle, s.locale);
    bells.push({
      user_id: s.userId,
      tenant_id: null,
      kind: "system",
      surface: "talent",
      title: copy.title,
      body: copy.body,
      target_drawer: "theme-update",
      target_payload: { kind: "theme_update", releaseId: release.id, design: release.design_slug, toVersion: release.to_version },
      origin_event_id: release.id,
      origin_kind: "theme_release",
    });
  }
  return { updates, bells };
}
