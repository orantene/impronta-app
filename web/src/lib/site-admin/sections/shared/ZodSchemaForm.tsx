"use client";

/**
 * Phase 3 — auto-rendering form for a Zod-described section schema.
 *
 * Given a section's v1 schema and the current draft props, renders an
 * inspector form by walking the introspected field list. Supported:
 * text / textarea / number / boolean / enum / url / email / nested
 * object / array-of-objects / array-of-strings.
 *
 * The form is a "fallback by default" surface — sections that need
 * custom UX (e.g. featured_talent's roster source toggles, hero's
 * slider) keep their hand-written Editor.tsx. New simple sections can
 * skip Editor.tsx entirely and rely on this. The schema is the source
 * of truth either way.
 *
 * Hint-based primitive swaps (no per-section configuration):
 *   - hint: "image_url"  → MediaPicker + URL input
 *   - hint: "alt_text"   → AltTextField (sibling URL field needed on parent)
 *   - hint: "href"       → LinkPicker
 *   - hint: "rich_text"  → larger textarea (we don't render the inline
 *                          markers preview here — same trade-off as the
 *                          existing hand-written editors).
 *
 * The `presentation` field is rendered separately by the parent (calls
 * PresentationPanel directly). This component skips it.
 */

import type { IntrospectedField } from "./zod-introspect";
import { introspectSectionSchema } from "./zod-introspect";
import { LinkPicker } from "./LinkPicker";
import { MediaPicker } from "./MediaPicker";
import { AltTextField } from "./AltTextField";
import { AiRewriteButton } from "@/components/edit-chrome/inspectors/AiRewriteButton";

import type { z } from "zod";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL =
  "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

interface ZodSchemaFormProps<T> {
  schema: z.ZodType<T>;
  value: Partial<T>;
  onChange: (next: Partial<T>) => void;
  tenantId?: string;
  /** Optional: skip these top-level keys (extend the section's manual UI). */
  excludeKeys?: ReadonlyArray<string>;
  /** Required to enable the per-field AI rewrite affordance. */
  sectionTypeKey?: string;
}

export function ZodSchemaForm<T>({
  schema,
  value,
  onChange,
  tenantId,
  excludeKeys,
  sectionTypeKey,
}: ZodSchemaFormProps<T>) {
  const fields = introspectSectionSchema(schema);
  const props = (value ?? {}) as Record<string, unknown>;
  const set = (next: Record<string, unknown>) =>
    onChange({ ...props, ...next } as Partial<T>);

  return (
    <div className="flex flex-col gap-4">
      {fields
        .filter((f) => !excludeKeys?.includes(f.name))
        .map((f) => (
          <FieldNode
            key={f.name}
            field={f}
            value={props[f.name]}
            siblings={props}
            onChange={(v) => set({ [f.name]: v })}
            tenantId={tenantId}
            sectionTypeKey={sectionTypeKey}
          />
        ))}
    </div>
  );
}

interface FieldNodeProps {
  field: IntrospectedField;
  value: unknown;
  siblings: Record<string, unknown>;
  onChange: (next: unknown) => void;
  tenantId?: string;
  sectionTypeKey?: string;
}

function FieldNode({
  field,
  value,
  siblings,
  onChange,
  tenantId,
  sectionTypeKey,
}: FieldNodeProps) {
  // ---- Hint-based primitive swaps -------------------------------------
  if (field.hint === "href") {
    return (
      <div className={FIELD}>
        <span className={LABEL}>
          {field.label}
          {field.optional ? "" : " *"}
        </span>
        <LinkPicker
          value={(value as string) ?? ""}
          onChange={(next) => onChange(next || (field.optional ? undefined : ""))}
          tenantId={tenantId}
        />
      </div>
    );
  }

  if (field.hint === "alt_text") {
    // Look for a sibling URL field with the same prefix.
    const urlKey = field.name.replace(/Alt$/, "Url");
    const urlSibling = siblings[urlKey];
    return (
      <AltTextField
        imageUrl={typeof urlSibling === "string" ? urlSibling : null}
        value={(value as string) ?? ""}
        onChange={(next) => onChange(next || undefined)}
      />
    );
  }

  if (field.hint === "image_url") {
    return (
      <div className={FIELD}>
        <span className={LABEL}>
          {field.label}
          {field.optional ? "" : " *"}
        </span>
        <div className="flex items-center gap-2">
          <input
            className={`${INPUT} flex-1`}
            placeholder="https://…"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
          {tenantId ? (
            <MediaPicker
              tenantId={tenantId}
              onPick={(url) => onChange(url)}
              label=""
            />
          ) : null}
        </div>
      </div>
    );
  }

  // ---- Kind-based renderers -------------------------------------------
  // Show the AI rewrite button on text/textarea fields when we have a
  // sectionTypeKey AND the field name is in the rewrite allow-list
  // (server action enforces this; we hide the button when it'd error).
  const aiEligible =
    !!sectionTypeKey &&
    (field.kind === "text" || field.kind === "textarea") &&
    !field.hint && // skip hinted fields (image/href/etc.)
    AI_REWRITABLE_FIELD_NAMES.has(field.name);

  switch (field.kind) {
    case "text":
    case "url":
    case "email":
      return (
        <label className={FIELD}>
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>
              {field.label}
              {field.optional ? "" : " *"}
            </span>
            {aiEligible && sectionTypeKey ? (
              <AiRewriteButton
                sectionTypeKey={sectionTypeKey}
                fieldName={field.name}
                currentValue={(value as string) ?? ""}
                onApply={(next) => onChange(next)}
                siblingContext={pickStringSiblings(siblings, field.name)}
              />
            ) : null}
          </div>
          <input
            type={field.kind === "text" ? "text" : field.kind}
            className={INPUT}
            maxLength={field.max}
            value={(value as string) ?? ""}
            onChange={(e) =>
              onChange(e.target.value || (field.optional ? undefined : ""))
            }
          />
          {field.description ? (
            <span className="text-[11px] text-muted-foreground">
              {field.description}
            </span>
          ) : null}
        </label>
      );

    case "textarea":
      return (
        <label className={FIELD}>
          <div className="flex items-center justify-between gap-2">
            <span className={LABEL}>
              {field.label}
              {field.optional ? "" : " *"}
            </span>
            {aiEligible && sectionTypeKey ? (
              <AiRewriteButton
                sectionTypeKey={sectionTypeKey}
                fieldName={field.name}
                currentValue={(value as string) ?? ""}
                onApply={(next) => onChange(next)}
                siblingContext={pickStringSiblings(siblings, field.name)}
              />
            ) : null}
          </div>
          <textarea
            className={INPUT}
            rows={field.hint === "rich_text" ? 4 : 3}
            maxLength={field.max}
            value={(value as string) ?? ""}
            onChange={(e) =>
              onChange(e.target.value || (field.optional ? undefined : ""))
            }
          />
          {field.hint === "rich_text" ? (
            <span className="text-[11px] text-muted-foreground">
              Supports {"{accent}…{/accent}"}, {"{b}…{/b}"}, {"{i}…{/i}"},
              {" [text](url)"}.
            </span>
          ) : null}
        </label>
      );

    case "number":
      return (
        <label className={FIELD}>
          <span className={LABEL}>
            {field.label}
            {field.optional ? "" : " *"}
          </span>
          <input
            type="number"
            className={INPUT}
            min={field.min}
            max={field.max}
            value={
              typeof value === "number" ? value : (field.defaultValue as number) ?? ""
            }
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              onChange(n);
            }}
          />
        </label>
      );

    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className={LABEL}>{field.label}</span>
        </label>
      );

    case "enum": {
      // Small enums (<= 5 options) render as a chip row — matches the
      // visual feel of VariantPicker without per-section configuration.
      // Larger enums fall back to a plain select.
      const optCount = field.options?.length ?? 0;
      const current = (value as string) ?? (field.defaultValue as string) ?? "";
      if (optCount > 0 && optCount <= 5) {
        return (
          <div className={FIELD}>
            <span className={LABEL}>
              {field.label}
              {field.optional ? "" : " *"}
            </span>
            <div className="flex flex-wrap gap-1">
              {field.options?.map((o) => {
                const active = o === current;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChange(o)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-border/60 bg-background text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {humanizeEnumValue(o)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <label className={FIELD}>
          <span className={LABEL}>
            {field.label}
            {field.optional ? "" : " *"}
          </span>
          <select
            className={INPUT}
            value={current}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.optional ? <option value="">—</option> : null}
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {humanizeEnumValue(o)}
              </option>
            ))}
          </select>
        </label>
      );
    }

    case "array_of_strings":
      return (
        <label className={FIELD}>
          <span className={LABEL}>
            {field.label} (one per line)
            {field.optional ? "" : " *"}
          </span>
          <textarea
            className={INPUT}
            rows={4}
            value={
              Array.isArray(value)
                ? (value as string[]).join("\n")
                : ""
            }
            onChange={(e) =>
              onChange(
                e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter((s) => s),
              )
            }
          />
        </label>
      );

    case "array_of_objects":
      return (
        <ArrayOfObjectsField
          field={field}
          value={Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []}
          onChange={onChange}
          tenantId={tenantId}
        />
      );

    case "object":
      return (
        <fieldset className="rounded-md border border-border/60 p-3">
          <legend className="px-1 text-xs uppercase tracking-wide text-muted-foreground">
            {field.label}
          </legend>
          <div className="flex flex-col gap-3">
            {field.children?.map((child) => {
              const obj = (value as Record<string, unknown>) ?? {};
              return (
                <FieldNode
                  key={child.name}
                  field={child}
                  value={obj[child.name]}
                  siblings={obj}
                  onChange={(v) => onChange({ ...obj, [child.name]: v })}
                  tenantId={tenantId}
                />
              );
            })}
          </div>
        </fieldset>
      );

    default:
      return (
        <div className="text-[11px] italic text-muted-foreground">
          (unsupported field {field.name})
        </div>
      );
  }
}

/**
 * Mirrors the server-side rewrite allow-list (see ai-rewrite-action.ts).
 * Kept inlined to avoid a server-only import in this client file.
 */
const AI_REWRITABLE_FIELD_NAMES = new Set([
  "headline",
  "subheadline",
  "eyebrow",
  "copy",
  "body",
  "intro",
  "caption",
  "footnote",
  "reassurance",
  "successMessage",
  "title",
  "category",
  "byline",
  "pullQuote",
]);

/** Strip non-string siblings + the field itself for the AI context block. */
function pickStringSiblings(
  siblings: Record<string, unknown>,
  excludeKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(siblings)) {
    if (k === excludeKey) continue;
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

function humanizeEnumValue(value: string): string {
  // "fade-up" → "Fade up"; "5/6" → "5/6"; "edge-to-edge" → "Edge to edge"
  return value
    .replace(/[-_]/g, " ")
    .replace(/^(.)/, (c) => c.toUpperCase());
}

interface ArrayOfObjectsFieldProps {
  field: IntrospectedField;
  value: Array<Record<string, unknown>>;
  onChange: (next: unknown) => void;
  tenantId?: string;
}

function ArrayOfObjectsField({
  field,
  value,
  onChange,
  tenantId,
}: ArrayOfObjectsFieldProps) {
  const min = field.min ?? 0;
  const max = field.max ?? 50;
  const blank: Record<string, unknown> = {};
  for (const child of field.children ?? []) {
    if (child.defaultValue !== undefined) {
      blank[child.name] = child.defaultValue;
    } else if (child.kind === "boolean") {
      blank[child.name] = false;
    } else if (child.kind === "array_of_strings" || child.kind === "array_of_objects") {
      blank[child.name] = [];
    } else if (child.kind === "object") {
      blank[child.name] = {};
    } else if (!child.optional) {
      blank[child.name] = "";
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={LABEL}>
          {field.label} ({value.length}
          {max ? ` / ${max}` : ""})
        </span>
        <button
          type="button"
          disabled={max ? value.length >= max : false}
          onClick={() => onChange([...value, { ...blank }])}
          className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      {value.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3"
        >
          {field.children?.map((child) => (
            <FieldNode
              key={child.name}
              field={child}
              value={item[child.name]}
              siblings={item}
              onChange={(v) => {
                const next = [...value];
                next[i] = { ...item, [child.name]: v };
                onChange(next);
              }}
              tenantId={tenantId}
            />
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={value.length <= min}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
            >
              × Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
