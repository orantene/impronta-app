/**
 * Shared leave-hat logic for RailModeSwitch / ModeTogglePill / phone Más.
 * Desktop rails already call the same branches; phone chrome must too or the
 * Admin half looks inert (flipMode no-ops when alsoTalent is false, and hub
 * dual owners only have ownedWorkspaceSlug).
 */

export type RailModeActive = "talent" | "admin";

export function canShowRailModeSwitch(input: {
  active: RailModeActive;
  alsoTalent: boolean;
  ownedWorkspaceSlug?: string | null;
  talentSelfProfile: unknown | null;
}): boolean {
  if (input.active === "talent") {
    return input.alsoTalent || !!input.ownedWorkspaceSlug;
  }
  return input.alsoTalent || input.talentSelfProfile !== null;
}

/** Leave the hat you are on for the other one. */
export function leaveRailHat(input: {
  active: RailModeActive;
  alsoTalent: boolean;
  ownedWorkspaceSlug?: string | null;
  flipMode: () => void;
  /** Test seam — production uses window.location.assign. */
  assign?: (href: string) => void;
}): void {
  const go = input.assign ?? ((href: string) => {
    window.location.assign(href);
  });
  if (input.alsoTalent) {
    input.flipMode();
    return;
  }
  if (input.active === "talent" && input.ownedWorkspaceSlug) {
    // Hub dual owner: no hybrid membership here — go to the owned business.
    // admin-href-allow: cross-tenant switch to bridgeOwnedWorkspaceSlug.
    go(`/${input.ownedWorkspaceSlug}/admin`);
    return;
  }
  if (input.active === "admin") {
    // Canonical talent surface (not /{slug}/talent — that bounces hybrids).
    go("/talent/today");
  }
}
