/**
 * Public API for the Reservation Thread primitive.
 *
 * Consumers import from this barrel:
 *   import { ReservationThread, type PillDescriptor, type ActionPill } from "@/components/reservation-thread";
 */

export { ReservationThread } from "./ReservationThread";
export { Pill } from "./Pill";
export { QuickStrip } from "./QuickStrip";
export { Sheet } from "./Sheet";
export { SheetHost, useSheetState } from "./SheetHost";
export { ActionRow } from "./ActionRow";
export { Header as ReservationThreadHeader } from "./Header";

export type {
  ReservationPov,
  ReservationStage,
  PillKind,
  PillTone,
  PillDescriptor,
  ActionPill,
  SheetDescriptor,
  ReservationThreadProps,
  ReservationThreadHeader as ReservationThreadHeaderData,
} from "./types";

export {
  PALETTES,
  RADII,
  DENSITY,
  TYPE,
  MOBILE_BP_PX,
  pillToneColors,
} from "./tokens";
