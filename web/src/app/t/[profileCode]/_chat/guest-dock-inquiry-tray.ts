import type { GuestDockView } from "./guest-dock-view";

/** The tray shows when the dock is on, something is in the inquiry, and the lineup tab (where it is reviewed) is not already open. */
export function inquiryTrayVisible(input: { count: number; activeView: GuestDockView; enabled: boolean }): boolean {
  return input.enabled && input.count > 0 && input.activeView !== "lineup";
}
