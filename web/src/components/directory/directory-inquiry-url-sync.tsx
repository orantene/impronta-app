"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";

/**
 * URL → inquiry-modal sync. Two triggers, both then strip their query params:
 *  - `?inquiry=submitted&...` — show the success panel after a redirect submit.
 *  - `?inquiry=open` — open the composer. This is the cross-surface fallback:
 *    a surface without the inquiry-modal provider (e.g. a Max talent site, a
 *    freeform sub-page) routes its inquiry control here so the cart still has a
 *    real destination instead of dead-ending.
 */
export function DirectoryInquiryUrlSync() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { showSuccess, openInquiry } = useDirectoryInquiryModal();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const mode = params.get("inquiry");
    if (mode !== "submitted" && mode !== "open") return;

    handled.current = true;
    if (mode === "submitted") {
      showSuccess({
        email: params.get("email"),
        activation: params.get("activation"),
      });
    } else {
      openInquiry();
    }
    const next = new URLSearchParams(params.toString());
    next.delete("inquiry");
    next.delete("email");
    next.delete("activation");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, showSuccess, openInquiry]);

  return null;
}
