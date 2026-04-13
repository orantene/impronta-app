"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { saveTalentScalarFieldValues, type TalentFieldValuesState } from "@/app/(dashboard)/talent/field-values-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldDefinitionRow, FieldGroupRow } from "@/lib/fields/types";
import { booleanFieldSentinelName } from "@/lib/field-form-boolean";
import { TalentTaxonomyEditor } from "@/app/(dashboard)/talent/talent-taxonomy-editor";
import type { TalentEditableTaxonomyField, TalentTaxonomyTermOption } from "@/lib/talent-dashboard-data";

const editPanelCard =
  "rounded-2xl border border-border/40 bg-card/70 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]";

const editPanelTitle = "text-[15px] font-semibold tracking-tight text-foreground";

const editPanelInput =
  "h-11 rounded-xl border-border/60 bg-background/90 px-3.5 text-[15px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const editPanelTextarea =
  "min-h-[88px] rounded-2xl border-border/60 bg-background/90 px-3.5 py-3 text-[15px] leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const editPanelSelect =
  "h-11 w-full rounded-xl border border-border/60 bg-background/90 px-3.5 text-[15px] shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/25";

/** Submit from the panel bottom bar via `form="…"` (see TalentEditPanel `bottomBar`). */
export const TALENT_SCALAR_FIELD_FORM_ID = "talent-field-values-scalar-form";

function pickLabel(locale: "en" | "es", en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en.trim();
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

function supportedScalar(def: FieldDefinitionRow): boolean {
  return ["text", "textarea", "number", "boolean", "date"].includes(def.value_type);
}

type FieldValueLite = {
  field_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

export function TalentFieldValuesEditor({
  talentProfileId,
  groups,
  editableByGroup,
  scalarEditableIds,
  fieldValues,
  taxonomy,
  onDirtyChange,
  onPendingChange,
  locale = "en",
  focusGroupSlug = null,
}: {
  talentProfileId: string;
  groups: FieldGroupRow[];
  editableByGroup: Map<string, FieldDefinitionRow[]>;
  scalarEditableIds: string[];
  fieldValues: FieldValueLite[];
  taxonomy: {
    allTerms: TalentTaxonomyTermOption[];
    assignedIds: string[];
    primaryTalentTypeId: string | null;
    editableFields: TalentEditableTaxonomyField[];
  };
  onDirtyChange?: (dirty: boolean) => void;
  /** For disabling an external submit control wired with `form={TALENT_SCALAR_FIELD_FORM_ID}`. */
  onPendingChange?: (pending: boolean) => void;
  locale?: "en" | "es";
  /** When set, only scalar + taxonomy fields for this group are shown (sheet deep-link). */
  focusGroupSlug?: string | null;
}) {
  const [state, action, pending] = useActionState<TalentFieldValuesState, FormData>(
    saveTalentScalarFieldValues,
    undefined,
  );
  const dirtyRef = useRef(false);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      dirtyRef.current = false;
      onDirtyChange?.(false);
      toast.success(state.message ?? "Fields saved.");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, onDirtyChange]);

  const valuesByFieldId = useMemo(() => {
    return new Map(fieldValues.map((v) => [v.field_definition_id, v] as const));
  }, [fieldValues]);

  const focusGroupId = useMemo(() => {
    const s = focusGroupSlug?.trim();
    if (!s) return null;
    return groups.find((g) => g.slug === s)?.id ?? null;
  }, [focusGroupSlug, groups]);

  const effectiveGroups = useMemo(() => {
    if (!focusGroupId) return groups;
    return groups.filter((g) => g.id === focusGroupId);
  }, [groups, focusGroupId]);

  const effectiveEditableByGroup = useMemo(() => {
    if (!focusGroupId) return editableByGroup;
    const next = new Map<string, FieldDefinitionRow[]>();
    const arr = editableByGroup.get(focusGroupId);
    if (arr?.length) next.set(focusGroupId, arr);
    return next;
  }, [editableByGroup, focusGroupId]);

  const effectiveScalarIds = useMemo(() => {
    if (!focusGroupId) return scalarEditableIds;
    const inGroup = new Set(
      (editableByGroup.get(focusGroupId) ?? []).filter((d) => supportedScalar(d)).map((d) => d.id),
    );
    return scalarEditableIds.filter((id) => inGroup.has(id));
  }, [scalarEditableIds, editableByGroup, focusGroupId]);

  const taxonomyEditableFields = useMemo(() => {
    if (!focusGroupId) return taxonomy.editableFields;
    const defs = editableByGroup.get(focusGroupId) ?? [];
    const keys = new Set(
      defs
        .filter((d) => d.value_type === "taxonomy_single" || d.value_type === "taxonomy_multi")
        .map((d) => d.key),
    );
    return taxonomy.editableFields.filter((f) => keys.has(f.key));
  }, [taxonomy.editableFields, editableByGroup, focusGroupId]);

  const scalarDefsByGroup = useMemo(() => {
    const map = new Map<string, FieldDefinitionRow[]>();
    for (const [gid, defs] of effectiveEditableByGroup.entries()) {
      const scalar = defs.filter((d) => supportedScalar(d));
      if (scalar.length) map.set(gid, scalar);
    }
    return map;
  }, [effectiveEditableByGroup]);

  const hasScalar = effectiveScalarIds.length > 0;
  const showTaxonomyBlock = taxonomyEditableFields.length > 0;

  return (
    <div className="space-y-6">
      {/* Taxonomy toggles use their own server actions / useActionState per term; scalar fields use a separate form — failures are isolated (toast only). */}
      {showTaxonomyBlock ? (
        <section className="space-y-3">
          <TalentTaxonomyEditor
            variant="embedded"
            allTerms={taxonomy.allTerms}
            assignedIds={taxonomy.assignedIds}
            primaryTalentTypeId={taxonomy.primaryTalentTypeId}
            editableFields={taxonomyEditableFields}
            locale={locale}
          />
        </section>
      ) : null}

      {!hasScalar ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center text-sm leading-relaxed text-muted-foreground">
          No editable fields in this section right now. If you expected measurements or details here, ask
          your agency to enable them.
        </div>
      ) : (
        <form
          id={TALENT_SCALAR_FIELD_FORM_ID}
          action={action}
          className="space-y-5"
          onChange={() => {
            if (pending) return;
            if (dirtyRef.current) return;
            dirtyRef.current = true;
            onDirtyChange?.(true);
          }}
        >
          <input type="hidden" name="talent_profile_id" value={talentProfileId} />
          <input type="hidden" name="field_ids" value={effectiveScalarIds.join(",")} />

          {effectiveGroups.map((g) => {
            if (g.slug === "basic_info") return null;
            const defs = scalarDefsByGroup.get(g.id) ?? [];
            if (defs.length === 0) return null;
            return (
              <section key={g.id} className={editPanelCard}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={editPanelTitle}>{pickLabel(locale, g.name_en, g.name_es)}</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {defs.length} field{defs.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-lg border-border/50 font-medium">
                    Fields
                  </Badge>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {defs.map((d) => {
                    const v = valuesByFieldId.get(d.id);
                    const label = pickLabel(locale, d.label_en, d.label_es);
                    const requiredTone =
                      d.required_level === "required"
                        ? "Required"
                        : d.required_level === "recommended"
                          ? "Recommended"
                          : null;
                    const help = pickLabel(locale, d.help_en ?? "", d.help_es ?? null);
                    const selectOptions = d.value_type === "text" ? readSelectOptions(d) : null;

                    const name = `fv_${d.id}`;

                    return (
                      <div key={d.id} className={cn("space-y-2", d.value_type === "textarea" && "sm:col-span-2")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Label htmlFor={name} className="text-sm font-medium">
                            {label}
                          </Label>
                          {requiredTone ? (
                            <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {requiredTone}
                            </span>
                          ) : null}
                          {d.internal_only ? (
                            <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Internal
                            </span>
                          ) : null}
                        </div>
                        {d.value_type === "textarea" ? (
                          <Textarea
                            id={name}
                            name={name}
                            rows={4}
                            className={editPanelTextarea}
                            defaultValue={v?.value_text ?? ""}
                            placeholder={help || undefined}
                            disabled={pending}
                          />
                        ) : d.value_type === "text" ? (
                          selectOptions ? (
                            <div className="space-y-2">
                              <select
                                id={name}
                                name={name}
                                defaultValue={v?.value_text ?? ""}
                                disabled={pending}
                                className={editPanelSelect}
                              >
                                <option value="">{help || "Select…"}</option>
                                {selectOptions.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {pickLabel(locale, o.label_en ?? o.value, o.label_es ?? null)}
                                  </option>
                                ))}
                              </select>
                              {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
                            </div>
                          ) : (
                            <Input
                              id={name}
                              name={name}
                              defaultValue={v?.value_text ?? ""}
                              placeholder={help || undefined}
                              disabled={pending}
                              className={editPanelInput}
                            />
                          )
                        ) : d.value_type === "number" ? (
                          <Input
                            id={name}
                            name={name}
                            type="number"
                            inputMode="numeric"
                            defaultValue={typeof v?.value_number === "number" ? String(v.value_number) : ""}
                            placeholder={help || undefined}
                            disabled={pending}
                            className={editPanelInput}
                          />
                        ) : d.value_type === "date" ? (
                          <Input
                            id={name}
                            name={name}
                            type="date"
                            defaultValue={v?.value_date ?? ""}
                            disabled={pending}
                            className={editPanelInput}
                          />
                        ) : d.value_type === "boolean" ? (
                          <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-3.5 py-3">
                            <input type="hidden" name={booleanFieldSentinelName(name)} value="1" />
                            <input
                              id={name}
                              name={name}
                              type="checkbox"
                              value="1"
                              defaultChecked={v?.value_boolean === true}
                              disabled={pending}
                              className="h-4 w-4 rounded border-border/60 bg-transparent"
                            />
                            <span className="text-sm text-muted-foreground">{help || "Enable"}</span>
                          </div>
                        ) : null}
                        {d.value_type !== "boolean" && d.value_type !== "text" && help ? (
                          <p className="text-xs text-muted-foreground">{help}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </form>
      )}
    </div>
  );
}

