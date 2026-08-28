/**
 * W5-T6 — renders the runtime stylesheet for operator-defined custom
 * breakpoint tiers. Mount once near the canvas root (edit mode) and in the
 * published shell so custom-tier `data-section-<id>-*` overrides take effect
 * on the live page exactly like the static tablet/mobile rules.
 *
 * Renders nothing when there are no (valid) custom tiers — zero cost for the
 * common case. The generated CSS is deterministic + unit-tested in
 * `custom-breakpoint-css.test.ts`.
 */
import {
  generateContainerLayoutCss,
  generateCustomBreakpointCss,
} from "@/lib/site-admin/builder-node/custom-breakpoint-css";
import type { CustomBreakpoint } from "@/lib/site-admin/sections/shared/presentation";

export function BreakpointStyleEngine({
  tiers,
}: {
  tiers?: readonly CustomBreakpoint[] | null;
}) {
  const css = [generateCustomBreakpointCss(tiers), generateContainerLayoutCss(tiers)]
    .filter(Boolean)
    .join("\n\n");
  if (!css) return null;
  return (
    <style
      data-builder-custom-breakpoints=""
      // eslint-disable-next-line react/no-danger -- generated, slug-validated, no user HTML
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
