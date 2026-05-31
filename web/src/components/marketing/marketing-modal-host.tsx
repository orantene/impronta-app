"use client";

/**
 * Mounts the talent registration modal once per marketing surface and opens it
 * in response to the `TALENT_MODAL_EVENT` custom event dispatched by any CTA
 * (header, hero, footer, in-page buttons). Rendered in `MarketingShell` so the
 * modal is available on every marketing page without each section owning state.
 */

import { useEffect, useState } from "react";
import { TalentRegisterModal, TALENT_MODAL_EVENT } from "./talent-register-modal";

export function MarketingModalHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(TALENT_MODAL_EVENT, handler);
    return () => window.removeEventListener(TALENT_MODAL_EVENT, handler);
  }, []);

  if (!open) return null;
  return <TalentRegisterModal onClose={() => setOpen(false)} />;
}
