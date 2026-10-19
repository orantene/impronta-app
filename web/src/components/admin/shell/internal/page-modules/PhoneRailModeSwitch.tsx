"use client";

/**
 * Phone chrome Talent | Admin switch (TUL-378 Live QA): the desktop rails
 * already show RailModeSwitch; below 720px the rail is hidden and the top-bar
 * pill was often clipped or flipMode-only (inert for hub dual owners). Más
 * and the talent top bar mount this so a dual owner can always reach the
 * other hat.
 */

import { useAdminShell } from "../state";
import { RailModeSwitch } from "./RailModeSwitch";
import {
  canShowRailModeSwitch,
  leaveRailHat,
  type RailModeActive,
} from "./rail-mode-switch-action";

export function PhoneRailModeSwitch({
  active,
  onAfterSwitch,
  className = "mt-3",
}: {
  active: RailModeActive;
  onAfterSwitch?: () => void;
  className?: string;
}) {
  const {
    state,
    flipMode,
    bridgeOwnedWorkspaceSlug,
    bridgeTalentSelfProfile,
    bridgeTalentUnread,
    bridgeWorkspaceUnread,
  } = useAdminShell();

  if (
    !canShowRailModeSwitch({
      active,
      alsoTalent: state.alsoTalent,
      ownedWorkspaceSlug: bridgeOwnedWorkspaceSlug,
      talentSelfProfile: bridgeTalentSelfProfile,
    })
  ) {
    return null;
  }

  return (
    <div data-tulala-phone-rail-mode-switch className={className}>
      <RailModeSwitch
        active={active}
        talentUnread={bridgeTalentUnread ?? 0}
        adminUnread={bridgeWorkspaceUnread ?? 0}
        onSwitch={() => {
          leaveRailHat({
            active,
            alsoTalent: state.alsoTalent,
            ownedWorkspaceSlug: bridgeOwnedWorkspaceSlug,
            flipMode,
          });
          onAfterSwitch?.();
        }}
      />
    </div>
  );
}
