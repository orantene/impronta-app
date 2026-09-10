/**
 * Reading the point of sale's two inputs off the admin shell's client bridge.
 *
 * There are two of them and they come from different places, which is exactly
 * why the first cut of the mobile nav got both wrong:
 *
 *   • the PLATFORM kill switch — `platform_settings.workspace_pos_enabled`,
 *     one row for the whole product, loaded by `loadPlatformWorkspaceUi` and
 *     bridged as `workspaceUi.posEnabled`. Absent means off, matching the
 *     switch's own default.
 *
 *   • the WORKSPACE's enabled modes — `agencies.settings.pos.locations.default
 *     .modes`, parsed on the server by `enabledPosModesFromSettings` and
 *     bridged as `tenantIdentity.posModes`. Absent does NOT mean "none": an
 *     absent field means the bridge did not tell us, and the parser's
 *     documented answer to that is `["counter"]`. `[]` is a real and different
 *     value — a workspace that has switched every mode off — so defaulting to
 *     `[]` silently hides the POS from every workspace that has never opened
 *     the settings page. That was the shipped bug.
 *
 * Lives out here rather than inline in `state/context.tsx` because that file is
 * on the line-count ratchet (`file-size-ratchet.static.test.ts`), and because
 * the fallback rule above is worth a test of its own.
 */
import { enabledPosModesFromSettings, type PosMode } from "@/lib/pos/modes";

export type { PosMode };

/**
 * What `enabledPosModesFromSettings` answers when handed no settings at all.
 * Read from the parser instead of restated as a literal, so the two cannot
 * drift apart.
 */
export const DEFAULT_POS_MODES: readonly PosMode[] = enabledPosModesFromSettings(undefined);

export type WorkspacePosBridge = {
  readonly posEnabled: boolean;
  readonly posModes: readonly PosMode[];
};

export function readWorkspacePosBridge(
  workspaceUi: { posEnabled?: boolean } | null | undefined,
  tenantIdentity: { posModes?: readonly PosMode[] } | null | undefined,
): WorkspacePosBridge {
  return {
    posEnabled: workspaceUi?.posEnabled ?? false,
    posModes: tenantIdentity?.posModes ?? DEFAULT_POS_MODES,
  };
}
