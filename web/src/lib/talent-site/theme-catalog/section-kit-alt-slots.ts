/**
 * Other slot keys a kit role may carry. A role keeps ONE canonical slot
 * (`section-kit.ts`), but a layout swap moves a landmark to a new key so sites
 * on the old layout take the change as one opt-in choice (release 2.7: the
 * footer band becomes `footer_rich`). Same role, same landmark: the Design
 * still has its footer.
 */
export const TALENT_KIT_ALT_SLOTS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "talent.shell.footer": ["footer_rich"],
  // Gridline: the FAQ is the contact role under the key the parity map addresses (`faq`).
  "talent.contact": ["faq"],
};
