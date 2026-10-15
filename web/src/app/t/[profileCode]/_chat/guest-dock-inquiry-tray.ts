import type { GuestDockView } from "./guest-dock-view";

/** The tray shows on every dock tab once the dock is on and something is in the inquiry. */
export function inquiryTrayVisible(input: { count: number; activeView: GuestDockView; enabled: boolean }): boolean {
  return input.enabled && input.count > 0;
}
