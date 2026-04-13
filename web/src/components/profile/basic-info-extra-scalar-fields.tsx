"use client";

import { useActionState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { saveTalentScalarFieldValues, type TalentFieldValuesState } from "@/app/(dashboard)/talent/field-values-actions";
import {
  saveAdminTalentScalarFieldValues,
  type AdminTalentFieldValuesState,
} from "@/app/(dashboard)/admin/talent/actions";
import { booleanFieldSentinelName } from "@/lib/field-form-boolean";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldDefinitionRow } from "@/lib/fields/types";

type FieldValueLite = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

type SelectOption = { value: string; label_en?: string; label_es?: string | null };

function readSelectOptions(def: FieldDefinitionRow): SelectOption[] | null {
  const cfg = def.config ?? {};
  if (typeof cfg !== "object" || Array.isArray(cfg)) return null;
  const input = (cfg as Record<string, unknown>).input;
  if (input !== "select") return null;
  const options = (cfg as Record<string, unknown>).options;
  if (!Array.isArray(options)) return null;
  const out: SelectOption[] = [];
  for (const o of options) {
    if (!o || typeof o !== "object" || Array.isArray(o)) continue;
    const value = String((o as Record<string, unknown>).value ?? "").trim();
    if (!value) continue;
    out.push({
      value,
      label_en: typeof (o as Record<string, unknown>).label_en === "string" ? ((o as Record<string, unknown>).label_en as string) : undefined,
      label_es: typeof (o as Record<string, unknown>).label_es === "string" ? ((o as Record<string, unknown>).label_es as string) : null,
    });
  }
  return out.length ? out : null;
}

function supportedScalar(def: FieldDefinitionRow): boolean {
  return ["text", "textarea", "number", "boolean", "date"].includes(def.value_type);
}

/**
 * Extra (non-canonical) scalar fields in the Basic Information group — rendered after the canonical profile block.
 */
export function BasicInfoExtraScalarFieldsAdmin({
  talentProfileId,
  definitions,
  fieldValues,
}: {
  talentProfileId: string;
  definitions: FieldDefinitionRow[];
  fieldValues: FieldValueLite[];
}) {
  const [state, action, pending] = useActionState<AdminTalentFieldValuesState, FormData>(
    saveAdminTalentScalarFieldValues,
    undefined,
  );

  const defs = useMemo(
    () => definitions.filter((d) => supportedScalar(d)).sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)),
    [definitions],
  );
  const ids = defs.map((d) => d.id);
  const valuesById = useMemo(() => new Map(fieldValues.map((v) => [v.field_definition_id, v] as const)), [fieldValues]);

  if (defs.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-border/40 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--impronta-muted)]">
            Additional basic information
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Agency-defined fields in Basic Information (after canonical profile fields). Visibility on the public page is controlled in Admin → Fields.
          </p>
        </div>
        <Badge variant="outline" className="border-border/60 text-xs">
          Staff
        </Badge>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.success ? <p className="text-sm text-emerald-400">{state.message ?? "Saved."}</p> : null}

      <form action={action} className="space-y-4">
        <input type="hidden" name="talent_profile_id" value={talentProfileId} />
        <input type="hidden" name="field_ids" value={ids.join(",")} />
        <div className="grid gap-4 sm:grid-cols-2">
          {defs.map((d) => (
            <ScalarControl key={d.id} def={d} pending={pending} valuesById={valuesById} />
          ))}
        </div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save additional fields"}
        </Button>
      </form>
    </div>
  );
}

export function BasicInfoExtraScalarFieldsTalent({
  talentProfileId,
  definitions,
  fieldValues,
  onDirtyChange,
}: {
  talentProfileId: string;
  definitions: FieldDefinitionRow[];
  fieldValues: FieldValueLite[];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [state, action, pending] = useActionState<TalentFieldValuesState, FormData>(
    saveTalentScalarFieldValues,
    undefined,
  );

  const defs = useMemo(
    () => definitions.filter((d) => supportedScalar(d)).sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)),
    [definitions],
  );
  const ids = defs.map((d) => d.id);
  const valuesById = useMemo(() => new Map(fieldValues.map((v) => [v.field_definition_id, v] as const)), [fieldValues]);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      onDirtyChange?.(false);
      toast.success(state.message ?? "Saved.");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onDirtyChange]);

  if (defs.length === 0) return null;

  return (
    <div className="space-y-4 border-t border-border/40 pt-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--impronta-muted)]">
          Additional basic information
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Extra fields your agency added. They may or may not appear on your public page.
        </p>
      </div>

      <form
        action={action}
        className="space-y-4"
        onChange={() => {
          if (!pending) onDirtyChange?.(true);
        }}
      >
        <input type="hidden" name="talent_profile_id" value={talentProfileId} />
        <input type="hidden" name="field_ids" value={ids.join(",")} />
        <div className="grid gap-4 sm:grid-cols-2">
          {defs.map((d) => (
            <ScalarControl key={d.id} def={d} pending={pending} valuesById={valuesById} />
          ))}
        </div>
        <Button type="submit" disabled={pending} size="sm" variant="secondary">
          {pending ? "Saving…" : "Save additional fields"}
        </Button>
      </form>
    </div>
  );
}

function ScalarControl({
  def: d,
  pending,
  valuesById,
}: {
  def: FieldDefinitionRow;
  pending: boolean;
  valuesById: Map<string, FieldValueLite>;
}) {
  const name = `fv_${d.id}`;
  const v = valuesById.get(d.id);
  const selectOptions = d.value_type === "text" ? readSelectOptions(d) : null;

  return (
    <div className={cn("space-y-2", d.value_type === "textarea" && "sm:col-span-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={name}>{d.label_en}</Label>
        {d.internal_only ? (
          <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Internal
          </span>
        ) : null}
        {!d.public_visible ? (
          <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Not on public page
          </span>
        ) : null}
      </div>
      {d.value_type === "textarea" ? (
        <Textarea id={name} name={name} rows={4} defaultValue={v?.value_text ?? ""} disabled={pending} />
      ) : d.value_type === "text" ? (
        selectOptions ? (
          <select
            id={name}
            name={name}
            defaultValue={v?.value_text ?? ""}
            disabled={pending}
            className="h-10 w-full rounded-md border border-border/60 bg-background/40 px-3 text-sm text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select…</option>
            {selectOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label_en ?? o.value}
              </option>
            ))}
          </select>
        ) : (
          <Input id={name} name={name} defaultValue={v?.value_text ?? ""} disabled={pending} />
        )
      ) : d.value_type === "number" ? (
        <Input
          id={name}
          name={name}
          type="number"
          defaultValue={typeof v?.value_number === "number" ? String(v.value_number) : ""}
          disabled={pending}
        />
      ) : d.value_type === "date" ? (
        <Input id={name} name={name} type="date" defaultValue={v?.value_date ?? ""} disabled={pending} />
      ) : d.value_type === "boolean" ? (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="hidden" name={booleanFieldSentinelName(name)} value="1" />
          <input id={name} name={name} type="checkbox" value="1" defaultChecked={v?.value_boolean === true} disabled={pending} />
          Yes
        </label>
      ) : null}
    </div>
  );
}
