"use client";

/**
 * PlaygroundDraftRow + its inline drawer-status readout — the per-draft row of
 * the Builder Lab Playground, split out of `catalog-playground.tsx` to keep that
 * file under the 800-line `max-lines` cap. Shared leaves (STATUS_TONE,
 * isShellKind, the drawer state types) come from `playground-shared.ts`, so
 * there is no import cycle with catalog-playground.
 */
import { useCallback, useMemo, useState } from "react";

import {
  publishTemplate,
  restoreTemplateRevision,
  rollbackToRevision,
  setTemplateRollout,
  updateTemplateDraft,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import type {
  BuilderTemplateRow,
  SetTemplateRolloutInput,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import { validateTemplateForPublish } from "@/lib/site-admin/builder-core/templates/validate-publish";
import {
  planPromoteToStarter,
  promoteBlockMessage,
} from "./promote-to-starter";
import {
  isShellKind,
  STATUS_TONE,
  type DrawerActionState,
  type DrawerTab,
  type PromoteState,
} from "./playground-shared";
import { RevisionList } from "./template-revision-list";
import { RolloutPanel } from "./template-rollout-panel";
import { LAB as T, LabBadge, LinkBtn } from "./ui";

// ── Draft row + one-click promote-to-starter (A5) ─────────────────────────────

/**
 * One Playground draft row. Clicking the body reopens the draft in the editor;
 * page-template drafts also expose a one-click "Promote to starter" action that
 * tags the row `gallery_tab=’page_templates’` + a sane `target_context`, runs the
 * publish validator, and publishes — surfacing any validator reason INLINE.
 *
 * O4: An expand affordance reveals an inline drawer with two sub-panels:
 *   - Rollout: staged-rollout controls via RolloutPanel / setTemplateRollout
 *   - Revisions: revision trail via RevisionList / rollbackToRevision /
 *     restoreTemplateRevision
 * All async states are shown inline (no toast-and-vanish).
 */
export function PlaygroundDraftRow({
  draft: d,
  isFirst,
  onOpen,
  onPromoted,
}: {
  draft: BuilderTemplateRow;
  isFirst: boolean;
  onOpen: () => void;
  onPromoted: () => void | Promise<void>;
}) {
  const [promote, setPromote] = useState<PromoteState>({ kind: "idle" });
  // O4: expandable drawer state
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(null);
  const [drawerAction, setDrawerAction] = useState<DrawerActionState>({ kind: "idle" });
  // Key to remount RevisionList after a restore/rollback so it reloads.
  const [revisionKey, setRevisionKey] = useState(0);

  const plan = useMemo(() => planPromoteToStarter(d), [d]);

  const runPromote = useCallback(async () => {
    if (!plan.promotable) {
      setPromote({
        kind: "error",
        reasons: [promoteBlockMessage(plan.blockedReason!)],
      });
      return;
    }
    setPromote({ kind: "running" });

    // Instant client-side gate: surface the SAME validator’s reasons inline
    // before the round-trip, so a broken draft fails fast and visibly.
    const preflight = validateTemplateForPublish(d.builder_tree);
    if (!preflight.ok) {
      setPromote({ kind: "error", reasons: preflight.reasons });
      return;
    }

    // Tag the row so it lands in the page-templates gallery with a sane scope —
    // only when something actually needs to change (planPromoteToStarter returns
    // a null patch when the row is already correct).
    if (plan.patch) {
      const upd = await updateTemplateDraft({ id: d.id, ...plan.patch });
      if (!upd.ok) {
        setPromote({ kind: "error", reasons: [upd.error] });
        return;
      }
    }

    // Publish runs validateTemplateForPublish server-side too; its error string
    // carries the validator’s reasons ("Can’t publish: …") — show them inline.
    const pub = await publishTemplate(d.id);
    if (!pub.ok) {
      setPromote({ kind: "error", reasons: [pub.error] });
      return;
    }

    setPromote({ kind: "done", version: pub.data.version });
    await onPromoted();
  }, [plan, d, onPromoted]);

  // O4: rollout save
  const handleRolloutSave = useCallback(
    async (input: SetTemplateRolloutInput) => {
      setDrawerAction({ kind: "running", label: "Saving rollout…" });
      const res = await setTemplateRollout(d.id, input);
      if (!res.ok) {
        setDrawerAction({ kind: "error", msg: res.error });
      } else {
        setDrawerAction({ kind: "done", msg: "Rollout saved." });
        // Collapse the rollout panel after a successful save (stays dismissible).
        setDrawerTab(null);
      }
    },
    [d.id],
  );

  // O4: restore a revision to draft (does not republish)
  const handleRestore = useCallback(
    async (version: number) => {
      if (
        !window.confirm(
          `Restore v${version} onto this draft? The current draft content will be overwritten (not deleted, you can still roll back further).`,
        )
      )
        return;
      setDrawerAction({ kind: "running", label: `Restoring v${version}…` });
      const res = await restoreTemplateRevision(d.id, version);
      if (!res.ok) {
        setDrawerAction({ kind: "error", msg: res.error });
      } else {
        setDrawerAction({ kind: "done", msg: `Restored v${version} to draft. Open the editor to review before publishing.` });
        setRevisionKey((k) => k + 1);
      }
    },
    [d.id],
  );

  // O4: one-click rollback — re-publishes old revision as a new forward version
  const handleRollback = useCallback(
    async (version: number) => {
      if (
        !window.confirm(
          `Roll back to v${version}? This re-publishes that revision’s content as a new version (history is preserved).`,
        )
      )
        return;
      setDrawerAction({ kind: "running", label: `Rolling back to v${version}…` });
      const res = await rollbackToRevision(d.id, version);
      if (!res.ok) {
        setDrawerAction({ kind: "error", msg: res.error });
      } else {
        setDrawerAction({ kind: "done", msg: `Rolled back: re-published as v${res.data.version}.` });
        setRevisionKey((k) => k + 1);
        await onPromoted(); // reload the draft list so version + status are current
      }
    },
    [d.id, onPromoted],
  );

  const tone = STATUS_TONE[d.status];
  const running = promote.kind === "running";
  const drawerRunning = drawerAction.kind === "running";

  // Toggle a drawer tab — clicking the active tab closes it.
  const toggleDrawer = useCallback((tab: "rollout" | "revisions") => {
    setDrawerTab((cur) => (cur === tab ? null : tab));
    setDrawerAction({ kind: "idle" });
  }, []);

  return (
    <div
      style={{
        borderTop: isFirst ? "none" : `1px solid ${T.borderSoft}`,
        padding: "12px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={onOpen}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: 1,
            minWidth: 0,
            textAlign: "left",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: T.ink,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: T.ink,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {d.title || "Untitled draft"}
            </div>
            <div style={{ fontSize: 11, color: T.inkDim, marginTop: 2 }}>
              Updated {new Date(d.updated_at).toLocaleDateString()} · v{d.version}
            </div>
          </div>
        </button>

        {/* Shell drafts are platform-scoped — flag them distinctly from
            per-surface page drafts. */}
        {isShellKind(d.kind) ? (
          <LabBadge tone="accent" style={{ flexShrink: 0 }}>
            {d.kind === "shell_header" ? "Shell · Header" : "Shell · Footer"}
          </LabBadge>
        ) : (
          <LabBadge tone="muted" style={{ flexShrink: 0 }}>
            {d.target_context}
          </LabBadge>
        )}
        <LabBadge tone="custom" bg={tone.bg} fg={tone.fg} style={{ flexShrink: 0 }}>
          {d.status.replace("_", " ")}
        </LabBadge>

        {/* One-click promote — only for promotable (page-template) drafts. */}
        {plan.promotable ? (
          <LinkBtn
            label={running ? "Promoting…" : "Promote to starter"}
            onClick={() => void runPromote()}
            disabled={running}
            primary
            testId={`lab-promote-starter-${d.id}`}
          />
        ) : null}

        {/* O4: drawer toggle affordances — Rollout + Revisions */}
        <LinkBtn
          label="Rollout"
          onClick={() => toggleDrawer("rollout")}
          disabled={drawerRunning}
          primary={drawerTab === "rollout"}
          testId={`lab-playground-rollout-${d.id}`}
        />
        <LinkBtn
          label="Revisions"
          onClick={() => toggleDrawer("revisions")}
          disabled={drawerRunning}
          primary={drawerTab === "revisions"}
          testId={`lab-playground-revisions-${d.id}`}
        />

        <button
          type="button"
          onClick={onOpen}
          aria-label="Open draft"
          style={{
            background: "transparent",
            border: "none",
            color: T.inkDim,
            fontSize: 14,
            flexShrink: 0,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ›
        </button>
      </div>

      {/* Inline async + validation result — persistent, never toast-and-vanish. */}
      {promote.kind === "error" ? (
        <div
          role="alert"
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: T.red,
            background: T.redBg,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            padding: "7px 10px",
            lineHeight: 1.45,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: promote.reasons.length > 1 ? 4 : 0,
            }}
          >
            Couldn’t promote this draft
          </div>
          {promote.reasons.length > 1 ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {promote.reasons.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          ) : (
            <span>{promote.reasons[0]}</span>
          )}
        </div>
      ) : promote.kind === "done" ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: T.accent,
            background: T.accentSoft,
            border: `1px solid ${T.accent}`,
            borderRadius: 8,
            padding: "7px 10px",
          }}
        >
          Published as a starter (v{promote.version}), now in the &ldquo;+&rdquo; → Page
          Templates gallery.
        </div>
      ) : null}

      {/* O4: expandable drawer — Rollout panel */}
      {drawerTab === "rollout" ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${T.borderSoft}`,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: T.inkDim,
              marginBottom: 4,
            }}
          >
            Staged rollout
          </div>
          <RolloutPanel
            row={d}
            busy={drawerRunning}
            onSave={(input) => void handleRolloutSave(input)}
            onCancel={() => {
              setDrawerTab(null);
              setDrawerAction({ kind: "idle" });
            }}
          />
          <PlaygroundDrawerStatus state={drawerAction} />
        </div>
      ) : null}

      {/* O4: expandable drawer — Revisions list */}
      {drawerTab === "revisions" ? (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${T.borderSoft}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: T.inkDim,
              }}
            >
              Revision history
            </span>
            <button
              type="button"
              onClick={() => {
                setDrawerTab(null);
                setDrawerAction({ kind: "idle" });
              }}
              style={{
                background: "transparent",
                border: "none",
                color: T.inkDim,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Close
            </button>
          </div>
          {drawerAction.kind === "running" ? (
            <div style={{ fontSize: 11.5, color: T.inkMuted, padding: "6px 0" }}>
              {drawerAction.label}
            </div>
          ) : (
            <RevisionList
              key={revisionKey}
              templateId={d.id}
              onRestore={(version) => void handleRestore(version)}
              onRollback={(version) => void handleRollback(version)}
            />
          )}
          <PlaygroundDrawerStatus state={drawerAction} />
        </div>
      ) : null}
    </div>
  );
}

// ── Inline drawer async-state readout (O4) ────────────────────────────────────

/** Persistent inline readout of an in-flight or completed drawer action.
 *  Shows nothing in the idle state. Never toast-and-vanish. */
function PlaygroundDrawerStatus({ state }: { state: DrawerActionState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "running") {
    return (
      <div
        aria-live="polite"
        style={{
          marginTop: 8,
          fontSize: 11.5,
          color: T.inkMuted,
          padding: "6px 10px",
          borderRadius: 8,
          background: T.cardSoft,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {state.label}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        role="alert"
        style={{
          marginTop: 8,
          fontSize: 11.5,
          color: T.red,
          background: T.redBg,
          border: `1px solid ${T.red}`,
          borderRadius: 8,
          padding: "7px 10px",
        }}
      >
        {state.msg}
      </div>
    );
  }
  // done
  return (
    <div
      aria-live="polite"
      style={{
        marginTop: 8,
        fontSize: 11.5,
        color: T.accent,
        background: T.accentSoft,
        border: `1px solid ${T.accent}`,
        borderRadius: 8,
        padding: "7px 10px",
      }}
    >
      {state.msg}
    </div>
  );
}
