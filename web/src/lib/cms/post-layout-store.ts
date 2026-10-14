import "server-only";

/**
 * post-layout-store.ts — where "Diseño de posts" lives (Posts v1, TUL-1008).
 *
 * The logic (get-or-create from the theme default, idempotent; read-only public
 * load with a null fallback) sits in the functions below and runs against an
 * injectable `PostLayoutStore`, so tests use a typed in-memory fake. The
 * Supabase store is the only code that touches tables:
 *
 *   workspace → `cms_pages` via `tenantScopedQuery` (the tenant-scoped write
 *               path), system-owned row `post_layout` per tenant + locale
 *   talent    → `talent_sites.post_layout` (one site per talent profile)
 *
 * A layout save is live (no draft/publish split): it is the design of every
 * post page, and the public render reads it with a 60 s revalidate.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  defaultPostLayout,
  parsePostLayout,
  POST_LAYOUT_SLUG,
  POST_LAYOUT_SYSTEM_KEY,
  toPostLayoutEnvelope,
  type PostLayoutEnvelope,
  type PostLayoutSection,
} from "@/lib/cms/post-layout";
import type { PostScope } from "@/lib/cms/posts-writer";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export interface PostLayoutStore {
  findWorkspaceLayout(tenantId: string, locale: string): Promise<{ id: string; blocks: unknown } | null>;
  /** Insert the system row. Returns null when it already exists (unique race) or the write failed. */
  insertWorkspaceLayout(
    tenantId: string,
    locale: string,
    envelope: PostLayoutEnvelope,
  ): Promise<{ id: string; blocks: unknown } | null>;
  updateWorkspaceLayout(tenantId: string, id: string, envelope: PostLayoutEnvelope): Promise<boolean>;
  readTalentLayout(talentProfileId: string): Promise<unknown | null>;
  writeTalentLayout(talentProfileId: string, envelope: PostLayoutEnvelope): Promise<boolean>;
}

export type EnsuredPostLayout = {
  sections: PostLayoutSection[];
  /** Workspace only: the cms_pages id of the system row (the builder opens it). */
  pageId: string | null;
  /** True when this call wrote the theme default. */
  created: boolean;
};

/**
 * First use: create the layout from the theme default. Idempotent: an existing
 * valid layout is returned untouched; a concurrent create (unique violation)
 * resolves to the winner's row; an existing but unreadable row is repaired to
 * the default (the row is system-owned and cannot be deleted).
 */
export async function ensurePostLayout(
  store: PostLayoutStore,
  scope: PostScope,
  locale: string,
): Promise<EnsuredPostLayout | null> {
  const fallback = defaultPostLayout(locale);
  const envelope = toPostLayoutEnvelope(fallback);

  if (scope.kind === "talent") {
    const current = parsePostLayout(await store.readTalentLayout(scope.talentProfileId));
    if (current) return { sections: current, pageId: null, created: false };
    const ok = await store.writeTalentLayout(scope.talentProfileId, envelope);
    return ok ? { sections: fallback, pageId: null, created: true } : null;
  }

  const existing = await store.findWorkspaceLayout(scope.tenantId, locale);
  if (existing) {
    const current = parsePostLayout(existing.blocks);
    if (current) return { sections: current, pageId: existing.id, created: false };
    const ok = await store.updateWorkspaceLayout(scope.tenantId, existing.id, envelope);
    return ok ? { sections: fallback, pageId: existing.id, created: true } : null;
  }
  const inserted = await store.insertWorkspaceLayout(scope.tenantId, locale, envelope);
  if (inserted) return { sections: parsePostLayout(inserted.blocks) ?? fallback, pageId: inserted.id, created: true };
  // Lost a create race (or the insert failed): read what is there.
  const winner = await store.findWorkspaceLayout(scope.tenantId, locale);
  if (!winner) return null;
  return { sections: parsePostLayout(winner.blocks) ?? fallback, pageId: winner.id, created: false };
}

/** Public read: NEVER creates. `null` = no usable layout, render the article directly. */
export async function loadPostLayout(
  store: PostLayoutStore,
  scope: PostScope,
  locale: string,
): Promise<PostLayoutSection[] | null> {
  if (scope.kind === "talent") return parsePostLayout(await store.readTalentLayout(scope.talentProfileId));
  const row = await store.findWorkspaceLayout(scope.tenantId, locale);
  return row ? parsePostLayout(row.blocks) : null;
}

/** Save an edited section list. Invalid lists are refused (never stored). */
export async function savePostLayout(
  store: PostLayoutStore,
  scope: PostScope,
  locale: string,
  sections: readonly PostLayoutSection[],
): Promise<boolean> {
  const envelope = toPostLayoutEnvelope(sections);
  if (!parsePostLayout(envelope)) return false;
  if (scope.kind === "talent") return store.writeTalentLayout(scope.talentProfileId, envelope);
  const ensured = await ensurePostLayout(store, scope, locale);
  if (!ensured?.pageId) return false;
  return store.updateWorkspaceLayout(scope.tenantId, ensured.pageId, envelope);
}

// ---- Supabase store ----------------------------------------------------------

const PG_UNIQUE_VIOLATION = "23505";

export function createSupabasePostLayoutStore(db: SupabaseClient): PostLayoutStore {
  return {
    async findWorkspaceLayout(tenantId, locale) {
      const { data, error } = await tenantScopedQuery(db, "cms_pages", tenantId)
        .select("id, blocks")
        .eq("locale", locale)
        .eq("is_system_owned", true)
        .eq("system_template_key", POST_LAYOUT_SYSTEM_KEY)
        .maybeSingle();
      if (error) {
        logServerError("cms/post-layout/find", error);
        return null;
      }
      return (data ?? null) as { id: string; blocks: unknown } | null;
    },
    async insertWorkspaceLayout(tenantId, locale, envelope) {
      const { data, error } = await tenantScopedQuery(db, "cms_pages", tenantId)
        .insert({
          locale,
          slug: POST_LAYOUT_SLUG,
          template_key: "standard_page",
          template_schema_version: 1,
          title: locale === "es" ? "Diseño de posts" : "Post design",
          is_system_owned: true,
          system_template_key: POST_LAYOUT_SYSTEM_KEY,
          // Never routable, indexed or listed: it is a design, not a destination.
          status: "draft",
          noindex: true,
          include_in_sitemap: false,
          blocks: envelope,
        })
        .select("id, blocks")
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code !== PG_UNIQUE_VIOLATION) logServerError("cms/post-layout/insert", error);
        return null;
      }
      return (data ?? null) as { id: string; blocks: unknown } | null;
    },
    async updateWorkspaceLayout(tenantId, id, envelope) {
      const { error } = await tenantScopedQuery(db, "cms_pages", tenantId)
        .update({ blocks: envelope, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("system_template_key", POST_LAYOUT_SYSTEM_KEY);
      if (error) logServerError("cms/post-layout/update", error);
      return !error;
    },
    async readTalentLayout(talentProfileId) {
      const { data, error } = await db
        .from("talent_sites")
        .select("post_layout")
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle();
      if (error) {
        logServerError("cms/post-layout/talent-read", error);
        return null;
      }
      return (data as { post_layout?: unknown } | null)?.post_layout ?? null;
    },
    async writeTalentLayout(talentProfileId, envelope) {
      const { data, error } = await db
        .from("talent_sites")
        .update({ post_layout: envelope })
        .eq("talent_profile_id", talentProfileId)
        .select("talent_profile_id");
      if (error) logServerError("cms/post-layout/talent-write", error);
      return !error && (data?.length ?? 0) > 0;
    },
  };
}

/** The public/server default store, or null when the service role is not configured. */
export function defaultPostLayoutStore(): PostLayoutStore | null {
  const db = createServiceRoleClient();
  return db ? createSupabasePostLayoutStore(db) : null;
}
