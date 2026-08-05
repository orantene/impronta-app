import type { SectionMeta } from "../types";

export const joinRegisterMeta: SectionMeta = {
  key: "join_register",
  // W2-T2 — server data-loader (resolves the tenant's registration state at
  // render time): an in-editor prop edit must still router.refresh() to repaint.
  hasLiveData: true,
  label: "Join / Register",
  description:
    "A call-to-action that opens your branded talent registration, so people can join your roster directly from your site.",
  businessPurpose: "conversion",
  visibleToAgency: true,
  category: "convert",
  // Revealed under "Show advanced" rather than the curated default picker
  // (keeps the default-tier budget intact); still searchable + tagged new.
  inDefault: false,
  tag: "new",
};
