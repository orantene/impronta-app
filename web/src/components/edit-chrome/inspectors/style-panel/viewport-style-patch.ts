/**
 * StylePanel — WHERE A STYLE EDIT LANDS.
 *
 * Every control in the panel writes through one function, and that function
 * decides between three destinations: the base style (desktop), the container
 * -query bucket, or `responsive[<tier>]`. Getting that wrong is invisible in
 * the panel and obvious on the page, so the decision is extracted here as pure
 * functions that a test can drive without mounting a 5,000-line component.
 *
 * Lifted verbatim out of `style-panel.tsx`'s `patchSelectedStandaloneStyle`
 * (behaviour unchanged, same key order, same cleaners) when the token-scale
 * controls landed: a stepper writing `paddingTop` on a mobile canvas has to
 * reach `responsive.mobile.paddingTop` and leave the desktop value alone, and
 * "has to" deserves a test rather than a reading of the call site.
 */

import type {
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import { isResponsivePlumbedStyleKey } from "@/lib/site-admin/builder-node/responsive-style-keys";

import type { NodeViewport } from "./section-types";
import {
  mergeHoverLane,
  type HoverLaneStyle,
  type StyleValueWithHover,
} from "./hover-lane";

/**
 * Split a patch by whether the renderer has a breakpoint lane for each key.
 *
 * Thirty style keys do not. Written into `responsive[viewport]` they validate,
 * save, and read back into the field on reload — and emit nothing: the control
 * reports success and the page never changes. Those keys route to the BASE
 * style instead, where they actually render.
 */
export function splitPatchByResponsiveLane(patch: Partial<BuilderNodeStyleValue>): {
  scoped: Partial<BuilderNodeStyleValue>;
  desktopOnly: Partial<BuilderNodeStyle>;
} {
  const desktopOnly: Record<string, unknown> = {};
  const scoped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    (isResponsivePlumbedStyleKey(key) ? scoped : desktopOnly)[key] = value;
  }
  return {
    scoped: scoped as Partial<BuilderNodeStyleValue>,
    desktopOnly: desktopOnly as Partial<BuilderNodeStyle>,
  };
}

/**
 * The panel's two style allow-list cleaners, passed in rather than imported.
 *
 * They are ~340 lines of key-by-key allow-list living inside `style-panel.tsx`;
 * hauling them into this module to make one routing decision testable would be
 * a much larger move than the one being made here. Injecting them keeps this
 * file pure, and lets its test drive the routing without reproducing the
 * allow-lists.
 */
export interface StyleCleaners {
  readonly cleanStyle: (
    value: BuilderNodeStyle | undefined,
  ) => BuilderNodeStyle | undefined;
  readonly cleanValue: (
    value: BuilderNodeStyleValue | undefined,
  ) => BuilderNodeStyleValue | undefined;
}

/** Which bucket the active viewport + scope writes into. */
export type StyleWriteTarget = "base" | "container" | "responsive";

export function styleWriteTarget(
  viewport: string,
  scope: string,
): StyleWriteTarget {
  if (viewport === "desktop") return "base";
  return scope === "container" ? "container" : "responsive";
}

/**
 * The next style for a patch applied at `viewport` under `scope`.
 *
 * The base style is never touched by a non-desktop write: the tier bucket is
 * merged over its own previous contents and everything else is carried through
 * by reference.
 */
export function styleWithViewportPatch(
  currentStyle: BuilderNodeStyle | undefined,
  viewport: string,
  scope: string,
  patch: Partial<BuilderNodeStyleValue>,
  { cleanStyle, cleanValue }: StyleCleaners,
): BuilderNodeStyle | undefined {
  // `viewport` narrows to a real override tier here, which is what lets both
  // bucket writes below index their maps without a cast.
  if (viewport === "desktop") return cleanStyle({ ...currentStyle, ...patch });

  if (
    styleWriteTarget(viewport, scope) === "container" &&
    (viewport === "tablet" || viewport === "mobile")
  ) {
    return cleanStyle({
      ...currentStyle,
      containerQueries: {
        ...(currentStyle?.containerQueries ?? {}),
        [viewport]: cleanValue({
          ...(currentStyle?.containerQueries?.[viewport] ?? {}),
          ...patch,
        }),
      },
    });
  }

  return cleanStyle({
    ...currentStyle,
    responsive: {
      ...(currentStyle?.responsive ?? {}),
      [viewport]: cleanValue({
        ...(currentStyle?.responsive?.[viewport] ?? {}),
        ...patch,
      }),
    },
  });
}

/**
 * Hover writes: desktop → `style.hover`. Tablet/mobile →
 * `style.responsive.{tier}.hover` (the viewport router spine).
 */
export function styleWithHoverPatch(
  currentStyle: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
  patch: Partial<HoverLaneStyle>,
  { cleanStyle, cleanValue }: StyleCleaners,
): BuilderNodeStyle | undefined {
  if (viewport === "desktop") {
    return cleanStyle({
      ...currentStyle,
      hover: mergeHoverLane(currentStyle?.hover as HoverLaneStyle | undefined, patch),
    });
  }
  const bucket = currentStyle?.responsive?.[viewport] as
    | StyleValueWithHover
    | undefined;
  const nextBucket = cleanValue({
    ...(bucket ?? {}),
    hover: mergeHoverLane(bucket?.hover, patch),
  } as BuilderNodeStyleValue);
  return cleanStyle({
    ...currentStyle,
    responsive: {
      ...(currentStyle?.responsive ?? {}),
      [viewport]: nextBucket,
    },
  });
}
