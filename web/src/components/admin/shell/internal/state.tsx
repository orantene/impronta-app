// ─────────────────────────────────────────────────────────────────────
// _state.tsx — THIN BARREL (Phase 1b, remediation-plan-2026-05-19 §4).
//
// The former 9,549-LOC module was decomposed into ./state/* . This file
// re-exports every previously-public symbol byte-stable so the ~29
// importers (messages/talent/pages/drawers/admin-shell-client/...) keep
// working unchanged. Re-export ORDER preserves original eval order
// (fixtures fully initialised before the _field-catalog circular pull).
// ─────────────────────────────────────────────────────────────────────
export * from "./state/types";
export * from "./state/drawer-ids";
export * from "./state/fixtures";
export * from "./state/recent-activity";
export * from "./state/context";

// ─────────────────────────────────────────────────────────────────────
// Re-exports from _field-catalog.ts
//
// `_talent.tsx` imports computeProfileCompleteness, fieldsForType, and
// FIELD_CATALOG from "./state" (same import block as all other state
// symbols). Rather than modifying the frozen caller file, we re-export
// these from the catalog module. The circular import (_state ↔
// _field-catalog) is safe: _field-catalog already uses lazy
// initialization for everything that touches TAXONOMY_FIELDS.
// ─────────────────────────────────────────────────────────────────────
export {
  computeProfileCompleteness,
  fieldsForType,
  FIELD_CATALOG,
} from "./field-catalog";
