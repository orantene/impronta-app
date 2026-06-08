/**
 * Per-component variant presets (editor-time convenience).
 *
 * Variants compile to instanceOverrides via applyInstanceVariant; this module
 * stores named presets per master component id in localStorage until a DB
 * column lands.
 */

import type { BuilderComponentVariant } from "@/lib/site-admin/builder-node/types";

const STORAGE_KEY = "impronta.editChrome.componentVariants.v1";

type VariantMap = Record<string, BuilderComponentVariant[]>;

function readMap(): VariantMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as VariantMap;
  } catch {
    return {};
  }
}

function writeMap(map: VariantMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

export function listComponentVariants(
  componentId: string,
): ReadonlyArray<BuilderComponentVariant> {
  return readMap()[componentId] ?? [];
}

export function saveComponentVariant(
  componentId: string,
  variant: BuilderComponentVariant,
): void {
  const map = readMap();
  const existing = map[componentId] ?? [];
  const without = existing.filter((v) => v.id !== variant.id);
  map[componentId] = [...without, variant];
  writeMap(map);
}
