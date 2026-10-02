/** Structural mirror of edit-chrome `EditDevice` (kept local so lib does not import edit-chrome). */
type EditDevice = "desktop" | "tablet" | "mobile" | "wide" | "compact";

type ParamsLike = { get(name: string): string | null } | null | undefined;

/** True when this request is the editor's own Tablet/Phone preview frame
 *  (`?iframe=1`): it must paint the site canvas only, never editor chrome. */
export function isDeviceFrameRequest(params: ParamsLike): boolean {
  return params?.get("iframe") === "1";
}

export function deviceFromFrameParam(params: ParamsLike): EditDevice | undefined {
  const d = params?.get("device");
  return d === "tablet" || d === "mobile" || d === "wide" || d === "compact" || d === "desktop"
    ? d
    : undefined;
}
