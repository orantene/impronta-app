"use client";

/**
 * TemplateManager (WS5) — the full lifecycle console for `builder_templates`.
 *
 * Every mutation goes through the WS2 super_admin-gated registry actions; this
 * component NEVER writes a homepage / page. It is the durable counterpart to the
 * ephemeral Lab canvas: the Lab is where you SHAPE a template against real data,
 * the Template Manager is where you publish it INTO the consumer gallery per
 * target (talent / workspace / both) + plan.
 *
 * Covers:
 *   - list (all statuses) with status filter
 *   - create draft (metadata form)
 *   - edit metadata (title / slug / description / category / gallery tab /
 *     target / required plan / tags)
 *   - lifecycle: submit-for-review → publish → unpublish → archive
 *   - duplicate
 *   - restore a prior revision
 *
 * The Lab canvas's "Save as page template" / "Save section as gallery item"
 * (header wiring) call `createTemplateDraft` with the current `builder_tree`;
 * this Manager then drives the rest of the lifecycle.
 */

import { useCallback, useEffect, useState } from "react";

import {
  createTemplateDraft,
  updateTemplateDraft,
  submitTemplateForReview,
  rejectToDraft,
  publishTemplate,
  unpublishTemplate,
  archiveTemplate,
  duplicateTemplate,
  restoreTemplateRevision,
  rollbackToRevision,
  setTemplateRollout,
  listPublishedTemplates,
} from "@/lib/site-admin/builder-core/templates/registry-actions";
import { listAllTemplates } from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import { getTemplatePreviewUrl } from "@/lib/site-admin/builder-core/templates/template-def";
import { galleryTabForTemplateKind } from "@/lib/site-admin/builder-core/templates/apply-shell-template-core";
import {
  RevisionList,
  PublishNotePanel,
} from "./template-revision-list";
import { RolloutPanel, rolloutSummary } from "./template-rollout-panel";
import type {
  BuilderTemplateRow,
  BuilderTemplateKind,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
  BuilderGalleryTab,
  SetTemplateRolloutInput,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accent: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
};

const KINDS: BuilderTemplateKind[] = [
  "element",
  "section",
  "connected",
  "page_template",
  "starter_kit",
  // A7 follow-up — shell templates are platform-authored here; they surface
  // ONLY on the shell-surface gallery (gated by allowedTabs) + apply to a
  // tenant's site_shell via applyShellTemplateToTenant.
  "shell_header",
  "shell_footer",
];
const GALLERY_TABS: BuilderGalleryTab[] = [
  "sections",
  "elements",
  "connected",
  "page_templates",
  "shell",
];
const TARGETS: BuilderTemplateTarget[] = ["talent", "workspace", "both", "platform"];
const PLANS = ["free", "studio", "agency", "network"] as const;
const STATUS_FILTERS: Array<BuilderTemplateStatus | "all"> = [
  "all",
  "draft",
  "in_review",
  "published",
  "archived",
];

type DraftForm = {
  kind: BuilderTemplateKind;
  title: string;
  slug: string;
  description: string;
  category: string;
  gallery_tab: BuilderGalleryTab;
  target_context: BuilderTemplateTarget;
  required_plan: (typeof PLANS)[number];
  tags: string;
};

const EMPTY_DRAFT: DraftForm = {
  kind: "section",
  title: "",
  slug: "",
  description: "",
  category: "general",
  gallery_tab: "sections",
  target_context: "both",
  required_plan: "free",
  tags: "",
};

export function TemplateManager() {
  const [rows, setRows] = useState<BuilderTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BuilderTemplateStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Try the admin all-statuses list; fall back to published-only if the admin
    // action isn't available (older build) so the panel still renders something.
    const res = await listAllTemplates().catch(() => null);
    if (res && res.ok) {
      setRows(res.data);
      setLoading(false);
      return;
    }
    const pub = await listPublishedTemplates();
    setLoading(false);
    if (pub.ok) {
      setRows(pub.data);
    } else {
      setError(pub.error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const filtered =
    statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
  const pendingCount = rows.filter((r) => r.status === "in_review").length;

  // ── lifecycle handlers ─────────────────────────────────────────────────────

  const runLifecycle = useCallback(
    async (
      id: string,
      label: string,
      fn: () => Promise<{ ok: boolean; error?: string }>,
    ) => {
      setBusyId(id);
      setError(null);
      const res = await fn();
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "Action failed.");
        return;
      }
      flash(`${label} ✓`);
      void refresh();
    },
    [flash, refresh],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: T.cardSoft, borderRadius: 999, padding: 2 }}>
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{
                  background: active ? T.ink : "transparent",
                  color: active ? "#0F0F11" : T.inkMuted,
                  border: "none",
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {s === "all" ? "All" : s.replace("_", " ")}
                {s === "in_review" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditId(null);
          }}
          style={primaryBtn}
        >
          + New template
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: 12.5, color: T.red, background: "rgba(243,103,114,0.10)", padding: "8px 12px", borderRadius: 8 }}>
          {error}
        </div>
      ) : null}
      {toast ? (
        <div style={{ fontSize: 12.5, color: T.accent, background: "rgba(93,211,160,0.10)", padding: "8px 12px", borderRadius: 8 }}>
          {toast}
        </div>
      ) : null}

      {creating ? (
        <TemplateForm
          mode="create"
          onCancel={() => setCreating(false)}
          onSubmit={async (form) => {
            setBusyId("__create__");
            const res = await createTemplateDraft({
              kind: form.kind,
              title: form.title,
              slug: form.slug,
              description: form.description || null,
              category: form.category,
              gallery_tab: form.gallery_tab,
              target_context: form.target_context,
              required_plan: form.required_plan,
              tags: splitTags(form.tags),
            });
            setBusyId(null);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setCreating(false);
            flash("Draft created ✓");
            void refresh();
          }}
        />
      ) : null}

      {loading ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: 14 }}>Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: T.inkMuted, fontSize: 13, padding: 14 }}>
          No templates {statusFilter === "all" ? "yet" : `with status "${statusFilter}"`}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((row) =>
            editId === row.id ? (
              <TemplateForm
                key={row.id}
                mode="edit"
                initial={rowToForm(row)}
                onCancel={() => setEditId(null)}
                onSubmit={async (form) => {
                  setBusyId(row.id);
                  const res = await updateTemplateDraft({
                    id: row.id,
                    title: form.title,
                    slug: form.slug,
                    description: form.description || null,
                    category: form.category,
                    gallery_tab: form.gallery_tab,
                    target_context: form.target_context,
                    required_plan: form.required_plan,
                    tags: splitTags(form.tags),
                  });
                  setBusyId(null);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setEditId(null);
                  flash("Metadata saved ✓");
                  void refresh();
                }}
              />
            ) : (
              <TemplateRowCard
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onEdit={() => {
                  setEditId(row.id);
                  setCreating(false);
                }}
                onSubmit={() =>
                  runLifecycle(row.id, "Submitted for review", () =>
                    submitTemplateForReview(row.id),
                  )
                }
                onReject={() =>
                  runLifecycle(row.id, "Sent back to draft", () =>
                    rejectToDraft(row.id),
                  )
                }
                onPublish={(changelog) => {
                  // W7 — guard against publishing an empty template (inserts nothing).
                  if (
                    (row.builder_tree?.length ?? 0) === 0 &&
                    !window.confirm(
                      "This template has no content — it will insert nothing into a page. Publish to the gallery anyway?",
                    )
                  ) {
                    return;
                  }
                  void runLifecycle(row.id, "Published to gallery", () =>
                    publishTemplate(row.id, changelog ?? null),
                  );
                }}
                onUnpublish={() =>
                  runLifecycle(row.id, "Unpublished", () => unpublishTemplate(row.id))
                }
                onArchive={() =>
                  runLifecycle(row.id, "Archived", () => archiveTemplate(row.id))
                }
                onDuplicate={() =>
                  runLifecycle(row.id, "Duplicated", () => duplicateTemplate(row.id))
                }
                onRestore={(version) =>
                  runLifecycle(row.id, `Restored v${version}`, () =>
                    restoreTemplateRevision(row.id, version),
                  )
                }
                onRollback={(version) => {
                  if (
                    !window.confirm(
                      `Roll back to v${version}? This re-publishes that revision's content as a new version (history is preserved).`,
                    )
                  ) {
                    return;
                  }
                  void runLifecycle(row.id, `Rolled back to v${version}`, () =>
                    rollbackToRevision(row.id, version),
                  );
                }}
                onSetRollout={(input) =>
                  runLifecycle(row.id, "Rollout saved", () =>
                    setTemplateRollout(row.id, input),
                  )
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ── Row card ──────────────────────────────────────────────────────────────────

function TemplateRowCard({
  row,
  busy,
  onEdit,
  onSubmit,
  onReject,
  onPublish,
  onUnpublish,
  onArchive,
  onDuplicate,
  onRestore,
  onRollback,
  onSetRollout,
}: {
  row: BuilderTemplateRow;
  busy: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  onReject: () => void;
  onPublish: (changelog?: string | null) => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onRestore: (version: number) => void;
  onRollback: (version: number) => void;
  onSetRollout: (input: SetTemplateRolloutInput) => void;
}) {
  const [showRevs, setShowRevs] = useState(false);
  const [showRollout, setShowRollout] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changelog, setChangelog] = useState("");
  const rolloutPct = row.rollout_percentage ?? 100;
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{row.title}</span>
            <Pill tone={statusTone}>{row.status.replace("_", " ")}</Pill>
            <Pill>{row.kind.replace("_", " ")}</Pill>
            <Pill>{row.target_context}</Pill>
            <Pill>{row.required_plan}</Pill>
            <Pill tone={rolloutPct < 100 ? T.amber : undefined}>
              {rolloutSummary(row)}
            </Pill>
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
        <GhostBtn onClick={onDuplicate} disabled={busy}>Duplicate</GhostBtn>
        {row.status !== "archived" ? (
          <GhostBtn onClick={onArchive} disabled={busy} tone="danger">Archive</GhostBtn>
        ) : null}
        <GhostBtn onClick={() => setShowRollout((s) => !s)} disabled={busy}>
          {showRollout ? "Hide rollout" : "Rollout"}
        </GhostBtn>
        <GhostBtn onClick={() => setShowRevs((s) => !s)} disabled={busy}>
          {showRevs ? "Hide revisions" : "Revisions"}
        </GhostBtn>
      </div>

      {publishing ? (
        <PublishNotePanel
          value={changelog}
          busy={busy}
          ctaLabel={
            row.status === "in_review" ? "Approve + publish" : "Publish to gallery"
          }
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

// ── Create / edit form ──────────────────────────────────────────────────────

function TemplateForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: DraftForm;
  onSubmit: (form: DraftForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DraftForm>(initial ?? EMPTY_DRAFT);
  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title.trim().length > 0 && form.slug.trim().length > 0;

  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: 11,
        padding: 16,
        background: T.card,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
        {mode === "create" ? "New template" : "Edit metadata"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Title">
          <input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Slug">
          <input style={input} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="hero-split-cta" />
        </Field>
        {mode === "create" ? (
          <Field label="Kind">
            <select
              style={input}
              value={form.kind}
              onChange={(e) => {
                const nextKind = e.target.value as BuilderTemplateKind;
                set("kind", nextKind);
                // A7 follow-up — a shell template only ever lives on the "shell"
                // gallery tab; pick the coherent tab automatically. Only force a
                // shell↔non-shell switch so a manual tab choice is preserved
                // within a kind family.
                const wasShell = form.gallery_tab === "shell";
                const nextTab = galleryTabForTemplateKind(nextKind);
                const nowShell = nextTab === "shell";
                if (nowShell !== wasShell) set("gallery_tab", nextTab);
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Category">
          <input style={input} value={form.category} onChange={(e) => set("category", e.target.value)} />
        </Field>
        <Field label="Gallery tab">
          <select style={input} value={form.gallery_tab} onChange={(e) => set("gallery_tab", e.target.value as BuilderGalleryTab)}>
            {GALLERY_TABS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Target">
          <select style={input} value={form.target_context} onChange={(e) => set("target_context", e.target.value as BuilderTemplateTarget)}>
            {TARGETS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Required plan">
          <select style={input} value={form.required_plan} onChange={(e) => set("required_plan", e.target.value as (typeof PLANS)[number])}>
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Tags (comma-separated)">
          <input style={input} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="hero, cta" />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          style={{ ...input, minHeight: 56, resize: "vertical" }}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={ghostBase}>Cancel</button>
        <button type="button" disabled={!valid} onClick={() => onSubmit(form)} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}>
          {mode === "create" ? "Create draft" : "Save metadata"}
        </button>
      </div>
    </div>
  );
}

// ── small bits ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkMuted }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        color: tone ?? T.inkMuted,
        padding: "2px 7px",
        borderRadius: 999,
        background: T.cardSoft,
      }}
    >
      {children}
    </span>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...ghostBase, color: tone === "danger" ? T.red : T.ink, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...primaryBtn, cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.cardSoft,
  color: T.ink,
  fontSize: 12.5,
  outline: "none",
};

const ghostBase: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: "transparent",
  color: T.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 13px",
  borderRadius: 8,
  border: "none",
  background: T.accent,
  color: "#0F0F11",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
};

function rowToForm(row: BuilderTemplateRow): DraftForm {
  return {
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    description: row.description ?? "",
    category: row.category,
    gallery_tab: row.gallery_tab,
    target_context: row.target_context,
    required_plan: row.required_plan,
    tags: row.tags.join(", "),
  };
}

function splitTags(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
