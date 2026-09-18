/**
 * Shell layout, pure. The shell measures its own container (not the viewport)
 * so the dev preview can draw 390 / 1194 / 1440 side by side and each frame
 * lays itself out the way the board for that width does.
 *
 *   three  ≥ 1100   inbox 340 | thread | context 330 as cards on the ground (D01)
 *   two    900–1099 inbox 300 | thread; context is a right drawer (D11)
 *   one    < 900    inbox ⇄ thread ⇄ Details sheet, mobile kit (M01/M02/M04)
 */

export type ShellLayout = "three" | "two" | "one";
export type MobilePane = "inbox" | "thread";

export const THREE_COLUMN_MIN = 1100;
export const TWO_COLUMN_MIN = 900;

export function layoutForWidth(width: number): ShellLayout {
  if (width >= THREE_COLUMN_MIN) return "three";
  if (width >= TWO_COLUMN_MIN) return "two";
  return "one";
}

/** The mobile kit below 900; the desktop grammar above. Widths are the shell's
 * CONTAINER (viewport minus the 240px workspace sidebar): a 13-inch 1194
 * viewport is a ~950 container and gets the drawer (D11). */
export function variantForLayout(layout: ShellLayout): "desktop" | "mobile" {
  return layout === "one" ? "mobile" : "desktop";
}

export type ShellClassInput = {
  readonly layout: ShellLayout;
  /** One-column only: which screen is showing. */
  readonly pane: MobilePane;
  /** Two-column only: the context drawer is open over the thread. */
  readonly drawerOpen: boolean;
  /** Something modal (sheet / drawer / tray) is open; the root gets `has-overlay`. */
  readonly overlay: boolean;
  /**
   * L10 (D-MSG-172), additive: the POS "This customer" dock view hides the
   * inbox rail (the dock draws its own This customer / Inbox tabs outside
   * the shell) so the thread + context panel get the full width instead.
   * Absent/false: unchanged three/two/one behaviour.
   */
  readonly hideInboxRail?: boolean;
};

/**
 * Root class list. `.msgv5` scopes the kit tokens; `.msgs` is the grid;
 * `.tab` (two columns) and `.one` (single column) narrow it, `.pane-thread`
 * says the phone is on the thread screen.
 */
export function shellClassName(input: ShellClassInput): string {
  const parts = ["msgv5", "msgs"];
  if (input.layout === "two") parts.push("tab");
  if (input.layout === "one") {
    parts.push("one");
    parts.push(input.pane === "thread" ? "pane-thread" : "pane-inbox");
  }
  if (input.layout === "two" && input.drawerOpen) parts.push("drawer-open");
  if (input.overlay) parts.push("has-overlay");
  if (input.hideInboxRail) parts.push("hide-inbox");
  return parts.join(" ");
}

/** Where the context panel lives for a layout. */
export function contextPlacement(layout: ShellLayout): "column" | "drawer" | "sheet" {
  if (layout === "three") return "column";
  if (layout === "two") return "drawer";
  return "sheet";
}
