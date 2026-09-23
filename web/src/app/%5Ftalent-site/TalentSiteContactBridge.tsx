"use client";

import { useEffect, useState } from "react";

/**
 * Keeps "Ask a question" on the talent's own site. Clicks on the in-page
 * anchor, and on older buttons that still point at the hub profile, open
 * the existing guest dock. No second chat.
 *
 * When the published tree has no Ask anchor, a fallback bar offers the
 * same three channels. It stays hidden once the template button is there.
 */
export function TalentSiteContactBridge({
  heading,
  askLabel,
  whatsappLabel,
  emailLabel,
  truth,
  whatsappHref,
  emailHref,
}: {
  heading: string;
  askLabel: string;
  whatsappLabel: string;
  emailLabel: string;
  truth: string;
  whatsappHref: string;
  emailHref: string;
}) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (!isAskHref(href)) return;
      event.preventDefault();
      window.dispatchEvent(new Event("tulala:open-guest-chat"));
    };
    document.addEventListener("click", onClick, true);
    setShowFallback(document.querySelector('a[href="#talent-ask"]') == null);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!showFallback) return null;

  return (
    <section data-talent-contact-fallback="">
      <p>{heading}</p>
      <p>{truth}</p>
      <button
        type="button"
        data-talent-ask=""
        onClick={() => window.dispatchEvent(new Event("tulala:open-guest-chat"))}
      >
        {askLabel}
      </button>
      {whatsappHref ? <a href={whatsappHref}>{whatsappLabel}</a> : null}
      {emailHref ? <a href={emailHref}>{emailLabel}</a> : null}
    </section>
  );
}

function isAskHref(href: string): boolean {
  if (href === "#talent-ask" || href.endsWith("#talent-ask")) return true;
  if (href.startsWith("mailto:") || href.includes("wa.me") || href.includes("whatsapp.com")) {
    return false;
  }
  return /(?:\?|&)inquire=1(?:&|$)/.test(href);
}
