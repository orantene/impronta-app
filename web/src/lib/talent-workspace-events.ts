/** Document events for talent workspace — save state, toasts, and cross-section coordination. */

export const TALENT_WORKSPACE_STATE = "talent-workspace-state";
export const TALENT_WORKSPACE_TOAST = "talent-workspace-toast";
/** @deprecated Prefer TALENT_WORKSPACE_STATE + flash; kept for one-off listeners */
export const TALENT_PROFILE_SAVED = "talent-profile-saved";
export const TALENT_MEDIA_SAVED = "talent-media-saved";

export type TalentWorkspaceStateDetail = {
  profileDirty?: boolean;
  profileSaving?: boolean;
  mediaSaving?: boolean;
  workflowSaving?: boolean;
};

export type TalentWorkspaceToastDetail = {
  variant: "success" | "error" | "neutral";
  message: string;
};

export function dispatchTalentWorkspaceState(detail: TalentWorkspaceStateDetail) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(TALENT_WORKSPACE_STATE, { detail }));
}

export function dispatchTalentWorkspaceToast(detail: TalentWorkspaceToastDetail) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(TALENT_WORKSPACE_TOAST, { detail }));
}

export function dispatchTalentMediaSaved() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(TALENT_MEDIA_SAVED));
}
