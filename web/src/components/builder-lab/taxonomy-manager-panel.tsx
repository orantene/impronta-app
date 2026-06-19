"use client";

/**
 * taxonomy-manager-panel.tsx (D5) — standalone tag & category taxonomy manager
 * for the Builder Lab.
 *
 * Lists distinct tags and categories (with template counts) derived from
 * listTemplateTaxonomy(), and exposes rename / merge / delete controls for each
 * entry. Designed to be mounted as a standalone panel; the Lead wires it into
 * component-catalog.tsx SPECIAL_TABS in a later wave (do NOT add it there now).
 *
 * Design language: LAB dark tokens. Explicit pending/error states on every write.
 * No hidden loading — every async operation has a visible indicator.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listTemplateTaxonomy,
  renameTemplateTag,
  renameTemplateCategory,
  mergeTemplateTags,
  deleteTemplateTag,
} from "@/lib/site-admin/builder-core/templates/taxonomy-actions";
import type {
  TemplateTaxonomy,
  TaxonomyEntry,
} from "@/lib/site-admin/builder-core/templates/taxonomy-shape";
import {
  LAB,
  RADII,
  LabButton,
  LabViewHeader,
  LabToast,
  EmptyCard,
  SectionLabel,
  fieldStyle,
  panelStyle,
  LabChip,
} from "./ui";

// ── Toast duration constant (mirrors LAB.toastMs when it ships in Batch 1) ────
const TOAST_MS = 2400;

// ── Local inline-action button (mirrors LinkBtn from Batch-1 ui.tsx) ─────────
/** Borderless text action used in the taxonomy row's action column. */
function TaxLinkBtn({
  label,
  onClick,
  disabled,
  primary,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const color = disabled
    ? LAB.inkDim
    : danger
      ? LAB.red
      : primary
        ? LAB.accent
        : LAB.inkMuted;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "none",
        color,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

// ── Internal types ────────────────────────────────────────────────────────────

type Tab = "tags" | "categories";

interface InlineState {
  mode: "rename" | "merge" | "delete";
  /** The entry being acted on. */
  entry: TaxonomyEntry;
  /** Rename / merge target value. */
  inputValue: string;
  /** For merge: comma-separated source tags (pre-populated from entry). */
  mergeFromInput: string;
  pending: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pluralTemplates(count: number) {
  return count === 1 ? "1 template" : `${count} templates`;
}

// ── TaxonomyManagerPanel ──────────────────────────────────────────────────────

/**
 * Standalone taxonomy manager panel. Export ONLY; do not mount in SPECIAL_TABS
 * (component-catalog.tsx) in this wave — the Lead does that later.
 *
 * @example
 *   <TaxonomyManagerPanel />
 */
export function TaxonomyManagerPanel() {
  const [tab, setTab] = useState<Tab>("tags");
  const [taxonomy, setTaxonomy] = useState<TemplateTaxonomy | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline action state (at most one entry open at a time)
  const [inline, setInline] = useState<InlineState | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const result = await listTemplateTaxonomy();
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setTaxonomy(result.data);
    // Close any open inline if the entry disappeared after refresh
    setInline(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Toast helper ──────────────────────────────────────────────────────────

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // ── Open inline controls ──────────────────────────────────────────────────

  function openRename(entry: TaxonomyEntry) {
    setInline({
      mode: "rename",
      entry,
      inputValue: entry.value,
      mergeFromInput: "",
      pending: false,
      error: null,
    });
  }

  function openMerge(entry: TaxonomyEntry) {
    setInline({
      mode: "merge",
      entry,
      inputValue: entry.value,
      mergeFromInput: entry.value,
      pending: false,
      error: null,
    });
  }

  function openDelete(entry: TaxonomyEntry) {
    setInline({
      mode: "delete",
      entry,
      inputValue: "",
      mergeFromInput: "",
      pending: false,
      error: null,
    });
  }

  function closeInline() {
    setInline(null);
  }

  function updateInline(patch: Partial<InlineState>) {
    setInline((prev) => (prev ? { ...prev, ...patch } : null));
  }

  // ── Write handlers ────────────────────────────────────────────────────────

  async function handleRenameTag(entry: TaxonomyEntry, newName: string) {
    updateInline({ pending: true, error: null });
    const result = await renameTemplateTag(entry.value, newName);
    if (!result.ok) {
      updateInline({ pending: false, error: result.error });
      return;
    }
    flash(
      `Renamed tag "${entry.value}" to "${newName}" on ${pluralTemplates(result.data.updatedCount)}.`,
    );
    await load();
  }

  async function handleRenameCategory(entry: TaxonomyEntry, newName: string) {
    updateInline({ pending: true, error: null });
    const result = await renameTemplateCategory(entry.value, newName);
    if (!result.ok) {
      updateInline({ pending: false, error: result.error });
      return;
    }
    flash(
      `Renamed category "${entry.value}" to "${newName}" on ${pluralTemplates(result.data.updatedCount)}.`,
    );
    await load();
  }

  async function handleMergeTags(
    fromRaw: string,
    intoTag: string,
  ) {
    const fromTags = fromRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (fromTags.length === 0) {
      updateInline({ error: "Enter at least one source tag." });
      return;
    }
    updateInline({ pending: true, error: null });
    const result = await mergeTemplateTags(fromTags, intoTag);
    if (!result.ok) {
      updateInline({ pending: false, error: result.error });
      return;
    }
    flash(
      `Merged ${fromTags.length} tag(s) into "${intoTag}" on ${pluralTemplates(result.data.updatedCount)}.`,
    );
    await load();
  }

  async function handleDeleteTag(entry: TaxonomyEntry) {
    updateInline({ pending: true, error: null });
    const result = await deleteTemplateTag(entry.value);
    if (!result.ok) {
      updateInline({ pending: false, error: result.error });
      return;
    }
    flash(
      `Deleted tag "${entry.value}" from ${pluralTemplates(result.data.updatedCount)}.`,
    );
    await load();
  }

  // ── Submit inline form ────────────────────────────────────────────────────

  function submitInline() {
    if (!inline) return;
    const { mode, entry, inputValue, mergeFromInput } = inline;

    if (mode === "rename") {
      const target = inputValue.trim();
      if (!target) {
        updateInline({ error: "Name cannot be empty." });
        return;
      }
      if (tab === "tags") void handleRenameTag(entry, target);
      else void handleRenameCategory(entry, target);
    } else if (mode === "merge") {
      const intoTag = inputValue.trim();
      if (!intoTag) {
        updateInline({ error: "Target tag cannot be empty." });
        return;
      }
      void handleMergeTags(mergeFromInput, intoTag);
    } else if (mode === "delete") {
      void handleDeleteTag(entry);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const entries: TaxonomyEntry[] =
    taxonomy === null
      ? []
      : tab === "tags"
        ? taxonomy.tags
        : taxonomy.categories;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "24px 0",
        fontFamily: "inherit",
        color: LAB.ink,
      }}
    >
      {/* Header */}
      <LabViewHeader
        title="Taxonomy Manager"
        blurb="Rename, merge, or delete tags and categories across all templates in one operation."
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {toast ? <LabToast>{toast}</LabToast> : null}
            <LabButton
              variant="secondary"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </LabButton>
          </div>
        }
      />

      {/* Load error */}
      {loadError ? (
        <div
          role="alert"
          style={{
            fontSize: 12.5,
            color: LAB.red,
            background: LAB.redBg,
            padding: "10px 14px",
            borderRadius: RADII.control,
          }}
        >
          {loadError}
          <button
            type="button"
            onClick={() => void load()}
            style={{
              marginLeft: 12,
              fontSize: 12,
              fontWeight: 600,
              color: LAB.red,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="Taxonomy type"
        style={{ display: "flex", gap: 2 }}
      >
        {(["tags", "categories"] as Tab[]).map((t) => {
          const count =
            taxonomy === null
              ? null
              : t === "tags"
                ? taxonomy.tags.length
                : taxonomy.categories.length;
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(t);
                setInline(null);
              }}
              style={{
                padding: "6px 16px",
                fontSize: 12.5,
                fontWeight: 600,
                background: active ? LAB.cardSoft : "transparent",
                border: `1px solid ${active ? LAB.border : "transparent"}`,
                borderRadius: RADII.control,
                color: active ? LAB.ink : LAB.inkMuted,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {t === "tags" ? "Tags" : "Categories"}
              {count !== null ? (
                <LabChip tone="neutral" style={{ fontSize: 9.5 }}>
                  {count}
                </LabChip>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Entry list */}
      {loading && taxonomy === null ? (
        <div
          style={{
            fontSize: 12.5,
            color: LAB.inkMuted,
            padding: "20px 0",
            textAlign: "center",
          }}
        >
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <EmptyCard>
          No {tab} found. Templates must have {tab} assigned before they appear
          here.
        </EmptyCard>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 200px",
              gap: 12,
              padding: "4px 14px",
              alignItems: "center",
            }}
          >
            <SectionLabel>{tab === "tags" ? "Tag" : "Category"}</SectionLabel>
            <SectionLabel style={{ textAlign: "right" }}>Templates</SectionLabel>
            <SectionLabel>Actions</SectionLabel>
          </div>

          {entries.map((entry) => {
            const isOpen = inline?.entry.value === entry.value;
            return (
              <div key={entry.value} style={{ ...panelStyle, overflow: "hidden" }}>
                {/* Entry row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 200px",
                    gap: 12,
                    padding: "10px 14px",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: LAB.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={entry.value}
                  >
                    {entry.value}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: LAB.inkMuted,
                      textAlign: "right",
                    }}
                  >
                    {entry.count}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <TaxLinkBtn
                      label="Rename"
                      onClick={() =>
                        isOpen && inline?.mode === "rename"
                          ? closeInline()
                          : openRename(entry)
                      }
                      primary={isOpen && inline?.mode === "rename"}
                    />
                    {tab === "tags" ? (
                      <TaxLinkBtn
                        label="Merge into…"
                        onClick={() =>
                          isOpen && inline?.mode === "merge"
                            ? closeInline()
                            : openMerge(entry)
                        }
                        primary={isOpen && inline?.mode === "merge"}
                      />
                    ) : null}
                    <TaxLinkBtn
                      label="Delete"
                      onClick={() =>
                        isOpen && inline?.mode === "delete"
                          ? closeInline()
                          : openDelete(entry)
                      }
                      danger
                    />
                  </div>
                </div>

                {/* Inline action drawer */}
                {isOpen && inline ? (
                  <InlineActionDrawer
                    inline={inline}
                    tab={tab}
                    onInputChange={(v) => updateInline({ inputValue: v })}
                    onMergeFromChange={(v) => updateInline({ mergeFromInput: v })}
                    onSubmit={submitInline}
                    onCancel={closeInline}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── InlineActionDrawer ────────────────────────────────────────────────────────

// ── InlineActionDrawer ────────────────────────────────────────────────────────

function InlineActionDrawer({
  inline,
  tab,
  onInputChange,
  onMergeFromChange,
  onSubmit,
  onCancel,
}: {
  inline: InlineState;
  tab: Tab;
  onInputChange: (v: string) => void;
  onMergeFromChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { mode, entry, inputValue, mergeFromInput, pending, error } = inline;
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when the drawer opens
  useEffect(() => {
    if (mode !== "delete") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [mode]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${LAB.borderSoft}`,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {mode === "rename" && (
        <>
          <div style={{ fontSize: 12, color: LAB.inkMuted }}>
            New {tab === "tags" ? "tag" : "category"} name:
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKey}
            disabled={pending}
            placeholder={`New name for "${entry.value}"`}
            style={{ ...fieldStyle, width: "100%", maxWidth: 320, boxSizing: "border-box" }}
          />
        </>
      )}

      {mode === "merge" && (
        <>
          <div style={{ fontSize: 12, color: LAB.inkMuted }}>
            Merge these tags (comma-separated) into one tag:
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <SectionLabel>Source tags</SectionLabel>
              <input
                type="text"
                value={mergeFromInput}
                onChange={(e) => onMergeFromChange(e.target.value)}
                onKeyDown={handleKey}
                disabled={pending}
                placeholder="tag1, tag2, tag3"
                style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
              <SectionLabel>Merge into</SectionLabel>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={handleKey}
                disabled={pending}
                placeholder="target-tag"
                style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </>
      )}

      {mode === "delete" && (
        <div
          style={{
            fontSize: 12.5,
            color: LAB.inkMuted,
            padding: "6px 0",
          }}
        >
          Remove{" "}
          <span style={{ color: LAB.red, fontWeight: 600 }}>&ldquo;{entry.value}&rdquo;</span>{" "}
          from{" "}
          <span style={{ fontWeight: 600 }}>{pluralTemplates(entry.count)}</span>?
          This cannot be undone.
        </div>
      )}

      {/* Error */}
      {error ? (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: LAB.red,
            background: LAB.redBg,
            padding: "6px 10px",
            borderRadius: RADII.control,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <LabButton
          variant={mode === "delete" ? "primary" : "primary"}
          onClick={onSubmit}
          disabled={pending}
          style={
            mode === "delete"
              ? { background: LAB.red, color: "#fff", borderColor: LAB.red }
              : undefined
          }
        >
          {pending
            ? "Saving…"
            : mode === "rename"
              ? "Rename"
              : mode === "merge"
                ? "Merge"
                : "Delete"}
        </LabButton>
        <LabButton variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </LabButton>
      </div>
    </div>
  );
}
