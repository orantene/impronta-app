"use client";

/**
 * Mounts the tenant-branded registration modal once on a workspace storefront
 * and opens it in response to the `TENANT_REGISTER_MODAL_EVENT` custom event
 * dispatched by any join CTA (auto header/footer button, page-builder block).
 *
 * The tenant context (slug, brand, CTA label, whether the visitor is already a
 * signed-in Tulala talent) is resolved server-side and passed in, so the modal
 * is fully branded without client round-trips.
 *
 * Auto-opens when the visitor returns from sign-in with `?register=1` (the
 * "Already have a Tulala account? Sign in to apply" round-trip), landing them
 * straight on the one-tap apply step thanks to the shared parent-domain session.
 */

import { useEffect, useState } from "react";

import {
  TalentRegisterModal,
  TENANT_REGISTER_MODAL_EVENT,
  type TenantRegisterContext,
} from "./talent-register-modal";

export function TenantRegisterModalHost({
  tenant,
  locale = "en",
}: {
  tenant: TenantRegisterContext;
  /** Active locale — drives modal copy and the locale stamped on signup. */
  locale?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(TENANT_REGISTER_MODAL_EVENT, handler);
    return () => window.removeEventListener(TENANT_REGISTER_MODAL_EVENT, handler);
  }, []);

  // Returning from sign-in (?register=1) → reopen on the apply step.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("register") === "1") {
        setOpen(true);
      }
    } catch {
      /* no-op */
    }
  }, []);

  if (!open) return null;
  return (
    <TalentRegisterModal
      tenant={tenant}
      locale={locale}
      onClose={() => setOpen(false)}
    />
  );
}

/** Client trigger that opens the tenant register modal from any CTA. */
export function OpenTenantRegisterButton({
  children,
  className,
  style,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={ariaLabel}
      onClick={() =>
        window.dispatchEvent(new CustomEvent(TENANT_REGISTER_MODAL_EVENT))
      }
    >
      {children}
    </button>
  );
}
