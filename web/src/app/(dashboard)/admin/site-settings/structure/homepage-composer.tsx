"use client";

/**
 * Phase 5 / M5 — homepage composer client component.
 *
 * Renders one card per template slot. For each slot, the operator can:
 *   - append a section (select + add)
 *   - re-order entries within the slot (up/down)
 *   - remove an entry
 *
 * Section picker is gated by:
 *   - the slot's `allowedSectionTypes` (when set) — non-matching sections are
 *     hidden from the picker for that slot.
 *   - status in {draft, published} — archived sections are hidden because
 *     the server op will reject them on save.
 *
 * Publish discipline (enforced server-side; UI hints only here):
 *   - Save: allowed for {draft, published} sections; draft saves do not
 *     change the live homepage.
 *   - Publish: every referenced section must be status='published'. The UI
 *     flags a draft-on-draft slot entry with a small "draft ref" chip so
 *     the operator knows to publish the section before publishing the
 *     homepage.
 *
 * Slots are submitted as a JSON blob on a hidden input, so the operator can
 * rearrange freely in the browser and commit the whole composition in one
 * atomic save (matches the sections editor props pattern).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { useActionState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { PageStatusBadge } from "@/components/admin/page-status-badge";
import { SectionStatusBadge } from "@/components/admin/section-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/lib/site-admin/locales";
import type { PageRow } from "@/lib/site-admin/server/pages";
import type { HomepagePageSectionRow } from "@/lib/site-admin/server/homepage";
import type {
  SectionBusinessPurpose,
  SectionMeta,
} from "@/lib/site-admin/sections/types";

import {
  type HomepageActionState,
  publishHomepageAction,
  restoreHomepageRevisionAction,
  saveHomepageDraftAction,
} from "./actions";
import { SectionLibraryOverlay } from "./section-library-overlay";
import {
  PublishPreflightModal,
  type PreflightBlocker,
  type PreflightChange,
  type PreflightWarning,
} from "./publish-preflight-modal";
import {
  RevisionPreviewModal,
  type RevisionOpenDescriptor,
} from "./revision-preview-modal";

// ---- shapes --------------------------------------------------------------

interface AvailableSection {
  id: string;
  name: string;
  sectionTypeKey: string;
  status: "draft" | "published" | "archived";
  updatedAt: string;
}

interface TemplateSlotMeta {
  key: string;
  label: string;
  required: boolean;
  allowedSectionTypes: readonly string[] | null;
}

interface TemplateMeta {
  currentVersion: number;
  slots: readonly TemplateSlotMeta[];
}

interface RevisionLite {
  id: string;
  kind: string;
  version: number;
  createdAt: string;
}

interface Props {
  locale: Locale;
  page: PageRow;
  draftSlots: readonly HomepagePageSectionRow[];
  liveSlots: readonly HomepagePageSectionRow[];
  availableSections: readonly AvailableSection[];
  template: TemplateMeta;
  revisions: readonly RevisionLite[];
  sectionRegistry: ReadonlyArray<
    Pick<
      SectionMeta,
      "key" | "label" | "description" | "businessPurpose" | "visibleToAgency"
    >
  >;
  canCompose: boolean;
  canPublish: boolean;
}

interface SlotEntry {
  sectionId: string;
  sortOrder: number;
}

// ---- helpers -------------------------------------------------------------

function groupEntriesBySlot(
  rows: readonly HomepagePageSectionRow[],
  templateSlots: readonly TemplateSlotMeta[],
): Record<string, SlotEntry[]> {
  const out: Record<string, SlotEntry[]> = {};
  for (const slot of templateSlots) {
    out[slot.key] = [];
  }
  for (const row of rows) {
    const arr = out[row.slot_key] ?? [];
    arr.push({ sectionId: row.section_id, sortOrder: row.sort_order });
    out[row.slot_key] = arr;
  }
  // Normalise sortOrder to 0..N-1 per slot so the UI always renders
  // contiguous positions even if a prior composition had gaps.
  for (const key of Object.keys(out)) {
    out[key] = (out[key] ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry, idx) => ({ sectionId: entry.sectionId, sortOrder: idx }));
  }
  return out;
}

function Banner({ state }: { state: HomepageActionState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
        {state.message}
      </p>
    );
  }
  return (
    <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {state.error}
    </p>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---- sortable row ---------------------------------------------------------

/**
 * One drag-and-drop sortable row inside a slot's SortableContext. Kept as a
 * dedicated component because `useSortable` is a hook and can't be called
 * inside the `items.map` lambda of the parent. The arrow buttons stay as
 * keyboard-reachable fallbacks for drag-averse or AT users.
 */
function SortableSlotItem({
  sectionId,
  section,
  sectionTypeLabel,
  idx,
  isLast,
  canCompose,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  sectionId: string;
  section?: {
    id: string;
    name: string;
    sectionTypeKey: string;
    status: "draft" | "published" | "archived";
    updatedAt: string;
  };
  /** Human label for the section's type (looked up in the registry). */
  sectionTypeLabel: string;
  idx: number;
  isLast: boolean;
  canCompose: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId, disabled: !canCompose });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,0.18)" : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border border-border/40 bg-muted/20 px-3 py-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={!canCompose}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Drag to reorder`}
        title="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      <span className="flex-1 text-sm">
        {section ? (
          <span>
            <strong>{section.name}</strong>
            <span className="ml-2 text-xs text-muted-foreground">
              {sectionTypeLabel}
            </span>
          </span>
        ) : (
          <span className="text-destructive">
            Unknown section ({sectionId.slice(0, 8)}…)
          </span>
        )}
      </span>

      {section && (
        <span className="text-xs">
          <SectionStatusBadge status={section.status} />
        </span>
      )}
      {section?.status === "draft" && (
        <span
          className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
          title="This section is a draft. Publish it before publishing the homepage."
        >
          Needs publishing
        </span>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canCompose || idx === 0}
        onClick={onMoveUp}
        title="Move this section up in the slot"
        aria-label="Move section up"
      >
        <span aria-hidden>↑</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canCompose || isLast}
        onClick={onMoveDown}
        title="Move this section down in the slot"
        aria-label="Move section down"
      >
        <span aria-hidden>↓</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canCompose}
        onClick={onRemove}
        title="Remove from slot"
      >
        Remove
      </Button>
    </li>
  );
}

// ---- main component ------------------------------------------------------

export function HomepageComposer({
  locale,
  page,
  draftSlots,
  liveSlots,
  availableSections,
  template,
  revisions,
  sectionRegistry,
  canCompose,
  canPublish,
}: Props) {
  // If there are no draft rows yet, start the composer from the live rows
  // so the operator is editing "from where we are" rather than a blank slate.
  const initialEntries = useMemo(() => {
    const source = draftSlots.length > 0 ? draftSlots : liveSlots;
    return groupEntriesBySlot(source, template.slots);
  }, [draftSlots, liveSlots, template.slots]);

  const [entries, setEntries] = useState<Record<string, SlotEntry[]>>(
    initialEntries,
  );

  // ── Undo/redo history for structural changes (add / remove / reorder /
  // library insert). Content-level edits inside section editors are out
  // of scope — those run through autosave per-section. Capped at 50 to
  // keep memory bounded during long sessions.
  const historyRef = useRef<Array<Record<string, SlotEntry[]>>>([initialEntries]);
  const historyIdxRef = useRef<number>(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  // historyVersion increments on every undo/redo/push, so we use it to gate
  // access to the refs inside render. The lint rule doesn't know that
  // historyVersion is our state bridge, so quiet it for these lines.
  // eslint-disable-next-line react-hooks/refs
  const canUndo = historyVersion > 0 && historyIdxRef.current > 0;
  const canRedo =
    historyVersion > 0 &&
    // eslint-disable-next-line react-hooks/refs
    historyIdxRef.current < historyRef.current.length - 1;

  const commitEntries = useCallback(
    (
      updater: (
        prev: Record<string, SlotEntry[]>,
      ) => Record<string, SlotEntry[]>,
    ) => {
      setEntries((prev) => {
        const next = updater(prev);
        if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
        const truncated = historyRef.current.slice(
          0,
          historyIdxRef.current + 1,
        );
        truncated.push(next);
        const HISTORY_CAP = 50;
        const trimmed =
          truncated.length > HISTORY_CAP
            ? truncated.slice(truncated.length - HISTORY_CAP)
            : truncated;
        historyRef.current = trimmed;
        historyIdxRef.current = trimmed.length - 1;
        setHistoryVersion((n) => n + 1);
        return next;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    setEntries(historyRef.current[historyIdxRef.current]);
    setHistoryVersion((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    setEntries(historyRef.current[historyIdxRef.current]);
    setHistoryVersion((n) => n + 1);
  }, []);

  // Cmd+Z / Ctrl+Z undo, Cmd+Shift+Z redo. Scoped to the composer tab
  // via document listener; skips when the target is a form field so
  // typing text doesn't trigger it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "z" && e.key !== "Z") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Sections created in this browser tab via the library overlay. Not yet in
  // `availableSections` (which is server-rendered) but need to display in
  // sectionsById so slot rows render the new name instead of "Unknown section".
  const [libraryCreated, setLibraryCreated] = useState<
    ReadonlyArray<AvailableSection>
  >([]);

  const [libraryOpen, setLibraryOpen] = useState<{
    slotKey: string;
    slotLabel: string;
  } | null>(null);

  const [preflightOpen, setPreflightOpen] = useState(false);
  const publishFormRef = useRef<HTMLFormElement>(null);

  const [revisionPreview, setRevisionPreview] =
    useState<RevisionOpenDescriptor | null>(null);
  const restoreFormRef = useRef<HTMLFormElement>(null);
  const [restoreTargetId, setRestoreTargetId] = useState<string>("");

  const [title, setTitle] = useState(page.title ?? "Homepage");
  const [metaDescription, setMetaDescription] = useState<string>(
    page.meta_description ?? "",
  );
  const [introTagline, setIntroTagline] = useState<string>(
    (page.hero as { introTagline?: unknown } | null)?.introTagline &&
      typeof (page.hero as { introTagline?: unknown }).introTagline === "string"
      ? ((page.hero as { introTagline: string }).introTagline)
      : "",
  );

  const [saveState, saveAction, savePending] = useActionState<
    HomepageActionState,
    FormData
  >(saveHomepageDraftAction, undefined);

  const [publishState, publishAction, publishPending] = useActionState<
    HomepageActionState,
    FormData
  >(publishHomepageAction, undefined);

  const [restoreState, restoreAction, restorePending] = useActionState<
    HomepageActionState,
    FormData
  >(restoreHomepageRevisionAction, undefined);

  // Effective version: after a successful save the action returns a fresh
  // version we should use for the next CAS. Mirrors the sections editor.
  const effectiveVersion =
    saveState?.ok && typeof saveState.version === "number"
      ? saveState.version
      : publishState?.ok && typeof publishState.version === "number"
        ? publishState.version
        : restoreState?.ok && typeof restoreState.version === "number"
          ? restoreState.version
          : page.version;

  /** Map sectionTypeKey → human-friendly label from the registry prop. */
  const sectionTypeLabels = useMemo(() => {
    const out = new Map<string, string>();
    for (const entry of sectionRegistry) {
      out.set(entry.key, entry.label);
    }
    return out;
  }, [sectionRegistry]);
  function labelForType(key: string): string {
    return sectionTypeLabels.get(key) ?? key;
  }

  const mergedSections = useMemo(() => {
    const seen = new Set<string>();
    const out: AvailableSection[] = [];
    for (const s of [...libraryCreated, ...availableSections]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [availableSections, libraryCreated]);

  const sectionsById = useMemo(() => {
    return new Map(mergedSections.map((s) => [s.id, s] as const));
  }, [mergedSections]);

  // Per slot, the subset of sections the picker should show. Filters:
  //   - status != archived
  //   - if slot.allowedSectionTypes set: only those types
  function candidatesForSlot(slot: TemplateSlotMeta): AvailableSection[] {
    const allowed = slot.allowedSectionTypes
      ? new Set(slot.allowedSectionTypes)
      : null;
    return mergedSections.filter((s) => {
      if (s.status === "archived") return false;
      if (allowed && !allowed.has(s.sectionTypeKey)) return false;
      return true;
    });
  }

  function appendToSlot(slotKey: string, sectionId: string) {
    commitEntries((prev) => {
      const current = prev[slotKey] ?? [];
      const nextOrder = current.length;
      return {
        ...prev,
        [slotKey]: [...current, { sectionId, sortOrder: nextOrder }],
      };
    });
  }

  function removeFromSlot(slotKey: string, index: number) {
    commitEntries((prev) => {
      const current = prev[slotKey] ?? [];
      const next = current.filter((_, i) => i !== index);
      return {
        ...prev,
        [slotKey]: next.map((entry, i) => ({
          sectionId: entry.sectionId,
          sortOrder: i,
        })),
      };
    });
  }

  function moveInSlot(slotKey: string, index: number, dir: -1 | 1) {
    commitEntries((prev) => {
      const current = (prev[slotKey] ?? []).slice();
      const target = index + dir;
      if (target < 0 || target >= current.length) return prev;
      const tmp = current[index];
      current[index] = current[target];
      current[target] = tmp;
      return {
        ...prev,
        [slotKey]: current.map((entry, i) => ({
          sectionId: entry.sectionId,
          sortOrder: i,
        })),
      };
    });
  }

  // ── Drag-and-drop plumbing ────────────────────────────────────────────────
  // One DndContext per slot (see render). PointerSensor has a 4px activation
  // distance to prevent accidental drags when the operator just clicks a
  // button inside the row.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(slotKey: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    commitEntries((prev) => {
      const current = (prev[slotKey] ?? []).slice();
      const from = current.findIndex((e) => e.sectionId === active.id);
      const to = current.findIndex((e) => e.sectionId === over.id);
      if (from < 0 || to < 0) return prev;
      const moved = arrayMove(current, from, to);
      return {
        ...prev,
        [slotKey]: moved.map((entry, i) => ({
          sectionId: entry.sectionId,
          sortOrder: i,
        })),
      };
    });
  }

  const slotsJson = JSON.stringify(entries);

  // Detect whether any slot entry references a section that is not currently
  // published. The server op will block publish in that case; show a hint
  // pre-flight so operators aren't surprised.
  const draftRefs = useMemo(() => {
    const out: Array<{ slotKey: string; sectionName: string }> = [];
    for (const [slotKey, list] of Object.entries(entries)) {
      for (const entry of list) {
        const s = sectionsById.get(entry.sectionId);
        if (s && s.status === "draft") {
          out.push({ slotKey, sectionName: s.name });
        }
      }
    }
    return out;
  }, [entries, sectionsById]);

  /** Draft-vs-live structural diff used by the publish pre-flight surface. */
  const preflightChanges = useMemo<PreflightChange[]>(() => {
    type Pos = { slotKey: string; sortOrder: number };
    const livePos = new Map<string, Pos>();
    for (const row of liveSlots) {
      livePos.set(row.section_id, {
        slotKey: row.slot_key,
        sortOrder: row.sort_order,
      });
    }
    const draftPos = new Map<string, Pos>();
    for (const [slotKey, list] of Object.entries(entries)) {
      for (const entry of list) {
        draftPos.set(entry.sectionId, {
          slotKey,
          sortOrder: entry.sortOrder,
        });
      }
    }
    const out: PreflightChange[] = [];
    for (const [sectionId, draft] of draftPos.entries()) {
      const live = livePos.get(sectionId);
      const section = sectionsById.get(sectionId);
      const name = section?.name ?? "Unknown section";
      const typeLabel = section
        ? labelForType(section.sectionTypeKey)
        : "unknown";
      if (!live) {
        out.push({
          kind: "added",
          slotKey: draft.slotKey,
          sectionName: name,
          sectionTypeLabel: typeLabel,
          to: draft,
        });
        continue;
      }
      if (live.slotKey !== draft.slotKey || live.sortOrder !== draft.sortOrder) {
        out.push({
          kind: "moved",
          slotKey: draft.slotKey,
          sectionName: name,
          sectionTypeLabel: typeLabel,
          from: live,
          to: draft,
        });
      }
    }
    for (const [sectionId, live] of livePos.entries()) {
      if (draftPos.has(sectionId)) continue;
      const section = sectionsById.get(sectionId);
      const name = section?.name ?? "Unknown section";
      const typeLabel = section
        ? labelForType(section.sectionTypeKey)
        : "unknown";
      out.push({
        kind: "removed",
        slotKey: live.slotKey,
        sectionName: name,
        sectionTypeLabel: typeLabel,
        from: live,
      });
    }
    return out;
  }, [entries, liveSlots, sectionsById, labelForType]);

  const missingRequired = template.slots.filter(
    (s) => s.required && (entries[s.key]?.length ?? 0) === 0,
  );

  return (
    <div className="space-y-8">
      {/* ---- status pill + meta + undo/redo ---- */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <PageStatusBadge status={page.status} />
        <span>
          Last edited {formatWhen(page.updated_at)}
        </span>
        {page.published_at ? (
          <span>Last published {formatWhen(page.published_at)}</span>
        ) : (
          <span>Not yet published</span>
        )}
        <details className="group/meta">
          <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wide text-muted-foreground/60 hover:text-muted-foreground">
            Details
          </summary>
          <span className="ml-2 inline-flex items-center gap-2 text-[11px]">
            <span>Language: {locale === "en" ? "English" : locale}</span>
            <span>·</span>
            <span>Version {effectiveVersion}</span>
            <span>·</span>
            <span>Template v{template.currentVersion}</span>
          </span>
        </details>

        <span className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
            title="Undo (Cmd/Ctrl + Z) — reverses the last add / remove / reorder"
            aria-label="Undo last structural change"
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
            title="Redo (Cmd/Ctrl + Shift + Z)"
            aria-label="Redo last undone change"
          >
            <Redo2 className="size-3.5" />
          </Button>
        </span>
      </div>

      <Banner state={saveState} />
      <Banner state={publishState} />
      <Banner state={restoreState} />

      {/* ---- save draft form ---- */}
      <form action={saveAction} className="space-y-6">
        <input type="hidden" name="locale" value={locale} />
        <input
          type="hidden"
          name="expectedVersion"
          value={effectiveVersion ?? 0}
        />
        <input type="hidden" name="slots" value={slotsJson} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Homepage title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canCompose}
            />
            <p className="text-xs text-muted-foreground">
              Used for SEO and admin lists; not rendered as a headline.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaDescription">Meta description</Label>
            <Input
              id="metaDescription"
              name="metaDescription"
              maxLength={280}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              disabled={!canCompose}
              placeholder="Short description for search results"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="introTagline">Intro tagline (fallback hero)</Label>
            <Input
              id="introTagline"
              name="introTagline"
              maxLength={140}
              value={introTagline}
              onChange={(e) => setIntroTagline(e.target.value)}
              disabled={!canCompose}
              placeholder="Shown if the hero slot is empty"
            />
          </div>
        </div>

        {/* ---- slot editors ---- */}
        <div className="space-y-4">
          {template.slots.map((slot) => {
            const items = entries[slot.key] ?? [];
            const candidates = candidatesForSlot(slot);
            const allowedCopy = slot.allowedSectionTypes
              ? `Only ${slot.allowedSectionTypes.join(", ")} sections allowed.`
              : "Any published section type accepted.";
            return (
              <fieldset
                key={slot.key}
                id={`slot-${slot.key}`}
                className="space-y-3 scroll-mt-24 rounded-md border border-border/60 p-4"
              >
                <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {slot.label}
                  {slot.required && (
                    <span className="ml-2 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                      required
                    </span>
                  )}
                </legend>
                <p className="text-xs text-muted-foreground">{allowedCopy}</p>

                {items.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    Empty — {slot.required ? "publish is blocked until you add a section." : "optional slot."}
                  </p>
                ) : (
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => handleDragEnd(slot.key, e)}
                  >
                    <SortableContext
                      items={items.map((entry) => entry.sectionId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-2">
                        {items.map((entry, idx) => {
                          const section = sectionsById.get(entry.sectionId);
                          return (
                            <SortableSlotItem
                              key={`${slot.key}:${entry.sectionId}`}
                              sectionId={entry.sectionId}
                              section={section}
                              sectionTypeLabel={
                                section
                                  ? labelForType(section.sectionTypeKey)
                                  : ""
                              }
                              idx={idx}
                              isLast={idx === items.length - 1}
                              canCompose={canCompose}
                              onMoveUp={() => moveInSlot(slot.key, idx, -1)}
                              onMoveDown={() => moveInSlot(slot.key, idx, 1)}
                              onRemove={() => removeFromSlot(slot.key, idx)}
                            />
                          );
                        })}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}

                {canCompose && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setLibraryOpen({
                          slotKey: slot.key,
                          slotLabel: slot.label,
                        })
                      }
                      title="Open the section library to create a new section with sensible defaults"
                    >
                      + Add from library
                    </Button>
                    {candidates.length > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground">or</span>
                        <select
                          className="rounded border border-border/60 bg-background px-2 py-1 text-sm"
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            appendToSlot(slot.key, val);
                            e.currentTarget.value = "";
                          }}
                          aria-label={`Pick an existing section for ${slot.label}`}
                        >
                          <option value="">Reuse a saved section…</option>
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {labelForType(c.sectionTypeKey)} (
                              {c.status === "draft"
                                ? "draft"
                                : c.status === "published"
                                  ? "published"
                                  : "archived"}
                              )
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground">
                          {candidates.length} eligible
                        </span>
                      </>
                    )}
                  </div>
                )}
                {canCompose && candidates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No existing sections eligible — use{" "}
                    <em>Add from library</em> above, or create one in the
                    Sections tab
                    {slot.allowedSectionTypes
                      ? ` (type: ${slot.allowedSectionTypes.join(", ")})`
                      : ""}
                    .
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canCompose || savePending}>
            {savePending ? "Saving…" : "Save draft"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Draft saves don&apos;t change the live homepage. Publish below to
            promote this composition.
          </p>
        </div>
      </form>

      {/* ---- publish ---- */}
      {canPublish && (
        <div className="space-y-2 rounded-md border border-border/60 p-4">
          {/* Hidden form that the modal submits on confirm. Stays
              attached so publishAction + useActionState keep working. */}
          <form action={publishAction} ref={publishFormRef} className="sr-only">
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="expectedVersion"
              value={effectiveVersion ?? 0}
            />
            <button type="submit" aria-hidden tabIndex={-1} />
          </form>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => setPreflightOpen(true)}
              disabled={publishPending}
            >
              {publishPending ? "Publishing…" : "Review + publish"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Opens a pre-flight review so you can confirm what will land
              on the live storefront before committing. Publishing is
              reversible from the Revisions panel.
            </p>
          </div>
          {(draftRefs.length > 0 || missingRequired.length > 0) && (
            <p className="text-xs text-amber-300">
              {missingRequired.length > 0 && (
                <span>
                  Missing required slot
                  {missingRequired.length === 1 ? "" : "s"}:{" "}
                  {missingRequired.map((s) => s.label).join(", ")}.{" "}
                </span>
              )}
              {draftRefs.length > 0 && (
                <span>
                  {draftRefs.length} draft section reference
                  {draftRefs.length === 1 ? "" : "s"} — publish will fail until
                  each is published individually.
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* ---- revisions ---- */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Revision history</h3>
        {revisions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No revisions yet. They appear after your first save.
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-md border border-border/60">
            {revisions.slice(0, 10).map((rev) => (
              <li
                key={rev.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 uppercase">
                    {rev.kind}
                  </span>
                  <span>v{rev.version}</span>
                  <span className="text-muted-foreground">
                    {formatWhen(rev.createdAt)}
                  </span>
                </span>
                {canCompose && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRevisionPreview({
                        id: rev.id,
                        kind: rev.kind,
                        version: rev.version,
                        createdAt: rev.createdAt,
                      })
                    }
                    title="Preview this revision's contents before restoring"
                  >
                    Preview
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hidden restore form — submitted by the revision preview modal. */}
      <form action={restoreAction} ref={restoreFormRef} className="sr-only">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="revisionId" value={restoreTargetId} />
        <input
          type="hidden"
          name="expectedVersion"
          value={effectiveVersion ?? 0}
        />
        <button type="submit" aria-hidden tabIndex={-1} />
      </form>

      <RevisionPreviewModal
        open={revisionPreview}
        onCancel={() => {
          if (!restorePending) setRevisionPreview(null);
        }}
        onRestore={(revisionId) => {
          setRestoreTargetId(revisionId);
          // Let React flush the hidden input's value before submitting.
          window.setTimeout(() => {
            restoreFormRef.current?.requestSubmit();
            setRevisionPreview(null);
          }, 0);
        }}
        restorePending={restorePending}
        labelForType={labelForType}
      />

      <PublishPreflightModal
        open={preflightOpen}
        pending={publishPending}
        onCancel={() => {
          if (!publishPending) setPreflightOpen(false);
        }}
        onConfirm={() => {
          // Submit the hidden publish form. publishAction runs via
          // useActionState; modal stays open while pending, then the
          // outer banner reflects success/failure.
          publishFormRef.current?.requestSubmit();
          setPreflightOpen(false);
        }}
        blockers={[
          ...missingRequired.map<PreflightBlocker>((s) => ({
            kind: "missing-required-slot",
            label: `Required slot "${s.label}" is empty`,
            detail:
              "Every required slot must contain at least one published section before the homepage can go live.",
            anchor: `#slot-${s.key}`,
          })),
          ...draftRefs.map<PreflightBlocker>((r) => ({
            kind: "draft-section-ref",
            label: `"${r.sectionName}" is still a draft`,
            detail: `Slot: ${r.slotKey}. Publish the section from /admin/site-settings/sections to include it on the live homepage.`,
            anchor: `#slot-${r.slotKey}`,
          })),
        ]}
        warnings={[
          ...(saveState?.ok === false
            ? [
                {
                  label: "Last draft save failed",
                  detail:
                    "Your most recent draft save didn't complete. Save again before publishing or the live site may miss your latest edits.",
                } as PreflightWarning,
              ]
            : []),
          ...(Object.values(entries).every((arr) => arr.length === 0)
            ? [
                {
                  label: "No sections composed yet",
                  detail:
                    "Publishing an empty homepage is allowed but will hide all CMS sections on the live storefront.",
                } as PreflightWarning,
              ]
            : []),
        ]}
        summary={{
          slotsWithSections: Object.values(entries).filter(
            (arr) => arr.length > 0,
          ).length,
          totalSections: Object.values(entries).reduce(
            (n, arr) => n + arr.length,
            0,
          ),
          draftRefs: draftRefs.length,
        }}
        changes={preflightChanges}
      />

      <SectionLibraryOverlay
        open={libraryOpen}
        onCancel={() => setLibraryOpen(null)}
        onSectionCreated={(slotKey, section) => {
          // Cache the new instance locally so the composer renders its name.
          setLibraryCreated((prev) => [
            {
              id: section.id,
              name: section.name,
              sectionTypeKey: section.sectionTypeKey,
              status: section.status,
              updatedAt: new Date().toISOString(),
            },
            ...prev,
          ]);
          // Append to the target slot's entries — save is still explicit via
          // the composer's Save Draft button.
          appendToSlot(slotKey, section.id);
          setLibraryOpen(null);
        }}
        registry={sectionRegistry}
        allowedSectionTypes={
          libraryOpen
            ? (template.slots.find((s) => s.key === libraryOpen.slotKey)
                ?.allowedSectionTypes ?? null)
            : null
        }
      />
    </div>
  );
}
