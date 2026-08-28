"use client";

/**
 * The Image panel's PER-DEVICE SOURCE control.
 *
 * Per-device values are the one kind of state in the builder that is genuinely
 * invisible (see `responsive-override-badge.tsx` for the same argument about
 * the canvas): the phone canvas shows the phone photo, desktop shows the
 * desktop photo, and nothing on either screen says the two have parted
 * company. So this control does two things, not one:
 *
 *   ON A PHONE / TABLET CANVAS it offers a media field for THAT device, with
 *   the same `InspectorOverrideBadge` the style fields use, whose Reset clears
 *   the tier back to INHERITING the desktop image (never to a default).
 *
 *   ON THE DESKTOP CANVAS it renders nothing at all unless a per-device image
 *   already exists, and then it renders a read-only line per tier so an
 *   operator editing desktop can SEE that the phone is showing a different
 *   photo, and clear it from where they are standing.
 *
 * The alt text stays a single field on the base panel on purpose. `<picture>`
 * carries one accessible name, on its inner `<img>`; art direction is
 * alternate renditions of the SAME subject, so a second alt would have nowhere
 * to render. It also means this control cannot create a node that publishes
 * with a missing alt: it adds no alt-bearing element, and the publish
 * preflight's image scan still sees exactly one image node with one alt.
 *
 * Its own file rather than another block inside `builder-node-content.tsx`
 * (4,900 lines) or `kit/inspector-ui.tsx` (793 of an 800-line cap).
 */

import type { BuilderImageNode } from "@/lib/site-admin/builder-node";

import { breakpointLabelForDevice } from "../breakpoint-registry";
import { INSPECTOR_FIELD_LABEL_CLASS, InspectorOverrideBadge } from "./kit/inspector-ui";
import { MediaField, toMediaValue } from "./kit/media-field";
import { useInspectorT } from "./kit/use-inspector-t";
import {
  isImageSourceTier,
  nextImageSources,
  setImageSourceTiers,
  type ImageSourceTier,
} from "./responsive-image-sources";

export function ResponsiveImageSourceField({
  node,
  tenantId,
  device,
  commitPatch,
}: {
  readonly node: BuilderImageNode;
  readonly tenantId: string;
  /** The canvas viewport the operator is editing right now. */
  readonly device: string;
  readonly commitPatch: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useInspectorT();
  const sources = node.props.sources;
  const setTiers = setImageSourceTiers(sources);
  const activeTier: ImageSourceTier | null = isImageSourceTier(device)
    ? device
    : null;

  const write = (tier: ImageSourceTier, next: { url: string; mediaId?: string | null } | null) => {
    commitPatch({ sources: nextImageSources(sources, tier, next) });
  };

  // Desktop (or a preview-only tier): stay out of the way unless something is
  // already overridden, in which case say so and offer the way back.
  if (!activeTier) {
    if (setTiers.length === 0) return null;
    return (
      <div className="flex flex-col gap-1.5">
        <span className={INSPECTOR_FIELD_LABEL_CLASS}>
          {t("Different image on smaller screens")}
        </span>
        {setTiers.map((tier) => (
          <div key={tier} className="flex items-center gap-2">
            <InspectorOverrideBadge
              device={tier}
              onReset={() => write(tier, null)}
              tooltip="This device shows its own photo. Reset to use the desktop image."
            />
            <span className="truncate text-[11px] opacity-70">
              {sources?.[tier]?.src ?? ""}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const deviceLabel = t(breakpointLabelForDevice(activeTier));
  const current = sources?.[activeTier];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={INSPECTOR_FIELD_LABEL_CLASS}>
          {t("Image for this device")}
        </span>
        {current ? (
          <InspectorOverrideBadge
            device={activeTier}
            onReset={() => write(activeTier, null)}
            tooltip="This device shows its own photo. Reset to use the desktop image."
          />
        ) : null}
      </div>
      <MediaField
        tenantId={tenantId}
        value={toMediaValue(current?.src, current?.mediaId)}
        onChange={(next) => write(activeTier, next)}
        emptyLabel="Choose image"
        aspect="4/5"
        layout="row"
      />
      <span className="text-[11px] opacity-70">
        {t(
          "Leave this empty and {device} keeps the desktop image. Set it to swap in a photo framed for this screen; the alt text is shared.",
        ).replace("{device}", deviceLabel.toLowerCase())}
      </span>
    </div>
  );
}
