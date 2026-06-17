/**
 * STYLE-1 — pure coercion helpers between the DB jsonb sinks and the typed
 * style-class / style-preset envelopes carried on `CompositionData`.
 *
 * These are the SINGLE place an adapter turns an `unknown` jsonb column value
 * into the shared `BuilderStyleClassRegistry` / `BuilderStylePresetRegistry`
 * (load side) and back into a plain JSON value (save side). They are DELIBERATELY
 * tolerant: a `null` / absent column (a not-yet-migrated row) or a malformed blob
 * coerces to `undefined`, so every surface degrades to the SSR-hydrated
 * localStorage seed instead of throwing. No I/O, no runtime imports — safe to use
 * from any pure adapter-core factory and from a bare `tsx --test` run.
 */

import type {
  BuilderStyleClass,
  BuilderStyleClassRegistry,
  BuilderStylePreset,
  BuilderStylePresetRegistry,
} from "./style-classes";
import type { BuilderNodeStyle } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStyleClass(value: unknown): value is BuilderStyleClass {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isPlainObject(value.style)
  );
}

function isStylePreset(value: unknown): value is BuilderStylePreset {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isPlainObject(value.style)
  );
}

/**
 * Coerce a jsonb column value into a class REGISTRY (id→class). Accepts either
 * the registry map shape (`{ id: { id, name, style } }`) OR a bare array of
 * classes (the localStorage shape the inspector writes). Returns `undefined`
 * when nothing well-formed is present — never throws.
 */
export function coerceStyleClassRegistry(
  raw: unknown,
): BuilderStyleClassRegistry | undefined {
  const out: Record<string, BuilderStyleClass> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) if (isStyleClass(entry)) out[entry.id] = entry;
  } else if (isPlainObject(raw)) {
    for (const entry of Object.values(raw)) {
      if (isStyleClass(entry)) out[entry.id] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Coerce a jsonb column value into the presets ENVELOPE
 * (`{ presets: [...], clipboard? }`). Accepts either the envelope shape OR a
 * bare array of presets (a legacy/partial blob). Returns `undefined` when no
 * presets and no clipboard are present.
 */
export function coerceStylePresetRegistry(
  raw: unknown,
): BuilderStylePresetRegistry | undefined {
  let presets: BuilderStylePreset[] = [];
  let clipboard: BuilderNodeStyle | null | undefined;

  if (Array.isArray(raw)) {
    presets = raw.filter(isStylePreset);
  } else if (isPlainObject(raw)) {
    const list = raw.presets;
    if (Array.isArray(list)) presets = list.filter(isStylePreset);
    if (isPlainObject(raw.clipboard)) {
      clipboard = raw.clipboard as BuilderNodeStyle;
    }
  }

  if (presets.length === 0 && !clipboard) return undefined;
  return clipboard ? { presets, clipboard } : { presets };
}

/**
 * Serialize a class registry to the plain JSON value persisted in the column.
 * `undefined` / empty maps to `null` so the column is cleared rather than left
 * stale. (A save that simply doesn't touch classes should pass `undefined`,
 * which the adapter maps to "leave the column as-is" — see the adapter cores.)
 */
export function serializeStyleClassRegistry(
  registry: BuilderStyleClassRegistry | undefined,
): unknown {
  if (!registry || Object.keys(registry).length === 0) return null;
  return registry;
}

/** Serialize a presets envelope to the plain JSON column value (or `null`). */
export function serializeStylePresetRegistry(
  registry: BuilderStylePresetRegistry | undefined,
): unknown {
  if (!registry) return null;
  const hasPresets = registry.presets.length > 0;
  const hasClipboard = Boolean(registry.clipboard);
  if (!hasPresets && !hasClipboard) return null;
  return registry;
}
