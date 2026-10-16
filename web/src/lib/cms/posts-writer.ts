import "server-only";

/**
 * posts-writer.ts — Posts v1 writer save path (TUL-1006) + paid gate (TUL-1007).
 *
 * ONE write path for both owners of a post:
 *   scope.kind = "tenant"  → every cms_posts / cms_redirects query goes through
 *                            `tenantScopedQuery(…, scope.tenantId)`
 *   scope.kind = "talent"  → through `talentScopedQuery(…, scope.talentProfileId)`
 *                            (talent_profile_id = id AND tenant_id IS NULL)
 * There is no raw `.from("cms_posts")` in this file;
 * `posts-tenant-isolation.static.test.ts` asserts it.
 *
 * THE GATE (server-side; the UI lock is a convenience)
 * ─────────────────────────────────────────────────────
 *   `ctx.canPublish` is resolved by the caller PER ACTOR (talent → talentPosts /
 *   Web Office, workspace admin → workspace posts capability) and threaded in.
 *   - publish without it          → { ok:false, code:"upgrade_required" }; the
 *                                   draft content sent with the call IS saved.
 *   - edit of a LIVE post without → { ok:false, code:"read_only_lapsed" }; the
 *                                   row is never mutated (lapse keeps it live).
 *   - unpublish is always allowed (it only reduces visibility).
 *
 * TAKEDOWN
 * ────────
 *   A write that names taken_down_* is rejected (`forbidden_field`). A
 *   taken-down post refuses publish and edits with
 *   "Oculto por Tulala: {reason}" / "Hidden by Tulala: {reason}".
 *
 * SCHEDULING ("Programado")
 * ─────────────────────────
 *   status='draft' AND scheduled_publish_at set (NOT published_at: live-tenant
 *   drafts carry stale published_at values). Setting scheduled_publish_at is a
 *   publish intent, gated like publish; null clears it. The cron
 *   (`posts-scheduled-sweep.ts`) publishes with published_at =
 *   scheduled_publish_at and clears the schedule.
 *
 * LAPSE (read-only live posts) is per ACTOR: a talent without Web Office
 * cannot edit live posts, also under their own workspace scope. A workspace
 * admin keeps editing already-published posts on any plan (no regression);
 * only moving a post INTO published (publish / schedule) needs the capability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { parsePostBlocks } from "@/lib/cms/post-blocks";
import { isPostLocale, isValidPostSlug, type PostLocale } from "@/lib/cms/posts-shared";
import { logServerError } from "@/lib/server/safe-error";
import { talentScopedQuery } from "@/lib/supabase/talent-scoped-query";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

// ---- scope -----------------------------------------------------------------

export type PostScope =
  | { kind: "tenant"; tenantId: string }
  | { kind: "talent"; talentProfileId: string };

/** The scoped builder for `table` — the ONLY way this file reaches a table. */
function scoped(supabase: SupabaseClient, table: "cms_posts" | "cms_redirects", scope: PostScope) {
  return scope.kind === "tenant"
    ? tenantScopedQuery(supabase, table, scope.tenantId)
    : talentScopedQuery(supabase, table, scope.talentProfileId);
}

// ---- shapes ----------------------------------------------------------------

export type PostWriterContext = {
  supabase: SupabaseClient;
  scope: PostScope;
  /** null only for the cron (no session); the audit columns stay as they were. */
  actorProfileId: string | null;
  /**
   * Who is writing. Lapse is ACTOR-based: a talent without Web Office gets
   * read_only_lapsed on live posts in either scope; a workspace admin (and the
   * cron, "system") keeps editing live posts on any plan.
   */
  actorKind: "talent" | "workspace_admin" | "system";
  /** Per-actor posts capability, resolved by the action layer. */
  canPublish: boolean;
  /** Language of the human-readable messages. */
  uiLocale?: "es" | "en";
};

export type PostWriteCode =
  | "upgrade_required"
  | "read_only_lapsed"
  | "taken_down"
  | "forbidden_field"
  | "validation_failed"
  | "slug_taken"
  | "not_found"
  | "write_failed";

export type PostWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PostWriteCode; message: string; draftSaved?: boolean };

export type PostWriterRecord = {
  id: string;
  status: string;
  slug: string;
  locale: string;
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  updatedAt: string | null;
};

type PostRow = {
  id: string;
  status: string;
  slug: string;
  locale: string;
  published_at: string | null;
  scheduled_publish_at: string | null;
  updated_at: string | null;
  taken_down_at: string | null;
  taken_down_reason: string | null;
};

const ROW_COLUMNS = "id, status, slug, locale, published_at, scheduled_publish_at, updated_at, taken_down_at, taken_down_reason";

function toRecord(row: PostRow): PostWriterRecord {
  return {
    id: row.id,
    status: row.status,
    slug: row.slug,
    locale: row.locale,
    publishedAt: row.published_at,
    scheduledPublishAt: row.scheduled_publish_at,
    updatedAt: row.updated_at,
  };
}

// ---- messages --------------------------------------------------------------

const MESSAGES = {
  es: {
    upgrade_required: "Publicar posts es parte de Web Office. Tu borrador está guardado.",
    upgrade_required_workspace: "Publicar posts requiere el plan Website o superior. Tu borrador está guardado.",
    read_only_lapsed: "Tu plan ya no incluye posts. Los publicados siguen en línea, pero no se pueden editar hasta renovar.",
    not_found: "No encontramos este post. Recarga la lista.",
    validation_failed: "Revisa los campos del post.",
    forbidden_field: "Ese campo no se puede cambiar.",
    slug_taken: "Otro post en este idioma ya usa esa dirección.",
    write_failed: "No se pudo guardar. Inténtalo de nuevo.",
    taken_down: (reason: string) => `Oculto por Tulala: ${reason}`,
  },
  en: {
    upgrade_required: "Publishing posts is part of Web Office. Your draft is saved.",
    upgrade_required_workspace: "Publishing posts needs the Website plan or above. Your draft is saved.",
    read_only_lapsed: "Your plan no longer includes posts. Published posts stay live but can't be edited until you renew.",
    not_found: "Post not found. Reload the list.",
    validation_failed: "Check the post's fields.",
    forbidden_field: "That field can't be changed.",
    slug_taken: "Another post in this language already uses that address.",
    write_failed: "Could not save. Try again.",
    taken_down: (reason: string) => `Hidden by Tulala: ${reason}`,
  },
} as const;

/** Talent-actor lapse: a live post is read-only without Web Office, in any scope. */
function liveLocked(ctx: PostWriterContext, row: PostRow): boolean {
  return ctx.actorKind === "talent" && row.status === "published" && !ctx.canPublish;
}

function msg(ctx: PostWriterContext) {
  return MESSAGES[ctx.uiLocale ?? "es"];
}

function fail<T>(
  ctx: PostWriterContext,
  code: Exclude<PostWriteCode, "taken_down">,
  extra?: { message?: string; draftSaved?: boolean },
): PostWriteResult<T> {
  const m = msg(ctx);
  const message =
    extra?.message ??
    (code === "upgrade_required" && ctx.scope.kind === "tenant" ? m.upgrade_required_workspace : m[code]);
  return { ok: false, code, message, ...(extra?.draftSaved ? { draftSaved: true } : {}) };
}

function takenDown<T>(ctx: PostWriterContext, row: PostRow): PostWriteResult<T> {
  return { ok: false, code: "taken_down", message: msg(ctx).taken_down(row.taken_down_reason ?? "") };
}

// ---- validation ------------------------------------------------------------

/** Any key that names a takedown column — platform-admin only. */
function namesTakedownField(input: object): boolean {
  return Object.keys(input).some((k) => /^taken_?down/i.test(k));
}

/**
 * Strict block validation: `parsePostBlocks` drops invalid blocks, so a
 * length mismatch means the client sent at least one invalid block. A write
 * never silently loses content.
 */
function validateBlocks(raw: unknown): { ok: true; blocks: ReturnType<typeof parsePostBlocks> } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  const blocks = parsePostBlocks(raw);
  return blocks.length === raw.length ? { ok: true, blocks } : { ok: false };
}

const nullableText = z.string().trim().max(2000).nullable();
const nullableUuid = z.string().uuid().nullable();
const nullableIso = z.string().datetime({ offset: true }).nullable();

export const postSettingsSchema = z
  .object({
    status: z.enum(["draft", "published", "archived"]),
    published_at: nullableIso,
    scheduled_publish_at: nullableIso,
    category_id: nullableUuid,
    is_featured: z.boolean(),
    is_unlisted: z.boolean(),
    expires_at: nullableIso,
    related_offering_id: nullableUuid,
    meta_title: nullableText,
    meta_description: nullableText,
    slug: z.string().trim().toLowerCase(),
    cover_image_url: nullableText,
    cover_image_alt: nullableText,
    og_image_url: nullableText,
    noindex: z.boolean(),
  })
  .partial()
  .strict();

export type PostSettingsPatch = z.input<typeof postSettingsSchema>;

export type PostDraftValues = {
  title?: string;
  excerpt?: string;
  bodyBlocks?: unknown;
};

// ---- shared reads / writes -------------------------------------------------

async function loadRow(ctx: PostWriterContext, postId: string): Promise<PostRow | null | "error"> {
  const { data, error } = await scoped(ctx.supabase, "cms_posts", ctx.scope)
    .select(ROW_COLUMNS)
    .eq("id", postId)
    .maybeSingle<PostRow>();
  if (error) {
    logServerError("cms/posts-writer/load", error);
    return "error";
  }
  return data ?? null;
}

async function updateRow(
  ctx: PostWriterContext,
  postId: string,
  patch: Record<string, unknown>,
): Promise<PostRow | null | "error"> {
  const { data, error } = await scoped(ctx.supabase, "cms_posts", ctx.scope)
    .update(ctx.actorProfileId ? { ...patch, updated_by: ctx.actorProfileId } : patch)
    .eq("id", postId)
    .select(ROW_COLUMNS)
    .maybeSingle<PostRow>();
  if (error) {
    logServerError("cms/posts-writer/update", error);
    return "error";
  }
  return data ?? null;
}

function draftPatch(values: PostDraftValues): { ok: true; patch: Record<string, unknown> } | { ok: false } {
  const patch: Record<string, unknown> = {};
  if (values.title !== undefined) {
    const title = values.title.trim();
    if (!title || title.length > 300) return { ok: false };
    patch.title = title;
  }
  if (values.excerpt !== undefined) patch.excerpt = values.excerpt.trim().slice(0, 1000);
  if (values.bodyBlocks !== undefined) {
    const checked = validateBlocks(values.bodyBlocks);
    if (!checked.ok) return { ok: false };
    patch.body_blocks = checked.blocks;
  }
  return { ok: true, patch };
}

async function slugIsTaken(ctx: PostWriterContext, locale: string, slug: string, excludeId: string): Promise<boolean> {
  const { data } = await scoped(ctx.supabase, "cms_posts", ctx.scope)
    .select("id")
    .eq("locale", locale)
    .eq("slug", slug)
    .neq("id", excludeId)
    .maybeSingle();
  return !!data;
}

/** `/blog/<old>` → `/blog/<new>`, scoped to the same owner as the post. */
async function writeSlugRedirect(ctx: PostWriterContext, oldSlug: string, newSlug: string): Promise<void> {
  const { error } = await scoped(ctx.supabase, "cms_redirects", ctx.scope).insert({
    old_path: `/blog/${oldSlug}`,
    new_path: `/blog/${newSlug}`,
    status_code: 301,
    active: true,
    created_by: ctx.actorProfileId,
  });
  // Logged, never thrown: the slug change already landed; a missing redirect
  // is recoverable from the Redirects screen, a failed save is not.
  if (error) logServerError("cms/posts-writer/slug-redirect", error);
}

// ---- operations ------------------------------------------------------------

/** New draft. Allowed on every plan (free drafts + previews). */
export async function createPostDraft(
  ctx: PostWriterContext,
  input: { locale: PostLocale } & PostDraftValues,
): Promise<PostWriteResult<PostWriterRecord>> {
  if (namesTakedownField(input)) return fail(ctx, "forbidden_field");
  if (!isPostLocale(input.locale)) return fail(ctx, "validation_failed");
  const checked = draftPatch({ title: input.title ?? "Sin título", excerpt: input.excerpt, bodyBlocks: input.bodyBlocks ?? [] });
  if (!checked.ok) return fail(ctx, "validation_failed");

  const slug = `borrador-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { data, error } = await scoped(ctx.supabase, "cms_posts", ctx.scope)
    .insert({
      ...checked.patch,
      locale: input.locale,
      slug,
      body: "",
      status: "draft",
      include_in_sitemap: true,
      author_profile_id: ctx.actorProfileId,
      created_by: ctx.actorProfileId,
      updated_by: ctx.actorProfileId,
    })
    .select(ROW_COLUMNS)
    .single<PostRow>();
  if (error || !data) {
    logServerError("cms/posts-writer/create", error ?? new Error("insert returned no row"));
    return fail(ctx, "write_failed");
  }
  return { ok: true, data: toRecord(data) };
}

/**
 * Autosave. Idempotent (same values → same row) and last-write-wins: no
 * version check, the newest call's values are what the row holds; the
 * returned `updatedAt` is the server's stamp.
 */
export async function savePostDraft(
  ctx: PostWriterContext,
  input: { id: string } & PostDraftValues,
): Promise<PostWriteResult<PostWriterRecord>> {
  if (namesTakedownField(input)) return fail(ctx, "forbidden_field");
  const checked = draftPatch(input);
  if (!checked.ok) return fail(ctx, "validation_failed");

  const row = await loadRow(ctx, input.id);
  if (row === "error") return fail(ctx, "write_failed");
  if (!row) return fail(ctx, "not_found");
  if (row.taken_down_at) return takenDown(ctx, row);
  if (liveLocked(ctx, row)) return fail(ctx, "read_only_lapsed");
  if (Object.keys(checked.patch).length === 0) return { ok: true, data: toRecord(row) };

  const updated = await updateRow(ctx, input.id, checked.patch);
  if (updated === "error") return fail(ctx, "write_failed");
  if (!updated) return fail(ctx, "not_found");
  return { ok: true, data: toRecord(updated) };
}

/**
 * Settings sheet. A publish intent in the patch (status='published' or a
 * future published_at on a draft) without the capability saves the rest of
 * the patch and returns `upgrade_required` with `draftSaved: true`.
 */
export async function updatePostSettings(
  ctx: PostWriterContext,
  input: { id: string; patch: PostSettingsPatch },
): Promise<PostWriteResult<PostWriterRecord>> {
  if (namesTakedownField(input.patch)) return fail(ctx, "forbidden_field");
  const parsed = postSettingsSchema.safeParse(input.patch);
  if (!parsed.success) return fail(ctx, "validation_failed");
  const patch: Record<string, unknown> = { ...parsed.data };

  const row = await loadRow(ctx, input.id);
  if (row === "error") return fail(ctx, "write_failed");
  if (!row) return fail(ctx, "not_found");
  if (row.taken_down_at) return takenDown(ctx, row);
  if (liveLocked(ctx, row)) return fail(ctx, "read_only_lapsed");

  if (typeof patch.slug === "string") {
    if (!isValidPostSlug(patch.slug)) return fail(ctx, "validation_failed");
    if (patch.slug === row.slug) delete patch.slug;
    else if (await slugIsTaken(ctx, row.locale, patch.slug, row.id)) return fail(ctx, "slug_taken");
  }

  // Publish intent: going live now, or scheduling ("Programado").
  const schedules = typeof patch.scheduled_publish_at === "string";
  const publishes = patch.status === "published" && row.status !== "published";
  let blocked = false;
  if ((publishes || schedules) && !ctx.canPublish) {
    blocked = true;
    delete patch.status;
    delete patch.published_at;
    delete patch.scheduled_publish_at;
  }
  if (publishes && !blocked) patch.scheduled_publish_at = null;
  if (publishes && !blocked && patch.published_at === undefined) {
    patch.published_at = new Date().toISOString();
  }
  if (patch.status === "draft" && row.status === "published" && patch.published_at === undefined) {
    patch.published_at = null;
  }

  // Captured before the write: the redirect compares against the pre-update row.
  const before = { slug: row.slug, status: row.status };
  let result: PostRow = row;
  if (Object.keys(patch).length > 0) {
    const updated = await updateRow(ctx, row.id, patch);
    if (updated === "error") return fail(ctx, "write_failed");
    if (!updated) return fail(ctx, "not_found");
    result = updated;
  }
  if (blocked) return fail(ctx, "upgrade_required", { draftSaved: true });

  if (before.status === "published" && result.status === "published" && result.slug !== before.slug) {
    await writeSlugRedirect(ctx, before.slug, result.slug);
  }
  return { ok: true, data: toRecord(result) };
}

/**
 * Publish now. `draft` (optional) is the writer's unsaved content: it is saved
 * FIRST, so a free actor hitting `upgrade_required` keeps every keystroke.
 */
export async function publishPostNow(
  ctx: PostWriterContext,
  input: { id: string; draft?: PostDraftValues; /** cron: published_at = scheduled_publish_at */ fromSchedule?: boolean },
): Promise<PostWriteResult<PostWriterRecord>> {
  if (namesTakedownField(input) || (input.draft && namesTakedownField(input.draft))) {
    return fail(ctx, "forbidden_field");
  }
  const row = await loadRow(ctx, input.id);
  if (row === "error") return fail(ctx, "write_failed");
  if (!row) return fail(ctx, "not_found");
  if (row.taken_down_at) return takenDown(ctx, row);
  if (liveLocked(ctx, row)) return fail(ctx, "read_only_lapsed");

  let draftPatchValues: Record<string, unknown> = {};
  if (input.draft) {
    const checked = draftPatch(input.draft);
    if (!checked.ok) return fail(ctx, "validation_failed");
    draftPatchValues = checked.patch;
  }

  // Workspace-admin actor, post already live, plan without posts: this is an EDIT of
  // a live post (allowed, no regression), not a move into published.
  if (!ctx.canPublish && row.status === "published") {
    if (Object.keys(draftPatchValues).length === 0) return { ok: true, data: toRecord(row) };
    const saved = await updateRow(ctx, row.id, draftPatchValues);
    if (saved === "error" || !saved) return fail(ctx, "write_failed");
    return { ok: true, data: toRecord(saved) };
  }
  if (!ctx.canPublish) {
    if (Object.keys(draftPatchValues).length > 0) {
      const saved = await updateRow(ctx, row.id, draftPatchValues);
      if (saved === "error" || !saved) return fail(ctx, "write_failed");
    }
    return fail(ctx, "upgrade_required", { draftSaved: true });
  }

  const updated = await updateRow(ctx, row.id, {
    ...draftPatchValues,
    status: "published",
    published_at:
      input.fromSchedule && row.scheduled_publish_at ? row.scheduled_publish_at : new Date().toISOString(),
    scheduled_publish_at: null,
  });
  if (updated === "error") return fail(ctx, "write_failed");
  if (!updated) return fail(ctx, "not_found");
  return { ok: true, data: toRecord(updated) };
}

/** Back to draft. Always allowed (reduces visibility), also when lapsed or taken down. */
export async function unpublishPostNow(
  ctx: PostWriterContext,
  input: { id: string },
): Promise<PostWriteResult<PostWriterRecord>> {
  const updated = await updateRow(ctx, input.id, {
    status: "draft",
    published_at: null,
    scheduled_publish_at: null,
  });
  if (updated === "error") return fail(ctx, "write_failed");
  if (!updated) return fail(ctx, "not_found");
  return { ok: true, data: toRecord(updated) };
}
