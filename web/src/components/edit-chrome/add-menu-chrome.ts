/**
 * TUL-78 #3 — what the left-dock "+ Add" button does to the editor chrome.
 *
 * The contract the dock relies on, kept pure so it is testable:
 *   - Add opens the gallery whether or not the inspector is open; the inspector
 *     is selection-driven and is NEVER touched by this transition.
 *   - Opening Add closes the OTHER left-rail panels (search, pages, design,
 *     structure) so two never stack.
 *   - `toggle` decides open vs close from the CURRENT state, not from inside a
 *     React state updater. The old `setAddMenuOpen((prev) => { ...other
 *     setStates... })` ran its side effects in an updater, which React may
 *     replay or defer while the inspector is re-rendering, so the click
 *     appeared to do nothing.
 */

export interface AddMenuChrome {
  addMenuOpen: boolean;
  inspectorOpen: boolean;
  searchOpen: boolean;
  pagesOpen: boolean;
  designOpen: boolean;
  navigatorOpen: boolean;
}

export type AddMenuAction = "open" | "close" | "toggle";

export function nextAddMenuChrome(
  state: AddMenuChrome,
  action: AddMenuAction,
): AddMenuChrome {
  const open = action === "open" || (action === "toggle" && !state.addMenuOpen);
  if (!open) return { ...state, addMenuOpen: false };
  return {
    ...state,
    addMenuOpen: true,
    searchOpen: false,
    pagesOpen: false,
    designOpen: false,
    navigatorOpen: false,
  };
}

/** All-closed baseline, for callers that only know `addMenuOpen`. */
export const ADD_MENU_CHROME_IDLE: AddMenuChrome = {
  addMenuOpen: false,
  inspectorOpen: false,
  searchOpen: false,
  pagesOpen: false,
  designOpen: false,
  navigatorOpen: false,
};
