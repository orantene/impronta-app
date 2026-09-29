import { EDITORIAL_TYPE_SYSTEM_CSS, MAGAZINE_TYPE_SYSTEM_CSS } from "./design-type-system";

/**
 * Type-system stylesheets. Always safe to mount: every rule is scoped to a
 * canvas root whose effective tokens set `type.system`, and every value is a
 * token var.
 */
export function TypeSystemStyle() {
  return (
    <>
      <style data-type-system-style="editorial">{EDITORIAL_TYPE_SYSTEM_CSS}</style>
      <style data-type-system-style="magazine">{MAGAZINE_TYPE_SYSTEM_CSS}</style>
    </>
  );
}
