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
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Telescope,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTip } from "@/components/ui/help-tip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  partitionBasicInformationGroupFields,
  reservedTalentProfileFieldKeysHint,
} from "@/lib/field-canonical";
import {
  ADMIN_EMBEDDED_SURFACE,
  ADMIN_EXPANDABLE_GROUP_CARD,
  ADMIN_GROUP_SECTION_TITLE,
  ADMIN_GROUP_TOOLBAR_BUTTON,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import {
  createFieldDefinition,
  archiveFieldDefinition,
  restoreFieldDefinition,
  reorderFieldGroupFields,
  updateFieldGroup,
  archiveFieldGroup,
  hardDeleteFieldGroup,
  updateFieldDefinition,
  type FieldAdminActionState,
} from "./actions";

/** revalidatePath in server actions does not update RSC props already passed into this client tree. */
function useRefreshAfterMutationSuccess(isPending: boolean, success: boolean | undefined) {
  const router = useRouter();
  const didRefresh = useRef(false);
  useEffect(() => {
    if (isPending) didRefresh.current = false;
  }, [isPending]);
  useEffect(() => {
    if (success && !didRefresh.current) {
      didRefresh.current = true;
      router.refresh();
    }
  }, [success, router]);
}

function ValueTypePill({
  valueType,
  taxonomyKind,
}: {
  valueType: string;
  taxonomyKind: string | null;
}) {
  return (
    <Badge
      variant="outline"
      className="border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
    >
      {valueType}
      {taxonomyKind ? ` · ${taxonomyKind}` : ""}
    </Badge>
  );
}

function ToggleLabeledButton({
  label,
  shortLabel,
  active,
  disabled,
  onClick,
  icon,
  hint,
}: {
  label: string;
  shortLabel: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  hint: string;
}) {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <Button
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn(
              "h-auto min-h-8 shrink-0 gap-1 px-1.5 py-1 transition-colors",
              active
                ? "border-2 border-primary shadow-md [&_svg]:text-primary-foreground"
                : "border-2 border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            disabled={disabled}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            aria-label={`${label}${active ? ", on" : ", off"}`}
            aria-pressed={active}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className="inline-flex shrink-0">{icon}</span>
              <span className="max-w-[4.5rem] text-center text-[9px] font-semibold uppercase leading-tight tracking-tight text-current">
                {shortLabel}
              </span>
            </span>
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="block max-w-[min(90vw,300px)]">{hint}</span>
        <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
          {active ? "On — click to turn off" : "Off — click to turn on"}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export type FieldGroupRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  archived_at: string | null;
  /** null = canonical/global, UUID = agency-local. Added in SaaS Phase 6. */
  tenant_id: string | null;
};

export type FieldDefinitionRow = {
  id: string;
  key: string;
  label_en: string;
  label_es: string | null;
  value_type: string;
  required_level: "optional" | "recommended" | "required";
  public_visible: boolean;
  internal_only: boolean;
  card_visible: boolean;
  preview_visible: boolean;
  profile_visible: boolean;
  filterable: boolean;
  /** When true, field is eligible to appear in public directory sidebar + admin Directory filters layout. */
  directory_filter_visible: boolean;
  searchable: boolean;
  ai_visible: boolean;
  editable_by_talent: boolean;
  editable_by_staff: boolean;
  editable_by_admin: boolean;
  active: boolean;
  sort_order: number;
  taxonomy_kind: string | null;
  archived_at: string | null;
  /** null = canonical/global, UUID = agency-local. Added in SaaS Phase 6. */
  tenant_id: string | null;
};

function SortableFieldRow({
  field,
  disabled,
  onEditField,
}: {
  field: FieldDefinitionRow;
  disabled: boolean;
  onEditField: (fieldId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [updState, updAction, updPending] = useActionState<FieldAdminActionState, FormData>(
    updateFieldDefinition,
    undefined,
  );
  const [archState, archAction, archPending] = useActionState<FieldAdminActionState, FormData>(
    archiveFieldDefinition,
    undefined,
  );
  const [resState, resAction, resPending] = useActionState<FieldAdminActionState, FormData>(
    restoreFieldDefinition,
    undefined,
  );

  const pending = disabled || updPending || archPending || resPending;
  const err = updState?.error ?? archState?.error ?? resState?.error;

  useRefreshAfterMutationSuccess(updPending, updState?.success);
  useRefreshAfterMutationSuccess(archPending, archState?.success);
  useRefreshAfterMutationSuccess(resPending, resState?.success);

  const toggle = (name: string, next: boolean) => {
    const fd = new FormData();
    fd.set("field_id", field.id);
    fd.set(name, next ? "1" : "0");
    startTransition(() => {
      void updAction(fd);
    });
  };

  const setRequiredLevel = (level: FieldDefinitionRow["required_level"]) => {
    const fd = new FormData();
    fd.set("field_id", field.id);
    fd.set("required_level", level);
    startTransition(() => {
      void updAction(fd);
    });
  };

  return (
    <FieldRowShell
      field={field}
      pending={pending}
      err={err}
      dragHandle={
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50",
            pending && "pointer-events-none",
          )}
          aria-label="Drag to reorder"
          disabled={pending}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      }
      rowProps={{
        style,
        className: cn(
          "transition-colors hover:bg-[var(--impronta-gold-border)]",
          isDragging && "bg-[var(--impronta-gold-border)]/60",
        ),
      }}
      rowRef={setNodeRef}
      lockDefinitionMetadata={false}
      onSetRequiredLevel={setRequiredLevel}
      onToggle={toggle}
      archAction={archAction}
      resAction={resAction}
      onEditField={onEditField}
    />
  );
}

function StaticFieldRow({
  field,
  disabled,
  onEditField,
  fixedOrderHint,
}: {
  field: FieldDefinitionRow;
  disabled: boolean;
  onEditField: (fieldId: string) => void;
  /** Canonical Basic Information mirrors: show badge + lock label/required/archive edits; toggles stay live. */
  fixedOrderHint?: boolean;
}) {
  const [updState, updAction, updPending] = useActionState<FieldAdminActionState, FormData>(
    updateFieldDefinition,
    undefined,
  );
  const [archState, archAction, archPending] = useActionState<FieldAdminActionState, FormData>(
    archiveFieldDefinition,
    undefined,
  );
  const [resState, resAction, resPending] = useActionState<FieldAdminActionState, FormData>(
    restoreFieldDefinition,
    undefined,
  );

  const pending = disabled || updPending || archPending || resPending;
  const err = updState?.error ?? archState?.error ?? resState?.error;

  useRefreshAfterMutationSuccess(updPending, updState?.success);
  useRefreshAfterMutationSuccess(archPending, archState?.success);
  useRefreshAfterMutationSuccess(resPending, resState?.success);

  const toggle = (name: string, next: boolean) => {
    const fd = new FormData();
    fd.set("field_id", field.id);
    fd.set(name, next ? "1" : "0");
    startTransition(() => {
      void updAction(fd);
    });
  };

  const setRequiredLevel = (level: FieldDefinitionRow["required_level"]) => {
    const fd = new FormData();
    fd.set("field_id", field.id);
    fd.set("required_level", level);
    startTransition(() => {
      void updAction(fd);
    });
  };

  return (
    <FieldRowShell
      field={field}
      pending={pending}
      err={err}
      fixedOrderHint={fixedOrderHint}
      lockDefinitionMetadata={Boolean(fixedOrderHint)}
      dragHandle={
        <span
          className={cn(
            "inline-flex items-center gap-2 text-muted-foreground",
            fixedOrderHint && "text-muted-foreground/50",
            pending && "opacity-50",
          )}
          title={
            fixedOrderHint
              ? "Canonical profile column — fixed order; edit values on the talent profile form."
              : undefined
          }
          aria-hidden
        >
          <GripVertical className="size-4" aria-hidden />
        </span>
      }
      rowProps={{
        className: cn(
          "transition-colors hover:bg-[var(--impronta-gold-border)]",
          fixedOrderHint && "bg-muted/20 hover:bg-[var(--impronta-gold-border)]/40",
        ),
      }}
      onSetRequiredLevel={setRequiredLevel}
      onToggle={toggle}
      archAction={archAction}
      resAction={resAction}
      onEditField={onEditField}
    />
  );
}

function FieldRowShell({
  field,
  pending,
  err,
  dragHandle,
  rowRef,
  rowProps,
  fixedOrderHint,
  lockDefinitionMetadata,
  onSetRequiredLevel,
  onToggle,
  archAction,
  resAction,
  onEditField,
}: {
  field: FieldDefinitionRow;
  pending: boolean;
  err?: string;
  dragHandle: React.ReactNode;
  rowRef?: ((element: HTMLTableRowElement | null) => void) | null;
  rowProps?: React.ComponentPropsWithoutRef<"tr">;
  fixedOrderHint?: boolean;
  lockDefinitionMetadata?: boolean;
  onSetRequiredLevel: (level: FieldDefinitionRow["required_level"]) => void;
  onToggle: (name: string, next: boolean) => void;
  archAction: (payload: FormData) => void;
  resAction: (payload: FormData) => void;
  onEditField: (fieldId: string) => void;
}) {
  const { className, ...restRowProps } = rowProps ?? {};

  return (
    <tr
      ref={rowRef ?? undefined}
      {...restRowProps}
      className={cn("group", className)}
      title={err ?? undefined}
    >
      <td className="py-2 pr-3 align-middle">{dragHandle}</td>
      <td className="py-2 pr-4 align-middle">
        <span className="font-mono text-[11px] text-[var(--impronta-muted)]">{field.key}</span>
        <div className="text-sm">{field.label_en}</div>
        {field.label_es ? (
          <div className="text-xs text-muted-foreground">{field.label_es}</div>
        ) : null}
        {fixedOrderHint ? (
          <div className="mt-1.5">
            <Badge variant="secondary" className="text-[10px] font-normal">
              Canonical · fixed order
            </Badge>
          </div>
        ) : null}
      </td>
      <td className="py-2 pr-4 align-middle">
        <ValueTypePill valueType={field.value_type} taxonomyKind={field.taxonomy_kind} />
      </td>
      <td className="py-2 pr-4 align-middle">
        <select
          className="h-8 rounded-md border border-border/60 bg-background/40 px-2 text-xs"
          value={field.required_level}
          disabled={pending || lockDefinitionMetadata}
          title={
            lockDefinitionMetadata
              ? "Required level is fixed for canonical profile mirrors."
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onSetRequiredLevel(e.target.value as FieldDefinitionRow["required_level"])}
        >
          <option value="optional">Optional</option>
          <option value="recommended">Recommended</option>
          <option value="required">Required</option>
        </select>
      </td>
      <td className="py-2 pr-4 align-middle">
        <TooltipProvider delayDuration={250}>
          <div className="flex max-w-[min(100vw,520px)] flex-wrap gap-1.5">
          <ToggleLabeledButton
            label="Public exposure"
            shortLabel="Public"
            active={field.public_visible}
            disabled={pending}
            onClick={() => onToggle("public_visible", !field.public_visible)}
            icon={
              field.public_visible ? (
                <Eye className="size-4" aria-hidden />
              ) : (
                <EyeOff className="size-4" aria-hidden />
              )
            }
            hint={
              field.public_visible
                ? "Gate for anonymous/public data: when off, values stay out of public APIs and most public UIs. Profile page and directory card traits still require their own toggles. Internal-only fields never leak."
                : "Off: not treated as publicly releasable. Staff/talent dashboards may still show the field where the product allows."
            }
          />
          <ToggleLabeledButton
            label="Profile page"
            shortLabel="Profile"
            active={field.profile_visible}
            disabled={pending}
            onClick={() => onToggle("profile_visible", !field.profile_visible)}
            icon={<UserRound className="size-4" aria-hidden />}
            hint={
              field.profile_visible
                ? "Show on profile: may appear on the public talent profile when public exposure is on and the field is not internal-only. Directory card traits also require profile visibility for most fields."
                : "Off: hidden from public profile sections even when public exposure is on."
            }
          />
          <ToggleLabeledButton
            label="Directory card traits"
            shortLabel="Card"
            active={field.card_visible}
            disabled={pending}
            onClick={() => onToggle("card_visible", !field.card_visible)}
            icon={<LayoutGrid className="size-4" aria-hidden />}
            hint="Show on card: extra trait lines under fit labels on directory cards. Runtime requires public exposure + profile + this toggle. Name, primary role, and city on the card come from profile columns, not field definitions."
          />
          <ToggleLabeledButton
            label="Quick preview (hover)"
            shortLabel="Preview"
            active={field.preview_visible}
            disabled={pending}
            onClick={() => onToggle("preview_visible", !field.preview_visible)}
            icon={<Telescope className="size-4" aria-hidden />}
            hint="Directory hover preview API: wired for fit_labels, skills, and languages together with public exposure and profile visibility."
          />
          <ToggleLabeledButton
            label="Show in directory filters"
            shortLabel="Filters"
            active={field.directory_filter_visible}
            disabled={pending}
            onClick={() => onToggle("directory_filter_visible", !field.directory_filter_visible)}
            icon={<ListFilter className="size-4" aria-hidden />}
            hint="When on, this field can appear in the admin Directory filters list and (for supported types) as a public directory sidebar facet. Reorder and hide blocks under Admin → Directory → Directory filters. Unsupported value types may appear in admin only until the facet UI supports them."
          />
          <ToggleLabeledButton
            label="Search indexing (field values)"
            shortLabel="Search"
            active={field.searchable}
            disabled={pending}
            onClick={() => onToggle("searchable", !field.searchable)}
            icon={<Search className="size-4" aria-hidden />}
            hint="Searchable: adds this field’s text/textarea values in field_values to classic directory keyword search (q) when the field is public + profile-visible. Names, bios, taxonomy, and cities are searched via other paths—canonical profile columns do not use field_values, so this toggle does not affect them."
          />
          <ToggleLabeledButton
            label="Use for AI matching"
            shortLabel="AI"
            active={field.ai_visible}
            disabled={pending}
            onClick={() => onToggle("ai_visible", !field.ai_visible)}
            icon={<Sparkles className="size-4" aria-hidden />}
            hint="AI signal: includes this field in the AI search document used for semantic / vector search and related tooling when values exist. Canonical columns (name, bio, location, gender, etc.) are merged by the document builder separately from field_values."
          />
          </div>
        </TooltipProvider>
      </td>
      <td className="py-2 text-right align-middle">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending || lockDefinitionMetadata}
          title={
            lockDefinitionMetadata
              ? "Canonical mirrors use fixed labels and types; use toggles for visibility."
              : undefined
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEditField(field.id)}
          className="opacity-90 hover:opacity-100"
        >
          Edit
        </Button>
        {field.archived_at ? (
          <form action={resAction} onPointerDown={(e) => e.stopPropagation()}>
            <input type="hidden" name="field_id" value={field.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="text-muted-foreground hover:text-emerald-400"
            >
              Restore
            </Button>
          </form>
        ) : lockDefinitionMetadata ? null : (
          <form action={archAction} onPointerDown={(e) => e.stopPropagation()}>
            <input type="hidden" name="field_id" value={field.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
            >
              Archive
            </Button>
          </form>
        )}
      </td>
    </tr>
  );
}

export function FieldGroupPanel({
  group,
  fields,
  activeTenantId,
  onEditField,
  open,
  onOpenChange,
}: {
  group: FieldGroupRow;
  fields: FieldDefinitionRow[];
  /** Current active tenant — see AdminFieldsClient. New fields created here inherit it when the parent group is agency-local or the caller is on an agency workspace. */
  activeTenantId: string | null;
  onEditField: (fieldId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groupScope: "canonical" | "agency" = group.tenant_id ? "agency" : "canonical";
  const effectiveTenantId = group.tenant_id ?? activeTenantId;
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"archive" | "delete">("archive");

  const [createState, createAction, createPending] = useActionState<FieldAdminActionState, FormData>(
    createFieldDefinition,
    undefined,
  );
  const [reorderState, reorderAction, reorderPending] = useActionState<
    FieldAdminActionState,
    FormData
  >(reorderFieldGroupFields, undefined);

  const [groupUpdState, groupUpdAction, groupUpdPending] = useActionState<FieldAdminActionState, FormData>(
    updateFieldGroup,
    undefined,
  );
  const [groupArchState, groupArchAction, groupArchPending] = useActionState<FieldAdminActionState, FormData>(
    archiveFieldGroup,
    undefined,
  );
  const [groupDelState, groupDelAction, groupDelPending] = useActionState<FieldAdminActionState, FormData>(
    hardDeleteFieldGroup,
    undefined,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const router = useRouter();
  const panelRefreshLock = useRef(false);
  const panelPending =
    reorderPending || createPending || groupUpdPending || groupArchPending || groupDelPending;
  const panelSucceeded = Boolean(
    createState?.success ||
      reorderState?.success ||
      groupUpdState?.success ||
      groupArchState?.success ||
      groupDelState?.success,
  );
  useEffect(() => {
    if (panelPending) panelRefreshLock.current = false;
  }, [panelPending]);
  useEffect(() => {
    if (panelSucceeded && !panelRefreshLock.current) {
      panelRefreshLock.current = true;
      router.refresh();
    }
  }, [panelSucceeded, router]);

  useEffect(() => {
    if (groupUpdState?.success) setEditingGroup(false);
  }, [groupUpdState?.success]);

  useEffect(() => {
    if (createState?.success) setAddFieldOpen(false);
  }, [createState?.success]);

  useEffect(() => {
    if (groupArchState?.success) {
      setEditingGroup(false);
      setConfirmOpen(false);
    }
  }, [groupArchState?.success]);

  useEffect(() => {
    if (groupDelState?.success) setConfirmOpen(false);
  }, [groupDelState?.success]);

  const { canonicalRows, draggableFields } = useMemo(() => {
    if (group.slug === "basic_info") {
      const { canonical, extras } = partitionBasicInformationGroupFields(fields);
      return { canonicalRows: canonical, draggableFields: extras };
    }
    return { canonicalRows: [] as FieldDefinitionRow[], draggableFields: fields };
  }, [group.slug, fields]);

  const filteredCanonical = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return canonicalRows;
    return canonicalRows.filter((f) => {
      const hay = `${f.key} ${f.label_en} ${f.label_es ?? ""} ${f.value_type} ${f.taxonomy_kind ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [canonicalRows, query]);

  const filteredDraggable = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return draggableFields;
    return draggableFields.filter((f) => {
      const hay = `${f.key} ${f.label_en} ${f.label_es ?? ""} ${f.value_type} ${f.taxonomy_kind ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [draggableFields, query]);

  const dragEnabled = !query.trim();
  const draggableIds = draggableFields.map((f) => f.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (!dragEnabled) return;

    if (group.slug === "basic_info") {
      const oldIndex = draggableIds.indexOf(String(active.id));
      const newIndex = draggableIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const nextExtras = arrayMove(draggableFields, oldIndex, newIndex);
      const nextIds = [...canonicalRows.map((f) => f.id), ...nextExtras.map((f) => f.id)];
      const fd = new FormData();
      fd.set("ordered_ids", nextIds.join(","));
      startTransition(() => {
        reorderAction(fd);
      });
      return;
    }

    const oldIndex = draggableIds.indexOf(String(active.id));
    const newIndex = draggableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(draggableFields, oldIndex, newIndex);
    const fd = new FormData();
    fd.set("ordered_ids", next.map((f) => f.id).join(","));
    startTransition(() => {
      reorderAction(fd);
    });
  };

  const busy = reorderPending || createPending || groupUpdPending || groupArchPending || groupDelPending;
  const err =
    reorderState?.error ??
    createState?.error ??
    groupUpdState?.error ??
    groupArchState?.error ??
    groupDelState?.error;

  return (
    <div className={ADMIN_EXPANDABLE_GROUP_CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={ADMIN_GROUP_SECTION_TITLE}>
              {group.name_en}
            </h2>
            <Badge variant="secondary" className="h-6">
              {fields.length} field{fields.length !== 1 ? "s" : ""}
            </Badge>
            <Badge
              variant={groupScope === "canonical" ? "outline" : "default"}
              className="h-6"
              title={
                groupScope === "canonical"
                  ? "Canonical — shared across every agency; edited by platform admins only."
                  : "Agency-local — visible and editable only within this workspace."
              }
            >
              {groupScope === "canonical" ? "Canonical" : "Agency"}
            </Badge>
            <HelpTip content="Groups define sections in talent and admin profile editors." />
          </div>
          {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ADMIN_GROUP_TOOLBAR_BUTTON}
            disabled={busy}
            onClick={() => setEditingGroup((v) => !v)}
          >
            <Pencil className="size-4" aria-hidden />
            {editingGroup ? "Close" : "Edit group"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ADMIN_GROUP_TOOLBAR_BUTTON}
            disabled={busy}
            onClick={() => {
              const next = !addFieldOpen;
              setAddFieldOpen(next);
              if (next) onOpenChange(true);
            }}
            aria-expanded={addFieldOpen}
          >
            <Plus className="size-4" aria-hidden />
            {addFieldOpen ? "Close" : "Add field"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(ADMIN_GROUP_TOOLBAR_BUTTON, "text-muted-foreground hover:text-destructive")}
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ADMIN_GROUP_TOOLBAR_BUTTON}
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open ? "rotate-180" : "")}
              aria-hidden
            />
            {open ? "Collapse" : "Expand"}
          </Button>
        </div>
      </div>

      {editingGroup ? (
        <div className={ADMIN_EMBEDDED_SURFACE}>
          <form action={groupUpdAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="group_id" value={group.id} />
            <div className="space-y-1.5">
              <Label htmlFor={`group-name-en-${group.id}`}>Name (EN)</Label>
              <Input
                id={`group-name-en-${group.id}`}
                name="name_en"
                defaultValue={group.name_en}
                required
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`group-name-es-${group.id}`}>Name (ES)</Label>
              <Input
                id={`group-name-es-${group.id}`}
                name="name_es"
                defaultValue={group.name_es ?? ""}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`group-slug-${group.id}`}>Slug</Label>
                <HelpTip content="Stable ID used in URLs and code. Normalized to lowercase, no spaces." />
              </div>
              <Input
                id={`group-slug-${group.id}`}
                name="slug"
                defaultValue={group.slug}
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("group_id", group.id);
                  startTransition(() => {
                    groupArchAction(fd);
                  });
                }}
              >
                Archive group
              </Button>
              <Button type="submit" disabled={busy}>
                {groupUpdPending ? "Saving…" : "Save group"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {group.slug === "basic_info" ? (
              <>
                <span className="font-medium text-foreground">Basic Information</span> starts with fixed canonical
                fields (display name, legal name, phone, demographics, locations, short bio) edited on talent profile
                forms — not as dynamic field values. Rows marked “Canonical · fixed order” mirror those columns. Add{" "}
                <span className="font-medium text-foreground">extra</span> fields below them; only extras can be
                reordered. Use the eye control for whether an enrichment field appears on the{" "}
                <span className="font-medium text-foreground">public</span> profile (admins and the talent still see it
                in editors when profile-visible). Reserved keys:{" "}
                <span className="font-mono text-[11px]">{reservedTalentProfileFieldKeysHint()}</span>.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">Canonical profile columns</span> (name, bio, legal name,
                location) are edited on talent profile forms — not here. Reserved dynamic keys:{" "}
                <span className="font-mono text-[11px]">{reservedTalentProfileFieldKeysHint()}</span>.
                Use this form only for enrichment fields (measurements, skills metadata, URLs, etc.).
              </>
            )}
          </p>
          {addFieldOpen ? (
            <div className={ADMIN_EMBEDDED_SURFACE}>
              <form action={createAction} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="field_group_id" value={group.id} />
                <input
                  type="hidden"
                  name="tenant_id"
                  value={effectiveTenantId ?? ""}
                />
                <div className="space-y-1.5">
                  <Label htmlFor={`key-${group.id}`}>Key</Label>
                  <Input id={`key-${group.id}`} name="key" placeholder="e.g. eye_color" required disabled={busy} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`label_en-${group.id}`}>Label (EN)</Label>
                  <Input
                    id={`label_en-${group.id}`}
                    name="label_en"
                    placeholder="e.g. Height (cm)"
                    required
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`value_type-${group.id}`}>Type</Label>
                  <select
                    id={`value_type-${group.id}`}
                    name="value_type"
                    className="flex h-9 w-full rounded-md border border-border/60 bg-background/40 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                    defaultValue="text"
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Yes/No</option>
                    <option value="taxonomy_single">Taxonomy (single)</option>
                    <option value="taxonomy_multi">Taxonomy (multi)</option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`taxonomy_kind-${group.id}`}>Taxonomy kind</Label>
                    <HelpTip content="Only for taxonomy fields. Example: skill, language, talent_type." />
                  </div>
                  <Input id={`taxonomy_kind-${group.id}`} name="taxonomy_kind" placeholder="e.g. skill" disabled={busy} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`label_es-${group.id}`}>Label (ES)</Label>
                  <Input id={`label_es-${group.id}`} name="label_es" placeholder="Optional" disabled={busy} />
                </div>
                <div className="sm:col-span-4 flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={busy}>
                    Create field
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setAddFieldOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          <div className={cn("flex items-end gap-2", ADMIN_EMBEDDED_SURFACE)}>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fields…"
                className="pl-9"
                disabled={busy}
              />
            </div>
            {query ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setQuery("")} disabled={busy}>
                Clear
              </Button>
            ) : null}
          </div>

          <div className={cn("overflow-x-auto rounded-lg border border-border/60", busy && "opacity-60")}>
            {mounted ? (
              <DndContext
                id={`field-group-fields-${group.id}`}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-left">
                      <th className="w-12 pb-2 pl-3 pr-3 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                        Move
                      </th>
                      <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                        Field
                      </th>
                      <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                        Type
                      </th>
                      <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                        Required
                      </th>
                      <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                        Visibility & behavior
                      </th>
                      <th className="pb-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {!dragEnabled ? (
                      <>
                        {filteredCanonical.map((field) => (
                          <StaticFieldRow
                            key={field.id}
                            field={field}
                            disabled={busy}
                            onEditField={onEditField}
                            fixedOrderHint={canonicalRows.some((c) => c.id === field.id)}
                          />
                        ))}
                        {filteredDraggable.map((field) => (
                          <StaticFieldRow
                            key={field.id}
                            field={field}
                            disabled={busy}
                            onEditField={onEditField}
                          />
                        ))}
                      </>
                    ) : group.slug === "basic_info" && canonicalRows.length > 0 ? (
                      <>
                        {canonicalRows.map((field) => (
                          <StaticFieldRow
                            key={field.id}
                            field={field}
                            disabled={busy}
                            onEditField={onEditField}
                            fixedOrderHint
                          />
                        ))}
                        {draggableFields.length > 0 ? (
                          <>
                            <tr className="bg-muted/15">
                              <td
                                colSpan={6}
                                className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                              >
                                Extra fields — drag to reorder (canonical fields stay fixed above)
                              </td>
                            </tr>
                            <SortableContext items={draggableIds} strategy={verticalListSortingStrategy}>
                              {draggableFields.map((field) => (
                                <SortableFieldRow
                                  key={field.id}
                                  field={field}
                                  disabled={busy}
                                  onEditField={onEditField}
                                />
                              ))}
                            </SortableContext>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <SortableContext items={draggableIds} strategy={verticalListSortingStrategy}>
                        {draggableFields.map((field) => (
                          <SortableFieldRow
                            key={field.id}
                            field={field}
                            disabled={busy}
                            onEditField={onEditField}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </tbody>
                </table>
              </DndContext>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left">
                    <th className="w-12 pb-2 pl-3 pr-3 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Move
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Field
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Type
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Required
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Visibility & behavior
                    </th>
                    <th className="pb-2 pr-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredCanonical.map((field) => (
                    <StaticFieldRow
                      key={field.id}
                      field={field}
                      disabled={busy}
                      onEditField={onEditField}
                      fixedOrderHint={canonicalRows.some((c) => c.id === field.id)}
                    />
                  ))}
                  {filteredDraggable.map((field) => (
                    <StaticFieldRow key={field.id} field={field} disabled={busy} onEditField={onEditField} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Delete “{group.name_en}”?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Removing this group changes talent profile sections. Archiving hides it from editors while keeping data;
              permanent delete removes definitions and may affect saved values.
            </Dialog.Description>

            <div className="mt-4 space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Preferred: archive</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Archive removes the group from UI and prevents editing, while preserving history.
                  </p>
                </div>
                <input
                  type="radio"
                  name="delete_mode"
                  checked={deleteMode === "archive"}
                  onChange={() => setDeleteMode("archive")}
                  className="mt-1 h-4 w-4"
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Hard delete (destructive)</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Deletes the group, deletes its field definitions, and field values cascade. This cannot be undone.
                  </p>
                </div>
                <input
                  type="radio"
                  name="delete_mode"
                  checked={deleteMode === "delete"}
                  onChange={() => setDeleteMode("delete")}
                  className="mt-1 h-4 w-4"
                />
              </div>
            </div>

            {groupDelState?.error ? (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {groupDelState.error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={busy}>
                  Cancel
                </Button>
              </Dialog.Close>
              <form action={groupDelAction}>
                <input type="hidden" name="group_id" value={group.id} />
                <input type="hidden" name="mode" value={deleteMode} />
                <Button type="submit" disabled={busy} variant={deleteMode === "delete" ? "destructive" : "default"}>
                  {deleteMode === "delete" ? "Delete group" : "Archive group"}
                </Button>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
