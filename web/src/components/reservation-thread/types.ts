/**
 * Reservation Thread — shared type contract for the cross-POV thread primitive.
 *
 * Three POVs (admin / talent / client) all render through the same component
 * tree. The differences are *what controls they get* and *what the pills
 * surface*, never the layout primitive. See
 * `web/docs/messages-consolidation-audit-2026-05-13.md` for design intent.
 */

import type { ReactNode } from "react";

/** Who is looking at the thread. Drives label voice, control visibility,
 *  and per-pill content. `talent_coord` is the hybrid case from
 *  `project_workspace_talent_hybrid.md` — talent who also runs jobs. */
export type ReservationPov = "admin" | "talent" | "talent_coord" | "client";

/** Pipeline stages we expose in the header progress strip. The DB enum
 *  has more states (cancelled, expired, rejected) — those collapse to
 *  the closest forward stage for header purposes; closure is shown via
 *  a separate "closed" header variant, not a strip cell. */
export type ReservationStage =
  | "inquiry"
  | "review"
  | "offer"
  | "booked"
  | "wrapped";

/** Pill identifiers. Order in the array is the desktop default; mobile
 *  may re-order contextually by stage (decided per pov in §4.2 of the
 *  audit). */
export type PillKind =
  | "lineup"
  | "offer"
  | "event"
  | "files"
  | "team"; // admin-only

/** Status tone for a pill — drives the small dot color next to the label.
 *  We keep the palette muted; this is not a traffic-light system. */
export type PillTone = "neutral" | "info" | "warn" | "ok" | "alert";

/** A pill as rendered in the QuickStrip. The descriptor is the data
 *  shape — the actual pill component reads from this. */
export interface PillDescriptor {
  kind: PillKind;
  /** Short label, e.g. "Lineup", "Offer", "Event", "Files", "Team". */
  label: string;
  /** Status fragment, e.g. "2/3 accepted", "€3,200 · pending", "15 Jun · Tulum",
   *  "4". Rendered to the right of the label in a tabular-nums style. */
  status?: string;
  tone?: PillTone;
  /** Optional badge count (red-dot N) for unread/needs-attention. */
  badge?: number;
  /** If false, the pill is rendered disabled (e.g. Offer pill before any
   *  offer exists, but still shows "No offer yet" hint on tap). */
  enabled?: boolean;
}

/** A composer-area action pill. Three states: idle, pending (after click,
 *  while server action runs), done (briefly, before the row disappears). */
export interface ActionPill {
  id: string;
  label: string;
  /** Visual emphasis. `primary` = filled, `secondary` = outlined, `danger`
   *  = soft red. The pill set never has more than one `primary`. */
  emphasis?: "primary" | "secondary" | "danger";
  /** Async handler; the row shows a pending spinner while this is in
   *  flight, then removes itself if the result triggers a stage change. */
  onClick: () => void | Promise<void>;
  /** If true, the pill is shown but not tappable (e.g. waiting on someone
   *  else's action upstream). */
  disabled?: boolean;
  /** Optional one-line subtitle shown above the row when this set is
   *  active, e.g. "Coordinator invited you. Accept, hold, or decline." */
  preamble?: string;
}

/** A sheet that opens when a pill is tapped. SheetHost manages the open
 *  pill and renders the matching sheet — desktop = right-side drawer,
 *  mobile = bottom-sheet. */
export interface SheetDescriptor {
  kind: PillKind;
  /** Sheet title shown in the sheet header. Plain-English, role-aware
   *  (e.g. talent's lineup sheet titled "Your lineup", admin's titled
   *  "Lineup"). */
  title: string;
  /** Content rendered inside the sheet body. Sheets are full-height on
   *  mobile, 460–520px wide on desktop. */
  content: ReactNode;
  /** Optional footer (action row) for sheets that own destructive or
   *  primary actions (e.g. Offer sheet's "Send to client" button). */
  footer?: ReactNode;
}

/** The full prop contract for <ReservationThread>. All slots are
 *  optional except `pov` and `header` — empty/null pills/actions are
 *  fine and degrade gracefully. */
export interface ReservationThreadProps {
  pov: ReservationPov;
  /** Header descriptor — title, subtitle, stage, optional move-to menu. */
  header: ReservationThreadHeader;
  /** Pill descriptors for the quick-strip, in desktop order. */
  pills?: PillDescriptor[];
  /** Sheet descriptors indexed by pill kind. The host opens the matching
   *  sheet when a pill is tapped; pills without a matching sheet show a
   *  toast hint instead. */
  sheets?: Partial<Record<PillKind, SheetDescriptor>>;
  /** The message stream component — passed in as a node so each POV can
   *  bring its own renderer (admin = AdminMessageStream, client =
   *  ClientMessageStream, etc.). */
  stream: ReactNode;
  /** The composer node — passed in for the same reason. */
  composer: ReactNode;
  /** Optional action row above the composer (Accept/Hold/Decline,
   *  Approve/Decline/Counter). Disappears after answered. */
  actionRow?: ActionPill[] | null;
  /** Optional pickle for which pill is open. Sheet host owns this
   *  internally too, but parents may force-open one (e.g. open Offer
   *  sheet from a notification deep-link). */
  initialOpenPill?: PillKind | null;
}

/** Header data — kept thin. Move-to menu is admin/coord-only; for client
 *  and pure-talent we omit it. */
export interface ReservationThreadHeader {
  title: string;
  /** One-line context. Client name + city + date for admin; agency name
   *  + date for talent/client; etc. */
  subtitle?: string;
  /** Current stage. The header progress strip lights up cells up to and
   *  including this. */
  stage: ReservationStage;
  /** Soft "closed" overlay when inquiry has ended badly (cancelled /
   *  declined / expired). Stage strip dims, banner says why. */
  closedReason?: string;
  /** Optional move-to menu items (admin only). Each item runs an action
   *  when tapped; the host shows them in a ⋯ dropdown. */
  moveToMenu?: Array<{ id: string; label: string; onClick: () => void; danger?: boolean }>;
}
