/**
 * Surgical write into `style.responsive.{mobile|tablet}.{visibility,order}`.
 * Used by the device-tier HUD so a tablet hide does not clobber the mobile
 * bucket (and vice versa). Pure — the edit-context callback only runs the
 * engine `patch` op.
 */

export type ResponsiveStructureBucket = "mobile" | "tablet";

export type ResponsiveStructurePatch = {
  visibility?: "visible" | "hidden";
  order?: number | null;
};

export function applyResponsiveStructurePatch(
  currentStyle: Record<string, unknown>,
  bucket: ResponsiveStructureBucket,
  patch: ResponsiveStructurePatch,
): Record<string, unknown> {
  const currentResponsive =
    (currentStyle.responsive as Record<string, unknown> | undefined) ?? {};
  const currentBucket = {
    ...((currentResponsive[bucket] as Record<string, unknown> | undefined) ?? {}),
  };

  if ("visibility" in patch) {
    if (patch.visibility === undefined) delete currentBucket.visibility;
    else currentBucket.visibility = patch.visibility;
  }
  if ("order" in patch) {
    if (patch.order === undefined || patch.order === null) delete currentBucket.order;
    else currentBucket.order = patch.order;
  }

  const nextResponsive: Record<string, unknown> = { ...currentResponsive };
  if (Object.keys(currentBucket).length > 0) {
    nextResponsive[bucket] = currentBucket;
  } else {
    delete nextResponsive[bucket];
  }

  const nextStyle: Record<string, unknown> = { ...currentStyle };
  if (Object.keys(nextResponsive).length > 0) {
    nextStyle.responsive = nextResponsive;
  } else {
    delete nextStyle.responsive;
  }
  return nextStyle;
}
