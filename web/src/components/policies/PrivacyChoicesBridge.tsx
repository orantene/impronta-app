"use client";

import { useEffect } from "react";

import {
  PRIVACY_CHOICES_EVENT,
  PRIVACY_CHOICES_HREF,
} from "@/lib/policies/footer-links";

/**
 * Turns any footer link whose href is `#privacy-choices` into a button press:
 * dispatches `tulala:privacy-choices` on window. The consent panel listens for
 * that event (owned by the consent work, not here). Renders nothing.
 *
 * Delegated on `document` so it works for footer links rendered by the footer
 * section and by builder button nodes alike, without touching either renderer.
 */
export function PrivacyChoicesBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      // Several mounts may coexist (page + footer section): the first one to
      // handle the click prevents default, the rest skip it.
      if (event.defaultPrevented || !(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href !== PRIVACY_CHOICES_HREF && !href.endsWith(PRIVACY_CHOICES_HREF)) return;
      event.preventDefault();
      window.dispatchEvent(new Event(PRIVACY_CHOICES_EVENT));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
