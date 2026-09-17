"use server";

/**
 * Events surface, "Page & Promotion" tab: the builder page that IS an
 * event's public page (`events.page_id`).
 *
 * A sibling of `_events-actions.ts` rather than two more functions in it:
 * that file sits at 784 lines against the 800-line cap. Same guard pattern,
 * verbatim: THE TENANT IS NEVER A PARAMETER. `requireWorkspaceStaffAction`
 * resolves it from the session and the workspace under the operator's
 * cursor; a `pageId` from another tenant is refused by the tenant-scoped
 * existence check before anything is written.
 *
 * What the link means, so the tab can say it honestly: with a page linked,
 * `/events/<slug>` (and `/es/eventos/<slug>`) renders that builder page and
 * the page's own URL (`/<slug>`) redirects there. Cleared, the engine's own
 * event page renders again.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { localeUrlSettings } from "@/i18n/pathnames";
import { canonicalEventPath } from "@/lib/events/event-page-paths";

const CAPABILITY = "manage_agency_settings" as const;

export type EventPageOption = {
  /** The cms_pages row id of the PRIMARY-locale row (what `page_id` stores). */
  id: string;
  title: string;
  slug: string;
  locale: string;
};

export type EventPageLinkView = {
  /** Current `events.page_id`, or null for the engine page. */
  pageId: string | null;
  /** Published, non-system builder pages of this workspace, one per slug. */
  pages: EventPageOption[];
  /** The canonical public paths, in the tenant's own URL grammar. */
  canonical: { en: string; es: string };
};

export type LoadEventPageLinkResult = { ok: true; view: EventPageLinkView } | { ok: false; error: string };

/**
 * The event's current link plus the pages it could link to. Published pages
 * only: linking a draft would render the engine page anyway (the public read
 * is published-only on both sides), and offering it here would promise a
 * page the visitor never sees. One option per slug, the primary-locale row
 * first (ONE DESIGN PER PAGE: the primary row is the document).
 */
export async function loadEventPageLink(input: { eventId: string }): Promise<LoadEventPageLinkResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;
  const parsed = z.object({ eventId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  try {
    const [{ data: ev, error: evErr }, { data: pageRows, error: pageErr }, localeSettings] = await Promise.all([
      supabase.from("events").select("id, slug, page_id").eq("tenant_id", tenantId).eq("id", parsed.data.eventId).maybeSingle(),
      supabase
        .from("cms_pages")
        .select("id, title, slug, locale")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .eq("is_system_owned", false)
        .order("slug", { ascending: true }),
      loadTenantLocaleSettings(tenantId),
    ]);
    if (evErr) { logServerError("events.loadEventPageLink/event", evErr); return { ok: false, error: "Could not load this event." }; }
    if (!ev) return { ok: false, error: "That is not an event." };
    if (pageErr) { logServerError("events.loadEventPageLink/pages", pageErr); return { ok: false, error: "Could not load the website pages." }; }

    const bySlug = new Map<string, EventPageOption>();
    for (const row of pageRows ?? []) {
      const option: EventPageOption = { id: row.id as string, title: (row.title as string) ?? (row.slug as string), slug: row.slug as string, locale: row.locale as string };
      const existing = bySlug.get(option.slug);
      // Prefer the primary-locale row; keep whichever the link already points at.
      if (!existing || option.id === ev.page_id || (existing.id !== ev.page_id && option.locale === localeSettings.defaultLocale)) {
        bySlug.set(option.slug, option);
      }
    }
    const settings = localeUrlSettings(localeSettings.defaultLocale, localeSettings.supportedLocales);
    const slug = ev.slug as string;
    return {
      ok: true,
      view: {
        pageId: (ev.page_id as string | null) ?? null,
        pages: [...bySlug.values()],
        canonical: {
          en: canonicalEventPath({ slug, locale: "en", settings }),
          es: canonicalEventPath({ slug, locale: "es", settings }),
        },
      },
    };
  } catch (err) {
    logServerError("events.loadEventPageLink", err);
    return { ok: false, error: "Could not load this event." };
  }
}

const setSchema = z.object({
  eventId: z.string().uuid(),
  /** null clears the link: the engine's own event page renders again. */
  pageId: z.string().uuid().nullable(),
});

export type SetEventPageResult = { ok: true } | { ok: false; error: string };

/**
 * One tenant-scoped UPDATE of `events.page_id`. The page must be a published,
 * non-system page of THIS workspace; a page id from anywhere else is refused
 * before the write, and the write itself is scoped to the tenant again.
 */
export async function setEventPage(input: { eventId: string; pageId: string | null }): Promise<SetEventPageResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = setSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a page." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    if (parsed.data.pageId) {
      const { data: page, error: pErr } = await admin
        .from("cms_pages")
        .select("id")
        .eq("tenant_id", guard.tenantId)
        .eq("id", parsed.data.pageId)
        .eq("status", "published")
        .eq("is_system_owned", false)
        .maybeSingle();
      if (pErr) { logServerError("events.setEventPage/page", pErr); return { ok: false, error: "Could not check the page." }; }
      if (!page) return { ok: false, error: "That page is not a published page of this workspace." };
    }
    const { data, error } = await admin
      .from("events")
      .update({ page_id: parsed.data.pageId, updated_at: new Date().toISOString() })
      .eq("tenant_id", guard.tenantId)
      .eq("id", parsed.data.eventId)
      .select("id");
    if (error) { logServerError("events.setEventPage", error); return { ok: false, error: "Could not save the page link." }; }
    if (!data || data.length === 0) return { ok: false, error: "That is not an event in this workspace." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("events.setEventPage", err);
    return { ok: false, error: "Could not save the page link." };
  }
}
