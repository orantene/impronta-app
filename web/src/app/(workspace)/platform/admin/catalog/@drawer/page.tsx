// Drawer slot for the /catalog list route itself — nothing to overlay.
// Needed so that navigating back to /catalog (e.g. via a Link) clears any
// previously-active intercepted drawer instead of leaving it visible.

// Match the list page's dynamic rendering — parallel slots at the same segment
// level must agree (the catalog list page is force-dynamic).
export const dynamic = "force-dynamic";

export default function DrawerSlotPage() {
  return null;
}
