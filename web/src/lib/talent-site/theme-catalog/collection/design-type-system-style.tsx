import { EDITORIAL_TYPE_SYSTEM_CSS } from "./design-type-system";

/**
 * The editorial type-system stylesheet (`design-type-system.ts`). Always safe
 * to mount: every rule is scoped to a canvas root whose effective tokens set
 * `type.system = "editorial"`, and every value is a token var.
 */
export function TypeSystemStyle() {
  return <style data-type-system-style="">{EDITORIAL_TYPE_SYSTEM_CSS}</style>;
}
