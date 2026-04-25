"use server";

/**
 * Phase 5+ helper — read another locale's homepage composition so the
 * client can clone it into the active locale's draft.
 *
 * Section ids are tenant-scoped (not locale-scoped), so the slot
 * composition transfers verbatim. Page-level metadata (title, meta
 * description, intro tagline, og fields) is also returned so the
 * operator can copy editorial copy as a starting point and translate
 * in place.
 *
 * The action only READS — it returns a payload that the composer
 * applies via the existing `saveHomepageDraftAction`. That keeps every
 * write going through the audited save path and avoids duplicating the
 * CAS / capability gates here.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { loadHomepageForStaff } from "@/lib/site-admin/server/homepage";

export interface CloneLocalePayload {
  metadata: {
    title: string;
    metaDescription: string;
    introTagline: string;
    ogTitle: string;
    ogDescription: string;
    ogImageUrl: string;
    canonicalUrl: string;
    noindex: boolean;
  };
  /** Slot composition — slot key → ordered list of section ids. */
  slots: Record<string, ReadonlyArray<{ sectionId: string; sortOrder: number }>>;
  /** TRUE if the source had any draft rows; FALSE means we sourced from live. */
  sourcedFromDraft: boolean;
}

export type LoadLocaleHomepageResult =
  | { ok: true; data: CloneLocalePayload }
  | { ok: false; error: string; code?: string };

export async function loadLocaleHomepageForCloneAction(
  sourceLocaleRaw: string,
): Promise<LoadLocaleHomepageResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace first.",
      code: "NO_TENANT",
    };
  }

  if (!isLocale(sourceLocaleRaw)) {
    return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };
  }
  const sourceLocale = sourceLocaleRaw as Locale;

  try {
    const state = await loadHomepageForStaff(
      auth.supabase,
      scope.tenantId,
      sourceLocale,
    );
    if (!state) {
      return {
        ok: false,
        error: `No homepage exists yet for locale ${sourceLocale}.`,
        code: "NOT_FOUND",
      };
    }
    // Prefer draft rows (most recent operator intent); fall back to live
    // if the source has no in-flight draft.
    const sourceRows =
      state.draftSlots.length > 0 ? state.draftSlots : state.liveSlots;
    const sourcedFromDraft = state.draftSlots.length > 0;

    const slots: Record<
      string,
      Array<{ sectionId: string; sortOrder: number }>
    > = {};
    for (const row of sourceRows) {
      const list = slots[row.slot_key] ?? [];
      list.push({ sectionId: row.section_id, sortOrder: row.sort_order });
      slots[row.slot_key] = list;
    }
    // Normalise sortOrder to 0..N-1 per slot so the client can re-emit
    // a clean composition without holes.
    for (const key of Object.keys(slots)) {
      slots[key] = (slots[key] ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((entry, idx) => ({
          sectionId: entry.sectionId,
          sortOrder: idx,
        }));
    }

    const heroIntro =
      typeof (state.page.hero as { introTagline?: unknown } | null)
        ?.introTagline === "string"
        ? ((state.page.hero as { introTagline: string }).introTagline)
        : "";

    return {
      ok: true,
      data: {
        metadata: {
          title: state.page.title ?? "",
          metaDescription: state.page.meta_description ?? "",
          introTagline: heroIntro,
          ogTitle: state.page.og_title ?? "",
          ogDescription: state.page.og_description ?? "",
          ogImageUrl: state.page.og_image_url ?? "",
          canonicalUrl: state.page.canonical_url ?? "",
          noindex: state.page.noindex ?? false,
        },
        slots,
        sourcedFromDraft,
      },
    };
  } catch (error) {
    logServerError("homepage/clone-locale-load", error);
    return {
      ok: false,
      error: "Failed to load source locale.",
      code: "LOAD_FAILED",
    };
  }
}
