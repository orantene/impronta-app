"use client";

/**
 * PlaygroundView (Phase 3) — the Builder Lab workbench, extracted from
 * component-catalog.tsx to keep that controller under the max-lines cap. A
 * persistent list of full-page drafts (builder_templates, kind=page_template)
 * AND shell (header/footer) drafts, with status pills. "+ New" creates a draft
 * for the picked target and opens it; clicking a draft reopens it. The editor
 * binds to the draft id, so edits persist and Publish promotes the draft into
 * the page-templates gallery — the live builders' "+" Add → Page Templates tab
 * (scoped by the draft's target_context).
 *
 * Shell drafts are platform-scoped (they apply to a tenant's site_shell, not the
 * page gallery), so the "+ New" menu sections + badges them distinctly.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { createTemplateDraft } from "@/lib/site-admin/builder-core/templates/registry-actions";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import type {
  BuilderGalleryTab,
  BuilderTemplateKind,
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";
import type { BuilderLabTarget } from "./builder-lab-stage";
import {
  LAB as T,
  panelStyle,
  LabBadge,
  LabButton,
  PillToggle,
  LabViewHeader,
  EmptyCard,
} from "./ui";

/** A "+ New" draft recipe — the kind/tab/seed metadata for `createTemplateDraft`.
 *  Page-template targets vary by surface; shell templates are platform-authored
 *  header/footer drafts that apply to a tenant's site_shell. */
type PlaygroundNewSpec = {
  kind: BuilderTemplateKind;
  target: BuilderLabTarget;
  gallery_tab: BuilderGalleryTab;
  category: string;
  titleSeed: string;
  slugSeed: string;
};

/** True for the platform-scoped shell (header/footer) template kinds — they
 *  apply to a tenant's site_shell rather than living in the page gallery, so the
 *  UI flags them distinctly. */
export function isShellKind(kind: BuilderTemplateKind): boolean {
  return kind === "shell_header" || kind === "shell_footer";
}

const PLAYGROUND_TARGETS: ReadonlyArray<{
  spec: PlaygroundNewSpec;
  label: string;
  blurb: string;
}> = [
  {
    spec: {
      kind: "page_template",
      target: "talent",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Talent page",
    blurb: "Author against a single talent's live data.",
  },
  {
    spec: {
      kind: "page_template",
      target: "workspace",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Workspace page",
    blurb: "Author against a workspace / hub.",
  },
  {
    spec: {
      kind: "page_template",
      target: "both",
      gallery_tab: "page_templates",
      category: "playground",
      titleSeed: "Untitled draft",
      slugSeed: "playground",
    },
    label: "Both",
    blurb: "A design for both surfaces — preview against a talent or a workspace.",
  },
  // A7 follow-up — shell (header/footer) templates. Platform-authored; they
  // surface ONLY on the shell-surface gallery and apply to a tenant's
  // site_shell row via applyShellTemplateToTenant. Authored against a workspace
  // preview subject (the shell hydrates against the tenant default).
  {
    spec: {
      kind: "shell_header",
      target: "workspace",
      gallery_tab: "shell",
      category: "shell",
      titleSeed: "Untitled header",
      slugSeed: "shell-header",
    },
    label: "Shell header",
    blurb: "A reusable site header — apply it to a tenant's shell.",
  },
  {
    spec: {
      kind: "shell_footer",
      target: "workspace",
      gallery_tab: "shell",
      category: "shell",
      titleSeed: "Untitled footer",
      slugSeed: "shell-footer",
    },
    label: "Shell footer",
    blurb: "A reusable site footer — apply it to a tenant's shell.",
  },
];

const PLAYGROUND_STATUS_FILTERS: ReadonlyArray<{
  key: "all" | BuilderTemplateStatus;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_review", label: "In Review" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

const STATUS_TONE: Record<BuilderTemplateStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(255,255,255,0.07)", fg: T.inkMuted },
  in_review: { bg: "rgba(155,168,183,0.16)", fg: "#9BA8B7" },
  published: { bg: "rgba(93,211,160,0.16)", fg: T.accent },
  archived: { bg: "rgba(255,255,255,0.05)", fg: T.inkDim },
};

/** builder_templates target_context → the editor's launch target. */
function targetToLabTarget(t: BuilderTemplateTarget): BuilderLabTarget {
  return t === "talent" || t === "workspace" ? t : "both";
}

/** A labeled section inside the Playground "+ New" dropdown, with an optional
 *  scope hint under the heading. */
function PlaygroundNewMenuGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ paddingBottom: 2 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: T.inkDim,
          padding: "6px 8px 2px",
        }}
      >
        {label}
      </div>
      {hint ? (
        <div style={{ fontSize: 10.5, color: T.inkDim, padding: "0 8px 6px", lineHeight: 1.4 }}>
          {hint}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** One "+ New" dropdown item — label + blurb, with an optional trailing badge. */
function PlaygroundNewMenuItem({
  label,
  blurb,
  badge,
  onClick,
}: {
  label: string;
  blurb: string;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        borderRadius: 9,
        padding: "9px 10px",
        cursor: "pointer",
        color: T.ink,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.cardSoft;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        {badge}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 2, lineHeight: 1.4 }}>
        {blurb}
      </div>
    </button>
  );
}

export function PlaygroundView({
  onLaunchEditor,
}: {
  onLaunchEditor?: (target: BuilderLabTarget, draftId?: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drafts, setDrafts] = useState<BuilderTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | BuilderTemplateStatus>(
    "all",
  );
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const res = await listAllTemplates();
    if (res.ok) {
      // A7 follow-up — the Playground lists full-page drafts AND the shell
      // (header/footer) drafts, so a shell template can be authored + reopened
      // here just like a page template.
      setDrafts(
        res.data.filter(
          (t) =>
            t.kind === "page_template" ||
            t.kind === "shell_header" ||
            t.kind === "shell_footer",
        ),
      );
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createAndOpen = useCallback(
    async (spec: PlaygroundNewSpec) => {
      setMenuOpen(false);
      setCreating(true);
      setError(null);
      const stamp = Date.now().toString(36);
      const res = await createTemplateDraft({
        kind: spec.kind,
        title: spec.titleSeed,
        slug: `${spec.slugSeed}-${stamp}-${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        category: spec.category,
        gallery_tab: spec.gallery_tab,
        target_context: spec.target,
      });
      setCreating(false);
      if (res.ok) {
        onLaunchEditor?.(spec.target, res.data.id);
      } else {
        setError(res.error);
      }
    },
    [onLaunchEditor],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drafts?.length ?? 0 };
    for (const d of drafts ?? []) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
  }, [drafts]);

  const visible = (drafts ?? []).filter(
    (d) => statusFilter === "all" || d.status === statusFilter,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <LabViewHeader
        title="Playground"
        blurb="Your workbench — full-page drafts. Start one, author against real data, then publish it into the page-templates gallery."
        actions={
          <div style={{ position: "relative" }}>
            <LabButton
              variant="primary"
              testId="lab-playground-new"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={creating}
              ariaHasPopup
              ariaExpanded={menuOpen}
            >
              {creating ? "Creating…" : "+ New"}
              <span aria-hidden style={{ fontSize: 9, opacity: 0.75 }}>
                {menuOpen ? "▲" : "▼"}
              </span>
            </LabButton>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="New draft target"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 60,
                  width: 320,
                  maxWidth: "90vw",
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 12,
                  boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
                  padding: 8,
                }}
              >
                <PlaygroundNewMenuGroup label="Page draft — pick a target">
                  {PLAYGROUND_TARGETS.filter((o) => !isShellKind(o.spec.kind)).map(
                    (opt) => (
                      <PlaygroundNewMenuItem
                        key={`${opt.spec.kind}:${opt.spec.target}`}
                        label={opt.label}
                        blurb={opt.blurb}
                        onClick={() => void createAndOpen(opt.spec)}
                      />
                    ),
                  )}
                </PlaygroundNewMenuGroup>

                {/* Shell templates are platform-scoped (apply to a tenant's
                    site_shell, not the page gallery) — sectioned + badged so the
                    distinction reads at a glance. */}
                <PlaygroundNewMenuGroup
                  label="Shell"
                  hint="Platform-scoped — applies to a tenant's header/footer."
                >
                  {PLAYGROUND_TARGETS.filter((o) => isShellKind(o.spec.kind)).map(
                    (opt) => (
                      <PlaygroundNewMenuItem
                        key={`${opt.spec.kind}:${opt.spec.target}`}
                        label={opt.label}
                        blurb={opt.blurb}
                        badge={<LabBadge tone="muted">Platform</LabBadge>}
                        onClick={() => void createAndOpen(opt.spec)}
                      />
                    ),
                  )}
                </PlaygroundNewMenuGroup>
              </div>
            ) : null}
          </div>
        }
      />

      {/* Status pills */}
      <PillToggle
        size="sm"
        ariaLabel="Filter drafts by status"
        value={statusFilter}
        onChange={setStatusFilter}
        options={PLAYGROUND_STATUS_FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          count: counts[f.key] ?? 0,
        }))}
      />

      {error ? (
        <div style={{ fontSize: 12, color: T.red }}>{error}</div>
      ) : null}

      {drafts === null ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: "10px 0" }}>Loading drafts…</div>
      ) : visible.length === 0 ? (
        <EmptyCard>
          {statusFilter === "all"
            ? "No drafts yet. Hit + New to start a full-page draft — it’s saved as you edit."
            : `No ${statusFilter.replace("_", " ")} drafts.`}
        </EmptyCard>
      ) : (
        <section style={{ ...panelStyle, overflow: "hidden" }}>
          {visible.map((d, i) => {
            const tone = STATUS_TONE[d.status];
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onLaunchEditor?.(targetToLabTarget(d.target_context), d.id)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`,
                  padding: "12px 16px",
                  cursor: "pointer",
                  color: T.ink,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.cardSoft;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.title || "Untitled draft"}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkDim, marginTop: 2 }}>
                    Updated {new Date(d.updated_at).toLocaleDateString()} · v{d.version}
                  </div>
                </div>
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
                <span aria-hidden style={{ color: T.inkDim, fontSize: 14, flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
