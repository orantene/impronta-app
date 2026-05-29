// ============================================================================
// settings-deeplink.ts — cross-component request to open a specific Settings
// tab + accordion section.
//
// The workspace plan badge (and any other surface) calls
// `requestSettingsSection({ tab, section })` and then navigates to the Settings
// page via `setPage("settings")`. WorkspacePageView resolves the request two
// ways, covering both timing cases:
//
//   1. Mount-consume — when we navigate from another page, WorkspacePageView
//      remounts. It calls `consumePendingSettingsSection()` on mount and
//      applies whatever was parked just before navigation.
//   2. Live event — when we're already on Settings, no remount happens, so
//      WorkspacePageView also listens for SETTINGS_SECTION_EVENT and applies
//      the target from the event detail.
//
// A module-level pending var (not React state / context) is the simplest
// hand-off that survives the setPage → remount: requestSettingsSection() sets
// it synchronously *before* navigation, and the freshly-mounted view reads +
// clears it on mount. The event covers the no-remount path.
// ============================================================================

export const SETTINGS_SECTION_EVENT = "tulala:open-settings-section";

export type SettingsTabId =
  | "workspace"
  | "roster"
  | "team"
  | "billing"
  | "advanced";

export type SettingsSectionTarget = {
  /** Settings tab id — must match a WorkspacePageView TABS entry. */
  tab: SettingsTabId;
  /** Accordion section id — must match a `data-settings-section` value. */
  section: string;
};

let pendingTarget: SettingsSectionTarget | null = null;

/**
 * Request that the Settings page open a specific tab + accordion section.
 * Parks the target synchronously, then dispatches SETTINGS_SECTION_EVENT for
 * any already-mounted WorkspacePageView. The CALLER is responsible for the
 * actual navigation (`setPage("settings")`) — this only records the intent.
 */
export function requestSettingsSection(target: SettingsSectionTarget): void {
  pendingTarget = target;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SettingsSectionTarget>(SETTINGS_SECTION_EVENT, {
        detail: target,
      }),
    );
  }
}

/**
 * Read and clear the parked Settings section target. Called by
 * WorkspacePageView on mount; returns null when there's nothing pending.
 */
export function consumePendingSettingsSection(): SettingsSectionTarget | null {
  const t = pendingTarget;
  pendingTarget = null;
  return t;
}
