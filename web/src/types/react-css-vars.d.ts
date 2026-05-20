/**
 * Augment React's CSSProperties so `style={{ '--my-var': value }}` is
 * accepted without a cast. CSS custom properties (variables) are a
 * legitimate dynamic-value channel — see Y3 lane in the style-system
 * remediation plan. The `--${string}` template-literal key type lets
 * TypeScript enforce the `--` prefix while accepting any variable name.
 */
import "react";

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
