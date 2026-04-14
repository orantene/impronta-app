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
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { ChevronDown, GripVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTip } from "@/components/ui/help-tip";
import {
  ADMIN_EMBEDDED_SURFACE,
  ADMIN_FORM_CONTROL,
  ADMIN_GROUP_SECTION_TITLE,
  ADMIN_GROUP_TOOLBAR_BUTTON,
  ADMIN_MUTED_INLINE_SURFACE,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import {
  archiveAllTermsInKind,
  bulkToggleArchiveTaxonomyTerms,
  createTaxonomyTerm,
  deleteTaxonomyTerm,
  reorderTaxonomyKind,
  restoreAllTermsInKind,
  updateTaxonomyTerm,
  type TaxonomyActionState,
} from "./actions";
import { ArchiveTermButton, RestoreTermButton } from "./taxonomy-forms";

function ReadOnlyTermRow({ term }: { term: AdminTaxonomyTerm }) {
  return (
    <tr className="transition-colors hover:bg-[var(--impronta-gold-border)]/40">
      <td className="py-2 pr-4 align-middle">
        <span className="font-mono text-xs text-[var(--impronta-muted)]">{term.slug}</span>
      </td>
      <td className="py-2 pr-4 align-middle">
        <div className="truncate text-sm text-foreground" title={term.name_en}>
          {term.name_en}
        </div>
      </td>
      <td className="py-2 pr-4 align-middle text-muted-foreground">
        <div className="truncate text-xs" title={term.name_es ?? ""}>
          {term.name_es ?? "—"}
        </div>
      </td>
      <td className="py-2 pr-4 align-middle text-xs text-muted-foreground tabular-nums">{term.sort_order}</td>
      <td className="py-2 text-right align-middle text-xs text-muted-foreground">Synced</td>
    </tr>
  );
}

export type AdminTaxonomyTerm = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  archived_at: string | null;
};

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function SortableRow({
  term,
  selected,
  onSelect,
  disabled,
  onEdit,
  onRequestDelete,
}: {
  term: AdminTaxonomyTerm;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  disabled: boolean;
  onEdit: (term: AdminTaxonomyTerm) => void;
  onRequestDelete: (term: AdminTaxonomyTerm) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: term.id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-colors hover:bg-[var(--impronta-gold-border)]",
        isDragging && "bg-[var(--impronta-gold-border)]/60",
      )}
    >
      <td className="py-2 pr-3 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          disabled={disabled}
          aria-label={`Select ${term.slug}`}
          className="h-4 w-4 rounded border-border/60 bg-transparent"
        />
      </td>
      <td className="py-2 pr-3 align-middle">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 text-muted-foreground hover:text-foreground disabled:opacity-50",
            disabled && "pointer-events-none",
          )}
          aria-label="Drag to reorder"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </td>
      <td className="py-2 pr-4 align-middle">
        <span className="font-mono text-xs text-[var(--impronta-muted)]">{term.slug}</span>
      </td>
      <td className="py-2 pr-4 align-middle">
        <div className="truncate text-sm text-foreground" title={term.name_en}>
          {term.name_en}
        </div>
      </td>
      <td className="py-2 pr-4 align-middle text-muted-foreground">
        <div className="truncate text-xs" title={term.name_es ?? ""}>
          {term.name_es ?? "—"}
        </div>
      </td>
      <td className="py-2 pr-4 align-middle text-xs text-muted-foreground">{term.sort_order}</td>
      <td className="py-2 text-right align-middle">
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            disabled={disabled}
            onClick={() => onEdit(term)}
          >
            Edit
          </Button>
          {term.archived_at ? (
            <RestoreTermButton id={term.id} disabled={disabled} />
          ) : (
            <ArchiveTermButton id={term.id} disabled={disabled} />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={() => onRequestDelete(term)}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function TaxonomyKindPanel({
  title,
  kind,
  terms,
  showArchived,
  systemManaged = false,
  defaultExpanded = false,
}: {
  title: string;
  kind: string;
  terms: AdminTaxonomyTerm[];
  showArchived: boolean;
  systemManaged?: boolean;
  /** When true, section starts expanded (used for system-managed location mirrors). */
  defaultExpanded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingGroupMeta, setEditingGroupMeta] = useState(false);
  const [addTermOpen, setAddTermOpen] = useState(false);
  const [confirmGroupOpen, setConfirmGroupOpen] = useState(false);
  const [termBeingEdited, setTermBeingEdited] = useState<AdminTaxonomyTerm | null>(null);
  const [termBeingDeleted, setTermBeingDeleted] = useState<AdminTaxonomyTerm | null>(null);

  const [createState, createAction, createPending] = useActionState<TaxonomyActionState, FormData>(
    createTaxonomyTerm,
    undefined,
  );
  const [reorderState, reorderAction, reorderPending] = useActionState<TaxonomyActionState, FormData>(
    reorderTaxonomyKind,
    undefined,
  );
  const [bulkState, bulkAction, bulkPending] = useActionState<TaxonomyActionState, FormData>(
    bulkToggleArchiveTaxonomyTerms,
    undefined,
  );
  const [updState, updAction, updPending] = useActionState<TaxonomyActionState, FormData>(
    updateTaxonomyTerm,
    undefined,
  );
  const [delState, delAction, delPending] = useActionState<TaxonomyActionState, FormData>(
    deleteTaxonomyTerm,
    undefined,
  );
  const [archAllState, archAllAction, archAllPending] = useActionState<TaxonomyActionState, FormData>(
    archiveAllTermsInKind,
    undefined,
  );
  const [restAllState, restAllAction, restAllPending] = useActionState<TaxonomyActionState, FormData>(
    restoreAllTermsInKind,
    undefined,
  );

  useEffect(() => {
    if (createState?.success) setAddTermOpen(false);
  }, [createState?.success]);

  useEffect(() => {
    if (updState?.success) setTermBeingEdited(null);
  }, [updState?.success]);

  useEffect(() => {
    if (delState?.success) setTermBeingDeleted(null);
  }, [delState?.success]);

  useEffect(() => {
    if (archAllState?.success || restAllState?.success) setConfirmGroupOpen(false);
  }, [archAllState?.success, restAllState?.success]);

  const activeTermCount = useMemo(() => terms.filter((t) => !t.archived_at).length, [terms]);
  const archivedTermCount = useMemo(() => terms.filter((t) => t.archived_at).length, [terms]);

  const busy =
    !systemManaged &&
    (createPending ||
      reorderPending ||
      bulkPending ||
      updPending ||
      delPending ||
      archAllPending ||
      restAllPending);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terms;
    return terms.filter((t) => {
      const hay = `${t.slug} ${t.name_en} ${t.name_es ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, terms]);

  const orderedIds = filtered.map((t) => t.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (systemManaged) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(filtered, oldIndex, newIndex);
    const nextIds = next.map((t) => t.id);

    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("ordered_ids", nextIds.join(","));
    startTransition(() => {
      reorderAction(fd);
    });
  };

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedCount = selectedIds.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={ADMIN_GROUP_SECTION_TITLE}>
              {title}
            </h2>
            <Badge variant="secondary" className="h-6">
              {terms.length} term{terms.length !== 1 ? "s" : ""}
            </Badge>
            {systemManaged ? (
              <Badge variant="outline" className="h-6 border-border/60">
                System managed
              </Badge>
            ) : null}
            <HelpTip
              content={
                systemManaged
                  ? "These terms are derived for filtering and labels. Manage canonical locations in /admin/locations."
                  : "Reorder controls scan order. Archive preserves history."
              }
            />
          </div>
          {(createState?.error ||
            reorderState?.error ||
            bulkState?.error ||
            updState?.error ||
            delState?.error ||
            archAllState?.error ||
            restAllState?.error) && (
            <p className="mt-2 text-sm text-destructive">
              {createState?.error ??
                reorderState?.error ??
                bulkState?.error ??
                updState?.error ??
                delState?.error ??
                archAllState?.error ??
                restAllState?.error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!systemManaged ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_GROUP_TOOLBAR_BUTTON}
                disabled={busy}
                onClick={() => {
                  setEditingGroupMeta((v) => {
                    const next = !v;
                    if (next) setCollapsed(false);
                    return next;
                  });
                }}
              >
                <Pencil className="size-4" aria-hidden />
                {editingGroupMeta ? "Close" : "Edit group"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_GROUP_TOOLBAR_BUTTON}
                disabled={busy}
                onClick={() => {
                  setAddTermOpen((prev) => {
                    const next = !prev;
                    if (next) setCollapsed(false);
                    return next;
                  });
                }}
                aria-expanded={addTermOpen}
              >
                <Plus className="size-4" aria-hidden />
                {addTermOpen ? "Close" : "Add term"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(ADMIN_GROUP_TOOLBAR_BUTTON, "text-muted-foreground hover:text-destructive")}
                disabled={busy || (!showArchived && activeTermCount === 0) || (showArchived && archivedTermCount === 0)}
                onClick={() => setConfirmGroupOpen(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            </>
          ) : null}
          {!systemManaged && selectedCount > 0 ? (
            <form
              action={bulkAction}
              onSubmit={() => setSelected(new Set())}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="term_ids" value={selectedIds.join(",")} />
              <input
                type="hidden"
                name="next_archived"
                value={showArchived ? "0" : "1"}
              />
              <Button type="submit" size="sm" variant="outline" disabled={busy}>
                {showArchived ? "Restore selected" : "Archive selected"}
              </Button>
            </form>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ADMIN_GROUP_TOOLBAR_BUTTON}
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
          >
            <ChevronDown className={cn("size-4 transition-transform", collapsed ? "" : "rotate-180")} aria-hidden />
            {collapsed ? "Expand" : "Collapse"}
          </Button>
        </div>
      </div>

      {!collapsed ? (
        <>
          {!systemManaged && editingGroupMeta ? (
            <div className={cn(ADMIN_EMBEDDED_SURFACE, "text-sm text-muted-foreground")}>
              <p className="font-medium text-foreground">Group details</p>
              <p className="mt-2">
                <span className="text-foreground">Display title:</span> {title}
              </p>
              <p className="mt-1">
                <span className="text-foreground">Kind key (schema):</span>{" "}
                <span className="font-mono text-xs text-[var(--impronta-muted)]">{kind}</span>
              </p>
              <p className="mt-2">
                Taxonomy kinds are fixed in the database. This screen manages <span className="font-medium text-foreground">terms</span>{" "}
                inside the group (slug, labels, order). Adding a new kind requires a migration.
              </p>
            </div>
          ) : null}

          {systemManaged ? (
            <div className={cn(ADMIN_MUTED_INLINE_SURFACE, "text-sm text-muted-foreground")}>
              <span className="font-medium text-foreground">Managed from Locations.</span>
              {" "}
              Use
              {" "}
              <Link href="/admin/locations" className="font-medium text-[var(--impronta-gold)] underline underline-offset-4">
                /admin/locations
              </Link>
              {" "}
              to add, rename, archive, or restore canonical locations. These taxonomy terms are derived support terms for labels and filtering.
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {!systemManaged && addTermOpen ? (
              <form
                action={createAction}
                className={cn("flex flex-wrap items-end gap-2", ADMIN_MUTED_INLINE_SURFACE)}
              >
                <input type="hidden" name="kind" value={kind} />
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name (EN)</label>
                  <Input name="name_en" placeholder="Add term…" required disabled={busy} className={ADMIN_FORM_CONTROL} />
                </div>
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name (ES)</label>
                  <Input name="name_es" placeholder="Optional" disabled={busy} className={ADMIN_FORM_CONTROL} />
                </div>
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Slug</label>
                  <Input
                    name="slug"
                    placeholder="auto from name"
                    disabled={busy}
                    className={ADMIN_FORM_CONTROL}
                    onBlur={(e) => {
                      const slug = e.currentTarget.value.trim();
                      if (slug) return;
                      const form = e.currentTarget.form;
                      const nameInput = form?.querySelector<HTMLInputElement>('input[name="name_en"]');
                      const next = slugify(nameInput?.value ?? "");
                      if (next) e.currentTarget.value = next;
                    }}
                  />
                </div>
                <div className="w-[120px] space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort</label>
                  <Input
                    name="sort_order"
                    type="number"
                    min={0}
                    defaultValue={0}
                    disabled={busy}
                    className={ADMIN_FORM_CONTROL}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={busy}>
                    {createPending ? "Adding…" : "Create term"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAddTermOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : !systemManaged ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 p-3 text-sm text-muted-foreground">
                Use <span className="font-medium text-foreground">Add term</span> in the header to open the form. Edit slug
                and labels per row with <span className="font-medium text-foreground">Edit</span>, or remove a term with{" "}
                <span className="font-medium text-foreground">Delete</span> (permanent).
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/5 p-3 text-sm text-muted-foreground">
                Terms are created and updated automatically when you manage rows in{" "}
                <Link href="/admin/locations" className="font-medium text-[var(--impronta-gold)] underline underline-offset-4">
                  Locations
                </Link>
                . Manual add, reorder, archive, and restore are disabled so admin never maintains a parallel location list here.
              </div>
            )}

            <div className={cn("flex items-end gap-2", ADMIN_MUTED_INLINE_SURFACE)}>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search in this group…"
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
          </div>

          <div className={cn("overflow-x-auto rounded-lg border border-border/60", busy && "opacity-60")}>
            {systemManaged ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left">
                    <th className="pb-2 pl-3 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Slug
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Name (EN)
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Name (ES)
                    </th>
                    <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Order
                    </th>
                    <th className="pb-2 pr-3 text-right text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filtered.map((term) => (
                    <ReadOnlyTermRow key={term.id} term={term} />
                  ))}
                </tbody>
              </table>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left">
                        <th className="w-10 pb-2 pl-3 pr-3 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          #
                        </th>
                        <th className="w-10 pb-2 pr-3 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Move
                        </th>
                        <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Slug
                        </th>
                        <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Name (EN)
                        </th>
                        <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Name (ES)
                        </th>
                        <th className="pb-2 pr-4 text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Order
                        </th>
                        <th className="pb-2 pr-3 text-right text-sm font-medium uppercase tracking-wider text-[var(--impronta-muted)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {filtered.map((term) => (
                        <SortableRow
                          key={term.id}
                          term={term}
                          selected={selected.has(term.id)}
                          disabled={busy}
                          onEdit={setTermBeingEdited}
                          onRequestDelete={setTermBeingDeleted}
                          onSelect={(checked) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(term.id);
                              else next.delete(term.id);
                              return next;
                            });
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      ) : null}

      <Dialog.Root open={!!termBeingEdited} onOpenChange={(open) => !open && setTermBeingEdited(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-foreground">Edit term</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Slug must stay unique within this group. Changing slug updates how URLs and filters reference this term.
            </Dialog.Description>
            {termBeingEdited ? (
              <form key={termBeingEdited.id} action={updAction} className="mt-4 grid gap-3">
                <input type="hidden" name="term_id" value={termBeingEdited.id} />
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-slug-${termBeingEdited.id}`}>Slug</Label>
                  <Input
                    id={`edit-slug-${termBeingEdited.id}`}
                    name="slug"
                    required
                    disabled={updPending}
                    defaultValue={termBeingEdited.slug}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-name-en-${termBeingEdited.id}`}>Name (EN)</Label>
                  <Input
                    id={`edit-name-en-${termBeingEdited.id}`}
                    name="name_en"
                    required
                    disabled={updPending}
                    defaultValue={termBeingEdited.name_en}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-name-es-${termBeingEdited.id}`}>Name (ES)</Label>
                  <Input
                    id={`edit-name-es-${termBeingEdited.id}`}
                    name="name_es"
                    disabled={updPending}
                    defaultValue={termBeingEdited.name_es ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-sort-${termBeingEdited.id}`}>Sort order</Label>
                  <Input
                    id={`edit-sort-${termBeingEdited.id}`}
                    name="sort_order"
                    type="number"
                    min={0}
                    disabled={updPending}
                    defaultValue={termBeingEdited.sort_order}
                  />
                </div>
                {updState?.error ? <p className="text-sm text-destructive">{updState.error}</p> : null}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Dialog.Close asChild>
                    <Button type="button" variant="outline" disabled={updPending}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" disabled={updPending}>
                    {updPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!termBeingDeleted} onOpenChange={(open) => !open && setTermBeingDeleted(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-foreground">Delete term permanently?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {termBeingDeleted ? (
                <>
                  This removes <span className="font-mono text-foreground">{termBeingDeleted.slug}</span> from the
                  database. Links from talent profiles to this term will be removed. This cannot be undone.
                </>
              ) : null}
            </Dialog.Description>
            {termBeingDeleted ? (
              <form key={termBeingDeleted.id} action={delAction} className="mt-5 flex flex-wrap justify-end gap-2">
                <input type="hidden" name="term_id" value={termBeingDeleted.id} />
                {delState?.error ? (
                  <p className="w-full text-sm text-destructive">{delState.error}</p>
                ) : null}
                <Dialog.Close asChild>
                  <Button type="button" variant="outline" disabled={delPending}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" variant="destructive" disabled={delPending}>
                  {delPending ? "Deleting…" : "Delete permanently"}
                </Button>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={confirmGroupOpen} onOpenChange={setConfirmGroupOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-foreground">
              {showArchived ? `Restore all archived terms in “${title}”?` : `Archive all active terms in “${title}”?`}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              {showArchived
                ? `This will restore every archived term in this group (${archivedTermCount} in this view). Individual restores remain available per row.`
                : `This will archive every active term in this group (${activeTermCount} in this view). You can restore them from the archived view or per row.`}
            </Dialog.Description>
            {archAllState?.error || restAllState?.error ? (
              <p className="mt-3 text-sm text-destructive">{archAllState?.error ?? restAllState?.error}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={archAllPending || restAllPending}>
                  Cancel
                </Button>
              </Dialog.Close>
              {showArchived ? (
                <form action={restAllAction}>
                  <input type="hidden" name="kind" value={kind} />
                  <Button type="submit" disabled={archAllPending || restAllPending}>
                    {restAllPending ? "Restoring…" : "Restore all"}
                  </Button>
                </form>
              ) : (
                <form action={archAllAction}>
                  <input type="hidden" name="kind" value={kind} />
                  <Button type="submit" variant="destructive" disabled={archAllPending || restAllPending}>
                    {archAllPending ? "Archiving…" : "Archive all"}
                  </Button>
                </form>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
