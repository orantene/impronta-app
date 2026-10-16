"use client";

/**
 * PostSettingsSheet — status, date, category, featured, expiry, related
 * service and SEO (with a Google / WhatsApp preview). Shared by the talent and
 * the workspace writer.
 *
 * The sheet edits a local copy and hands the writer ONE patch on "Guardar":
 * the writer owns the server call, so the upgrade sheet, the lapse banner and
 * the saved record stay in one place.
 */

import { Check, ChevronRight, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  derivePostUiStatus,
  isoToLocalInput,
  localInputToIso,
  postUiStatusToPatch,
  type PostUiStatus,
} from "@/lib/cms/post-writer-status";
import type { WriterCategory, WriterOffering } from "@/lib/cms/post-writer-types";
import {
  evaluatePostSeo,
  type PostSeoCheckId,
  type PostSeoInput,
  type PostSeoLevel,
} from "@/lib/cms/post-seo-dot";
import { isValidPostSlug } from "@/lib/cms/posts-shared";
import type { PostSettingsPatch } from "@/lib/cms/posts-writer";
import { PostImageField } from "./PostImageField";
import { ServicePicker, type PostBlockMedia } from "./PostBlockEditor";
import type { PostsT } from "./posts-t";

export type PostSettingsValues = {
  status: string;
  isUnlisted: boolean;
  scheduledPublishAt: string | null;
  categoryId: string | null;
  isFeatured: boolean;
  expiresAt: string | null;
  relatedOfferingId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  slug: string;
  ogImageUrl: string | null;
  noindex: boolean;
};

export type PostSettingsSaveResult = { close: boolean; error?: string };

export type PostSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  values: PostSettingsValues;
  postTitle: string;
  coverImageUrl: string | null;
  /** Everything the SEO checks read that the sheet does not edit. */
  seoBase: Pick<PostSeoInput, "title" | "coverImageUrl" | "coverImageAlt" | "blocks">;
  categories: readonly WriterCategory[];
  offerings: readonly WriterOffering[];
  media: PostBlockMedia;
  /** Public host shown in the previews, e.g. "jorgelina.tulala.digital". */
  siteHost?: string | null;
  disabled: boolean;
  t: PostsT;
  onSave: (patch: PostSettingsPatch, next: PostSettingsValues) => Promise<PostSettingsSaveResult>;
};

const STATUS_ORDER: readonly PostUiStatus[] = ["draft", "scheduled", "published", "hidden"];

const FIELD =
  "w-full rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[10px] text-[15px] text-admin-ink placeholder:text-admin-ink-dim disabled:opacity-60";
const LABEL = "text-[12px] font-semibold uppercase tracking-[0.4px] text-admin-ink-dim";

export function seoLevelLabel(level: PostSeoLevel, t: PostsT): string {
  if (level === "green") return t("dashboard.talentPosts.seoGood");
  if (level === "yellow") return t("dashboard.talentPosts.seoOk");
  return t("dashboard.talentPosts.seoLow");
}

export const SEO_DOT_CLASS: Record<PostSeoLevel, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function seoCheckText(id: PostSeoCheckId, ok: boolean, t: PostsT): string {
  switch (id) {
    case "title":
      return ok ? t("dashboard.talentPosts.seoTitleOk") : t("dashboard.talentPosts.seoTitleFix");
    case "description":
      return ok ? t("dashboard.talentPosts.seoDescriptionOk") : t("dashboard.talentPosts.seoDescriptionFix");
    case "cover":
      return ok ? t("dashboard.talentPosts.seoCoverOk") : t("dashboard.talentPosts.seoCoverFix");
    case "words":
      return ok ? t("dashboard.talentPosts.seoWordsOk") : t("dashboard.talentPosts.seoWordsFix");
    case "service":
      return ok ? t("dashboard.talentPosts.seoServiceOk") : t("dashboard.talentPosts.seoServiceFix");
    case "alts":
      return ok ? t("dashboard.talentPosts.seoAltsOk") : t("dashboard.talentPosts.seoAltsFix");
  }
}

function statusLabel(s: PostUiStatus, t: PostsT): string {
  switch (s) {
    case "draft":
      return t("dashboard.talentPosts.statusDraft");
    case "scheduled":
      return t("dashboard.talentPosts.statusScheduled");
    case "published":
      return t("dashboard.talentPosts.statusPublished");
    case "hidden":
      return t("dashboard.talentPosts.statusHidden");
  }
}

export function PostSettingsSheet(props: PostSettingsSheetProps) {
  if (!props.open) return null;
  return <SheetBody {...props} />;
}

function SheetBody({
  onClose,
  values,
  postTitle,
  coverImageUrl,
  seoBase,
  categories,
  offerings,
  media,
  siteHost,
  disabled,
  t,
  onSave,
}: PostSettingsSheetProps) {
  const initialUi = derivePostUiStatus({
    status: values.status,
    isUnlisted: values.isUnlisted,
    scheduledPublishAt: values.scheduledPublishAt,
  });
  const [ui, setUi] = useState<PostUiStatus>(initialUi);
  const [scheduled, setScheduled] = useState(isoToLocalInput(values.scheduledPublishAt));
  const [categoryId, setCategoryId] = useState(values.categoryId);
  const [featured, setFeatured] = useState(values.isFeatured);
  const [expires, setExpires] = useState(isoToLocalInput(values.expiresAt));
  const [offeringId, setOfferingId] = useState(values.relatedOfferingId);
  const [metaTitle, setMetaTitle] = useState(values.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(values.metaDescription ?? "");
  const [slug, setSlug] = useState(values.slug);
  const [ogImageUrl, setOgImageUrl] = useState(values.ogImageUrl);
  const [noindex, setNoindex] = useState(values.noindex);
  const [seoOpen, setSeoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seo = useMemo(
    () =>
      evaluatePostSeo({
        ...seoBase,
        metaTitle,
        metaDescription,
        relatedOfferingId: offeringId,
      }),
    [seoBase, metaTitle, metaDescription, offeringId],
  );

  const scheduledIso = localInputToIso(scheduled);
  const slugTrimmed = slug.trim().toLowerCase();
  const slugBad = slugTrimmed.length > 0 && !isValidPostSlug(slugTrimmed);
  const needsDate = ui === "scheduled" && !scheduledIso;
  const blocked = disabled || saving || needsDate || slugBad;

  const buildPatch = (): { patch: PostSettingsPatch; next: PostSettingsValues } => {
    const patch: PostSettingsPatch = {};
    const nextScheduledAt = ui === "scheduled" ? scheduledIso : null;
    if (ui !== initialUi || (ui === "scheduled" && nextScheduledAt !== values.scheduledPublishAt)) {
      Object.assign(patch, postUiStatusToPatch(ui, nextScheduledAt));
    }
    if (categoryId !== values.categoryId) patch.category_id = categoryId;
    if (featured !== values.isFeatured) patch.is_featured = featured;
    const expiresIso = localInputToIso(expires);
    if (expiresIso !== values.expiresAt) patch.expires_at = expiresIso;
    if (offeringId !== values.relatedOfferingId) patch.related_offering_id = offeringId;
    const mt = metaTitle.trim() || null;
    if (mt !== values.metaTitle) patch.meta_title = mt;
    const md = metaDescription.trim() || null;
    if (md !== values.metaDescription) patch.meta_description = md;
    if (slugTrimmed && slugTrimmed !== values.slug) patch.slug = slugTrimmed;
    if (ogImageUrl !== values.ogImageUrl) patch.og_image_url = ogImageUrl;
    if (noindex !== values.noindex) patch.noindex = noindex;
    const next: PostSettingsValues = {
      status: patch.status ?? values.status,
      isUnlisted: patch.is_unlisted ?? values.isUnlisted,
      scheduledPublishAt: patch.scheduled_publish_at !== undefined ? patch.scheduled_publish_at : values.scheduledPublishAt,
      categoryId,
      isFeatured: featured,
      expiresAt: expiresIso,
      relatedOfferingId: offeringId,
      metaTitle: mt,
      metaDescription: md,
      slug: patch.slug ?? values.slug,
      ogImageUrl,
      noindex,
    };
    return { patch, next };
  };

  const submit = async () => {
    const { patch, next } = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await onSave(patch, next);
    setSaving(false);
    if (res.error) setError(res.error);
    if (res.close) onClose();
  };

  const googleTitle = metaTitle.trim() || postTitle || t("dashboard.talentPosts.untitled");
  const host = siteHost?.trim() || "tusitio.com";
  const shareImage = ogImageUrl || coverImageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid="post-settings-sheet">
      <button
        type="button"
        aria-label={t("dashboard.talentPosts.close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-settings-title"
        className="relative flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-t-[20px] bg-admin-card shadow-xl sm:rounded-[20px]"
      >
        <header className="flex items-center justify-between gap-[8px] border-b border-admin-border px-[16px] py-[8px]">
          <h2 id="post-settings-title" className="m-0 text-[16px] font-semibold text-admin-ink">
            {t("dashboard.talentPosts.settingsTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.talentPosts.close")}
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-admin-md border-0 bg-transparent text-admin-ink-muted"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex flex-col gap-[18px] overflow-y-auto px-[16px] py-[16px]">
          <div className="flex flex-col gap-[8px]">
            <span className={LABEL}>{t("dashboard.talentPosts.fieldStatus")}</span>
            <div role="radiogroup" className="grid grid-cols-2 gap-[8px]">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={ui === s}
                  disabled={disabled}
                  onClick={() => setUi(s)}
                  className={`min-h-11 cursor-pointer rounded-admin-md border px-[12px] text-[14px] font-medium ${
                    ui === s
                      ? "border-admin-ink bg-admin-ink text-admin-surface"
                      : "border-admin-border bg-admin-card text-admin-ink"
                  }`}
                >
                  {statusLabel(s, t)}
                </button>
              ))}
            </div>
            {ui === "hidden" ? (
              <p className="m-0 text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.statusHiddenHelp")}</p>
            ) : null}
            {ui === "scheduled" ? (
              <label className="flex flex-col gap-[6px]">
                <span className={LABEL}>{t("dashboard.talentPosts.fieldDate")}</span>
                <input
                  type="datetime-local"
                  className={FIELD}
                  disabled={disabled}
                  value={scheduled}
                  onChange={(e) => setScheduled(e.target.value)}
                />
                <span className="text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.scheduleHint")}</span>
              </label>
            ) : null}
          </div>

          <label className="flex flex-col gap-[6px]">
            <span className={LABEL}>{t("dashboard.talentPosts.fieldCategory")}</span>
            <select
              className={FIELD}
              disabled={disabled || categories.length === 0}
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
            >
              <option value="">
                {categories.length === 0
                  ? t("dashboard.talentPosts.noCategories")
                  : t("dashboard.talentPosts.noneCategory")}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-[12px]">
            <span className="flex flex-col">
              <span className="text-[15px] font-medium text-admin-ink">{t("dashboard.talentPosts.fieldFeatured")}</span>
              <span className="text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.featuredHelp")}</span>
            </span>
            <input
              type="checkbox"
              className="size-5"
              disabled={disabled}
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
          </label>

          <div className="flex flex-col gap-[6px]">
            <span className={LABEL}>{t("dashboard.talentPosts.fieldExpires")}</span>
            <div className="flex items-center gap-[8px]">
              <input
                type="datetime-local"
                className={FIELD}
                disabled={disabled}
                value={expires}
                aria-label={t("dashboard.talentPosts.fieldExpires")}
                onChange={(e) => setExpires(e.target.value)}
              />
              {expires ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setExpires("")}
                  className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-admin-md border border-admin-border bg-admin-card px-[12px] text-[13px] text-admin-ink"
                >
                  {t("dashboard.talentPosts.never")}
                </button>
              ) : null}
            </div>
            <span className="text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.expiresHelp")}</span>
          </div>

          <div className="flex flex-col gap-[6px]">
            <span className={LABEL}>{t("dashboard.talentPosts.fieldService")}</span>
            <ServicePicker
              value={offeringId}
              offerings={offerings}
              t={t}
              disabled={disabled}
              emptyOption={t("dashboard.talentPosts.noneService")}
              onPick={setOfferingId}
            />
          </div>

          <div className="flex flex-col gap-[10px] rounded-admin-lg border border-admin-border p-[4px]">
            <button
              type="button"
              aria-expanded={seoOpen}
              onClick={() => setSeoOpen((v) => !v)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-[10px] rounded-admin-md border-0 bg-transparent px-[10px] text-left text-[15px] font-medium text-admin-ink"
            >
              <ChevronRight size={16} className={seoOpen ? "rotate-90" : ""} />
              <span className="flex-1">{t("dashboard.talentPosts.seoSection")}</span>
              <span
                role="img"
                aria-label={seoLevelLabel(seo.level, t)}
                title={seoLevelLabel(seo.level, t)}
                className={`size-[10px] rounded-full ${SEO_DOT_CLASS[seo.level]}`}
              />
            </button>
            {seoOpen ? (
              <div className="flex flex-col gap-[14px] px-[10px] pb-[12px]">
                <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
                  {seo.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-[8px] text-[13px] text-admin-ink">
                      {c.ok ? (
                        <Check size={16} className="mt-[1px] shrink-0 text-emerald-600" />
                      ) : (
                        <TriangleAlert size={16} className="mt-[1px] shrink-0 text-amber-600" />
                      )}
                      <span>{seoCheckText(c.id, c.ok, t)}</span>
                    </li>
                  ))}
                </ul>

                <label className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.seoFieldTitle")}</span>
                  <input
                    className={FIELD}
                    maxLength={200}
                    disabled={disabled}
                    value={metaTitle}
                    placeholder={postTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.seoFieldDescription")}</span>
                  <textarea
                    className={`${FIELD} min-h-[80px] resize-y`}
                    rows={3}
                    maxLength={400}
                    disabled={disabled}
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.seoFieldSlug")}</span>
                  <input
                    className={FIELD}
                    maxLength={240}
                    disabled={disabled}
                    value={slug}
                    aria-invalid={slugBad}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                  <span className="text-[13px] text-admin-ink-muted">{t("dashboard.talentPosts.slugHelp")}</span>
                </label>
                <div className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.seoFieldOg")}</span>
                  <PostImageField
                    value={ogImageUrl ? { url: ogImageUrl } : null}
                    mediaTenantId={media.mediaTenantId}
                    mediaTalentProfileId={media.mediaTalentProfileId}
                    emptyLabel={t("dashboard.talentPosts.seoFieldOg")}
                    disabled={disabled}
                    onChange={(v) => setOgImageUrl(v ? v.url : null)}
                  />
                </div>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-[12px]">
                  <span className="text-[15px] text-admin-ink">{t("dashboard.talentPosts.seoNoindex")}</span>
                  <input
                    type="checkbox"
                    className="size-5"
                    disabled={disabled}
                    checked={noindex}
                    onChange={(e) => setNoindex(e.target.checked)}
                  />
                </label>

                <div className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.previewGoogle")}</span>
                  <div className="rounded-admin-md border border-admin-border p-[12px]" data-testid="seo-preview-google">
                    <div className="truncate text-[12px] text-admin-ink-muted">
                      {host}/blog/{slugTrimmed || "..."}
                    </div>
                    <div className="truncate text-[17px] text-blue-700">{googleTitle}</div>
                    <div className="line-clamp-2 text-[13px] text-admin-ink-muted">{metaDescription}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <span className={LABEL}>{t("dashboard.talentPosts.previewWhatsApp")}</span>
                  <div className="overflow-hidden rounded-admin-md border border-admin-border" data-testid="seo-preview-whatsapp">
                    {shareImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview of a remote library URL
                      <img src={shareImage} alt="" className="h-[140px] w-full object-cover" />
                    ) : null}
                    <div className="bg-admin-surface-alt p-[10px]">
                      <div className="truncate text-[14px] font-semibold text-admin-ink">{googleTitle}</div>
                      <div className="line-clamp-2 text-[13px] text-admin-ink-muted">{metaDescription}</div>
                      <div className="truncate text-[12px] text-admin-ink-dim">{host}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="m-0 text-[14px] text-admin-ink">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="border-t border-admin-border px-[16px] py-[12px]">
          <button
            type="button"
            disabled={blocked}
            onClick={() => void submit()}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-admin-md border-0 bg-admin-ink px-[16px] text-[15px] font-semibold text-admin-surface disabled:cursor-default disabled:opacity-50"
          >
            {t("dashboard.talentPosts.saveSettings")}
          </button>
        </footer>
      </div>
    </div>
  );
}
