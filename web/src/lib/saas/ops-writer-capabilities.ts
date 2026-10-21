import type { CapabilityKey } from "@/lib/access";

/**
 * TUL-1708: the capability each operations / settings WRITE requires. The default guard capability is
 * `agency.workspace.view`, which the `viewer` role holds, so a viewer could change hours, rooms, and booking hours. Reads keep the default; every writer passes one of these.
 * `operate_venue` is editor+. Call sheet and reservation propose (#4332), holds, calendar feed, venue/appointments settings, staff resources and Stripe Connect were gated
 * separately (#4326/#4328 and earlier work) and are not in this map. A tier change is a one-line edit here.
 */
export const OPS_WRITER_CAPABILITY = {
  // operate_venue (editor+)
  addRoomAction: "operate_venue",
  addTablesAction: "operate_venue",
  saveBookingHours: "operate_venue",
  acceptBookingHoursProposal: "operate_venue",
  setTalentDirectBookingOptIn: "operate_venue",
} as const satisfies Record<string, CapabilityKey>;

export type OpsWriterAction = keyof typeof OPS_WRITER_CAPABILITY;
