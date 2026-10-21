/**
 * dated-mount.ts — when a public service page mounts the dated booking step
 * (TUL-1411). Pure.
 *
 * Mount whenever the picker loaded and the item has any upcoming date: even a
 * sold out, closed or private date is shown, because the step is what says so
 * (waitlist, sales closed, private on request). An item with no dates keeps the
 * generic booking link, so non-dated services are untouched.
 */

export const DATED_STEP_ANCHOR_ID = "dated-places";

export function datedAnchorHref(): string {
  return `#${DATED_STEP_ANCHOR_ID}`;
}

export function shouldMountDatedStep(
  picker: { ok: boolean; dates?: ReadonlyArray<{ state: string }> } | null | undefined,
): boolean {
  return !!picker && picker.ok === true && (picker.dates?.length ?? 0) > 0;
}
