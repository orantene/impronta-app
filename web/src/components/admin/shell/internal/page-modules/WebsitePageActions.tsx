"use client";

/**
 * WebsitePageActions.tsx — the quick actions inside a Pages-list row.
 *
 * WHAT THIS IS FOR
 * ────────────────
 * Before this, changing a page's state meant opening the visual editor: the
 * admin could TELL you a page was still a draft and then had nowhere to go. The
 * expandable row shipped in PR #1243 reserved a labelled region for exactly
 * this set; P3-A fills it.
 *
 * NO NEW SERVER CODE
 * ──────────────────
 * Every action here calls an operation that already existed:
 *
 *   Publish now / Restore  → publishPageAction        (FormData, CAS)
 *   Rename                 → quickRenamePageAction    (title + slug)
 *   Duplicate              → duplicatePageAction      (draft copy)
 *   Set as homepage        → setPageRoleAction("home", rawSlug)
 *   Archive                → archivePageAction        (FormData, CAS)
 *   Delete                 → deletePageAction         (FormData, CAS)
 *
 * Their messages are shown as they come back. `VERSION_CONFLICT`,
 * `PUBLISH_NOT_READY` and `SYSTEM_PAGE_IMMUTABLE` all carry a sentence written
 * for an operator; replacing them with copy invented here would hide WHY the
 * call failed and would drift the moment the server's rules change.
 *
 * WHICH VARIANT
 * ─────────────
 * `cms_pages` is unique on (tenant_id, locale, slug), so a bilingual page is
 * two rows with two versions and two statuses. Acting on "the page" is not a
 * thing the schema supports, so these act on the group's PRIMARY variant and
 * say so out loud when a second language exists.
 *
 * SAFETY RAILS
 * ────────────
 * Which actions appear at all is decided by `derivePageActions` in
 * `state/website-pages-list.ts` — pure, unit-tested, and the only place the
 * rules live. This file owns confirmation, not permission.
 *
 * STYLING
 * ───────
 * Admin Tailwind tokens only; `ratchet/no-new-inline-style` freezes new inline
 * style objects under `components/admin/shell`.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  archivePageAction,
  deletePageAction,
  duplicatePageAction,
  publishPageAction,
} from "@/lib/server-actions/admin-site-pages";
import { quickRenamePageAction } from "@/lib/server-actions/admin-site-pages-inline";
import { setPageRoleAction } from "@/lib/server-actions/page-role-actions";

import { Icon } from "../primitives";
import { useAdminShell } from "../state";
import type { WebsitePageRow } from "../state";
import {
  derivePageActions,
  isPageSlugLocked,
  rawPageSlug,
  type PageActionContext,
  type WebsitePageActionId,
  type WebsitePageGroup,
} from "../state/website-pages-list";

/** Catalog key for each action's button label. */
const ACTION_LABEL_KEY: Record<WebsitePageActionId, string> = {
  publish: "dashboard.adminWebsite.pageActionPublish",
  restore: "dashboard.adminWebsite.pageActionRestore",
  rename: "dashboard.adminWebsite.pageActionRename",
  duplicate: "dashboard.adminWebsite.pageActionDuplicate",
  setHomepage: "dashboard.adminWebsite.pageActionSetHomepage",
  archive: "dashboard.adminWebsite.pageActionArchive",
  delete: "dashboard.adminWebsite.pageActionDelete",
};

/**
 * The confirm question for each action that has one, and whether confirming is
 * itself destructive enough to warrant the critical treatment.
 *
 * Duplicate, Rename and Restore are absent on purpose: a duplicate is a new
 * draft nobody can see, a rename has its own form with a Cancel, and Restore
 * only undoes an archive.
 */
const CONFIRM: Partial<
  Record<WebsitePageActionId, { promptKey: string; confirmKey: string; danger: boolean }>
> = {
  publish: {
    promptKey: "dashboard.adminWebsite.pageActionPublishConfirm",
    confirmKey: "dashboard.adminWebsite.pageActionPublishConfirmYes",
    danger: false,
  },
  setHomepage: {
    promptKey: "dashboard.adminWebsite.pageActionSetHomepageConfirm",
    confirmKey: "dashboard.adminWebsite.pageActionSetHomepageConfirmYes",
    danger: false,
  },
  archive: {
    promptKey: "dashboard.adminWebsite.pageActionArchiveConfirm",
    confirmKey: "dashboard.adminWebsite.pageActionArchiveConfirmYes",
    danger: true,
  },
  delete: {
    promptKey: "dashboard.adminWebsite.pageActionDeleteConfirm",
    confirmKey: "dashboard.adminWebsite.pageActionDeleteConfirmYes",
    danger: true,
  },
};

/**
 * Client-side mirror of the server's `slugifyPageName`, so the address updates
 * as the title is typed. The server still validates; this only previews.
 */
function slugifyTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 240);
}

/** `id` + `expectedVersion` — the shape every CAS page action parses. */
function casFormData(row: WebsitePageRow): FormData {
  const formData = new FormData();
  formData.set("id", row.id);
  formData.set("expectedVersion", String(row.version ?? 0));
  return formData;
}

const BUTTON_BASE =
  "inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-55";

const FIELD_BASE =
  "w-full rounded-admin-md border border-admin-border bg-admin-card px-[8px] py-[6px] text-admin-12h text-admin-ink";

// ── inline rename ───────────────────────────────────────────────────────────

/**
 * Title + address, edited in place. Enter saves, Escape cancels — the two keys
 * an operator will try without being told.
 *
 * The address auto-follows the title until the operator touches it, then stops
 * for good: a slug they typed is a decision, and silently rewriting it on the
 * next keystroke in the title field would undo that decision invisibly.
 */
function InlineRenameForm({
  row,
  slugLocked,
  busy,
  onCancel,
  onSave,
}: {
  row: WebsitePageRow;
  slugLocked: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (title: string, slug: string) => void;
}) {
  const t = useT();
  const currentSlug = rawPageSlug(row.slug);
  const [title, setTitle] = useState(row.title);
  const [slugDraft, setSlugDraft] = useState(currentSlug);
  const [slugTouched, setSlugTouched] = useState(false);

  const slug = slugLocked ? currentSlug : slugTouched ? slugDraft : slugifyTitle(title);

  const submit = () => {
    if (busy) return;
    onSave(title.trim(), slug.trim());
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-[8px] rounded-admin-md border border-admin-border bg-admin-card p-[10px]">
      <label className="flex flex-col gap-[3px]">
        <span className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
          {t("dashboard.adminWebsite.pageActionRenameTitleLabel")}
        </span>
        <input
          type="text"
          value={title}
          autoFocus
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={onKeyDown}
          className={FIELD_BASE}
        />
      </label>
      {slugLocked ? (
        <p className="m-0 text-admin-11h text-admin-ink-dim">
          {t("dashboard.adminWebsite.pageActionRenameAddressLocked")}
        </p>
      ) : (
        <label className="flex flex-col gap-[3px]">
          <span className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
            {t("dashboard.adminWebsite.pageActionRenameAddressLabel")}
          </span>
          <input
            type="text"
            value={slug}
            disabled={busy}
            onChange={(event) => {
              setSlugTouched(true);
              setSlugDraft(event.target.value);
            }}
            onKeyDown={onKeyDown}
            className={`${FIELD_BASE} font-mono`}
          />
          <span className="truncate font-mono text-admin-10 text-admin-ink-dim">
            {interpolate(t("dashboard.adminWebsite.pageActionRenameAddressPreview"), {
              path: `/${slug}`,
            })}
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-[6px]">
        <button type="button" disabled={busy} onClick={submit} className={BUTTON_BASE}>
          {t("dashboard.adminWebsite.pageActionRenameSave")}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className={BUTTON_BASE}>
          {t("dashboard.adminWebsite.pageActionCancel")}
        </button>
      </div>
    </div>
  );
}

// ── inline confirm ──────────────────────────────────────────────────────────

/** A question with two answers. Never `window.confirm`. */
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
      <p
        className={`m-0 text-admin-12h ${danger ? "text-admin-critical" : "text-admin-ink"}`}
      >
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

// ── the region ──────────────────────────────────────────────────────────────

/**
 * `delete` is confirmed TWICE. The first press explains that the page and its
 * content go for good; the second is the last door. An archived page is already
 * invisible to visitors, so nothing is urgent enough to justify one click.
 */
type ActionMode =
  | { kind: "idle" }
  | { kind: "rename" }
  | { kind: "confirm"; action: WebsitePageActionId; step: 1 | 2 };

export function WebsitePageActions({
  group,
  canEdit,
  isPlatformHub,
}: {
  group: WebsitePageGroup;
} & Pick<PageActionContext, "canEdit" | "isPlatformHub">) {
  const t = useT();
  const router = useRouter();
  const { toast } = useAdminShell();
  const [mode, setMode] = useState<ActionMode>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const row = group.primary;
  const actions = useMemo(
    () =>
      derivePageActions(row, {
        canEdit,
        isPlatformHub,
        isHomepage: group.isHomepage,
      }),
    [row, canEdit, isPlatformHub, group.isHomepage],
  );

  /**
   * One place where a server result becomes a toast plus a refresh.
   *
   * The refresh is unconditional on success AND on failure: a VERSION_CONFLICT
   * means the row in front of the operator is stale, so leaving it on screen
   * would invite them to press the same stale button again. Retrying silently
   * with the server's `currentVersion` is the tempting alternative and is
   * wrong — the conflict exists because somebody else's edit is in there.
   */
  const run = useCallback(
    (work: () => Promise<{ ok: boolean; message: string }>) => {
      startTransition(() => {
        void (async () => {
          const result = await work();
          toast(result.message);
          setMode({ kind: "idle" });
          await router.refresh();
        })();
      });
    },
    [router, toast],
  );

  const runCas = useCallback(
    (
      action: (
        prev: undefined,
        formData: FormData,
      ) => Promise<
        { ok: true; message: string } | { ok: false; error: string } | undefined
      >,
      successKey: string,
    ) => {
      run(async () => {
        const result = await action(undefined, casFormData(row));
        if (!result) {
          return { ok: false, message: t("dashboard.adminWebsite.pageActionFailed") };
        }
        // The server's own sentence, not a re-written one: it names the reason
        // (someone else edited this, the template is not ready to publish, this
        // page is system-owned) and this surface cannot know which applies.
        return result.ok
          ? { ok: true, message: t(successKey) }
          : { ok: false, message: result.error };
      });
    },
    [row, run, t],
  );

  const perform = useCallback(
    (action: WebsitePageActionId) => {
      if (action === "publish") {
        runCas(publishPageAction, "dashboard.adminWebsite.pageActionPublishedToast");
        return;
      }
      if (action === "restore") {
        runCas(publishPageAction, "dashboard.adminWebsite.pageActionRestoredToast");
        return;
      }
      if (action === "archive") {
        runCas(archivePageAction, "dashboard.adminWebsite.pageActionArchivedToast");
        return;
      }
      if (action === "delete") {
        runCas(deletePageAction, "dashboard.adminWebsite.pageActionDeletedToast");
        return;
      }
      if (action === "duplicate") {
        run(async () => {
          const result = await duplicatePageAction(row.id);
          return result.ok
            ? { ok: true, message: t("dashboard.adminWebsite.pageActionDuplicatedToast") }
            : { ok: false, message: result.error };
        });
        return;
      }
      if (action === "setHomepage") {
        run(async () => {
          const result = await setPageRoleAction("home", rawPageSlug(row.slug));
          return result.ok
            ? { ok: true, message: t("dashboard.adminWebsite.pageActionHomepageSetToast") }
            : { ok: false, message: result.error };
        });
      }
    },
    [row, run, runCas, t],
  );

  const onRenameSave = useCallback(
    (title: string, slug: string) => {
      if (!title) {
        toast(t("dashboard.adminWebsite.pageActionRenameNeedsTitle"));
        return;
      }
      run(async () => {
        const result = await quickRenamePageAction({ id: row.id, title, slug });
        return result.ok
          ? { ok: true, message: t("dashboard.adminWebsite.pageActionRenamedToast") }
          : { ok: false, message: result.error };
      });
    },
    [row.id, run, t, toast],
  );

  if (actions.length === 0) return null;

  const onPick = (action: WebsitePageActionId) => {
    if (action === "rename") {
      setMode({ kind: "rename" });
      return;
    }
    if (CONFIRM[action]) {
      setMode({ kind: "confirm", action, step: 1 });
      return;
    }
    perform(action);
  };

  const confirmState = mode.kind === "confirm" ? CONFIRM[mode.action] : undefined;

  return (
    <div className="flex flex-col gap-[8px] border-t border-admin-border-soft pt-[10px]">
      <span className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
        {t("dashboard.adminWebsite.pagesListActionsHeading")}
      </span>
      {group.variants.length > 1 ? (
        <span className="text-admin-11h text-admin-ink-dim">
          {interpolate(t("dashboard.adminWebsite.pageActionVariantNote"), {
            locale: (row.locale ?? "").toUpperCase(),
          })}
        </span>
      ) : null}

      <div className="flex flex-wrap items-center gap-[6px]">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending}
            onClick={() => onPick(action)}
            className={`${BUTTON_BASE} ${action === "delete" ? "text-admin-critical" : ""}`}
          >
            {action === "publish" || action === "restore" ? (
              <Icon name="check" size={12} stroke={1.7} />
            ) : null}
            {action === "rename" ? <Icon name="pencil" size={12} stroke={1.7} /> : null}
            {action === "duplicate" ? <Icon name="layers" size={12} stroke={1.7} /> : null}
            {action === "setHomepage" ? <Icon name="home" size={12} stroke={1.7} /> : null}
            {action === "archive" ? <Icon name="archive" size={12} stroke={1.7} /> : null}
            {action === "delete" ? <Icon name="x" size={12} stroke={1.7} /> : null}
            {t(ACTION_LABEL_KEY[action])}
          </button>
        ))}
      </div>

      {mode.kind === "rename" ? (
        <InlineRenameForm
          row={row}
          slugLocked={isPageSlugLocked(row, { isHomepage: group.isHomepage })}
          busy={pending}
          onCancel={() => setMode({ kind: "idle" })}
          onSave={onRenameSave}
        />
      ) : null}

      {mode.kind === "confirm" && confirmState ? (
        <InlineConfirm
          prompt={
            mode.action === "delete" && mode.step === 2
              ? t("dashboard.adminWebsite.pageActionDeleteConfirmFinal")
              : t(confirmState.promptKey)
          }
          confirmLabel={
            mode.action === "delete" && mode.step === 2
              ? t("dashboard.adminWebsite.pageActionDeleteConfirmFinalYes")
              : t(confirmState.confirmKey)
          }
          danger={confirmState.danger}
          busy={pending}
          onCancel={() => setMode({ kind: "idle" })}
          onConfirm={() => {
            // Delete is the only two-door action: step 1 states what is lost,
            // step 2 is the point of no return.
            if (mode.action === "delete" && mode.step === 1) {
              setMode({ kind: "confirm", action: "delete", step: 2 });
              return;
            }
            perform(mode.action);
          }}
        />
      ) : null}
    </div>
  );
}
