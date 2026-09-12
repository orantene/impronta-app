/** EXPERIMENTAL WhatsApp drawer. Isolated window events so chrome mounts stay one line. */

export const WHATSAPP_DRAWER_TOGGLE_EVENT = "tulala:whatsapp-drawer-toggle";
export const WHATSAPP_DRAWER_OPEN_EVENT = "tulala:whatsapp-drawer-open";

export function toggleWhatsAppDrawer(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WHATSAPP_DRAWER_TOGGLE_EVENT));
}

export function openWhatsAppDrawer(inquiryId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WHATSAPP_DRAWER_OPEN_EVENT, { detail: { inquiryId } }));
}
