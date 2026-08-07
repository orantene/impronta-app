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
 * custom UX keep their hand-written Editor.tsx. The schema is the source
 * of truth either way.
 *
 * Information architecture (2026-05-29 unification pass) — this one
 * component renders ~36 section drawers. It used to flat-map every field
 * with ad-hoc class constants (the "million options" walls, e.g. Magazine
 * Layout). It now:
 *   1. Uses the shared inspector KIT tokens, so auto-bound drawers read
 *      identically to the hand-curated `*-content.tsx` inspectors.
 *   2. Groups by structure: top-level scalars in a "Content" block; each
 *      object / array-of-objects becomes its own collapsible
 *      `InspectorGroup` (persisted per section type). Advanced groups
 *      (nodePresentation, seo, …) collapse by default.
 *   3. Collapses array-repeater items to a one-line summary — a
 *      4-card × 6-field wall becomes four tappable rows.
 * Hierarchy is derived from the introspected `kind` — no schema changes.
 *
 * Hint-based primitive swaps (no per-section config): image_url →
 * MediaPicker; alt_text → AltTextField; href → LinkPicker; rich_text →
 * RichEditor. The `presentation` field is rendered separately by the
 * parent (PresentationPanel) and skipped here.
 */

import { useState } from "react";

import type { IntrospectedField } from "./zod-introspect";
import { introspectSectionSchema } from "./zod-introspect";
import { LinkPicker } from "./LinkPicker";
import { LinkKindPicker } from "./LinkKindPicker";
import type { LinkRef } from "@/lib/site-admin/links/link-ref";
import { MediaPicker } from "./MediaPicker";
import { AltTextField } from "./AltTextField";
import { BlueprintPicker } from "./BlueprintPicker";
import { LocalizedTextInput } from "./LocalizedTextInput";
import type { I18nString } from "./i18n-text";
import { useSectionT } from "./section-editor-i18n";
import { AiRewriteButton } from "@/components/edit-chrome/inspectors/AiRewriteButton";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  InspectorGroup,
  InspectorRowDelete,
  KIT,
} from "@/components/edit-chrome/inspectors/kit";
import {
  ADVANCED_GROUP_NAMES,
  AI_REWRITABLE_FIELD_NAMES,
  GROUP_LABEL_OVERRIDES,
  deriveItemSummary,
  humanizeEnumValue,
  isGroupKind,
  pickStringSiblings,
} from "./zod-form-helpers";

import type { z } from "zod";

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
  const t = useSectionT();
  const fields = introspectSectionSchema(schema).filter(
    (f) => !excludeKeys?.includes(f.name),
  );
  const props = (value ?? {}) as Record<string, unknown>;
  const set = (next: Record<string, unknown>) =>
    onChange({ ...props, ...next } as Partial<T>);

  const primary = fields.filter((f) => !isGroupKind(f));
  const groups = fields.filter(isGroupKind);

  // When the form is all scalars there's no value in a header — render them
  // bare. Once there are structured groups below, a "Content" header gives
  // the top-level fields a peer label so the hierarchy reads cleanly.
  const primaryBlock =
    primary.length > 0 ? (
      <div className="flex flex-col gap-4">
        {primary.map((f) => (
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
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {sectionTypeKey ? (
        <BlueprintPicker
          sectionTypeKey={sectionTypeKey}
          current={props}
          onApply={(next) => onChange(next as Partial<T>)}
        />
      ) : null}

      {primaryBlock && groups.length > 0 ? (
        <InspectorGroup title={t("Content")}>{primaryBlock}</InspectorGroup>
      ) : (
        primaryBlock
      )}

      {groups.map((f) => {
        const advanced = ADVANCED_GROUP_NAMES.has(f.name);
        const base = t(GROUP_LABEL_OVERRIDES[f.name] ?? f.label);
        const count =
          f.kind === "array_of_objects" && Array.isArray(props[f.name])
            ? (props[f.name] as unknown[]).length
            : null;
        const title = count !== null ? `${base} · ${count}` : base;
        return (
          <InspectorGroup
            key={f.name}
            title={title}
            collapsible
            advanced={advanced}
            storageKey={
              sectionTypeKey ? `zf:${sectionTypeKey}:${f.name}` : undefined
            }
          >
            <GroupBody
              field={f}
              value={props[f.name]}
              onChange={(v) => set({ [f.name]: v })}
              tenantId={tenantId}
            />
          </InspectorGroup>
        );
      })}
    </div>
  );
}

/**
 * Renders the *inner* content of a top-level object / array group. The
 * surrounding `InspectorGroup` already supplies the title + collapse, so
 * this never draws its own border or header (that's what made nested
 * objects double-chrome before).
 */
function GroupBody({
  field,
  value,
  onChange,
  tenantId,
}: {
  field: IntrospectedField;
  value: unknown;
  onChange: (next: unknown) => void;
  tenantId?: string;
}) {
  if (field.kind === "object") {
    const obj = (value as Record<string, unknown>) ?? {};
    return (
      <div className="flex flex-col gap-3">
        {field.children?.map((child) => (
          <FieldNode
            key={child.name}
            field={child}
            value={obj[child.name]}
            siblings={obj}
            onChange={(v) => onChange({ ...obj, [child.name]: v })}
            tenantId={tenantId}
          />
        ))}
      </div>
    );
  }
  // array_of_objects
  return (
    <ArrayOfObjectsField
      field={field}
      value={Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []}
      onChange={onChange}
      tenantId={tenantId}
      headerless
    />
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
  const t = useSectionT();
  // ---- 6C structured LinkRef field (linkRefOrLegacy) ------------------
  // Checked BEFORE the legacy `href` hint so migrated fields get the
  // structured picker while plain z.string() href fields keep LinkPicker.
  if (field.kind === "link_ref") {
    return (
      <div className={KIT.field}>
        <span className={KIT.label}>
          {t(field.label)}
          {field.optional ? "" : " *"}
        </span>
        <LinkKindPicker
          value={value as LinkRef | string | null | undefined}
          onChange={(next) => onChange(next)}
          tenantId={tenantId}
        />
        {field.description ? (
          <span className={KIT.hint}>{t(field.description)}</span>
        ) : null}
      </div>
    );
  }

  // ---- Hint-based primitive swaps -------------------------------------
  if (field.hint === "href") {
    return (
      <div className={KIT.field}>
        <span className={KIT.label}>
          {t(field.label)}
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
      <div className={KIT.field}>
        <span className={KIT.label}>
          {t(field.label)}
          {field.optional ? "" : " *"}
        </span>
        <div className="flex items-center gap-2">
          <input
            className={`${KIT.input} flex-1`}
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

  // ---- Locale-aware text (i18nString) ---------------------------------
  if (field.kind === "i18n_text") {
    const longish =
      typeof field.max === "number" ? field.max > 240 : false;
    return (
      <LocalizedTextInput
        label={t(field.label) + (field.optional ? "" : " *")}
        value={value as I18nString | undefined}
        onChange={(next) => onChange(next)}
        multiline={longish}
        maxLength={field.max}
        hint={field.description ? t(field.description) : undefined}
        rich={field.hint === "rich_text"}
        tenantId={tenantId}
      />
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
        <label className={KIT.field}>
          <div className="flex items-center justify-between gap-2">
            <span className={KIT.label}>
              {t(field.label)}
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
          {field.kind === "text" && field.hint === "rich_text" ? (
            <RichEditor
              value={(value as string) ?? ""}
              onChange={(next) =>
                onChange(next || (field.optional ? undefined : ""))
              }
              variant="single"
              tenantId={tenantId}
              ariaLabel={t(field.label)}
            />
          ) : (
            <input
              type={field.kind === "text" ? "text" : field.kind}
              className={KIT.input}
              maxLength={field.max}
              value={(value as string) ?? ""}
              onChange={(e) =>
                onChange(e.target.value || (field.optional ? undefined : ""))
              }
            />
          )}
          {field.description ? (
            <span className={KIT.hint}>{t(field.description)}</span>
          ) : null}
        </label>
      );

    case "textarea":
      return (
        <label className={KIT.field}>
          <div className="flex items-center justify-between gap-2">
            <span className={KIT.label}>
              {t(field.label)}
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
          {field.hint === "rich_text" ? (
            <RichEditor
              value={(value as string) ?? ""}
              onChange={(next) =>
                onChange(next || (field.optional ? undefined : ""))
              }
              variant="multi"
              tenantId={tenantId}
              ariaLabel={t(field.label)}
            />
          ) : (
            <textarea
              className={KIT.textarea}
              rows={3}
              maxLength={field.max}
              value={(value as string) ?? ""}
              onChange={(e) =>
                onChange(e.target.value || (field.optional ? undefined : ""))
              }
            />
          )}
          {field.description ? (
            <span className={KIT.hint}>{t(field.description)}</span>
          ) : null}
        </label>
      );

    case "number":
      return (
        <label className={KIT.field}>
          <span className={KIT.label}>
            {t(field.label)}
            {field.optional ? "" : " *"}
          </span>
          <input
            type="number"
            className={KIT.input}
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
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            className="size-4 accent-[#3d4f7c]"
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className={KIT.label}>{t(field.label)}</span>
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
          <div className={KIT.field}>
            <span className={KIT.label}>
              {t(field.label)}
              {field.optional ? "" : " *"}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {field.options?.map((o) => {
                const active = o === current;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChange(o)}
                    className={active ? KIT.enumChipOn : KIT.enumChipOff}
                  >
                    {t(humanizeEnumValue(o))}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <label className={KIT.field}>
          <span className={KIT.label}>
            {t(field.label)}
            {field.optional ? "" : " *"}
          </span>
          <select
            className={KIT.select}
            value={current}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.optional ? <option value="">—</option> : null}
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {t(humanizeEnumValue(o))}
              </option>
            ))}
          </select>
        </label>
      );
    }

    case "array_of_strings":
      return (
        <label className={KIT.field}>
          <span className={KIT.label}>
            {t(field.label)} ({t("one per line")})
            {field.optional ? "" : " *"}
          </span>
          <textarea
            className={KIT.textarea}
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
      // Nested object (inside an array item or another object). Top-level
      // objects are rendered by GroupBody inside an InspectorGroup; this
      // path is the nested case only, so it keeps a light bordered card.
      return (
        <div className="flex flex-col gap-2.5 rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/60 p-3">
          <span className={KIT.groupTitle}>{t(field.label)}</span>
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
        </div>
      );

    default:
      return (
        <div className="text-[11px] italic text-stone-500">
          ({t("unsupported field")} {field.name})
        </div>
      );
  }
}

interface ArrayOfObjectsFieldProps {
  field: IntrospectedField;
  value: Array<Record<string, unknown>>;
  onChange: (next: unknown) => void;
  tenantId?: string;
  /** When the parent InspectorGroup already supplies the title + count. */
  headerless?: boolean;
}

function ArrayOfObjectsField({
  field,
  value,
  onChange,
  tenantId,
  headerless = false,
}: ArrayOfObjectsFieldProps) {
  const t = useSectionT();
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
  const atMax = max ? value.length >= max : false;

  return (
    <div className="flex flex-col gap-2.5">
      {!headerless ? (
        <div className="flex items-center justify-between">
          <span className={KIT.label}>
            {t(field.label)} ({value.length}
            {max ? ` / ${max}` : ""})
          </span>
        </div>
      ) : null}

      {value.map((item, i) => (
        <ArrayItemCard
          key={i}
          field={field}
          item={item}
          index={i}
          canRemove={value.length > min}
          tenantId={tenantId}
          onChange={(next) => {
            const arr = [...value];
            arr[i] = next;
            onChange(arr);
          }}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}

      <button
        type="button"
        disabled={atMax}
        onClick={() => onChange([...value, { ...blank }])}
        className={`${KIT.ghostButton} self-start disabled:cursor-not-allowed disabled:opacity-50`}
      >
        + {t("Add")}
      </button>
    </div>
  );
}

/**
 * A single repeater item. Collapsed by default — shows a one-line summary
 * + remove control. Expand to edit the item's fields. This is the core
 * wall-reduction: an N-card list reads as N tappable rows, not N×M fields.
 */
function ArrayItemCard({
  field,
  item,
  index,
  canRemove,
  onChange,
  onRemove,
  tenantId,
}: {
  field: IntrospectedField;
  item: Record<string, unknown>;
  index: number;
  canRemove: boolean;
  onChange: (next: Record<string, unknown>) => void;
  onRemove: () => void;
  tenantId?: string;
}) {
  const t = useSectionT();
  const [open, setOpen] = useState(false);
  const summary = deriveItemSummary(field.children, item, index, t("Item {n}"));

  return (
    <div className="overflow-hidden rounded-lg border border-[#e5e0d5] bg-[#faf9f6]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
          aria-expanded={open}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-stone-500 transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="truncate text-[13px] font-medium text-stone-700">
            {summary}
          </span>
        </button>
        {canRemove ? <InspectorRowDelete onClick={onRemove} /> : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-[#e5e0d5] px-3 py-3">
          {field.children?.map((child) => (
            <FieldNode
              key={child.name}
              field={child}
              value={item[child.name]}
              siblings={item}
              onChange={(v) => onChange({ ...item, [child.name]: v })}
              tenantId={tenantId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
