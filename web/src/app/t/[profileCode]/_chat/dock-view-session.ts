import type { GuestDockView } from "./guest-dock-view";

const DOCK_VIEW_STORAGE_KEY = "impronta.dockView";
const DOCK_VIEWS: readonly GuestDockView[] = ["home", "chat", "lineup", "projects"];

export function readStoredDockView(): GuestDockView | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(DOCK_VIEW_STORAGE_KEY);
    if (stored && (DOCK_VIEWS as readonly string[]).includes(stored)) {
      return stored as GuestDockView;
    }
  } catch {
    /* sessionStorage unavailable (private mode) */
  }
  return null;
}

/** Remap stale "home" sessions to Hablar chat (empty-home = bubble + chips). */
export function normalizeDockView(view: GuestDockView): GuestDockView {
  return view === "home" ? "chat" : view;
}

/** Remembered view wins (home→chat); otherwise open on Hablar chat. */
export function resolveInitialDockView(
  existingInquiryId: string | null,
  cartTalentIds: readonly string[] | undefined,
): GuestDockView {
  void existingInquiryId;
  void cartTalentIds;
  const stored = readStoredDockView();
  if (stored) return normalizeDockView(stored);
  return "chat";
}

export function persistDockView(view: GuestDockView): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DOCK_VIEW_STORAGE_KEY, view);
  } catch {
    /* best-effort */
  }
}
