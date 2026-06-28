import type { MiniChatPanelProps } from "@/lib/inquiry/guest-chat-contract";

import type { SurfaceMode } from "./mini-chat-styles";

// Local extension of MiniChatPanelProps for the F4 expand/collapse props + the
// Phase 3 launcher-cart wiring. NOT added to guest-chat-contract.ts (shared
// read-only); consumed by MiniChatPanel + the launcher only.
export type MiniChatPanelLocalProps = MiniChatPanelProps & {
  /**
   * Jon 360 Phase 7 — dark surface variant for noir tenants. Derived from the
   * tenant's resolved background.mode at the mount and threaded down. A LOCAL
   * prop (not on the shared read-only contract). Defaults to "light", so light
   * tenants are byte-identical.
   */
  surfaceMode?: SurfaceMode;
  /** When true, render 2-pane expanded mode. Owned by TalentProfileChatLauncher. */
  expanded?: boolean;
  /** Toggle handler from TalentProfileChatLauncher's setExpanded. */
  onToggleExpand?: () => void;
  /** Phase 3: inquiry-cart talent ids (useInquiryCart().cartIds) for preload/empty-state. */
  cartTalentIds?: readonly string[];
  /** Best-effort display names aligned with cartTalentIds (picker chips). */
  cartTalentNames?: string[];
  /** One-shot: open scrolled to the Talent section (+N chip / a rail avatar). */
  openToTalentSection?: boolean;
  /** Clear the openToTalentSection intent once consumed. */
  onConsumeOpenToTalentSection?: () => void;
  /** Remove a talent from the cart (mirrors the rail X; single source). */
  onRemoveCartTalent?: (talentProfileId: string) => void;
  /**
   * Register the panel's unified talent-patch runner up to the launcher (B6) so a
   * rail X-remove routes through the SAME useUnifiedInquiry.patch path as an
   * in-chat change (same saving state, grace window, retry). Called with the FULL
   * remaining selected_ids set (replace semantics).
   */
  onRegisterRemoveTalent?: (
    runner:
      | ((
          selectedIds: string[],
          selectionMode: "i_know_who" | "agency_recommends",
          selectedNames: string[],
        ) => void)
      | null,
  ) => void;
  /**
   * Report the live inquiry id up to the launcher whenever it resolves (early-row
   * create / resume / switch), so a rail X-remove can patch talent.selected_ids in
   * sync with the cart WITHOUT spawning a fresh row (id stays null until a real
   * structured commit creates one).
   */
  onInquiryIdChange?: (inquiryId: string | null) => void;
};
