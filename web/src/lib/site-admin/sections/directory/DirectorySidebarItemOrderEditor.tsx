"use client";

import { useId } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

/**
 * Drag-and-drop reorder list for the directory sidebar `item_order`.
 *
 * - Uses @dnd-kit/sortable (already in the bundle — see
 *   `media-gallery-drawer.tsx` and `pitch-compose.tsx`).
 * - The `__filter_search__` pseudo-key is rendered (so its position in
 *   the sidebar is editable) but rendered slightly muted so operators
 *   know it's the search-box slot, not a facet field.
 * - Up/Down chevron buttons provide a fully keyboard-accessible
 *   alternative to the drag handle (in addition to dnd-kit's built-in
 *   keyboard sensor on the handle).
 * - Optimistic reorder is owned by the caller; this component is
 *   purely controlled — it emits the next `string[]` and the parent
 *   wires the server action + revert-on-error.
 */

const FILTER_SEARCH_KEY = "__filter_search__";

const LABEL =
  "block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--impronta-muted)]";
const HELP = "text-[11px] leading-relaxed text-[var(--impronta-muted)]";

export function DirectorySidebarItemOrderEditor({
  itemOrder,
  disabled,
  onReorder,
}: {
  itemOrder: string[];
  disabled?: boolean;
  onReorder: (next: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labelId = useId();

  if (itemOrder.length === 0) {
    return (
      <div className="space-y-1 pt-1">
        <div className={LABEL}>Reorder sidebar facets (live)</div>
        <p className={HELP}>
          No facets in the live catalog yet. Add directory facets in the
          field definitions admin first.
        </p>
      </div>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemOrder.indexOf(String(active.id));
    const newIndex = itemOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(itemOrder, oldIndex, newIndex));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= itemOrder.length) return;
    onReorder(arrayMove(itemOrder, index, target));
  };

  return (
    <div className="space-y-1 pt-1">
      <div id={labelId} className={LABEL}>
        Reorder sidebar facets (live)
      </div>
      <p className={HELP}>
        Drag to reorder; or use the arrows. The order here is the order
        shoppers see on the storefront sidebar.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemOrder} strategy={verticalListSortingStrategy}>
          <ul
            aria-labelledby={labelId}
            className="rounded-md border border-border/40"
          >
            {itemOrder.map((key, index) => (
              <SortableRow
                key={key}
                id={key}
                index={index}
                total={itemOrder.length}
                disabled={Boolean(disabled)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableRow({
  id,
  index,
  total,
  disabled,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  index: number;
  total: number;
  disabled: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const isPseudo = id === FILTER_SEARCH_KEY;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      className="flex items-center gap-2 border-b border-border/30 px-2 py-1.5 text-sm text-foreground last:border-b-0"
    >
      <button
        type="button"
        aria-label={`Drag ${id}`}
        title="Drag to reorder"
        disabled={disabled}
        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-[var(--impronta-muted)] hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span
        className={`flex-1 truncate font-mono text-[12px] ${
          isPseudo ? "text-[var(--impronta-muted)] italic" : ""
        }`}
        title={isPseudo ? "Search-box slot" : id}
      >
        {isPseudo ? "search-box slot" : id}
      </span>
      <span className="text-[10px] text-[var(--impronta-muted)]">
        {index + 1}/{total}
      </span>
      <div className="inline-flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`Move ${id} up`}
          disabled={disabled || index === 0}
          onClick={onMoveUp}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--impronta-muted)] hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Move ${id} down`}
          disabled={disabled || index === total - 1}
          onClick={onMoveDown}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--impronta-muted)] hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
