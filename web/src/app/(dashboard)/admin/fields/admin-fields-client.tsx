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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { FieldDefinitionRow, FieldGroupRow } from "./field-group-panel";
import { FieldGroupPanel } from "./field-group-panel";
import {
  AdminFieldDefinitionEditSheet,
  type AdminFieldDefinitionEditInitial,
  type FieldGroupOption,
} from "./admin-field-definition-edit-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reorderFieldGroups, type FieldAdminActionState } from "./actions";

export function AdminFieldsClient({
  groups,
  fieldsByGroup,
  initialEditFieldId,
}: {
  groups: FieldGroupRow[];
  fieldsByGroup: Array<{ groupId: string; fields: FieldDefinitionRow[] }>;
  initialEditFieldId?: string | null;
}) {
  const [editFieldId, setEditFieldId] = useState<string | null>(
    initialEditFieldId ?? null,
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const [reorderState, reorderAction, reorderPending] = useActionState<FieldAdminActionState, FormData>(
    reorderFieldGroups,
    undefined,
  );

  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  useEffect(() => {
    setEditFieldId(initialEditFieldId ?? null);
  }, [initialEditFieldId]);

  const stripEditParam = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("edit");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const openFieldEdit = (id: string) => {
    setEditFieldId(id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("edit", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const groupOrderRefreshLock = useRef(false);
  useEffect(() => {
    if (reorderPending) groupOrderRefreshLock.current = false;
  }, [reorderPending]);
  useEffect(() => {
    if (reorderState?.success && !groupOrderRefreshLock.current) {
      groupOrderRefreshLock.current = true;
      router.refresh();
    }
  }, [reorderState?.success, router]);

  const byId = useMemo(() => {
    const map = new Map<string, FieldDefinitionRow>();
    for (const bucket of fieldsByGroup) {
      for (const f of bucket.fields) map.set(f.id, f);
    }
    return map;
  }, [fieldsByGroup]);

  const initial: AdminFieldDefinitionEditInitial | null = editFieldId
    ? (() => {
        const f = byId.get(editFieldId);
        if (!f) return null;
        // Note: `help_*` and `field_group_id` are loaded on the server page for the sheet.
        return {
          id: f.id,
          field_group_id: (f as unknown as { field_group_id?: string | null }).field_group_id ?? null,
          key: f.key,
          label_en: f.label_en,
          label_es: f.label_es,
          help_en: (f as unknown as { help_en?: string | null }).help_en ?? null,
          help_es: (f as unknown as { help_es?: string | null }).help_es ?? null,
          value_type: f.value_type,
          required_level: f.required_level,
          taxonomy_kind: f.taxonomy_kind,
        };
      })()
    : null;

  const groupOptions: FieldGroupOption[] = groups.map((g) => ({
    id: g.id,
    name_en: g.name_en,
  }));

  // DnD for group ordering
  const orderedGroupIds = groups.map((g) => g.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedGroupIds.indexOf(String(active.id));
    const newIndex = orderedGroupIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(orderedGroupIds, oldIndex, newIndex);
    const fd = new FormData();
    fd.set("ordered_ids", next.join(","));
    startTransition(() => {
      reorderAction(fd);
    });
  };

  return (
    <div className="space-y-5">
      {reorderState?.error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          {reorderState.error}
        </p>
      ) : null}

      <DndContext
        id="admin-field-groups-order"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onGroupDragEnd}
      >
        <SortableContext items={orderedGroupIds} strategy={verticalListSortingStrategy}>
          <div className={cn("space-y-5", reorderPending && "opacity-70")}>
            {groups.map((group) => {
              const bucket = fieldsByGroup.find((b) => b.groupId === group.id);
              const fields = bucket?.fields ?? [];
              return (
                <SortableGroupShell key={group.id} id={group.id} disabled={reorderPending}>
                  <FieldGroupPanel
                    group={group}
                    fields={fields}
                    onEditField={(id) => openFieldEdit(id)}
                    open={openGroups.has(group.id)}
                    onOpenChange={(nextOpen) => {
                      setOpenGroups((prev) => {
                        const next = new Set(prev);
                        if (nextOpen) next.add(group.id);
                        else next.delete(group.id);
                        return next;
                      });
                    }}
                  />
                </SortableGroupShell>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <AdminFieldDefinitionEditSheet
        open={Boolean(editFieldId)}
        onOpenChange={(o) => {
          if (!o) {
            setEditFieldId(null);
            stripEditParam();
          }
        }}
        initial={initial}
        groups={groupOptions}
      />
    </div>
  );
}

function SortableGroupShell({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "ring-2 ring-ring/40 rounded-2xl")}>
      <div className="mb-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-2 border-border/60 bg-background/40 text-xs text-muted-foreground hover:text-foreground"
          disabled={disabled}
          aria-label="Drag group to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
          Reorder group
        </Button>
      </div>
      {children}
    </div>
  );
}

