"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { updateFieldDefinitionCore, type FieldAdminActionState } from "./actions";

export type FieldGroupOption = { id: string; name_en: string };

export type AdminFieldDefinitionEditInitial = {
  id: string;
  field_group_id: string | null;
  key: string;
  label_en: string;
  label_es: string | null;
  help_en?: string | null;
  help_es?: string | null;
  value_type: string;
  required_level: "optional" | "recommended" | "required";
  taxonomy_kind: string | null;
};

export function AdminFieldDefinitionEditSheet({
  open,
  onOpenChange,
  initial,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdminFieldDefinitionEditInitial | null;
  groups: FieldGroupOption[];
}) {
  const [state, formAction, pending] = useActionState<FieldAdminActionState, FormData>(
    updateFieldDefinitionCore,
    undefined,
  );

  useEffect(() => {
    if (state?.success) onOpenChange(false);
  }, [state?.success, onOpenChange]);

  return (
    <DashboardEditPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Edit field"
      description="Update the field’s identity and value type. Visibility, filters, and behavior toggles stay on the Fields overview table."
      className="lg:max-w-md"
    >
      {!initial ? (
        <p className="text-sm text-muted-foreground">Select a field to edit.</p>
      ) : (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="field_id" value={initial.id} />

            <div className="space-y-1.5">
              <Label htmlFor="field_group_id">Group</Label>
              <select
                id="field_group_id"
                name="field_group_id"
                defaultValue={initial.field_group_id ?? ""}
                className="h-10 w-full rounded-xl border border-border/60 bg-background/90 px-3 text-sm shadow-sm transition-colors focus-visible:border-[var(--impronta-gold)]/45 focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/25"
                disabled={pending}
              >
                <option value="">(Ungrouped)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name_en}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="label_en">Label (EN)</Label>
                <Input
                  id="label_en"
                  name="label_en"
                  defaultValue={initial.label_en}
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="label_es">Label (ES)</Label>
                <Input
                  id="label_es"
                  name="label_es"
                  defaultValue={initial.label_es ?? ""}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="key">Key</Label>
                <Input id="key" name="key" defaultValue={initial.key} required disabled={pending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="value_type">Value type</Label>
                <select
                  id="value_type"
                  name="value_type"
                  defaultValue={initial.value_type}
                  className="h-10 w-full rounded-xl border border-border/60 bg-background/90 px-3 text-sm shadow-sm transition-colors focus-visible:border-[var(--impronta-gold)]/45 focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/25"
                  disabled={pending}
                >
                  <option value="text">Text</option>
                  <option value="textarea">Long text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Yes/No</option>
                  <option value="taxonomy_single">Taxonomy (single)</option>
                  <option value="taxonomy_multi">Taxonomy (multi)</option>
                  <option value="location">Location</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="taxonomy_kind">Taxonomy kind</Label>
              <Input
                id="taxonomy_kind"
                name="taxonomy_kind"
                defaultValue={initial.taxonomy_kind ?? ""}
                disabled={pending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="help_en">Help (EN)</Label>
              <Input id="help_en" name="help_en" defaultValue={initial.help_en ?? ""} disabled={pending} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="help_es">Help (ES)</Label>
              <Input id="help_es" name="help_es" defaultValue={initial.help_es ?? ""} disabled={pending} />
            </div>

            {state?.error ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {state.error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
        </form>
      )}
    </DashboardEditPanel>
  );
}

