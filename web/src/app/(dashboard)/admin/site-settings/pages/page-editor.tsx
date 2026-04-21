"use client";

/**
 * Phase 5 / M3 — page editor form.
 *
 * Handles create and edit in one component. Consumed by both
 *   /admin/site-settings/pages/new        (no row; expectedVersion=0)
 *   /admin/site-settings/pages/[id]       (row loaded; CAS version)
 *
 * Publish + archive + delete + preview are separate forms so each can
 * carry its own `expectedVersion` hidden input and surface its own
 * response state.
 *
 * Rollback lives in a sibling component (revision-history.tsx) to keep
 * this one focused on the main authoring surface.
 */

import { useActionState } from "react";

import {
  PageStatusBadge,
  SystemOwnedBadge,
} from "@/components/admin/page-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENCY_SELECTABLE_TEMPLATE_KEYS,
  PAGE_BODY_MAX,
  PAGE_CANONICAL_MAX,
  PAGE_META_DESCRIPTION_MAX,
  PAGE_META_TITLE_MAX,
  PAGE_OG_DESCRIPTION_MAX,
  PAGE_OG_TITLE_MAX,
  PAGE_SLUG_MAX,
  PAGE_TITLE_MAX,
} from "@/lib/site-admin/forms/pages";
import type { Locale } from "@/lib/site-admin/locales";
import type { PageRow } from "@/lib/site-admin/server/pages";

import {
  archivePageAction,
  deletePageAction,
  endPagePreviewAction,
  publishPageAction,
  savePageAction,
  startPagePreviewAction,
  type PageActionState,
} from "./actions";

interface Props {
  mode: "create" | "edit";
  page: PageRow | null;
  canEdit: boolean;
  canPublish: boolean;
  supportedLocales: readonly Locale[];
  defaultLocale: Locale;
}

function FieldError({
  messages,
  name,
}: {
  messages?: Record<string, string>;
  name: string;
}) {
  const msg = messages?.[name];
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

function Banner({ state }: { state: PageActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        {state.message}
      </p>
    );
  }
  return (
    <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}

export function PageEditor({
  mode,
  page,
  canEdit,
  canPublish,
  supportedLocales,
  defaultLocale,
}: Props) {
  const [saveState, saveAction, savePending] = useActionState<
    PageActionState,
    FormData
  >(savePageAction, undefined);

  const [publishState, publishAction, publishPending] = useActionState<
    PageActionState,
    FormData
  >(publishPageAction, undefined);

  const [archiveState, archiveAction, archivePending] = useActionState<
    PageActionState,
    FormData
  >(archivePageAction, undefined);

  const [deleteState, deleteAction, deletePending] = useActionState<
    PageActionState,
    FormData
  >(deletePageAction, undefined);

  const [previewState, previewAction, previewPending] = useActionState<
    PageActionState,
    FormData
  >(startPagePreviewAction, undefined);

  const [previewEndState, previewEndAction, previewEndPending] = useActionState<
    PageActionState,
    FormData
  >(endPagePreviewAction, undefined);

  const saveFieldErrors =
    saveState && saveState.ok === false ? saveState.fieldErrors : undefined;

  const isSystem = page?.is_system_owned ?? false;
  const effectiveVersion = saveState?.ok ? saveState.version : page?.version;
  const version = effectiveVersion ?? page?.version ?? 0;

  const slugDefault = page?.slug ?? "";
  const localeDefault = page?.locale ?? defaultLocale;
  const templateKeyDefault = page?.template_key ?? "standard_page";
  const templateSchemaVersionDefault = page?.template_schema_version ?? 1;

  const heroAny = (page?.hero as Record<string, unknown>) ?? {};
  const heroTitleDefault =
    typeof heroAny.title === "string" ? heroAny.title : "";
  const heroSubtitleDefault =
    typeof heroAny.subtitle === "string" ? heroAny.subtitle : "";
  const heroEyebrowDefault =
    typeof heroAny.eyebrow === "string" ? heroAny.eyebrow : "";

  // The upsert schema only accepts AGENCY_SELECTABLE_TEMPLATE_KEYS. System-
  // owned pages route through M5 and do not render this editor.
  const selectableTemplates = AGENCY_SELECTABLE_TEMPLATE_KEYS;

  return (
    <div className="space-y-8">
      {/* ---- status pill + meta ---- */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <PageStatusBadge status={page?.status ?? "draft"} />
        {isSystem && <SystemOwnedBadge />}
        <span>version v{version}</span>
        {page?.updated_at && (
          <span>
            last edited{" "}
            {(() => {
              try {
                return new Date(page.updated_at).toLocaleString();
              } catch {
                return page.updated_at;
              }
            })()}
          </span>
        )}
        {page?.published_at && (
          <span>
            last published{" "}
            {(() => {
              try {
                return new Date(page.published_at).toLocaleString();
              } catch {
                return page.published_at;
              }
            })()}
          </span>
        )}
      </div>

      <Banner state={saveState} />

      {/* ---- core form ---- */}
      <form action={saveAction} className="space-y-6">
        {page?.id && <input type="hidden" name="id" value={page.id} />}
        <input
          type="hidden"
          name="expectedVersion"
          value={effectiveVersion ?? 0}
        />
        <input
          type="hidden"
          name="templateSchemaVersion"
          value={templateSchemaVersionDefault}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={PAGE_TITLE_MAX}
              defaultValue={page?.title ?? ""}
              disabled={!canEdit}
            />
            <FieldError messages={saveFieldErrors} name="title" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              required
              maxLength={PAGE_SLUG_MAX}
              defaultValue={slugDefault}
              disabled={!canEdit || isSystem}
              placeholder="about or services/booking"
            />
            <FieldError messages={saveFieldErrors} name="slug" />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, digits, hyphens, and forward slashes. First
              segment cannot be a platform-reserved route.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="locale">Locale</Label>
            <select
              id="locale"
              name="locale"
              defaultValue={localeDefault}
              disabled={!canEdit || isSystem}
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
            >
              {supportedLocales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Only locales declared in Identity settings appear here. Each
              (locale, slug) pair is an independent page.
            </p>
            <FieldError messages={saveFieldErrors} name="locale" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="templateKey">Template</Label>
            <select
              id="templateKey"
              name="templateKey"
              defaultValue={templateKeyDefault}
              disabled={!canEdit || isSystem}
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
            >
              {selectableTemplates.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <FieldError messages={saveFieldErrors} name="templateKey" />
          </div>
        </div>

        {/* ---- hero ---- */}
        <fieldset className="space-y-4 rounded-md border border-border/60 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Hero
          </legend>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="heroEyebrow">Eyebrow</Label>
              <Input
                id="heroEyebrow"
                name="heroEyebrow"
                maxLength={80}
                defaultValue={heroEyebrowDefault}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heroTitle">Title</Label>
              <Input
                id="heroTitle"
                name="heroTitle"
                maxLength={PAGE_TITLE_MAX}
                defaultValue={heroTitleDefault}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heroSubtitle">Subtitle</Label>
              <Input
                id="heroSubtitle"
                name="heroSubtitle"
                maxLength={PAGE_META_DESCRIPTION_MAX}
                defaultValue={heroSubtitleDefault}
                disabled={!canEdit}
              />
            </div>
          </div>
        </fieldset>

        {/* ---- body ---- */}
        <div className="space-y-1.5">
          <Label htmlFor="body">Body</Label>
          <Textarea
            id="body"
            name="body"
            rows={10}
            maxLength={PAGE_BODY_MAX}
            defaultValue={page?.body ?? ""}
            disabled={!canEdit}
          />
          <FieldError messages={saveFieldErrors} name="body" />
        </div>

        {/* ---- SEO ---- */}
        <fieldset className="space-y-4 rounded-md border border-border/60 p-4">
          <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SEO
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="metaTitle">Meta title</Label>
              <Input
                id="metaTitle"
                name="metaTitle"
                maxLength={PAGE_META_TITLE_MAX}
                defaultValue={page?.meta_title ?? ""}
                disabled={!canEdit}
              />
              <FieldError messages={saveFieldErrors} name="metaTitle" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="metaDescription">Meta description</Label>
              <Input
                id="metaDescription"
                name="metaDescription"
                maxLength={PAGE_META_DESCRIPTION_MAX}
                defaultValue={page?.meta_description ?? ""}
                disabled={!canEdit}
              />
              <FieldError messages={saveFieldErrors} name="metaDescription" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ogTitle">OG title</Label>
              <Input
                id="ogTitle"
                name="ogTitle"
                maxLength={PAGE_OG_TITLE_MAX}
                defaultValue={page?.og_title ?? ""}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ogDescription">OG description</Label>
              <Input
                id="ogDescription"
                name="ogDescription"
                maxLength={PAGE_OG_DESCRIPTION_MAX}
                defaultValue={page?.og_description ?? ""}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="canonicalUrl">Canonical URL</Label>
              <Input
                id="canonicalUrl"
                name="canonicalUrl"
                maxLength={PAGE_CANONICAL_MAX}
                defaultValue={page?.canonical_url ?? ""}
                disabled={!canEdit}
                placeholder="https://example.com/about"
              />
              <p className="text-xs text-muted-foreground">
                Optional. Leave blank to use the page&apos;s natural URL. If
                set, must be an absolute <code>http(s)://</code> URL — other
                schemes (e.g. <code>javascript:</code>) are rejected.
              </p>
              <FieldError messages={saveFieldErrors} name="canonicalUrl" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ogImageMediaAssetId">OG image media id</Label>
              <Input
                id="ogImageMediaAssetId"
                name="ogImageMediaAssetId"
                defaultValue={page?.og_image_media_asset_id ?? ""}
                disabled={!canEdit}
                placeholder="UUID of a live media asset"
              />
              <FieldError
                messages={saveFieldErrors}
                name="ogImageMediaAssetId"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="noindex"
                value="true"
                defaultChecked={page?.noindex ?? false}
                disabled={!canEdit}
              />
              <span>noindex</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="includeInSitemap"
                value="true"
                defaultChecked={page?.include_in_sitemap ?? true}
                disabled={!canEdit}
              />
              <span>include in sitemap</span>
            </label>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canEdit || savePending}>
            {savePending
              ? "Saving…"
              : mode === "create"
                ? "Create page"
                : "Save draft"}
          </Button>
        </div>
      </form>

      {/* ---- publish / archive / delete / preview ---- */}
      {page?.id && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            {canPublish && (
              <form action={publishAction}>
                <input type="hidden" name="id" value={page.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button type="submit" disabled={publishPending}>
                  {publishPending ? "Publishing…" : "Publish page"}
                </Button>
                <Banner state={publishState} />
              </form>
            )}
            {canPublish && (
              <form action={archiveAction}>
                <input type="hidden" name="id" value={page.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={archivePending || isSystem}
                >
                  {archivePending ? "Archiving…" : "Archive page"}
                </Button>
                <Banner state={archiveState} />
              </form>
            )}
            {canEdit && !isSystem && (
              <form
                action={deleteAction}
                onSubmit={(e) => {
                  const ok = window.confirm(
                    `Delete page “${page.title}” (/${page.slug})?\n\nThis is a hard delete — the draft, every revision, and the published copy are removed. Prefer Archive if you may want to restore it later.`,
                  );
                  if (!ok) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={page.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={effectiveVersion ?? 0}
                />
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletePending}
                >
                  {deletePending ? "Deleting…" : "Delete page"}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Destructive. Archive is usually the right choice — it hides
                  the page from the storefront without losing history. System
                  pages cannot be deleted.
                </p>
                <Banner state={deleteState} />
              </form>
            )}
            {canEdit && (
              <div className="space-y-2">
                <form action={previewAction}>
                  <input type="hidden" name="pageId" value={page.id} />
                  <Button type="submit" variant="outline" disabled={previewPending}>
                    {previewPending ? "Starting preview…" : "Start preview"}
                  </Button>
                </form>
                <form action={previewEndAction}>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={previewEndPending}
                  >
                    {previewEndPending ? "Ending preview…" : "End preview"}
                  </Button>
                </form>
                <Banner state={previewState} />
                <Banner state={previewEndState} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
