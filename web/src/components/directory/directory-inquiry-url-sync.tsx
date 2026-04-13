"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";

/**
 * Opens the inquiry sheet when returning from a successful submission
 * (`?inquiry=submitted&...`), then strips query params from the URL.
 */
export function DirectoryInquiryUrlSync() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { showSuccess } = useDirectoryInquiryModal();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (params.get("inquiry") !== "submitted") return;

    handled.current = true;
    showSuccess({
      email: params.get("email"),
      activation: params.get("activation"),
    });
    const next = new URLSearchParams(params.toString());
    next.delete("inquiry");
    next.delete("email");
    next.delete("activation");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, showSuccess]);

  return null;
}
