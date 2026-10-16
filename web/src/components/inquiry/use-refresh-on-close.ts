"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * TUL-966: the submit action no longer revalidates the client pages, because
 * refreshing the page the drawer sits on re-rendered it through the loading
 * skeleton and dropped the "sent" confirmation. The page refreshes when the
 * person closes the drawer after a submitted inquiry instead.
 *
 * Returns the wrapped close handler and a stable setter; call the setter from
 * an effect (refs must not be written during render).
 */
export function useRefreshOnClose(onClose: () => void): readonly [() => void, (submitted: boolean) => void] {
  const router = useRouter();
  const submittedRef = useRef(false);
  const close = useCallback(() => {
    onClose();
    if (submittedRef.current) router.refresh();
  }, [onClose, router]);
  const noteSubmitted = useCallback((submitted: boolean) => {
    submittedRef.current = submitted;
  }, []);
  return [close, noteSubmitted] as const;
}
