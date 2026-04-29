/**
 * Sprint 5 — canonical EditorStore mutation surface.
 *
 * One typed `EditorMutation` discriminated union covers every editing
 * operation the operator can perform on a page: composition-level
 * (insert / remove / move / duplicate / metadata) and section-level
 * (rename / setVisibility / field-edit). The EditProvider's
 * `dispatch(mutation)` consumes this union and routes each kind to
 * the appropriate server action.
 *
 * Constraints (per Sprint 5 charter):
 *   - Server action signatures are NOT renormalized globally. Each
 *     action keeps its current request/response shape. The `dispatch`
 *     boundary parses + projects each result into the unified
 *     `DispatchResult` envelope.
 *   - Undo/redo snapshot shape is unchanged. Composition mutations
 *     still produce CompositionSnapshot transforms; the dispatcher
 *     wraps them, doesn't replace them.
 *   - This file is types-only — no runtime imports beyond JS standard
 *     library, so it's safe in both server and client trees.
 */

import type { SectionVisibility } from "./section-actions";

/** Target description for inserting a new section. Mirrors the existing
 *  `LibraryTarget` shape used by `createAndInsertSectionAction`. */
export interface InsertTarget {
  slotKey: string;
  /** sortOrder of the section AFTER which to insert. `null` → prepend. */
  insertAfterSortOrder: number | null;
}

/**
 * Discriminated union of every operator-driven mutation the editor
 * supports. The `kind` namespace prefix (`composition.*` vs
 * `section.*`) tells the dispatcher whether to route through the
 * page-level CompositionSnapshot pipeline or the per-section action.
 */
export type EditorMutation =
  // Composition-level — full snapshot transform, single page-version
  // bump per save. Already handled by the existing dispatchMutation
  // pattern; Sprint 5 unifies the call signature.
  | {
      kind: "composition.remove";
      sectionId: string;
    }
  | {
      kind: "composition.move";
      sectionId: string;
      targetSlotKey: string;
      targetSortOrder: number;
    }
  | {
      kind: "composition.metadata";
      metadata: Record<string, unknown>;
    }
  // Composition mutations whose new section id is server-generated;
  // local state is reconciled from the action's response payload.
  | {
      kind: "composition.insert";
      target: InsertTarget;
      sectionTypeKey: string;
    }
  | {
      kind: "composition.duplicate";
      sectionId: string;
    }
  // Section-level — modify one section's stored fields (visibility /
  // name / props) without touching slot order. No page-version bump
  // required; the section's own version field handles CAS.
  | {
      kind: "section.setVisibility";
      sectionId: string;
      visibility: SectionVisibility;
    }
  | {
      kind: "section.rename";
      sectionId: string;
      newName: string;
    }
  | {
      kind: "section.applyFieldEdit";
      sectionId: string;
      props: Record<string, unknown>;
    };

/**
 * Unified result envelope every dispatch() returns. Action-specific
 * payloads (e.g. duplicate's newSectionId) ride on the optional
 * `data` field.
 */
export type DispatchResult =
  | {
      ok: true;
      data?: {
        /** Set on `composition.insert` and `composition.duplicate`. */
        newSectionId?: string;
      };
    }
  | {
      ok: false;
      error: string;
      /** Action-specific code (`VERSION_CONFLICT` / `VALIDATION_FAILED` / etc.). */
      code?: string;
    };
