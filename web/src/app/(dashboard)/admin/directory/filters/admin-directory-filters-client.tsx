"use client";

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
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ALERT_SUCCESS,
  ADMIN_DRAGGABLE_SETTING_ROW,
  ADMIN_EMBEDDED_SURFACE,
  ADMIN_ERROR_CARD,
  ADMIN_FORM_CONTROL,
  ADMIN_GROUP_LIST_GAP,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY } from "@/lib/directory/directory-sidebar-layout";
import { saveDirectorySidebarLayout, type DirectoryFiltersActionState } from "./actions";

export type DirectoryFilterAdminRow = {
  key: string;
  label: string;
  kind: "filter_search" | "facet";
  valueType?: string;
  taxonomyKind?: string | null;
};

function SortableFilterRow({
  row,
  visible,
  startCollapsed,
  collapsedToggleDisabled,
  disabled,
  onVisibleChange,
  onStartCollapsedChange,
}: {
  row: DirectoryFilterAdminRow;
  visible: boolean;
  startCollapsed: boolean;
  /** Search row is not an accordion — no default collapsed state. */
  collapsedToggleDisabled: boolean;
  disabled: boolean;
  onVisibleChange: (next: boolean) => void;
  onStartCollapsedChange: (next: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        ADMIN_DRAGGABLE_SETTING_ROW,
        isDragging && "z-10 border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/5",
        !visible && "opacity-60",
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40",
          disabled && "pointer-events-none",
        )}
        aria-label="Drag to reorder"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{row.label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{row.key}</p>
        {row.kind === "facet" ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.valueType}
            {row.taxonomyKind ? ` · ${row.taxonomyKind}` : ""}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Narrows which facet groups match as visitors type in the sidebar search box.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-background accent-[var(--impronta-gold)]"
            checked={visible}
            disabled={disabled}
            onChange={(e) => onVisibleChange(e.target.checked)}
            aria-label={`Visible on site: ${row.label}`}
          />
          <span>
            <span className="font-medium text-foreground">Visible</span>
            <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
              Off = hidden on directory
            </span>
          </span>
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 text-xs text-muted-foreground",
            collapsedToggleDisabled && "cursor-not-allowed opacity-45",
          )}
          title={
            collapsedToggleDisabled
              ? "The filter search box is not a collapsible section."
              : "When visible, this group loads closed until the visitor expands it."
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border bg-background accent-[var(--impronta-gold)]"
            checked={startCollapsed}
            disabled={disabled || collapsedToggleDisabled}
            onChange={(e) => onStartCollapsedChange(e.target.checked)}
            aria-label={`Start collapsed: ${row.label}`}
          />
          <span>
            <span className="font-medium text-foreground">Collapsed</span>
            <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
              Default closed
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

export type TopBarFacetCandidate = { key: string; label: string };

export function AdminDirectoryFiltersClient({
  initialOrder,
  initialFilterSearchVisible,
  initialTopBarFacetKey,
  topBarFacetCandidates,
  initialFieldVisibility,
  initialSectionCollapsed,
  rowsByKey,
}: {
  initialOrder: string[];
  initialFilterSearchVisible: boolean;
  /** `field_definitions.key` for taxonomy facet in the pill row, or null for no top bar. */
  initialTopBarFacetKey: string | null;
  /** Taxonomy facets that can use the public directory pill row (same set the pill UI supports). */
  topBarFacetCandidates?: TopBarFacetCandidate[] | null;
  initialFieldVisibility: Record<string, boolean>;
  initialSectionCollapsed: Record<string, boolean>;
  rowsByKey: Record<string, DirectoryFilterAdminRow>;
}) {
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [filterSearchVisible, setFilterSearchVisible] = useState(initialFilterSearchVisible);
  const [topBarFacetKey, setTopBarFacetKey] = useState<string | null>(initialTopBarFacetKey);
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, boolean>>(initialFieldVisibility);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(initialSectionCollapsed);

  const router = useRouter();
  const [state, formAction, pending] = useActionState<DirectoryFiltersActionState, FormData>(
    saveDirectorySidebarLayout,
    undefined,
  );

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [state?.success, router]);

  useEffect(() => {
    setOrder(initialOrder);
    setFilterSearchVisible(initialFilterSearchVisible);
    setTopBarFacetKey(initialTopBarFacetKey);
    setFieldVisibility({ ...initialFieldVisibility });
    setSectionCollapsed({ ...initialSectionCollapsed });
  }, [
    initialFilterSearchVisible,
    initialTopBarFacetKey,
    JSON.stringify(initialOrder),
    JSON.stringify(initialFieldVisibility),
    JSON.stringify(initialSectionCollapsed),
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setOrder(arrayMove(order, oldIndex, newIndex));
  };

  const orderedRows = useMemo(() => {
    return order
      .map((k) => rowsByKey[k])
      .filter((r): r is DirectoryFilterAdminRow => Boolean(r));
  }, [order, rowsByKey]);

  const topBarSelectOptions = useMemo(() => {
    const candidates = Array.isArray(topBarFacetCandidates) ? topBarFacetCandidates : [];
    const sorted = [...candidates].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
    if (topBarFacetKey && !sorted.some((o) => o.key === topBarFacetKey)) {
      const row = rowsByKey[topBarFacetKey];
      sorted.unshift({
        key: topBarFacetKey,
        label: row ? `${row.label} (${topBarFacetKey})` : topBarFacetKey,
      });
    }
    return sorted;
  }, [topBarFacetCandidates, topBarFacetKey, rowsByKey]);

  const save = () => {
    const fv = { ...fieldVisibility };
    const collapsed: Record<string, boolean> = {};
    for (const k of order) {
      if (k === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) continue;
      if (sectionCollapsed[k]) collapsed[k] = true;
    }
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        item_order: order,
        filter_search_visible: filterSearchVisible,
        top_bar_facet_key: topBarFacetKey,
        field_visibility: fv,
        section_collapsed_defaults: collapsed,
      }),
    );
    startTransition(() => {
      formAction(fd);
    });
  };

  return (
    <div className="space-y-4">
      {state?.error ? <p className={ADMIN_ERROR_CARD}>{state.error}</p> : null}
      {state?.success ? (
        <p className={ADMIN_ALERT_SUCCESS}>Saved. Public directory sidebar will update on next load.</p>
      ) : null}

      <div className={ADMIN_EMBEDDED_SURFACE}>
        <div className="space-y-2 text-sm">
          <div>
            <label htmlFor="directory-top-bar-facet" className="font-medium text-foreground">
              Top pill row (above results)
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick one <span className="font-medium text-foreground">taxonomy</span> facet to show as a
              horizontal ALL + options row on the public directory. That facet is removed from the sidebar so it
              is not shown twice. Height, age, location, and non-taxonomy facets cannot use this row (they use
              different controls on the listing).
            </p>
          </div>
          <select
            id="directory-top-bar-facet"
            className={cn(ADMIN_FORM_CONTROL, "max-w-md")}
            disabled={pending}
            value={topBarFacetKey ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setTopBarFacetKey(v.length > 0 ? v : null);
            }}
            aria-label="Directory facet for top pill row"
          >
            <option value="">None — all facets only in the sidebar</option>
            {topBarSelectOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DndContext
        id="admin-directory-sidebar-filters"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className={cn(ADMIN_GROUP_LIST_GAP, pending && "pointer-events-none opacity-60")}>
            {orderedRows.map((row) => (
              <SortableFilterRow
                key={row.key}
                row={row}
                disabled={pending}
                collapsedToggleDisabled={row.key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY}
                visible={
                  row.key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY
                    ? filterSearchVisible
                    : (fieldVisibility[row.key] ?? false)
                }
                startCollapsed={sectionCollapsed[row.key] === true}
                onVisibleChange={(next) => {
                  if (row.key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) {
                    setFilterSearchVisible(next);
                  } else {
                    setFieldVisibility((prev) => ({ ...prev, [row.key]: next }));
                  }
                }}
                onStartCollapsedChange={(next) => {
                  if (row.key === DIRECTORY_SIDEBAR_FILTER_SEARCH_KEY) return;
                  setSectionCollapsed((prev) => {
                    const copy = { ...prev };
                    if (next) copy[row.key] = true;
                    else delete copy[row.key];
                    return copy;
                  });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save layout"}
        </Button>
      </div>
    </div>
  );
}
