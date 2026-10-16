"use client";

/**
 * PostWriter — the full-screen post writer (Posts v1, TUL-1006).
 *
 * Shared by the talent dashboard and (later) the agency admin: it knows
 * nothing about who is writing. The caller hands it the post, the server
 * actions for its actor (`PostWriterActions`), the owner's services and
 * categories, and where the plans live. One primary action: Publicar.
 *
 * Save model: debounced autosave (title + blocks) through `actions.save`.
 * Only blocks that already satisfy the schema are sent, so a half-filled
 * Servicio or photo never makes the whole save fail. Settings and the cover
 * save immediately through `actions.updateSettings`.
 *
 * Gate model (the SERVER decides, the UI only reacts):
 *   upgrade_required   -> the draft is already saved; open the upgrade sheet.
 *   read_only_lapsed   -> read-only banner with a renew link.
 *   taken_down         -> "Oculto por Tulala: {razón}" banner, read-only.
 */

import {
  ArrowLeft,
  CalendarCheck,
  CircleHelp,
  Eye,
  Heading2,
  Image as ImageIcon,
  Images,
  List,
  Lock,
  Minus,
  Pencil,
  Plus,
  Quote,
  Settings2,
  Type,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PostBlockType } from "@/lib/cms/post-blocks";
import { evaluatePostSeo } from "@/lib/cms/post-seo-dot";
import type {
  PostWriterActions,
  WriterCategory,
  WriterOffering,
  WriterPostData,
} from "@/lib/cms/post-writer-types";
import { derivePostUiStatus } from "@/lib/cms/post-writer-status";
import { slugifyPostTitle } from "@/lib/cms/posts-shared";
import type { PostSettingsPatch } from "@/lib/cms/posts-writer";
import type { PostWriterActionResult } from "@/lib/server-actions/posts-writer-actions";
import { PostBlocksRenderer, type PostServiceMap } from "@/components/posts/PostBlocksRenderer";
import {
  MORE_BLOCK_TYPES,
  PRIMARY_BLOCK_TYPES,
  makeBlockId,
  moveItem,
  newBlock,
  savableBlocks,
  type EditorBlock,
} from "./editor-blocks";
import { blockLabel, PostBlockEditor } from "./PostBlockEditor";
import { PostImageField } from "./PostImageField";
import {
  PostSettingsSheet,
  SEO_DOT_CLASS,
  seoLevelLabel,
  type PostSettingsSaveResult,
  type PostSettingsValues,
} from "./PostSettingsSheet";
import { PostUpgradeSheet } from "./PostUpgradeSheet";
import { postsTranslator } from "./posts-t";

export const POST_AUTOSAVE_MS = 1500;

export type PostWriterProps = {
  post: WriterPostData;
  actions: PostWriterActions;
  /** Language of the writer's own UI. */
  locale: "es" | "en";
  offerings: readonly WriterOffering[];
  categories: readonly WriterCategory[];
  backHref: string;
  /** Where the plans live (talent: /talent/plan). Used by the upgrade sheet and renew link. */
  upgradeHref: string;
  upgradeAudience?: "talent" | "workspace";
  /** The plan lapsed: this live post is read-only (drafts stay editable). */
  lapsed?: boolean;
  /** Workspace the media library belongs to ("" for a talent without one). */
  mediaTenantId?: string;
  /** Set on the talent dashboard so the picker shows the talent's own library. */
  mediaTalentProfileId?: string | null;
  /** Home path of the site ("/" or "/en"), for the preview's booking links. */
  homePath?: string;
  /** Public host for the SEO previews. */
  siteHost?: string | null;
};

type Lock = { kind: "takenDown" | "lapsed"; text: string } | null;

function ToolbarIcon({ type }: { type: PostBlockType }) {
  switch (type) {
    case "image":
      return <ImageIcon size={20} />;
    case "paragraph":
      return <Type size={20} />;
    case "service":
      return <CalendarCheck size={20} />;
    case "faq":
      return <CircleHelp size={20} />;
    case "heading":
      return <Heading2 size={20} />;
    case "list":
      return <List size={20} />;
    case "gallery":
      return <Images size={20} />;
    case "quote":
      return <Quote size={20} />;
    case "video":
      return <Video size={20} />;
    case "divider":
      return <Minus size={20} />;
    case "book_button":
      return <CalendarCheck size={20} />;
  }
}

function settingsFromPost(post: WriterPostData): PostSettingsValues {
  return {
    status: post.status,
    isUnlisted: post.isUnlisted,
    scheduledPublishAt: post.scheduledPublishAt,
    categoryId: post.categoryId,
    isFeatured: post.isFeatured,
    expiresAt: post.expiresAt,
    relatedOfferingId: post.relatedOfferingId,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    slug: post.slug,
    ogImageUrl: post.ogImageUrl,
    noindex: post.noindex,
  };
}

export function PostWriter({
  post,
  actions,
  locale,
  offerings,
  categories,
  backHref,
  upgradeHref,
  upgradeAudience = "talent",
  lapsed = false,
  mediaTenantId = "",
  mediaTalentProfileId = null,
  homePath = "/",
  siteHost = null,
}: PostWriterProps) {
  const t = useMemo(() => postsTranslator(locale), [locale]);
  const media = useMemo(
    () => ({ mediaTenantId, mediaTalentProfileId }),
    [mediaTenantId, mediaTalentProfileId],
  );

  const [title, setTitle] = useState(post.title);
  const [blocks, setBlocks] = useState<EditorBlock[]>(post.blocks);
  const [settings, setSettings] = useState<PostSettingsValues>(() => settingsFromPost(post));
  const [cover, setCover] = useState({ url: post.coverImageUrl, alt: post.coverImageAlt ?? "" });
  const [lock, setLock] = useState<Lock>(() =>
    post.takenDown
      ? { kind: "takenDown", text: t("dashboard.talentPosts.takenDown", { reason: post.takenDownReason ?? "" }) }
      : lapsed && post.status === "published"
        ? { kind: "lapsed", text: t("dashboard.talentPosts.lapsedBanner") }
        : null,
  );
  const [preview, setPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const readOnly = lock !== null;

  // ---- autosave ------------------------------------------------------------

  const payload = useMemo(
    () => ({ title: title.trim(), bodyBlocks: savableBlocks(blocks) }),
    [title, blocks],
  );
  const snapshot = useMemo(() => JSON.stringify(payload), [payload]);
  const [savedSnap, setSavedSnap] = useState(snapshot);
  const [failedSnap, setFailedSnap] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const applyLockFromFailure = useCallback((res: Extract<PostWriterActionResult, { ok: false }>) => {
    if (res.code === "read_only_lapsed") setLock({ kind: "lapsed", text: res.message });
    else if (res.code === "taken_down") setLock({ kind: "takenDown", text: res.message });
  }, []);

  useEffect(() => {
    if (readOnly || saving || publishing || snapshot === savedSnap || snapshot === failedSnap) return;
    const handle = setTimeout(() => {
      void (async () => {
        setSaving(true);
        const res = await actions.save({
          id: post.id,
          // The server refuses an empty title; leave it out until one is typed.
          ...(payload.title ? { title: payload.title } : {}),
          bodyBlocks: payload.bodyBlocks,
        });
        setSaving(false);
        if (res.ok) {
          setSavedSnap(snapshot);
          setFailedSnap(null);
        } else {
          setFailedSnap(snapshot);
          applyLockFromFailure(res);
        }
      })();
    }, POST_AUTOSAVE_MS);
    return () => clearTimeout(handle);
  }, [actions, applyLockFromFailure, failedSnap, payload, post.id, publishing, readOnly, savedSnap, saving, snapshot]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(handle);
  }, [toast]);

  useEffect(() => {
    if (!lastAddedId) return;
    document.getElementById(`blk-${lastAddedId}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [lastAddedId]);

  const saveLabel = (() => {
    if (readOnly) return "";
    if (failedSnap === snapshot) return t("dashboard.talentPosts.saveError");
    if (saving || snapshot !== savedSnap) return t("dashboard.talentPosts.saving");
    return t("dashboard.talentPosts.saved");
  })();

  // ---- blocks --------------------------------------------------------------

  const addBlock = (type: PostBlockType) => {
    const block = newBlock(type, makeBlockId());
    setBlocks((prev) => [...prev, block]);
    setLastAddedId(block.id);
    setMoreOpen(false);
  };
  const updateBlock = (index: number, next: EditorBlock) =>
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));
  const deleteBlock = (index: number) => setBlocks((prev) => prev.filter((_, i) => i !== index));
  const moveBlock = (index: number, direction: -1 | 1) =>
    setBlocks((prev) => moveItem(prev, index, index + direction));

  // ---- settings, cover, publish --------------------------------------------

  const mergeRecord = (res: Extract<PostWriterActionResult, { ok: true }>) => {
    setSettings((s) => ({
      ...s,
      status: res.data.status,
      slug: res.data.slug,
      scheduledPublishAt: res.data.scheduledPublishAt,
    }));
  };

  const handleGateFailure = (res: Extract<PostWriterActionResult, { ok: false }>) => {
    if (res.code === "upgrade_required") {
      setUpgradeOpen(true);
      return true;
    }
    if (res.code === "read_only_lapsed" || res.code === "taken_down") {
      applyLockFromFailure(res);
      return true;
    }
    return false;
  };

  const saveSettings = async (
    patch: PostSettingsPatch,
    next: PostSettingsValues,
  ): Promise<PostSettingsSaveResult> => {
    let working: PostSettingsPatch = patch;
    if (patch.status === "draft" && settings.status === "published") {
      // Unpublishing is always allowed (it only reduces visibility).
      const un = await actions.unpublish({ id: post.id });
      if (!un.ok) {
        if (handleGateFailure(un)) return { close: true };
        return { close: false, error: un.message };
      }
      mergeRecord(un);
      working = { ...patch };
      delete working.status;
    }
    if (Object.keys(working).length === 0) {
      setSettings((s) => ({ ...next, status: s.status }));
      return { close: true };
    }
    const res = await actions.updateSettings({ id: post.id, patch: working });
    if (res.ok) {
      setSettings({ ...next, status: res.data.status, slug: res.data.slug, scheduledPublishAt: res.data.scheduledPublishAt });
      return { close: true };
    }
    if (res.code === "upgrade_required") {
      // The rest of the patch was saved; only the publish intent was held back.
      setSettings((s) => ({
        ...next,
        status: s.status,
        isUnlisted: s.isUnlisted,
        scheduledPublishAt: s.scheduledPublishAt,
      }));
      setUpgradeOpen(true);
      return { close: true };
    }
    if (handleGateFailure(res)) return { close: true };
    return { close: false, error: res.message };
  };

  const onCoverChange = async (value: { url: string; alt?: string | null } | null) => {
    const next = { url: value ? value.url : null, alt: value?.alt ?? "" };
    const previous = cover;
    setCover(next);
    const res = await actions.updateSettings({
      id: post.id,
      patch: { cover_image_url: next.url, cover_image_alt: next.url ? next.alt || null : null },
    });
    if (!res.ok) {
      setCover(previous);
      if (!handleGateFailure(res)) setToast(res.message);
    }
  };

  const saveCoverAlt = async () => {
    if (!cover.url) return;
    const res = await actions.updateSettings({ id: post.id, patch: { cover_image_alt: cover.alt.trim() || null } });
    if (!res.ok && !handleGateFailure(res)) setToast(res.message);
  };

  /** A new draft has a placeholder address; give it one from the title before it goes live. */
  const ensureFriendlySlug = async () => {
    if (!settings.slug.startsWith("borrador-")) return;
    const base = slugifyPostTitle(payload.title);
    if (!base) return;
    for (const candidate of [base, `${base}-2`, `${base}-3`]) {
      const res = await actions.updateSettings({ id: post.id, patch: { slug: candidate } });
      if (res.ok) {
        mergeRecord(res);
        return;
      }
      if (res.code !== "slug_taken") return;
    }
  };

  const onPublish = async () => {
    if (!payload.title) {
      setToast(t("dashboard.talentPosts.titleRequired"));
      return;
    }
    setPublishing(true);
    await ensureFriendlySlug();
    const res = await actions.publish({
      id: post.id,
      draft: { title: payload.title, bodyBlocks: payload.bodyBlocks },
    });
    setPublishing(false);
    if (res.ok) {
      setSavedSnap(snapshot);
      setFailedSnap(null);
      mergeRecord(res);
      setSettings((s) => ({ ...s, isUnlisted: false }));
      setToast(t("dashboard.talentPosts.publishedToast"));
      return;
    }
    if (res.code === "upgrade_required" && res.draftSaved) {
      // The server saved the draft content before refusing: nothing is lost.
      setSavedSnap(snapshot);
      setFailedSnap(null);
    }
    if (!handleGateFailure(res)) setToast(res.message);
  };

  // ---- derived view data ---------------------------------------------------

  const uiStatus = derivePostUiStatus(settings);
  const isLive = settings.status === "published";
  const seo = useMemo(
    () =>
      evaluatePostSeo({
        title: payload.title,
        metaTitle: settings.metaTitle,
        metaDescription: settings.metaDescription,
        coverImageUrl: cover.url,
        coverImageAlt: cover.alt,
        relatedOfferingId: settings.relatedOfferingId,
        blocks: payload.bodyBlocks,
      }),
    [cover.alt, cover.url, payload, settings.metaDescription, settings.metaTitle, settings.relatedOfferingId],
  );
  const services: PostServiceMap = useMemo(
    () => Object.fromEntries(offerings.map((o) => [o.id, { name: o.name, label: o.priceLabel ?? "" }])),
    [offerings],
  );
  const seoBase = useMemo(
    () => ({
      title: payload.title,
      coverImageUrl: cover.url,
      coverImageAlt: cover.alt,
      blocks: payload.bodyBlocks,
    }),
    [cover.alt, cover.url, payload],
  );

  const iconBtn =
    "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-admin-md border-0 bg-transparent text-admin-ink hover:bg-admin-surface-alt disabled:cursor-default disabled:opacity-40";

  return (
    <div className="flex min-h-dvh flex-col bg-admin-card text-admin-ink" data-testid="post-writer">
      <header className="sticky top-0 z-30 flex items-center gap-[4px] border-b border-admin-border bg-admin-card px-[8px] py-[6px]">
        <Link href={backHref} aria-label={t("dashboard.talentPosts.back")} className={`${iconBtn} no-underline`}>
          <ArrowLeft size={20} />
        </Link>
        <span
          role="status"
          aria-live="polite"
          data-testid="post-save-state"
          className="min-w-0 flex-1 truncate text-[13px] text-admin-ink-muted"
        >
          {saveLabel}
        </span>
        <span
          role="img"
          aria-label={seoLevelLabel(seo.level, t)}
          title={seoLevelLabel(seo.level, t)}
          className={`size-[10px] shrink-0 rounded-full ${SEO_DOT_CLASS[seo.level]}`}
        />
        <button
          type="button"
          className={iconBtn}
          aria-pressed={preview}
          aria-label={preview ? t("dashboard.talentPosts.edit") : t("dashboard.talentPosts.preview")}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? <Pencil size={20} /> : <Eye size={20} />}
        </button>
        <button
          type="button"
          className={iconBtn}
          aria-label={t("dashboard.talentPosts.settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 size={20} />
        </button>
        {isLive && !readOnly ? (
          <span className="inline-flex min-h-11 items-center px-[10px] text-[14px] font-semibold text-admin-ink-muted">
            {uiStatus === "hidden"
              ? t("dashboard.talentPosts.statusHidden")
              : t("dashboard.talentPosts.statusPublished")}
          </span>
        ) : (
          <button
            type="button"
            disabled={readOnly || publishing}
            onClick={() => void onPublish()}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-admin-md border-0 bg-admin-ink px-[16px] text-[14px] font-semibold text-admin-surface disabled:cursor-default disabled:opacity-50"
          >
            {publishing ? t("dashboard.talentPosts.publishing") : t("dashboard.talentPosts.publish")}
          </button>
        )}
      </header>

      {lock ? (
        <div
          role="alert"
          data-testid={lock.kind === "takenDown" ? "post-takedown-banner" : "post-lapsed-banner"}
          className="flex flex-wrap items-center gap-[8px] border-b border-admin-border bg-admin-accent-soft px-[16px] py-[10px] text-[14px] text-admin-ink"
        >
          <Lock size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">{lock.text}</span>
          {lock.kind === "lapsed" ? (
            <Link href={upgradeHref} className="font-semibold text-admin-ink underline">
              {t("dashboard.talentPosts.renew")}
            </Link>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed left-1/2 top-[64px] z-40 -translate-x-1/2 rounded-full bg-admin-ink px-[16px] py-[8px] text-[13px] text-admin-surface shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[720px] flex-1 px-[16px] pb-[140px] pt-[16px]">
        {preview ? (
          <article className="site-post__body" data-testid="post-preview">
            <h1>{payload.title || t("dashboard.talentPosts.untitled")}</h1>
            {cover.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of a remote library URL
              <img src={cover.url} alt={cover.alt} className="mb-[16px] w-full rounded-admin-lg object-cover" />
            ) : null}
            <PostBlocksRenderer
              blocks={payload.bodyBlocks}
              services={services}
              homePath={homePath}
              locale={locale}
            />
          </article>
        ) : (
          <div className="flex flex-col gap-[14px]">
            <div className="flex flex-col gap-[8px]">
              <PostImageField
                value={cover.url ? { url: cover.url, alt: cover.alt } : null}
                mediaTenantId={media.mediaTenantId}
                mediaTalentProfileId={media.mediaTalentProfileId}
                layout="cover"
                aspect="21/9"
                emptyLabel={t("dashboard.talentPosts.addCover")}
                disabled={readOnly}
                onChange={(v) => void onCoverChange(v)}
              />
              {cover.url ? (
                <input
                  className="w-full rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[10px] text-[14px] text-admin-ink placeholder:text-admin-ink-dim"
                  maxLength={500}
                  disabled={readOnly}
                  value={cover.alt}
                  placeholder={t("dashboard.talentPosts.coverAlt")}
                  onChange={(e) => setCover((c) => ({ ...c, alt: e.target.value }))}
                  onBlur={() => void saveCoverAlt()}
                />
              ) : null}
            </div>

            <textarea
              aria-label={t("dashboard.talentPosts.titlePlaceholder")}
              className="w-full resize-none border-0 bg-transparent p-0 text-[28px] font-bold leading-tight text-admin-ink outline-none placeholder:text-admin-ink-dim"
              rows={2}
              maxLength={300}
              disabled={readOnly}
              value={title}
              placeholder={t("dashboard.talentPosts.titlePlaceholder")}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            />

            {blocks.length === 0 ? (
              <p className="m-0 py-[24px] text-center text-[14px] text-admin-ink-muted">
                {t("dashboard.talentPosts.emptyBlocks")}
              </p>
            ) : null}
            <div className="flex flex-col gap-[12px]">
              {blocks.map((block, index) => (
                <div key={block.id} id={`blk-${block.id}`}>
                  <PostBlockEditor
                    block={block}
                    index={index}
                    count={blocks.length}
                    t={t}
                    offerings={offerings}
                    media={media}
                    disabled={readOnly}
                    onChange={(next) => updateBlock(index, next)}
                    onMove={(direction) => moveBlock(index, direction)}
                    onDelete={() => deleteBlock(index)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {!preview && !readOnly ? (
        <nav
          aria-label={t("dashboard.talentPosts.addBlock")}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-admin-border bg-admin-card pb-[env(safe-area-inset-bottom)]"
        >
          {moreOpen ? (
            <div className="mx-auto grid max-w-[720px] grid-cols-4 gap-[4px] border-b border-admin-border px-[8px] py-[8px]">
              {MORE_BLOCK_TYPES.map((type) => (
                <ToolbarButton key={type} type={type} t={t} onAdd={addBlock} />
              ))}
            </div>
          ) : null}
          <div className="mx-auto grid max-w-[720px] grid-cols-5 gap-[4px] px-[8px] py-[6px]">
            {PRIMARY_BLOCK_TYPES.map((type) => (
              <ToolbarButton key={type} type={type} t={t} onAdd={addBlock} />
            ))}
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-label={t("dashboard.talentPosts.addBlock")}
              onClick={() => setMoreOpen((v) => !v)}
              className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-admin-md border-0 bg-transparent text-admin-ink"
            >
              <Plus size={20} />
              <span className="text-[11px] text-admin-ink-muted">...</span>
            </button>
          </div>
        </nav>
      ) : null}

      <PostSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        values={settings}
        postTitle={payload.title}
        coverImageUrl={cover.url}
        seoBase={seoBase}
        categories={categories}
        offerings={offerings}
        media={media}
        siteHost={siteHost}
        disabled={readOnly}
        t={t}
        onSave={saveSettings}
      />
      <PostUpgradeSheet
        open={upgradeOpen}
        audience={upgradeAudience}
        upgradeHref={upgradeHref}
        t={t}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  );
}

function ToolbarButton({
  type,
  t,
  onAdd,
}: {
  type: PostBlockType;
  t: ReturnType<typeof postsTranslator>;
  onAdd: (type: PostBlockType) => void;
}) {
  const label = blockLabel(type, t);
  return (
    <button
      type="button"
      onClick={() => onAdd(type)}
      aria-label={label}
      data-testid={`add-block-${type}`}
      className="flex min-h-12 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-admin-md border-0 bg-transparent text-admin-ink hover:bg-admin-surface-alt"
    >
      <ToolbarIcon type={type} />
      <span className="max-w-full truncate text-[11px] text-admin-ink-muted">{label}</span>
    </button>
  );
}
