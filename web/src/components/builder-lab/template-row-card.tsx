"use client";

/**
 * TemplateRowCard + the A1 DuplicateRenamePanel — one row of the Template
 * Manager list (status pills, thumbnail, lifecycle actions, the publish-note /
 * rollout / revisions / archive-impact panels) plus the inline duplicate-rename
 * form. Split out of `template-manager.tsx` to keep that file under the 800-line
 * `max-lines` cap. Shared tokens + primitives come from `template-manager-ui.tsx`.
 * Behavior-identical to the originals — pure move.
 */
import { useEffect, useMemo, useState } from "react";

import {
  getPublishDiff,
  loadHideImpact,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import type { HideImpact } from "@/lib/site-admin/builder-core/templates/hide-impact";
import {
  isSlugTaken,
  suggestDuplicateDefaults,
} from "@/lib/site-admin/builder-core/templates/slug-minting";
import { getTemplatePreviewUrl } from "@/lib/site-admin/builder-core/templates/template-def";
import {
  previewPublishChecklist,
  type PublishChecklist,
  type TemplateTreeDiff,
} from "@/lib/site-admin/builder-core/templates/validate-publish";
import type {
  BuilderTemplateRow,
  SetTemplateRolloutInput,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import {
  PublishNotePanel,
  RevisionList,
} from "./template-revision-list";
import {
  RolloutPanel,
  rolloutChipText,
  rolloutSummary,
} from "./template-rollout-panel";
import { summarizeLatestRevision } from "./template-revision-summary";
import { TemplateThumbnailCell } from "./template-thumbnail-cell";
import {
  Field,
  GhostBtn,
  Pill,
  PrimaryBtn,
  T,
  ghostBase,
  input,
  primaryBtn,
} from "./template-manager-ui";
import { WhereUsedConfirm } from "./where-used-confirm";

export function TemplateRowCard({
  row,
  busy,
  adoption,
  mediaTenantId,
  thumbUrl,
  thumbBusy,
  onSetThumbnail,
  onEdit,
  onSubmit,
  onReject,
  onPublish,
  onUnpublish,
  onArchive,
  duplicatingOpen,
  onDuplicateRequest,
  onDuplicateCancel,
  onDuplicateConfirm,
  sameKindRows,
  onRestore,
  onRollback,
  onSetRollout,
}: {
  row: BuilderTemplateRow;
  busy: boolean;
  adoption: string | null;
  mediaTenantId: string | null;
  thumbUrl: string | null;
  thumbBusy: boolean;
  onSetThumbnail: (assetId: string | null, publicUrl: string | null) => void;
  onEdit: () => void;
  onSubmit: () => void;
  onReject: () => void;
  onPublish: (changelog?: string | null) => void;
  onUnpublish: () => void;
  onArchive: () => void;
  /** A1 — duplicate-with-rename */
  duplicatingOpen: boolean;
  onDuplicateRequest: () => void;
  onDuplicateCancel: () => void;
  onDuplicateConfirm: (title: string, slug: string) => void;
  sameKindRows: ReadonlyArray<{ slug: string; title: string }>;
  onRestore: (version: number) => void;
  onRollback: (version: number) => void;
  onSetRollout: (input: SetTemplateRolloutInput) => void;
}) {
  const [showRevs, setShowRevs] = useState(false);
  const [showRollout, setShowRollout] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changelog, setChangelog] = useState("");
  // D6 — where-used / impact preview before the one-way archive. `archiving`
  // gates the confirm dialog; `archiveImpact` is null while loadHideImpact is in
  // flight (the dialog shows a "checking…" state until it resolves).
  const [archiving, setArchiving] = useState(false);
  const [archiveImpact, setArchiveImpact] = useState<HideImpact | null>(null);
  // G3 — advisory diff verdict fetched when the publish panel opens.
  const [publishDiff, setPublishDiff] = useState<{
    treeDiff: TemplateTreeDiff;
    publishedVersion: number | null;
  } | null>(null);

  // Fetch the diff when the publish panel opens so the admin sees "no changes
  // since v(N)" vs "tree changed since v(N)" before confirming.
  useEffect(() => {
    if (!publishing) {
      setPublishDiff(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await getPublishDiff(row.id).catch(() => null);
      if (cancelled || !res || !res.ok) return;
      setPublishDiff(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [publishing, row.id]);

  // D6 — when the archive confirm opens, load the where-used impact (D1 live-page
  // usage + G5 template dependents) so the operator sees the blast radius BEFORE
  // the one-way switch. A failure degrades to a zero-impact preview inside the
  // action, so the confirm always resolves to something.
  useEffect(() => {
    if (!archiving) {
      setArchiveImpact(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await loadHideImpact(
        { kind: "template", templateId: row.id },
        "archive",
      ).catch(() => null);
      if (cancelled || !res || !res.ok) return;
      setArchiveImpact(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [archiving, row.id]);

  // A6 — pre-publish checklist, recomputed as the admin types the changelog so
  // the "has changelog" row flips live. Read-only; uses the row data already in
  // memory + the diff snapshot fetched above (no extra round-trip).
  const checklist: PublishChecklist = useMemo(
    () =>
      previewPublishChecklist({
        tree: row.builder_tree,
        description: row.description,
        thumbnailAssetId: row.thumbnail_asset_id,
        changelog: row.changelog,
        pendingChangelog: changelog,
      }),
    [
      row.builder_tree,
      row.description,
      row.thumbnail_asset_id,
      row.changelog,
      changelog,
    ],
  );

  const chipText = rolloutChipText(row);
  const statusTone =
    row.status === "published"
      ? T.accent
      : row.status === "in_review"
        ? T.amber
        : row.status === "archived"
          ? T.inkDim
          : T.inkMuted;

  return (
    <div
      style={{
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 11,
        padding: 14,
        background: T.cardSoft,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <TemplateThumbnailCell
          tenantId={mediaTenantId}
          thumbUrl={thumbUrl}
          busy={thumbBusy}
          onPick={onSetThumbnail}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{row.title}</span>
            <Pill tone={statusTone}>{row.status.replace("_", " ")}</Pill>
            <Pill>{row.kind.replace("_", " ")}</Pill>
            <Pill>{row.target_context}</Pill>
            <Pill>{row.required_plan}</Pill>
            {/* Rollout chip: amber when canaried, dim quiet "100%" when fully
                rolled out. The tooltip always shows the full rolloutSummary. */}
            {chipText !== null ? (
              <Pill tone={T.amber} title={rolloutSummary(row)}>
                {chipText}
              </Pill>
            ) : (
              <Pill title="Fully rolled out to all tenants">100%</Pill>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
            {row.slug} · v{row.version} · {row.gallery_tab}
            {row.data_binding_requirements.length > 0
              ? ` · binds: ${row.data_binding_requirements.join(", ")}`
              : ""}
          </div>
          {row.description ? (
            <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 6, lineHeight: 1.5 }}>
              {row.description}
            </div>
          ) : null}
          {/* D4 — inline per-template changelog/revision summary line.
              Shows "v7, changed 2d ago, copy fix" at all times. Clicking
              "History ▾" / "History ▴" expands the full RevisionList below. */}
          <button
            type="button"
            onClick={() => setShowRevs((s) => !s)}
            disabled={busy}
            title={showRevs ? "Hide revision history" : "Expand revision history"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 7,
              background: showRevs ? "rgba(93,211,160,0.08)" : "transparent",
              border: `1px solid ${showRevs ? "rgba(93,211,160,0.30)" : T.borderSoft}`,
              borderRadius: 999,
              padding: "2px 9px",
              fontSize: 10.5,
              fontWeight: 600,
              color: showRevs ? T.accent : T.inkDim,
              cursor: busy ? "default" : "pointer",
              fontFamily: "ui-monospace, monospace",
              letterSpacing: 0.1,
            }}
          >
            {summarizeLatestRevision(row.version, row.updated_at, row.changelog)}
            <span aria-hidden style={{ fontSize: 8, opacity: 0.7, fontFamily: "inherit" }}>
              {showRevs ? "▴" : "▾"}
            </span>
          </button>
          {/* D7 — adoption stat: "applied N times across M tenants". Hidden when
              the template has never been applied (formatTemplateAdoption → null). */}
          {adoption ? (
            <div
              style={{
                fontSize: 11,
                color: T.inkMuted,
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>
                ◆
              </span>
              {adoption}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <GhostBtn onClick={onEdit} disabled={busy}>Edit</GhostBtn>
        <GhostBtn
          onClick={() => {
            if (typeof window === "undefined") return;
            window.open(
              getTemplatePreviewUrl(row.id, { family: "db-template" }),
              "_blank",
              "noopener,noreferrer",
            );
          }}
          disabled={busy}
        >
          Open preview
        </GhostBtn>
        {row.status === "draft" ? (
          <GhostBtn onClick={onSubmit} disabled={busy}>Submit for review</GhostBtn>
        ) : null}
        {row.status === "in_review" ? (
          <GhostBtn onClick={onReject} disabled={busy}>Send back to draft</GhostBtn>
        ) : null}
        {row.status !== "published" && row.status !== "archived" ? (
          <PrimaryBtn
            onClick={() => setPublishing((p) => !p)}
            disabled={busy}
          >
            {row.status === "in_review" ? "Approve + publish" : "Publish to gallery"}
          </PrimaryBtn>
        ) : null}
        {row.status === "published" ? (
          <GhostBtn onClick={onUnpublish} disabled={busy}>Unpublish</GhostBtn>
        ) : null}
        <GhostBtn onClick={onDuplicateRequest} disabled={busy}>Duplicate…</GhostBtn>
        {row.status !== "archived" ? (
          <GhostBtn
            onClick={() => setArchiving((a) => !a)}
            disabled={busy}
            tone="danger"
          >
            Archive
          </GhostBtn>
        ) : null}
        <GhostBtn onClick={() => setShowRollout((s) => !s)} disabled={busy}>
          {showRollout ? "Hide rollout" : "Rollout"}
        </GhostBtn>
      </div>

      {/* D6 — where-used / impact preview before the one-way archive. */}
      <WhereUsedConfirm
        open={archiving}
        subjectLabel={row.title}
        action="archive"
        impact={archiveImpact}
        loading={archiveImpact === null}
        busy={busy}
        onCancel={() => setArchiving(false)}
        onConfirm={() => {
          setArchiving(false);
          onArchive();
        }}
      />

      {/* A1 — inline rename panel: shown when user clicks "Duplicate…" */}
      {duplicatingOpen ? (
        <DuplicateRenamePanel
          sourceRow={row}
          sameKindRows={sameKindRows}
          busy={busy}
          onCancel={onDuplicateCancel}
          onConfirm={onDuplicateConfirm}
        />
      ) : null}

      {publishing ? (
        <PublishNotePanel
          value={changelog}
          busy={busy}
          ctaLabel={
            row.status === "in_review" ? "Approve + publish" : "Publish to gallery"
          }
          treeDiff={publishDiff?.treeDiff ?? null}
          publishedVersion={publishDiff?.publishedVersion ?? null}
          checklist={checklist}
          onChange={setChangelog}
          onCancel={() => setPublishing(false)}
          onConfirm={() => {
            const note = changelog.trim();
            setPublishing(false);
            setChangelog("");
            onPublish(note || null);
          }}
        />
      ) : null}

      {showRollout ? (
        <RolloutPanel
          row={row}
          busy={busy}
          onCancel={() => setShowRollout(false)}
          onSave={(input) => {
            setShowRollout(false);
            onSetRollout(input);
          }}
        />
      ) : null}

      {showRevs ? (
        <RevisionList
          templateId={row.id}
          onRestore={onRestore}
          onRollback={onRollback}
        />
      ) : null}
    </div>
  );
}

// ── A1: Duplicate-with-rename panel ──────────────────────────────────────────

/**
 * Inline rename row shown when the admin clicks "Duplicate…" on a template
 * card.  Pre-populates title + slug with the first collision-safe suggestion
 * (via mintCopyTitle / mintCopySlug) and validates uniqueness client-side
 * before the action fires.
 */
function DuplicateRenamePanel({
  sourceRow,
  sameKindRows,
  busy,
  onCancel,
  onConfirm,
}: {
  sourceRow: BuilderTemplateRow;
  /** All rows of the same kind — used for uniqueness checking. */
  sameKindRows: ReadonlyArray<{ slug: string; title: string }>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (title: string, slug: string) => void;
}) {
  const defaults = suggestDuplicateDefaults(
    sourceRow.slug,
    sourceRow.title,
    sameKindRows,
  );
  const [title, setTitle] = useState(defaults.title);
  const [slug, setSlug] = useState(defaults.slug);

  // Exclude the default slug itself from the uniqueness check so the
  // pre-populated suggestion is always valid without the user touching it.
  const slugConflict = isSlugTaken(slug, sameKindRows, defaults.slug);
  const valid =
    title.trim().length > 0 && slug.trim().length > 0 && !slugConflict;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        background: T.card,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink, letterSpacing: 0.2 }}>
        Duplicate — pick a name
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="New title">
          <input
            style={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="New slug">
          <input
            style={{
              ...input,
              borderColor: slugConflict ? T.red : undefined,
            }}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
      </div>
      {slugConflict ? (
        <div style={{ fontSize: 11.5, color: T.red }}>
          Slug &ldquo;{slug}&rdquo; is already in use — choose a unique slug.
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={ghostBase}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onConfirm(title.trim(), slug.trim())}
          style={{ ...primaryBtn, opacity: valid && !busy ? 1 : 0.5, cursor: valid && !busy ? "pointer" : "default" }}
        >
          Duplicate
        </button>
      </div>
    </div>
  );
}
