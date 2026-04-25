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
import {
  Undo2,
  Redo2,
  Sparkles,
  Copy as CopyIcon,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { useActionState } from "react";
import { toast } from "sonner";
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
import {
  cancelScheduledPublishAction,
  loadScheduledPublishAction,
  schedulePublishAction,
} from "@/lib/site-admin/edit-mode/schedule-actions";
import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";
import { loadLocaleHomepageForCloneAction } from "./clone-locale-action";
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
  /** Active tenant id — needed by MediaPicker and any client-side reads. */
  tenantId: string;
  /** Every platform locale the operator can switch to. */
  availableLocales: readonly Locale[];
  /** Sibling locales with at least one slot row (draft or live). Drives
   *  the "Clone from …" button visibility — empty array means no peer
   *  has content to copy. */
  otherLocalesWithContent: readonly Locale[];
  /** sectionId → totalReferences across draft+live compositions. Used to
   *  paint a chip on slot entries reused on other pages so the operator
   *  knows edits to the source section affect more than this homepage. */
  sectionUsageCounts: Record<string, number>;
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
  /** Total references across the tenant (homepage live + draft + other
   *  pages). 0/undefined → no chip. ≥2 → "Reused N×" so the operator
   *  knows edits to this section affect more than this homepage. */
  reuseCount,
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
  reuseCount?: number;
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
      {typeof reuseCount === "number" && reuseCount >= 2 && (
        <span
          className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300"
          title={`Used in ${reuseCount} compositions across the workspace. Editing this section changes every page that references it.`}
        >
          Reused {reuseCount}×
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
  tenantId,
  availableLocales,
  otherLocalesWithContent,
  sectionUsageCounts,
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
  // Search & social — mirror cms_pages columns one-to-one. Empty strings
  // normalise to NULL via the optionalUrlString / optionalTrimmedString
  // schemas, so the operator can clear an OG override by deleting the text.
  const [ogTitle, setOgTitle] = useState<string>(page.og_title ?? "");
  const [ogDescription, setOgDescription] = useState<string>(
    page.og_description ?? "",
  );
  const [ogImageUrl, setOgImageUrl] = useState<string>(page.og_image_url ?? "");
  const [canonicalUrl, setCanonicalUrl] = useState<string>(
    page.canonical_url ?? "",
  );
  const [noindex, setNoindex] = useState<boolean>(page.noindex ?? false);

  // Scheduled publish — datetime-local in operator's timezone, sent to the
  // server as an ISO UTC string. Loaded on mount from cms_pages so a previous
  // schedule round-trips even if the operator navigates away mid-session.
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [scheduledByName, setScheduledByName] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [schedulePending, setSchedulePending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadScheduledPublishAction({ locale }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        if (res.scheduledPublishAt) {
          // Convert UTC ISO → local datetime-local input value (YYYY-MM-DDTHH:mm).
          const d = new Date(res.scheduledPublishAt);
          const pad = (n: number) => String(n).padStart(2, "0");
          const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
            d.getDate(),
          )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          setScheduledAt(local);
          setScheduledByName(res.scheduledByName);
        } else {
          setScheduledAt("");
          setScheduledByName(null);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function handleSchedule() {
    if (!scheduledAt) {
      setScheduleNotice({
        kind: "error",
        message: "Pick a date and time first.",
      });
      return;
    }
    const iso = new Date(scheduledAt).toISOString();
    setSchedulePending(true);
    setScheduleNotice(null);
    const res = await schedulePublishAction({ locale, publishAt: iso });
    setSchedulePending(false);
    if (res.ok) {
      setScheduleNotice({
        kind: "ok",
        message: `Scheduled to publish at ${new Date(res.publishAt).toLocaleString()}.`,
      });
    } else {
      setScheduleNotice({ kind: "error", message: res.error });
    }
  }

  // ── Autosave to localStorage ──────────────────────────────────────────────
  // Belt-and-braces draft persistence so a tab close / hard refresh doesn't
  // lose in-flight composition. Server-side draft saves are still the
  // authoritative path; this is a fallback the operator can opt out of via
  // the "Discard local backup" button. Key is per (tenant, page, locale)
  // so different surfaces don't collide.
  const localKey = `homepage-composer:${page.id}:${locale}`;
  const restoredFromLocalRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (restoredFromLocalRef.current) return;
    try {
      const raw = window.localStorage.getItem(localKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        savedAt: string;
        version: number;
        entries?: Record<string, SlotEntry[]>;
        title?: string;
        metaDescription?: string;
        introTagline?: string;
        ogTitle?: string;
        ogDescription?: string;
        ogImageUrl?: string;
        canonicalUrl?: string;
        noindex?: boolean;
      };
      // Don't auto-apply if the server is ahead of the local backup —
      // the operator opened a fresher state since the snapshot was made.
      if (parsed.version >= page.version) {
        restoredFromLocalRef.current = true;
        toast.message(
          "Restored unsaved local backup",
          {
            description:
              "We recovered changes from your last visit. Save or discard below.",
          },
        );
        if (parsed.entries) setEntries(parsed.entries);
        if (typeof parsed.title === "string") setTitle(parsed.title);
        if (typeof parsed.metaDescription === "string")
          setMetaDescription(parsed.metaDescription);
        if (typeof parsed.introTagline === "string")
          setIntroTagline(parsed.introTagline);
        if (typeof parsed.ogTitle === "string") setOgTitle(parsed.ogTitle);
        if (typeof parsed.ogDescription === "string")
          setOgDescription(parsed.ogDescription);
        if (typeof parsed.ogImageUrl === "string")
          setOgImageUrl(parsed.ogImageUrl);
        if (typeof parsed.canonicalUrl === "string")
          setCanonicalUrl(parsed.canonicalUrl);
        if (typeof parsed.noindex === "boolean") setNoindex(parsed.noindex);
      }
    } catch {
      // Corrupted JSON — drop and move on.
      window.localStorage.removeItem(localKey);
    }
  }, [localKey, page.version]);

  // ── Dirty tracking + beforeunload guard ───────────────────────────────────
  // Compare the "applied to server" baseline against current state and warn
  // if the operator tries to navigate away mid-edit. We also use the dirty
  // flag to gate autosave so we don't churn localStorage every keystroke.
  const baselineRef = useRef({
    entries: initialEntries,
    title: page.title ?? "Homepage",
    metaDescription: page.meta_description ?? "",
    introTagline:
      typeof (page.hero as { introTagline?: unknown } | null)?.introTagline ===
      "string"
        ? ((page.hero as { introTagline: string }).introTagline)
        : "",
    ogTitle: page.og_title ?? "",
    ogDescription: page.og_description ?? "",
    ogImageUrl: page.og_image_url ?? "",
    canonicalUrl: page.canonical_url ?? "",
    noindex: page.noindex ?? false,
  });
  const isDirty = useMemo(() => {
    const b = baselineRef.current;
    if (b.title !== title) return true;
    if (b.metaDescription !== metaDescription) return true;
    if (b.introTagline !== introTagline) return true;
    if (b.ogTitle !== ogTitle) return true;
    if (b.ogDescription !== ogDescription) return true;
    if (b.ogImageUrl !== ogImageUrl) return true;
    if (b.canonicalUrl !== canonicalUrl) return true;
    if (b.noindex !== noindex) return true;
    if (JSON.stringify(b.entries) !== JSON.stringify(entries)) return true;
    return false;
  }, [
    entries,
    title,
    metaDescription,
    introTagline,
    ogTitle,
    ogDescription,
    ogImageUrl,
    canonicalUrl,
    noindex,
  ]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Persist current dirty state to localStorage with a short debounce so
  // we batch typing into one write per keystroke storm.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDirty) {
      window.localStorage.removeItem(localKey);
      return;
    }
    const handle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          localKey,
          JSON.stringify({
            savedAt: new Date().toISOString(),
            version: page.version,
            entries,
            title,
            metaDescription,
            introTagline,
            ogTitle,
            ogDescription,
            ogImageUrl,
            canonicalUrl,
            noindex,
          }),
        );
      } catch {
        // Quota exceeded — silently drop; main save path still works.
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [
    isDirty,
    localKey,
    page.version,
    entries,
    title,
    metaDescription,
    introTagline,
    ogTitle,
    ogDescription,
    ogImageUrl,
    canonicalUrl,
    noindex,
  ]);

  function discardLocalBackup() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(localKey);
    setEntries(baselineRef.current.entries);
    setTitle(baselineRef.current.title);
    setMetaDescription(baselineRef.current.metaDescription);
    setIntroTagline(baselineRef.current.introTagline);
    setOgTitle(baselineRef.current.ogTitle);
    setOgDescription(baselineRef.current.ogDescription);
    setOgImageUrl(baselineRef.current.ogImageUrl);
    setCanonicalUrl(baselineRef.current.canonicalUrl);
    setNoindex(baselineRef.current.noindex);
    toast.success("Local backup discarded");
  }

  // ── Clone-from-other-locale ──────────────────────────────────────────────
  const [clonePending, setClonePending] = useState(false);
  async function handleCloneFromLocale(source: Locale) {
    setClonePending(true);
    const res = await loadLocaleHomepageForCloneAction(source);
    setClonePending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const { metadata, slots, sourcedFromDraft } = res.data;
    // Rebuild the entries map with template slot keys preserved (so empty
    // slots stay rendered) while applying the source composition where
    // present.
    const next: Record<string, SlotEntry[]> = {};
    for (const slot of template.slots) {
      next[slot.key] = (slots[slot.key] ?? []).map((entry, idx) => ({
        sectionId: entry.sectionId,
        sortOrder: idx,
      }));
    }
    setEntries(next);
    setTitle(metadata.title || baselineRef.current.title);
    setMetaDescription(metadata.metaDescription);
    setIntroTagline(metadata.introTagline);
    setOgTitle(metadata.ogTitle);
    setOgDescription(metadata.ogDescription);
    setOgImageUrl(metadata.ogImageUrl);
    setCanonicalUrl(metadata.canonicalUrl);
    setNoindex(metadata.noindex);
    toast.success(
      `Loaded ${source.toUpperCase()} ${sourcedFromDraft ? "draft" : "live"} composition. Review and Save to apply.`,
    );
  }

  async function handleCancelSchedule() {
    setSchedulePending(true);
    setScheduleNotice(null);
    const res = await cancelScheduledPublishAction({ locale });
    setSchedulePending(false);
    if (res.ok) {
      setScheduledAt("");
      setScheduledByName(null);
      setScheduleNotice({ kind: "ok", message: "Schedule cleared." });
    } else {
      setScheduleNotice({ kind: "error", message: res.error });
    }
  }

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

  // On successful save / publish / restore, the current state IS the new
  // baseline — drop the localStorage backup and reset isDirty to false so
  // the beforeunload guard releases.
  useEffect(() => {
    if (saveState?.ok || publishState?.ok || restoreState?.ok) {
      baselineRef.current = {
        entries,
        title,
        metaDescription,
        introTagline,
        ogTitle,
        ogDescription,
        ogImageUrl,
        canonicalUrl,
        noindex,
      };
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(localKey);
      }
    }
    // We deliberately do NOT depend on the field state here — only on
    // the action results. The fields are read at the moment of success
    // to capture the just-saved values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, publishState, restoreState]);

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

  /**
   * slotKey → Set<sectionId> for the current draft composition. Passed to
   * RevisionPreviewModal so the diff view can mark each preview row as
   * added / kept / removed against what's already in the composer.
   */
  const currentSlotsBySection = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const [slotKey, list] of Object.entries(entries)) {
      out.set(slotKey, new Set(list.map((e) => e.sectionId)));
    }
    return out;
  }, [entries]);

  /**
   * Total slot entries across all template slots — used for the in-composer
   * empty-state nudge: when the operator has cleared the composition (or
   * never added anything) we show a one-line CTA to open the library on the
   * first slot, instead of a wall of "Empty slot" fieldsets.
   */
  const totalEntries = useMemo(
    () => Object.values(entries).reduce((sum, list) => sum + list.length, 0),
    [entries],
  );

  // Orphans: slot entries whose section row is missing from the available list
  // (deleted, archived behind our back, or out-of-tenant). The composer used
  // to render these as inline "Unknown section (xxxx…)" — a banner up top
  // makes them obvious at a glance and guides the operator to remove them
  // before the next save / publish.
  const orphanRefs = useMemo(() => {
    const out: Array<{ slotKey: string; sectionId: string }> = [];
    for (const [slotKey, list] of Object.entries(entries)) {
      for (const entry of list) {
        if (!sectionsById.has(entry.sectionId)) {
          out.push({ slotKey, sectionId: entry.sectionId });
        }
      }
    }
    return out;
  }, [entries, sectionsById]);

  return (
    <div className="space-y-8">
      {/* ---- status pill + meta + undo/redo ---- */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <PageStatusBadge status={page.status} />
        {/* Locale switcher — full reload via plain anchor so the server
            re-runs loadHomepageForStaff for the new locale. Disabled when
            dirty so the operator doesn't lose unsaved work mid-switch. */}
        {availableLocales.length > 1 && (
          <span className="inline-flex items-center gap-1">
            <span className="opacity-70">Locale:</span>
            {availableLocales.map((l) => {
              const active = l === locale;
              if (active) {
                return (
                  <span
                    key={l}
                    className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary"
                  >
                    {l}
                  </span>
                );
              }
              return (
                <a
                  key={l}
                  href={`?locale=${l}`}
                  onClick={(e) => {
                    if (
                      isDirty &&
                      !window.confirm(
                        "You have unsaved changes. Switch locale and discard them?",
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] uppercase hover:bg-muted/40"
                  title={`Switch to ${l.toUpperCase()} composer`}
                >
                  {l}
                </a>
              );
            })}
          </span>
        )}
        <span>
          Last edited {formatWhen(page.updated_at)}
        </span>
        {page.published_at ? (
          <span>Last published {formatWhen(page.published_at)}</span>
        ) : (
          <span>Not yet published</span>
        )}
        {isDirty && (
          <span
            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300"
            title="You have changes that haven't been saved yet."
          >
            Unsaved
          </span>
        )}
        {/* Clone-from-other-locale — only shown when a sibling locale has
            content; one button per peer locale to keep semantics obvious. */}
        {canCompose &&
          otherLocalesWithContent.map((src) => (
            <Button
              key={`clone-${src}`}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  isDirty &&
                  !window.confirm(
                    "Cloning will overwrite your current draft. Continue?",
                  )
                ) {
                  return;
                }
                void handleCloneFromLocale(src);
              }}
              disabled={clonePending || !canCompose}
              title={`Replace this draft with the ${src.toUpperCase()} composition (review before saving)`}
            >
              <CopyIcon className="mr-1 size-3.5" />
              {clonePending
                ? "Loading…"
                : `Clone from ${src.toUpperCase()}`}
            </Button>
          ))}
        {isDirty && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={discardLocalBackup}
            title="Revert all unsaved field + slot changes back to the last server state."
          >
            Discard changes
          </Button>
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

        {/* ---- Search & social ---------------------------------------------
            Optional SEO/OG knobs. Empty fields normalise to NULL on save so
            the renderer falls back to title/metaDescription. The noindex
            checkbox also gates inclusion in /sitemap.xml — see web/src/app
            /sitemap.ts which reads cms_pages.noindex for is_system_owned
            homepages and skips the canonical "/" entry when set. */}
        <details className="rounded-md border border-border/60">
          <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium hover:bg-muted/30">
            Search &amp; social
            <span className="ml-2 text-xs text-muted-foreground">
              SEO title, OpenGraph card, canonical URL, hide from search
            </span>
          </summary>
          <div className="grid gap-4 border-t border-border/60 p-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ogTitle">OG title (social card)</Label>
              <Input
                id="ogTitle"
                name="ogTitle"
                maxLength={140}
                value={ogTitle}
                onChange={(e) => setOgTitle(e.target.value)}
                disabled={!canCompose}
                placeholder="Falls back to homepage title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ogDescription">OG description</Label>
              <Input
                id="ogDescription"
                name="ogDescription"
                maxLength={280}
                value={ogDescription}
                onChange={(e) => setOgDescription(e.target.value)}
                disabled={!canCompose}
                placeholder="Falls back to meta description"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="ogImageUrl">OG image URL</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="ogImageUrl"
                  name="ogImageUrl"
                  type="url"
                  maxLength={2048}
                  value={ogImageUrl}
                  onChange={(e) => setOgImageUrl(e.target.value)}
                  disabled={!canCompose || savePending}
                  placeholder="https://… or /uploads/…"
                  className="flex-1 min-w-[260px]"
                />
                <MediaPicker
                  tenantId={tenantId}
                  onPick={(url) => setOgImageUrl(url)}
                  label="Pick from library"
                  disabled={!canCompose || savePending}
                />
                {ogImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOgImageUrl("")}
                    disabled={!canCompose || savePending}
                    title="Clear OG image"
                  >
                    Clear
                  </Button>
                )}
              </div>
              {ogImageUrl && (
                <div className="rounded-md border border-border/40 bg-muted/20 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ogImageUrl}
                    alt="OG preview"
                    className="max-h-32 rounded border border-border/30 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Absolute URL or path starting with <code>/</code>. 1200×630 PNG
                or JPG works best for Open Graph cards.
              </p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="canonicalUrl">Canonical URL</Label>
              <Input
                id="canonicalUrl"
                name="canonicalUrl"
                type="url"
                maxLength={2048}
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                disabled={!canCompose}
                placeholder="https://yourdomain.com/"
              />
              <p className="text-xs text-muted-foreground">
                Override only if this homepage is republished from another
                domain. Leave blank to use the storefront origin.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="noindex"
                  checked={noindex}
                  onChange={(e) => setNoindex(e.target.checked)}
                  disabled={!canCompose}
                  className="mt-0.5"
                />
                <span>
                  <strong>Hide from search engines</strong>
                  <span className="block text-xs text-muted-foreground">
                    Adds <code>noindex</code> meta + drops the homepage from
                    the sitemap. Use during pre-launch or while migrating.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </details>

        {/* ---- orphan banner ----
            A slot entry whose section can't be resolved from the merged
            registry (deleted/archived/out-of-tenant). Save will reject these
            with VALIDATION_FAILED, so we surface them up-front instead of
            failing on submit. */}
        {orphanRefs.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <strong>
              {orphanRefs.length} orphan section reference
              {orphanRefs.length === 1 ? "" : "s"}
            </strong>{" "}
            in slot{orphanRefs.length === 1 ? "" : "s"}{" "}
            {Array.from(new Set(orphanRefs.map((r) => r.slotKey))).join(", ")}.
            Remove or replace before saving — save and publish will reject
            unknown section ids.
          </div>
        )}

        {/* ---- in-composer empty-state nudge ----
            Sits between the SEO panel and the slot list. Only renders when the
            tenant has sections available but every slot is empty — in that
            case the wall-of-empty-fieldsets is more discouraging than helpful.
            Distinct from the page-level <StarterTiles /> which only renders
            when both slots AND the section library are empty. */}
        {canCompose && totalEntries === 0 && mergedSections.length > 0 && (
          <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-4">
            <p className="text-sm font-medium">
              No sections in any slot yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a section from your library to start composing — a hero
              works as a strong first slot, then layer trust + features
              underneath.
            </p>
            {template.slots.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={() =>
                  setLibraryOpen({
                    slotKey: template.slots[0]!.key,
                    slotLabel: template.slots[0]!.label,
                  })
                }
              >
                + Add to {template.slots[0]!.label}
              </Button>
            ) : null}
          </div>
        )}

        {/* ---- AI assist (stubbed) ----
            Slot for future composer assistance — generate hero copy from
            tenant brand notes, suggest a section order based on goals, etc.
            Buttons are disabled with a "Coming soon" hint so the surface
            communicates intent without writing a half-baked feature. The
            hooks live here so the visual real-estate is reserved; the
            backend lands in a later phase. */}
        {canCompose && (
          <div className="rounded-md border border-border/40 bg-muted/5 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-3.5 text-muted-foreground" />
                  AI assist
                  <span className="rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Coming soon
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Suggest a slot order, generate hero copy from brand notes,
                  or rewrite a section in another tone. Not wired yet —
                  scaffold reserved.
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled
                  title="AI suggestions ship in a later phase"
                >
                  Suggest order
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled
                  title="AI suggestions ship in a later phase"
                >
                  Draft hero copy
                </Button>
              </div>
            </div>
          </div>
        )}

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
                              reuseCount={
                                sectionUsageCounts[entry.sectionId]
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

      {/* ---- scheduled publish ----
          Operator picks a future fire time (datetime-local) and the
          server-side cron sweep at /api/cron/publish-scheduled promotes
          draft → live at that time. UI floors at +1 minute to mirror the
          DB trigger's skew window. Cancel clears `scheduled_publish_at`
          on the cms_pages row. */}
      {canPublish && (
        <div className="space-y-2 rounded-md border border-border/60 p-4">
          <h3 className="text-sm font-semibold">Schedule publish</h3>
          <p className="text-xs text-muted-foreground">
            Promote the current draft automatically at a chosen time. The
            cron sweeps every minute and applies the same publish gates as
            the manual button below.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={!canCompose || schedulePending}
              className="rounded border border-border/60 bg-background px-2 py-1 text-sm"
              aria-label="Scheduled publish time"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleSchedule}
              disabled={!canCompose || schedulePending || !scheduledAt}
            >
              {schedulePending ? "Saving…" : "Schedule"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCancelSchedule}
              disabled={!canCompose || schedulePending}
              title="Clear any existing schedule"
            >
              Clear
            </Button>
            {scheduledByName && (
              <span className="text-xs text-muted-foreground">
                Last set by {scheduledByName}
              </span>
            )}
          </div>
          {scheduleNotice && (
            <p
              className={
                scheduleNotice.kind === "ok"
                  ? "text-xs text-emerald-300"
                  : "text-xs text-destructive"
              }
            >
              {scheduleNotice.message}
            </p>
          )}
        </div>
      )}

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

          {/* ---- refresh published snapshot ----
              The published_homepage_snapshot freezes section props at
              publish time. If a section is later edited via the section
              editor, the live storefront keeps showing the frozen copy
              until the homepage is re-published. This nudge surfaces that
              behaviour and gives a one-click "re-publish to refresh" path
              that re-uses the current draft composition. CAS uses the
              same effectiveVersion as a regular publish, so racing
              edits are caught the same way. */}
          {page.published_at && (
            <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (publishPending) return;
                  publishFormRef.current?.requestSubmit();
                }}
                disabled={
                  publishPending ||
                  draftRefs.length > 0 ||
                  missingRequired.length > 0
                }
                title="Re-publish to re-bake section content into the live snapshot"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Refresh published snapshot
              </Button>
              <p className="text-xs text-muted-foreground">
                Edited a section after publishing? The live storefront serves
                content frozen at the last publish — re-publish to refresh.
              </p>
            </div>
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
        currentSlotsBySection={currentSlotsBySection}
        getSectionName={(id) => sectionsById.get(id)?.name ?? `Section ${id.slice(0, 6)}`}
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
