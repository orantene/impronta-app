"use client";

/**
 * builder-2027-node-content.tsx — the Content tab for the twelve native
 * BUILDER 2027 · P2A kinds.
 *
 * ONE renderer for all twelve, driven by the pure field schema in
 * `builder-2027-fields.ts`. See that file's header for why the description of
 * the controls is separated from the rendering of them.
 *
 * Everything the twelve kinds share is handled here exactly once:
 *   - per-prop admin LOCKS, mirrored from the server chokepoint so a locked
 *     field reports itself instead of silently no-opping;
 *   - the per-locale overlay editor, INJECTED by the caller rather than
 *     reimplemented (forking that plumbing is how a translated form ships in
 *     the wrong language) and injected rather than imported so this module and
 *     its dispatcher never form a cycle;
 *   - "unset" vs "set to the default" — a control writes only when the operator
 *     changes it, so an unset prop keeps following the renderer's own default
 *     instead of being frozen at today's value.
 */

import { useCallback, type ReactNode } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { stripLockedKeysFromPatch } from "@/lib/site-admin/builder-node/prop-lock";
import { useEditContext } from "../edit-context";
import { KIT } from "./kit/tokens";
import { useInspectorT } from "./kit/use-inspector-t";
import {
  BUILDER_2027_INSPECTOR_GROUPS,
  isBuilder2027InspectorKind,
  type Builder2027Field,
  type Builder2027InspectorKind,
} from "@/lib/site-admin/builder-node/builder-2027-fields";

/** The node shapes this inspector accepts (never a curated `section` row). */
type Builder2027Node = Extract<BuilderNode, { kind: Builder2027InspectorKind }>;

/**
 * The per-locale text editor, INJECTED by the caller rather than imported.
 *
 * It lives in `builder-node-content.tsx`, which is also the module that
 * dispatches to this inspector. Importing it back would form a module cycle —
 * the exact shape that took the admin down in #971 when a `const` landed in its
 * temporal dead zone at chunk-eval time. Passing it as a prop keeps the
 * dependency one-directional, so the cycle cannot be reintroduced by a later
 * refactor turning that declaration into a `const`.
 */
export type LocalizableTextFieldComponent = (props: {
  node: Exclude<BuilderNode, { kind: "section" }>;
  prop: string;
  tenantId: string;
  fieldKind: "rich-single" | "rich-multi" | "input" | "textarea";
  baseValue: string;
  ariaLabel: string;
  className: string;
  placeholder?: string;
  onCommitBase: (next: string) => void | Promise<void>;
  patch: (patch: Record<string, unknown>) => void | Promise<void>;
}) => ReactNode;

function readString(props: Record<string, unknown>, key: string): string {
  const value = props[key];
  return typeof value === "string" ? value : "";
}

function readBool(
  props: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = props[key];
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(
  props: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readChoice(
  props: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = props[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function Builder2027ContentInspector({
  node,
  tenantId,
  LocalizableTextField,
}: {
  node: Builder2027Node;
  tenantId: string;
  LocalizableTextField: LocalizableTextFieldComponent;
}): ReactNode {
  const { patchBuilderNodeProps, reportMutationError } = useEditContext();
  // The schema holds ENGLISH copy; every operator-facing string is translated
  // here, at the same boundary the rest of the inspector kit uses, so a Spanish
  // editor sees Spanish without the schema carrying two languages.
  const { t } = useInspectorT();
  const props = node.props as Record<string, unknown>;

  /**
   * The single write path. Mirrors the admin per-prop locks the server
   * re-strips in `patchBuilderNodeProps`, so a locked field says so instead of
   * accepting a keystroke that is silently dropped downstream.
   */
  const commitPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      const guarded = stripLockedKeysFromPatch(
        patch,
        node.props as Record<string, unknown>,
        node.lockedProps,
      );
      if (Object.keys(guarded).length === 0 && Object.keys(patch).length > 0) {
        reportMutationError(
          "That field is locked by the platform admin and cannot be changed.",
        );
        return;
      }
      const result = await patchBuilderNodeProps(node.id, guarded);
      if (!result.ok) {
        reportMutationError(result.error ?? "That change could not be saved.");
      }
    },
    [node.id, node.props, node.lockedProps, patchBuilderNodeProps, reportMutationError],
  );

  const groups = BUILDER_2027_INSPECTOR_GROUPS[node.kind];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-2.5">
          <h3 className={KIT.blockHeading}>{t(group.title)}</h3>
          {group.fields.map((field) => (
            <Builder2027Control
              key={field.prop}
              field={field}
              node={node}
              props={props}
              tenantId={tenantId}
              commitPatch={commitPatch}
              LocalizableTextField={LocalizableTextField}
            />
          ))}
          {group.note ? <p className={KIT.hint}>{t(group.note)}</p> : null}
        </section>
      ))}
    </div>
  );
}

function Builder2027Control({
  field,
  node,
  props,
  tenantId,
  commitPatch,
  LocalizableTextField,
}: {
  field: Builder2027Field;
  node: Builder2027Node;
  props: Record<string, unknown>;
  tenantId: string;
  commitPatch: (patch: Record<string, unknown>) => Promise<void>;
  LocalizableTextField: LocalizableTextFieldComponent;
}): ReactNode {
  const { t } = useInspectorT();
  const fieldId = `${node.id}-${field.prop}`;
  const label = t(field.label);

  if (field.control === "text") {
    const value = readString(props, field.prop);
    // A localizable prop goes through the SHARED overlay editor so secondary
    // locales are written to `i18n` rather than clobbering the base copy.
    if (field.localizable) {
      return (
        <div className={KIT.field}>
          <label className={KIT.label} htmlFor={fieldId}>
            {label}
          </label>
          <LocalizableTextField
            node={node}
            prop={field.prop}
            tenantId={tenantId}
            fieldKind={field.multiline ? "textarea" : "input"}
            baseValue={value}
            ariaLabel={label}
            className={field.multiline ? KIT.textarea : KIT.input}
            placeholder={field.placeholder ? t(field.placeholder) : undefined}
            onCommitBase={(next) => commitPatch({ [field.prop]: next })}
            patch={commitPatch}
          />
        </div>
      );
    }
    const Tag = field.multiline ? "textarea" : "input";
    return (
      <div className={KIT.field}>
        <label className={KIT.label} htmlFor={fieldId}>
          {label}
        </label>
        <Tag
          id={fieldId}
          className={field.multiline ? KIT.textarea : KIT.input}
          defaultValue={value}
          placeholder={field.placeholder ? t(field.placeholder) : undefined}
          aria-label={label}
          onBlur={(event: { currentTarget: { value: string } }) => {
            const next = event.currentTarget.value;
            if (next === value) return;
            void commitPatch({ [field.prop]: next });
          }}
        />
      </div>
    );
  }

  if (field.control === "select") {
    return (
      <div className={KIT.field}>
        <label className={KIT.label} htmlFor={fieldId}>
          {label}
        </label>
        <select
          id={fieldId}
          className={KIT.select}
          value={readChoice(props, field.prop, field.fallback)}
          aria-label={label}
          onChange={(event) => {
            void commitPatch({ [field.prop]: event.currentTarget.value });
          }}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.control === "toggle") {
    const on = readBool(props, field.prop, field.fallback);
    return (
      <div className={KIT.row}>
        <input
          id={fieldId}
          type="checkbox"
          checked={on}
          aria-label={label}
          onChange={(event) => {
            void commitPatch({ [field.prop]: event.currentTarget.checked });
          }}
        />
        <label className={KIT.label} htmlFor={fieldId}>
          {label}
        </label>
      </div>
    );
  }

  const numeric = readNumber(props, field.prop, field.fallback);
  return (
    <div className={KIT.field}>
      <label className={KIT.label} htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className={KIT.input}
        type="number"
        min={field.min}
        max={field.max}
        value={numeric}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (!Number.isFinite(next)) return;
          // Clamp here as well as in the schema: a browser number input lets a
          // typed value exceed min/max, and a rejected patch reads to the
          // operator as "the field does nothing".
          const clamped = Math.min(field.max, Math.max(field.min, next));
          void commitPatch({ [field.prop]: clamped });
        }}
      />
    </div>
  );
}

export { isBuilder2027InspectorKind };
export type { Builder2027Node };
