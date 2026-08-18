"use client";

/**
 * WebsiteCustomCode.tsx — Website → Setup → Custom code.
 *
 * Replaces the "not set up yet" placeholder card that PR #1244 shipped. This is
 * the real surface: a named snippet library the tenant owns, each snippet with
 * its own placement and its own published switch.
 *
 * WHO CAN SEE IT
 * ──────────────
 * The server action gate is `manage_agency_domains` (owner-only — see
 * `lib/server-actions/admin-code-snippets.ts` for why this is owner class and
 * not editor class). This component mirrors that with `meetsRole(role,
 * "owner")` so a manager is told plainly that this is an owner surface instead
 * of being shown controls that would fail on click. The client check is a
 * courtesy; the server check is the security boundary.
 *
 * COPY RULES THIS FILE FOLLOWS
 * ────────────────────────────
 * The reader is an agency owner, not a developer. "head" and "end of body" are
 * never used as bare jargon: every label says what it MEANS ("top of the page",
 * "end of the page") and the InfoTip explains when to pick which. The warning
 * that a broken snippet can break the live site is stated once, plainly, above
 * the list rather than buried in a tooltip.
 *
 * STYLING — token classes only (`ratchet/no-new-inline-style`). No `style={{}}`
 * anywhere in this file.
 */

import { useCallback, useEffect, useState } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  CODE_SNIPPET_CODE_MAX,
  CODE_SNIPPET_NAME_MAX,
  type CodeSnippetKind,
  type CodeSnippetPlacement,
  type CodeSnippetRecord,
} from "@/lib/site-admin/code-snippets";
import {
  createCodeSnippet,
  deleteCodeSnippet,
  listCodeSnippets,
  setCodeSnippetPublished,
  updateCodeSnippet,
} from "@/lib/server-actions/admin-code-snippets";

import { meetsRole, useAdminShell } from "../state";

/** Shared field chrome — one definition so every control matches. */
const FIELD_CLASS =
  "w-full min-w-0 rounded-admin-sm border border-admin-border bg-admin-card px-[10px] py-[7px] text-admin-12h text-admin-ink outline-none";

const BUTTON_CLASS =
  "cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-11h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BUTTON_CLASS =
  "cursor-pointer rounded-admin-md border border-admin-border bg-admin-accent-soft px-[12px] py-[6px] text-admin-11h font-semibold text-admin-accent-deep disabled:cursor-not-allowed disabled:opacity-50";

type DraftState = {
  /** null when the form is creating rather than editing. */
  id: string | null;
  name: string;
  kind: CodeSnippetKind;
  code: string;
  placement: CodeSnippetPlacement;
};

const EMPTY_DRAFT: DraftState = { id: null, name: "", kind: "css", code: "", placement: "head" };

/** Locale-agnostic short date for the "published on" column. */
function formatPublishedOn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Small uppercase pill — kind and placement both use it. */
function Chip({ children, tone }: { children: React.ReactNode; tone?: "live" | "draft" }) {
  const toneClass =
    tone === "live"
      ? "text-admin-success-deep"
      : tone === "draft"
        ? "text-admin-ink-dim"
        : "text-admin-ink-muted";
  return (
    <span
      className={`shrink-0 rounded-admin-sm bg-admin-surface-alt px-[7px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function WebsiteCustomCode() {
  const t = useT();
  const { state } = useAdminShell();
  const canManage = meetsRole(state.role, "owner");

  const [snippets, setSnippets] = useState<CodeSnippetRecord[]>([]);
  const [canAddMore, setCanAddMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listCodeSnippets();
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setSnippets(res.snippets);
    setCanAddMore(res.canAddMore);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!canManage) {
      setLoading(false);
      return;
    }
    listCodeSnippets()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(res.error);
          return;
        }
        setSnippets(res.snippets);
        setCanAddMore(res.canAddMore);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    const payload = {
      name: draft.name,
      kind: draft.kind,
      code: draft.code,
      placement: draft.placement,
    };
    const res = draft.id
      ? await updateCodeSnippet({ ...payload, id: draft.id })
      : await createCodeSnippet(payload);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    setDraft(null);
    setNotice(t("dashboard.adminWebsite.setup.customCode.savedNotice"));
    await refresh();
  }

  async function onTogglePublished(snippet: CodeSnippetRecord) {
    setBusyId(snippet.id);
    setFormError(null);
    setNotice(null);
    const res = await setCodeSnippetPublished({
      id: snippet.id,
      isPublished: !snippet.isPublished,
    });
    setBusyId(null);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setNotice(
      res.snippet.isPublished
        ? t("dashboard.adminWebsite.setup.customCode.publishedNotice")
        : t("dashboard.adminWebsite.setup.customCode.unpublishedNotice"),
    );
    await refresh();
  }

  async function onDelete(snippet: CodeSnippetRecord) {
    setBusyId(snippet.id);
    setNotice(null);
    const res = await deleteCodeSnippet({ id: snippet.id });
    setBusyId(null);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    if (draft?.id === snippet.id) setDraft(null);
    setNotice(t("dashboard.adminWebsite.setup.customCode.deletedNotice"));
    await refresh();
  }

  if (!canManage) {
    return (
      <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.customCode.ownerOnly")}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="m-0 text-admin-11h text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.customCode.loading")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      {/* The honest warning. Stated once, in the open, above everything. */}
      <p className="m-0 rounded-admin-md border border-admin-border-soft bg-admin-surface-alt p-[10px] text-admin-11h leading-relaxed text-admin-ink-muted">
        {t("dashboard.adminWebsite.setup.customCode.warning")}
      </p>

      {loadError ? (
        <p className="m-0 text-admin-11h text-admin-critical">{loadError}</p>
      ) : null}
      {notice ? (
        <p className="m-0 text-admin-11h text-admin-success-deep">{notice}</p>
      ) : null}

      {snippets.length === 0 ? (
        <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
          {t("dashboard.adminWebsite.setup.customCode.empty")}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
          {snippets.map((snippet) => (
            <li
              key={snippet.id}
              className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] rounded-admin-md border border-admin-border bg-admin-card p-[10px]"
            >
              <span className="min-w-0 flex-1 truncate text-admin-12h font-semibold text-admin-ink">
                {snippet.name}
              </span>
              <Chip>
                {snippet.kind === "css"
                  ? t("dashboard.adminWebsite.setup.customCode.kindCss")
                  : snippet.kind === "js"
                    ? t("dashboard.adminWebsite.setup.customCode.kindJs")
                    : t("dashboard.adminWebsite.setup.customCode.kindExternal")}
              </Chip>
              <Chip>
                {snippet.placement === "head"
                  ? t("dashboard.adminWebsite.setup.customCode.placementHeadShort")
                  : t("dashboard.adminWebsite.setup.customCode.placementBodyShort")}
              </Chip>
              <Chip tone={snippet.isPublished ? "live" : "draft"}>
                {snippet.isPublished
                  ? t("dashboard.adminWebsite.setup.customCode.statusLive")
                  : t("dashboard.adminWebsite.setup.customCode.statusDraft")}
              </Chip>
              {snippet.isPublished && snippet.publishedAt ? (
                <span className="shrink-0 text-admin-10h text-admin-ink-dim">
                  {interpolate(t("dashboard.adminWebsite.setup.customCode.publishedOn"), {
                    date: formatPublishedOn(snippet.publishedAt),
                  })}
                </span>
              ) : null}
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={busyId === snippet.id}
                onClick={() => void onTogglePublished(snippet)}
              >
                {snippet.isPublished
                  ? t("dashboard.adminWebsite.setup.customCode.unpublishAction")
                  : t("dashboard.adminWebsite.setup.customCode.publishAction")}
              </button>
              <button
                type="button"
                className={BUTTON_CLASS}
                disabled={busyId === snippet.id}
                onClick={() => {
                  setFormError(null);
                  setNotice(null);
                  setDraft({
                    id: snippet.id,
                    name: snippet.name,
                    kind: snippet.kind,
                    code: snippet.code,
                    placement: snippet.placement,
                  });
                }}
              >
                {t("dashboard.adminWebsite.setup.customCode.editAction")}
              </button>
              <button
                type="button"
                className={`${BUTTON_CLASS} text-admin-critical`}
                disabled={busyId === snippet.id}
                onClick={() => void onDelete(snippet)}
              >
                {t("dashboard.adminWebsite.setup.customCode.deleteAction")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <SnippetEditor
          draft={draft}
          saving={saving}
          error={formError}
          onChange={setDraft}
          onCancel={() => {
            setDraft(null);
            setFormError(null);
          }}
          onSave={() => void onSave()}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-[8px]">
          <button
            type="button"
            className={PRIMARY_BUTTON_CLASS}
            disabled={!canAddMore}
            onClick={() => {
              setFormError(null);
              setNotice(null);
              setDraft({ ...EMPTY_DRAFT });
            }}
          >
            {t("dashboard.adminWebsite.setup.customCode.addAction")}
          </button>
          {!canAddMore ? (
            <span className="text-admin-11h text-admin-ink-muted">
              {t("dashboard.adminWebsite.setup.customCode.limitReached")}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** The add/edit form. Separate so the list above stays readable. */
function SnippetEditor({
  draft,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: DraftState;
  saving: boolean;
  error: string | null;
  onChange: (next: DraftState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-[10px] rounded-admin-md border border-admin-border bg-admin-surface-alt p-[12px]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[10px]">
        <label className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
            {t("dashboard.adminWebsite.setup.customCode.nameLabel")}
          </span>
          <input
            className={FIELD_CLASS}
            value={draft.name}
            maxLength={CODE_SNIPPET_NAME_MAX}
            placeholder={t("dashboard.adminWebsite.setup.customCode.namePlaceholder")}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
            {t("dashboard.adminWebsite.setup.customCode.kindLabel")}
          </span>
          <select
            className={FIELD_CLASS}
            value={draft.kind}
            onChange={(e) =>
              onChange({ ...draft, kind: e.target.value as CodeSnippetKind })
            }
          >
            <option value="css">
              {t("dashboard.adminWebsite.setup.customCode.kindCssOption")}
            </option>
            <option value="js">
              {t("dashboard.adminWebsite.setup.customCode.kindJsOption")}
            </option>
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-[3px]">
          <span className="flex items-center gap-[5px] text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
            {t("dashboard.adminWebsite.setup.customCode.placementLabel")}
            <InfoTip
              label={t("dashboard.adminWebsite.setup.customCode.placementInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              placement="bottom-start"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </span>
          <select
            className={FIELD_CLASS}
            value={draft.placement}
            onChange={(e) =>
              onChange({ ...draft, placement: e.target.value as CodeSnippetPlacement })
            }
          >
            <option value="head">
              {t("dashboard.adminWebsite.setup.customCode.placementHeadOption")}
            </option>
            <option value="body_end">
              {t("dashboard.adminWebsite.setup.customCode.placementBodyOption")}
            </option>
          </select>
        </label>
      </div>

      <label className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-admin-10h font-semibold uppercase tracking-[0.5px] text-admin-ink-muted">
          {t("dashboard.adminWebsite.setup.customCode.codeLabel")}
        </span>
        <textarea
          className={`${FIELD_CLASS} min-h-[160px] resize-y font-mono`}
          value={draft.code}
          rows={10}
          maxLength={CODE_SNIPPET_CODE_MAX}
          spellCheck={false}
          placeholder={
            draft.kind === "css"
              ? t("dashboard.adminWebsite.setup.customCode.codePlaceholderCss")
              : t("dashboard.adminWebsite.setup.customCode.codePlaceholderJs")
          }
          onChange={(e) => onChange({ ...draft, code: e.target.value })}
        />
      </label>

      <p className="m-0 text-admin-10h leading-relaxed text-admin-ink-dim">
        {t("dashboard.adminWebsite.setup.customCode.externalNote")}
      </p>

      {error ? <p className="m-0 text-admin-11h text-admin-critical">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-[8px]">
        <button
          type="button"
          className={PRIMARY_BUTTON_CLASS}
          disabled={saving}
          onClick={onSave}
        >
          {saving
            ? t("dashboard.adminWebsite.setup.customCode.savingAction")
            : draft.id
              ? t("dashboard.adminWebsite.setup.customCode.saveChangesAction")
              : t("dashboard.adminWebsite.setup.customCode.saveDraftAction")}
        </button>
        <button type="button" className={BUTTON_CLASS} disabled={saving} onClick={onCancel}>
          {t("dashboard.adminWebsite.setup.customCode.cancelAction")}
        </button>
        <span className="text-admin-10h text-admin-ink-dim">
          {t("dashboard.adminWebsite.setup.customCode.draftFirstNote")}
        </span>
      </div>
    </div>
  );
}
