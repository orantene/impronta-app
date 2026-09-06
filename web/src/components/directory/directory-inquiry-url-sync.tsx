"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptionalDirectoryInquiryModal } from "@/components/directory/directory-inquiry-modal-context";

/**
 * URL → inquiry-modal sync. Two triggers, both then strip their query params:
 *  - `?inquiry=submitted&...` — show the success panel after a redirect submit.
 *  - `?inquiry=open` — open the inquiry. Phase 3: the canonical inquiry surface
 *    is the floating CHAT launcher, so this now asks the launcher to open
 *    (`requestOpenChat`) instead of the legacy InquiryDrawer composer. This is
 *    the cross-surface fallback every repointed entry routes through (a surface
 *    without the chat launcher mounted simply no-ops the cue, which is harmless).
 */
export function DirectoryInquiryUrlSync() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // OPTIONAL, because this component rides along on arbitrary pages and the
  // ROOT layout mounts no provider. The throwing hook here took down `/`,
  // `/global-directory` and `/_not-found` 61 times during SERVER RENDER between
  // 2026-09-03 and 2026-09-05. With no provider there is no modal to sync a URL
  // to, so the correct behaviour is to do nothing — not to crash the page the
  // component happens to be mounted on.
  const modal = useOptionalDirectoryInquiryModal();
  const showSuccess = modal?.showSuccess;
  const requestOpenChat = modal?.requestOpenChat;
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    // No provider: nothing to open, and the ?inquiry param is left alone rather
    // than stripped, so a later render under a provider can still act on it.
    if (!showSuccess || !requestOpenChat) return;
    const mode = params.get("inquiry");
    if (mode !== "submitted" && mode !== "open") return;

    handled.current = true;
    if (mode === "submitted") {
      showSuccess({
        email: params.get("email"),
        activation: params.get("activation"),
      });
    } else {
      requestOpenChat();
    }
    const next = new URLSearchParams(params.toString());
    next.delete("inquiry");
    next.delete("email");
    next.delete("activation");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router, showSuccess, requestOpenChat]);

  return null;
}
