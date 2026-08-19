"use client";

/**
 * WebsitePostEditor.tsx — the full-width post editor (W3).
 *
 * AUTHORING FORMAT — PLAIN TEXT, ON PURPOSE
 * ─────────────────────────────────────────
 * The public route (`app/(public)/posts/[slug]/page.tsx`) renders `body`
 * as raw text inside `whitespace-pre-wrap` — no markdown, no HTML. So the
 * editor is a plain textarea and SAYS so: line breaks are kept, a blank
 * line reads as a paragraph break. Teaching markdown here would promise
 * formatting the public page cannot deliver.
 *
 * SLUG — auto-follows the title while the post still carries its
 * placeholder "untitled-post-…" address, then stops the moment the operator
 * touches the field (or the post already has a real address): a typed slug
 * is a decision, mirroring `InlineRenameForm` in WebsitePageActions.tsx.
 *
 * ACTIONS — Save / Publish / Unpublish / Delete. Which state changes are
 * offered comes from `derivePostActions` (lib/cms/posts-shared.ts), the
 * same pure-matrix pattern as `derivePageActions`; this file owns
 * confirmation, not permission. Publish asks one question; Delete asks two
 * (the pages Delete rail's two-door pattern), and a live post must be
 * unpublished before Delete is offered at all.
 *
 * STYLING — admin Tailwind tokens only (`ratchet/no-new-inline-style`).
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { InfoTip } from "@/components/ui/info-tip";
import {
  derivePostActions,
  isPostLocale,
  POST_LOCALES,
  slugifyPostTitle,
  toWebsitePostStatus,
  type PostLocale,
} from "@/lib/cms/posts-shared";
import {
  deletePostAction,
  getPostForEditAction,
  publishPostAction,
  savePostAction,
  unpublishPostAction,
} from "@/lib/server-actions/admin-site-posts";
import type { PostEditorRecord } from "@/lib/site-admin/server/posts";

import { Icon } from "../primitives";
import { useAdminShell } from "../state";
import type { WebsitePost } from "../state";
import { PageStatusChip } from "./SitePage";
import { PageHeader } from "./pages-shared";

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-55";

const FIELD_BASE =
  "w-full rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[7px] text-admin-13 text-admin-ink";

const LABEL_BASE =
  "text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted";

/** A question with two answers, inline. Never `window.confirm`. */
function InlineConfirm({
  prompt,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  confirmLabel: string;
  danger: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`flex flex-col gap-[8px] rounded-admin-md border p-[10px] ${
        danger ? "border-admin-critical bg-admin-card" : "border-admin-border bg-admin-card"
      }`}
    >
      <p className={`m-0 text-admin-12h ${danger ? "text-admin-critical" : "text-admin-ink"}`}>
        {prompt}
      </p>
      <div className="flex flex-wrap items-center gap-[6px]">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`${BUTTON_BASE} ${danger ? "text-admin-critical" : ""}`}
        >
          {confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={BUTTON_BASE}>
          {t("dashboard.adminWebsite.pageActionCancel")}
        </button>
      </div>
    </div>
  );
}

type ConfirmMode =
  | { kind: "idle" }
  | { kind: "publish" }
  | { kind: "unpublish" }
  | { kind: "delete"; step: 1 | 2 };

export function WebsitePostEditor({
  postId,
  liveUrlFor,
  onClose,
}: {
  postId: string;
  /** Builds the public URL from the list's row model (locale-aware). */
  liveUrlFor: (post: WebsitePost) => string | null;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useAdminShell();

  const [record, setRecord] = useState<PostEditorRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [locale, setLocale] = useState<PostLocale>("en");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [confirm, setConfirm] = useState<ConfirmMode>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const applyRecord = useCallback((post: PostEditorRecord) => {
    setRecord(post);
    setTitle(post.title);
    setSlugDraft(post.slug);
    // A placeholder address keeps auto-following the title; a real one is a
    // decision the editor never silently rewrites.
    setSlugTouched(!post.slug.startsWith("untitled-post-"));
    setExcerpt(post.excerpt);
    setBody(post.body);
    setLocale(isPostLocale(post.locale) ? post.locale : "en");
    setMetaTitle(post.metaTitle ?? "");
    setMetaDescription(post.metaDescription ?? "");
    setConfirm({ kind: "idle" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getPostForEditAction(postId);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      applyRecord(result.post);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRecord, postId]);

  const status = toWebsitePostStatus(record?.status ?? "draft");
  const slug = slugTouched ? slugDraft : slugifyPostTitle(title);
  // Permission matrix lives in posts-shared.ts; the editor is only reachable
  // when the page already established canEdit && !isPlatformHub.
  const actions = useMemo(
    () => derivePostActions(status, { canEdit: true, isPlatformHub: false }),
    [status],
  );

  const rowModel: WebsitePost | null = record
    ? {
        id: record.id,
        title,
        slug: `/${slug}`,
        status,
        locale,
        hasExcerpt: !!excerpt.trim(),
        publishedAt: record.publishedAt ?? undefined,
        updatedAt: record.updatedAt ?? new Date().toISOString(),
        lastEditedBy: "",
      }
    : null;
  const liveUrl = rowModel && status === "published" ? liveUrlFor(rowModel) : null;

  /** Run a server call, toast its outcome, and re-load the record. */
  const run = useCallback(
    (work: () => Promise<{ ok: boolean; message: string; closeAfter?: boolean }>) => {
      startTransition(() => {
        void (async () => {
          const outcome = await work();
          toast(outcome.message);
          setConfirm({ kind: "idle" });
          if (outcome.ok && outcome.closeAfter) {
            onClose();
            return;
          }
          const reloaded = await getPostForEditAction(postId);
          if (reloaded.ok) applyRecord(reloaded.post);
        })();
      });
    },
    [applyRecord, onClose, postId, toast],
  );

  const handleSave = useCallback(() => {
    if (!record) return;
    if (!title.trim()) {
      toast(t("dashboard.adminWebsite.postEditorNeedsTitle"));
      return;
    }
    run(async () => {
      const result = await savePostAction({
        id: record.id,
        locale,
        slug,
        title,
        excerpt,
        body,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
      });
      return result.ok
        ? { ok: true, message: t("dashboard.adminWebsite.postEditorSavedToast") }
        : { ok: false, message: result.error };
    });
  }, [body, excerpt, locale, metaDescription, metaTitle, record, run, slug, t, title, toast]);

  const performConfirmed = useCallback(
    (mode: ConfirmMode) => {
      if (!record) return;
      if (mode.kind === "publish") {
        run(async () => {
          const result = await publishPostAction(record.id);
          return result.ok
            ? { ok: true, message: t("dashboard.adminWebsite.postEditorPublishedToast") }
            : { ok: false, message: result.error };
        });
        return;
      }
      if (mode.kind === "unpublish") {
        run(async () => {
          const result = await unpublishPostAction(record.id);
          return result.ok
            ? { ok: true, message: t("dashboard.adminWebsite.postEditorUnpublishedToast") }
            : { ok: false, message: result.error };
        });
        return;
      }
      if (mode.kind === "delete") {
        run(async () => {
          const result = await deletePostAction(record.id);
          return result.ok
            ? {
                ok: true,
                message: t("dashboard.adminWebsite.postEditorDeletedToast"),
                closeAfter: true,
              }
            : { ok: false, message: result.error };
        });
      }
    },
    [record, run, t],
  );

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-[10px] rounded-admin-lg border border-admin-border-soft bg-admin-card p-[16px]">
        <p className="m-0 text-admin-12h text-admin-critical">{loadError}</p>
        <button type="button" onClick={onClose} className={BUTTON_BASE}>
          <Icon name="x" size={12} stroke={1.7} />
          {t("dashboard.adminWebsite.postEditorBack")}
        </button>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-admin-lg border border-admin-border-soft bg-admin-card p-[16px] text-admin-12h text-admin-ink-muted">
        {t("dashboard.adminWebsite.postEditorLoading")}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWebsite.postEditorHeading")}
        subtitle={t("dashboard.adminWebsite.postEditorSubtitle")}
        actions={
          <button type="button" disabled={pending} onClick={onClose} className={BUTTON_BASE}>
            <Icon name="x" size={12} stroke={1.7} />
            {t("dashboard.adminWebsite.postEditorBack")}
          </button>
        }
      />

      <section className="mb-[22px] flex flex-col gap-[14px] rounded-admin-lg border border-admin-border-soft bg-admin-card p-[16px]">
        {/* Status line */}
        <div className="flex flex-wrap items-center gap-[8px]">
          <PageStatusChip status={status} />
          {status === "published" ? (
            <span className="text-admin-11h text-admin-ink-muted">
              {t("dashboard.adminWebsite.postEditorLiveNote")}
            </span>
          ) : (
            <span className="text-admin-11h text-admin-ink-muted">
              {t("dashboard.adminWebsite.postEditorDraftNote")}
            </span>
          )}
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-12h font-semibold text-admin-ink no-underline"
            >
              <Icon name="external" size={12} stroke={1.7} />
              {t("dashboard.adminWebsite.viewLive")}
            </a>
          ) : null}
        </div>

        {/* Title */}
        <label className="flex flex-col gap-[4px]">
          <span className={LABEL_BASE}>{t("dashboard.adminWebsite.postEditorTitleLabel")}</span>
          <input
            type="text"
            value={title}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
            className={FIELD_BASE}
          />
        </label>

        {/* Address */}
        <label className="flex flex-col gap-[4px]">
          <span className={LABEL_BASE}>{t("dashboard.adminWebsite.postEditorAddressLabel")}</span>
          <input
            type="text"
            value={slug}
            disabled={pending}
            onChange={(event) => {
              setSlugTouched(true);
              setSlugDraft(event.target.value);
            }}
            className={`${FIELD_BASE} font-mono`}
          />
          <span className="truncate font-mono text-admin-10 text-admin-ink-dim">
            {`/posts/${slug}`}
          </span>
        </label>

        {/* Language */}
        <label className="flex max-w-[240px] flex-col gap-[4px]">
          <span className="inline-flex items-center gap-[5px]">
            <span className={LABEL_BASE}>
              {t("dashboard.adminWebsite.postEditorLanguageLabel")}
            </span>
            <InfoTip
              label={t("dashboard.adminWebsite.postEditorLanguageInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </span>
          <select
            value={locale}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value;
              if (isPostLocale(next)) setLocale(next);
            }}
            className={FIELD_BASE}
          >
            {POST_LOCALES.map((code) => (
              <option key={code} value={code}>
                {code === "en"
                  ? t("dashboard.adminWebsite.postEditorLanguageEn")
                  : t("dashboard.adminWebsite.postEditorLanguageEs")}
              </option>
            ))}
          </select>
        </label>

        {/* Summary */}
        <label className="flex flex-col gap-[4px]">
          <span className={LABEL_BASE}>{t("dashboard.adminWebsite.postEditorExcerptLabel")}</span>
          <textarea
            value={excerpt}
            disabled={pending}
            rows={2}
            onChange={(event) => setExcerpt(event.target.value)}
            className={FIELD_BASE}
          />
          <span className="text-admin-11 text-admin-ink-dim">
            {t("dashboard.adminWebsite.postEditorExcerptHelp")}
          </span>
        </label>

        {/* Body — plain text, matching how the public page renders it. */}
        <label className="flex flex-col gap-[4px]">
          <span className={LABEL_BASE}>{t("dashboard.adminWebsite.postEditorBodyLabel")}</span>
          <textarea
            value={body}
            disabled={pending}
            rows={14}
            onChange={(event) => setBody(event.target.value)}
            className={`${FIELD_BASE} leading-relaxed`}
          />
          <span className="text-admin-11 text-admin-ink-dim">
            {t("dashboard.adminWebsite.postEditorBodyHelp")}
          </span>
        </label>

        {/* Search engines */}
        <div className="flex flex-col gap-[10px] border-t border-admin-border-soft pt-[12px]">
          <span className={LABEL_BASE}>{t("dashboard.adminWebsite.postEditorSeoHeading")}</span>
          <label className="flex flex-col gap-[4px]">
            <span className="inline-flex items-center gap-[5px]">
              <span className="text-admin-11h font-semibold text-admin-ink">
                {t("dashboard.adminWebsite.postEditorMetaTitleLabel")}
              </span>
              <InfoTip
                label={t("dashboard.adminWebsite.postEditorMetaTitleInfo")}
                triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
                className="text-admin-ink-dim hover:text-admin-ink"
              />
            </span>
            <input
              type="text"
              value={metaTitle}
              disabled={pending}
              onChange={(event) => setMetaTitle(event.target.value)}
              className={FIELD_BASE}
            />
          </label>
          <label className="flex flex-col gap-[4px]">
            <span className="inline-flex items-center gap-[5px]">
              <span className="text-admin-11h font-semibold text-admin-ink">
                {t("dashboard.adminWebsite.postEditorMetaDescriptionLabel")}
              </span>
              <InfoTip
                label={t("dashboard.adminWebsite.postEditorMetaDescriptionInfo")}
                triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
                className="text-admin-ink-dim hover:text-admin-ink"
              />
            </span>
            <textarea
              value={metaDescription}
              disabled={pending}
              rows={2}
              onChange={(event) => setMetaDescription(event.target.value)}
              className={FIELD_BASE}
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-[8px] border-t border-admin-border-soft pt-[12px]">
          <div className="flex flex-wrap items-center gap-[6px]">
            <button type="button" disabled={pending} onClick={handleSave} className={BUTTON_BASE}>
              <Icon name="check" size={12} stroke={1.7} />
              {status === "published"
                ? t("dashboard.adminWebsite.postEditorSaveLive")
                : t("dashboard.adminWebsite.postEditorSaveDraft")}
            </button>
            {actions.includes("publish") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirm({ kind: "publish" })}
                className={BUTTON_BASE}
              >
                {t("dashboard.adminWebsite.postEditorPublish")}
              </button>
            ) : null}
            {actions.includes("unpublish") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirm({ kind: "unpublish" })}
                className={BUTTON_BASE}
              >
                {t("dashboard.adminWebsite.postEditorUnpublish")}
              </button>
            ) : null}
            {actions.includes("delete") ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirm({ kind: "delete", step: 1 })}
                className={`${BUTTON_BASE} text-admin-critical`}
              >
                {t("dashboard.adminWebsite.postEditorDelete")}
              </button>
            ) : null}
          </div>
          {status === "published" ? (
            <span className="text-admin-11h text-admin-ink-dim">
              {t("dashboard.adminWebsite.postEditorDeleteWhileLive")}
            </span>
          ) : null}

          {confirm.kind === "publish" ? (
            <InlineConfirm
              prompt={t("dashboard.adminWebsite.postEditorPublishConfirm")}
              confirmLabel={t("dashboard.adminWebsite.postEditorPublishConfirmYes")}
              danger={false}
              busy={pending}
              onCancel={() => setConfirm({ kind: "idle" })}
              onConfirm={() => performConfirmed({ kind: "publish" })}
            />
          ) : null}
          {confirm.kind === "unpublish" ? (
            <InlineConfirm
              prompt={t("dashboard.adminWebsite.postEditorUnpublishConfirm")}
              confirmLabel={t("dashboard.adminWebsite.postEditorUnpublishConfirmYes")}
              danger={false}
              busy={pending}
              onCancel={() => setConfirm({ kind: "idle" })}
              onConfirm={() => performConfirmed({ kind: "unpublish" })}
            />
          ) : null}
          {confirm.kind === "delete" ? (
            <InlineConfirm
              prompt={
                confirm.step === 2
                  ? t("dashboard.adminWebsite.postEditorDeleteConfirmFinal")
                  : t("dashboard.adminWebsite.postEditorDeleteConfirm")
              }
              confirmLabel={
                confirm.step === 2
                  ? t("dashboard.adminWebsite.postEditorDeleteConfirmFinalYes")
                  : t("dashboard.adminWebsite.postEditorDeleteConfirmYes")
              }
              danger
              busy={pending}
              onCancel={() => setConfirm({ kind: "idle" })}
              onConfirm={() => {
                // Two-door delete, mirroring the pages rail: step 1 states
                // what is lost, step 2 is the point of no return.
                if (confirm.step === 1) {
                  setConfirm({ kind: "delete", step: 2 });
                  return;
                }
                performConfirmed({ kind: "delete", step: 2 });
              }}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
