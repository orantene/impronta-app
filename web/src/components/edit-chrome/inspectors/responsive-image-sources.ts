/**
 * responsive-image-sources.ts — WHERE A PER-DEVICE IMAGE SWAP LANDS.
 *
 * The owner's requirement, verbatim: "media such photo or banners ... in many
 * times needs to be a mobile specific design". Text size, position and heights
 * already round-trip per device. An image's FRAMING did too (`objectFit` /
 * `objectPosition` / `aspectRatio` are all breakpoint-plumbed). Its SOURCE did
 * not: `src` and `mediaId` are flat props, so a 21:9 desktop banner could be
 * recropped for a phone but never replaced with a photo that actually works at
 * 375px. That replacement is what art direction means.
 *
 * `BuilderImageNode.props.sources.{tablet,mobile}` is that lane, and this
 * module is the one place that computes the next value of it. Extracted from
 * the panel on purpose: the three invariants below are each invisible at the
 * call site and each is a data-loss bug when broken, so they get a test that
 * does not mount an inspector.
 *
 *   1. Setting a phone source NEVER touches the desktop `src` / `mediaId`, and
 *      never touches the tablet source either.
 *   2. Clearing a tier DELETES that tier, so the node goes back to INHERITING
 *      the desktop image. It never writes a default, and never writes an empty
 *      string (which `render.tsx` would reject anyway, but silently).
 *   3. Clearing the last tier prunes `sources` to `undefined` rather than
 *      leaving `{}` behind, so a node that has been set and unset is deep-equal
 *      to one that never had a per-device source at all. Without that, "no per
 *      -device media renders byte-identically to today" would be true only
 *      until someone experimented with the control.
 *
 * `patchBuilderNodeProps` SHALLOW-merges props, so every writer here returns
 * the COMPLETE next `sources` map, never a fragment.
 */

import type { BuilderImageDeviceSource } from "@/lib/site-admin/builder-node";

/**
 * The render-backed art-direction tiers, widest first.
 *
 * Deliberately the same two ids, in the same order, as
 * `editableOverrideTierIds()` returns for `style.responsive`: an operator
 * editing on the phone canvas expects the image control and the style controls
 * to write to the same device. The renderer pairs them with the same width
 * boundaries the responsive stylesheet already uses.
 */
export const IMAGE_SOURCE_TIERS = ["tablet", "mobile"] as const;

export type ImageSourceTier = (typeof IMAGE_SOURCE_TIERS)[number];

export type ImageDeviceSources = Partial<
  Record<ImageSourceTier, BuilderImageDeviceSource>
>;

/** True when `device` is a tier this node can carry its own image for. */
export function isImageSourceTier(device: string): device is ImageSourceTier {
  return (IMAGE_SOURCE_TIERS as readonly string[]).includes(device);
}

/** The tiers that currently carry an image, widest first. */
export function setImageSourceTiers(
  sources: ImageDeviceSources | undefined,
): ImageSourceTier[] {
  return IMAGE_SOURCE_TIERS.filter((tier) => {
    const entry = sources?.[tier];
    return Boolean(entry && typeof entry.src === "string" && entry.src.trim());
  });
}

/**
 * The COMPLETE next `sources` map after setting or clearing one tier.
 *
 * `next === null` (or an empty url) clears — the tier is deleted, not blanked,
 * so the node inherits the desktop image again. Returns `undefined` when no
 * tier is left, which is the shape a node that never used the feature has.
 */
export function nextImageSources(
  current: ImageDeviceSources | undefined,
  tier: ImageSourceTier,
  next: { url: string; mediaId?: string | null } | null,
): ImageDeviceSources | undefined {
  const out: ImageDeviceSources = {};
  for (const key of IMAGE_SOURCE_TIERS) {
    const entry = current?.[key];
    if (key !== tier && entry && entry.src.trim()) out[key] = entry;
  }
  const url = next?.url?.trim();
  if (url) {
    out[tier] = {
      src: url,
      ...(next?.mediaId ? { mediaId: next.mediaId } : {}),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
