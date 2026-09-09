/**
 * Nine shared form components on one create-and-return drawer contract.
 *
 * Preserve parent draft → show authorized records → create only with authority
 * → save child once → attach by stable ID → on attachment failure retry the
 * saved child (never create again) → restore focus and scroll. Mobile is a
 * full-screen sheet with explicit Back and Save.
 */

export const SHARED_FORM_KINDS = [
  "customer_participant_picker",
  "people_picker",
  "space_layout_picker",
  "catalog_picker",
  "date_recurrence_editor",
  "price_allocation_summary",
  "policy_selector",
  "file_intake",
  "publish_review",
] as const;

export type SharedFormKind = (typeof SHARED_FORM_KINDS)[number];

export type DrawerContractState = {
  parentDraftId: string;
  childId: string | null;
  childSavedOnce: boolean;
  attached: boolean;
  focusRestore: string | null;
  scrollRestore: number | null;
  mobileSheet: boolean;
};

export type DrawerEvent =
  | { type: "open"; parentDraftId: string; mobileSheet?: boolean; focusRestore?: string | null; scrollRestore?: number | null }
  | { type: "child_saved"; childId: string }
  | { type: "attach_ok" }
  | { type: "attach_failed" }
  | { type: "close" };

export type AttachPlan =
  | { action: "attach"; childId: string }
  | { action: "retry_saved_child"; childId: string }
  | { action: "create_child" }
  | { action: "none" };

export function initialDrawerState(): DrawerContractState {
  return {
    parentDraftId: "",
    childId: null,
    childSavedOnce: false,
    attached: false,
    focusRestore: null,
    scrollRestore: null,
    mobileSheet: false,
  };
}

export function reduceDrawer(state: DrawerContractState, event: DrawerEvent): DrawerContractState {
  switch (event.type) {
    case "open":
      return {
        ...initialDrawerState(),
        parentDraftId: event.parentDraftId,
        mobileSheet: event.mobileSheet === true,
        focusRestore: event.focusRestore ?? null,
        scrollRestore: event.scrollRestore ?? null,
      };
    case "child_saved":
      return { ...state, childId: event.childId, childSavedOnce: true };
    case "attach_ok":
      return { ...state, attached: true };
    case "attach_failed":
      return { ...state, attached: false };
    case "close":
      return initialDrawerState();
    default:
      return state;
  }
}

/**
 * After a save, prefer attaching the existing child id. A failed attach must
 * retry that same id — never mint a duplicate child.
 */
export function planAttach(state: DrawerContractState): AttachPlan {
  if (!state.parentDraftId) return { action: "none" };
  if (state.childId && state.childSavedOnce) {
    return state.attached
      ? { action: "none" }
      : { action: "retry_saved_child", childId: state.childId };
  }
  if (state.childId) return { action: "attach", childId: state.childId };
  return { action: "create_child" };
}
