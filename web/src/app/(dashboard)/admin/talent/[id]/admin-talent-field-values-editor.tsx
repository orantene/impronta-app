"use client";

import { useActionState, useMemo } from "react";
import { booleanFieldSentinelName } from "@/lib/field-form-boolean";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HelpTip } from "@/components/ui/help-tip";
import { Badge } from "@/components/ui/badge";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { saveAdminTalentScalarFieldValues, type AdminTalentFieldValuesState } from "@/app/(dashboard)/admin/talent/actions";
import { ADMIN_FORM_CONTROL, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

function supportedScalar(def: FieldDefinitionRow): boolean {
  return ["text", "textarea", "number", "boolean", "date"].includes(def.value_type);
}

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

type FieldValueLite = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

export function AdminTalentFieldValuesEditor({
  talentProfileId,
  groups,
  editableByGroup,
  fieldValues,
}: {
  talentProfileId: string;
  groups: FieldGroupRow[];
  editableByGroup: Map<string, FieldDefinitionRow[]>;
  fieldValues: FieldValueLite[];
}) {
  const [state, action, pending] = useActionState<AdminTalentFieldValuesState, FormData>(
    saveAdminTalentScalarFieldValues,
    undefined,
  );

  const valuesById = useMemo(() => new Map(fieldValues.map((v) => [v.field_definition_id, v] as const)), [fieldValues]);

  const scalarDefs = useMemo(() => {
    const out: FieldDefinitionRow[] = [];
    for (const defs of editableByGroup.values()) {
      out.push(...defs.filter((d) => supportedScalar(d)));
    }
    return out;
  }, [editableByGroup]);

  const scalarIds = scalarDefs.map((d) => d.id);

  if (scalarIds.length === 0) {
    return <p className="text-sm text-muted-foreground">No staff-editable scalar fields are enabled.</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="talent_profile_id" value={talentProfileId} />
      <input type="hidden" name="field_ids" value={scalarIds.join(",")} />

      {state?.error ? (
        <p className="rounded-2xl border border-destructive/35 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-3 text-sm text-emerald-950 dark:text-emerald-50"
          role="status"
        >
          {state.message ?? "Saved."}
        </p>
      ) : null}

      {groups.map((g) => {
        if (g.slug === "basic_info") return null;
        const defs = (editableByGroup.get(g.id) ?? []).filter((d) => supportedScalar(d));
        if (defs.length === 0) return null;
        return (
          <section
            key={g.id}
            className="rounded-2xl border border-border/45 bg-card/40 p-4 shadow-sm transition-colors hover:border-[var(--impronta-gold-border)]/35"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-sm font-medium tracking-wide text-foreground">{g.name_en}</p>
              <Badge variant="outline" className="border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                Staff-editable
              </Badge>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {defs.map((d) => {
                const name = `fv_${d.id}`;
                const v = valuesById.get(d.id);
                const selectOptions = d.value_type === "text" ? readSelectOptions(d) : null;
                return (
                  <div key={d.id} className={d.value_type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={name} className="truncate">
                        {d.label_en}
                      </Label>
                      {d.internal_only ? <HelpTip content="Internal-only. Not shown on public profile." /> : null}
                    </div>
                    {d.value_type === "textarea" ? (
                      <Textarea
                        id={name}
                        name={name}
                        rows={4}
                        defaultValue={v?.value_text ?? ""}
                        disabled={pending}
                        className="min-h-[100px] rounded-2xl border-border/55 bg-background/90 px-3.5 py-3 text-sm shadow-sm focus-visible:border-[var(--impronta-gold)]/45 focus-visible:ring-[var(--impronta-gold)]/20"
                      />
                    ) : d.value_type === "text" ? (
                      selectOptions ? (
                        <select
                          id={name}
                          name={name}
                          defaultValue={v?.value_text ?? ""}
                          disabled={pending}
                          className={cn(ADMIN_FORM_CONTROL, "h-10")}
                        >
                          <option value="">Select…</option>
                          {selectOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label_en ?? o.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id={name}
                          name={name}
                          defaultValue={v?.value_text ?? ""}
                          disabled={pending}
                          className={ADMIN_FORM_CONTROL}
                        />
                      )
                    ) : d.value_type === "number" ? (
                      <Input
                        id={name}
                        name={name}
                        type="number"
                        defaultValue={typeof v?.value_number === "number" ? String(v.value_number) : ""}
                        disabled={pending}
                        className={ADMIN_FORM_CONTROL}
                      />
                    ) : d.value_type === "date" ? (
                      <Input
                        id={name}
                        name={name}
                        type="date"
                        defaultValue={v?.value_date ?? ""}
                        disabled={pending}
                        className={ADMIN_FORM_CONTROL}
                      />
                    ) : d.value_type === "boolean" ? (
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="hidden" name={booleanFieldSentinelName(name)} value="1" />
                        <input
                          id={name}
                          name={name}
                          type="checkbox"
                          value="1"
                          defaultChecked={v?.value_boolean === true}
                          disabled={pending}
                        />
                        Yes
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Button
        type="submit"
        disabled={pending}
        className={cn("h-12 w-full rounded-2xl text-[15px] font-semibold sm:w-auto sm:min-w-[200px]", LUXURY_GOLD_BUTTON_CLASS)}
      >
        {pending ? "Saving…" : "Save field values"}
      </Button>
    </form>
  );
}

