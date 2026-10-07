"use client";

import { useEffect, useState } from "react";

import { isTalentOpenHash } from "@/lib/talent-site/contact-channels";

/**
 * Keeps "Ask a question" on the talent's own site. Clicks on the in-page
 * anchor, and on older buttons that still point at the hub profile, open
 * the existing guest dock. No second chat.
 *
 * When the published tree has no Ask channel, a fallback bar offers the
 * same three channels. It stays hidden once the template already ships
 * contact / ask chrome (BJ-04 — avoid a ghost duplicate under the footer).
 */
export function TalentSiteContactBridge({
  heading,
  askLabel,
  showAsk = true,
  whatsappLabel,
  emailLabel,
  truth,
  whatsappHref,
  emailHref,
}: {
  heading: string;
  askLabel: string;
  /** False when the talent is not taking inquiries (WSF D): no Ask button. */
  showAsk?: boolean;
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
    // A cold load or a pasted `...#talent-ask` link opens the chat too (the click above only
    // covers links followed on the page).
    const onHash = () => {
      if (isTalentOpenHash(window.location.hash)) window.dispatchEvent(new Event("tulala:open-guest-chat"));
    };
    // The initial fragment never fires `hashchange`, so a cold load of `...#book` (a custom-domain
    // link opened in a new tab) must run the handler once itself. The dock mounts as a sibling and
    // can attach its listener after this effect, so repeat once after it has had time to mount;
    // opening is idempotent.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (isTalentOpenHash(window.location.hash)) {
      timers.push(setTimeout(onHash, 0), setTimeout(onHash, 800));
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHash);
    // WSF: entry "hidden" (chat off, inquiries off): no ask / inquire control stays on the page.
    let observer: MutationObserver | null = null;
    if (!showAsk) {
      const sweep = () => hideAskControls(document);
      sweep();
      observer = new MutationObserver(sweep);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    setShowFallback(!pageAlreadyHasContactChrome());
    return () => {
      timers.forEach(clearTimeout);
      observer?.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHash);
    };
  }, [showAsk]);

  // `#talent-ask` is a real target on every talent page: the chat entry this bridge belongs to.
  // The click handler above opens the chat; this id keeps the link from being a dead anchor
  // (no-script visitors, crawlers and link checkers) and gives the hash somewhere to land.
  const askTarget = (
    <>
      <span id="talent-ask" data-talent-ask-target="" aria-hidden="true" />
      <span id="book" data-talent-book-target="" aria-hidden="true" />
    </>
  );

  if (!showFallback) return askTarget;

  return (
    <>
    {askTarget}
    <section data-talent-contact-fallback="" className="talent-contact-fallback">
      <style>{FALLBACK_CSS}</style>
      <p className="talent-contact-fallback__heading">{heading}</p>
      <p className="talent-contact-fallback__truth">{truth}</p>
      <div className="talent-contact-fallback__actions">
        {showAsk ? (
          <button
            type="button"
            data-talent-ask=""
            onClick={() => window.dispatchEvent(new Event("tulala:open-guest-chat"))}
          >
            {askLabel}
          </button>
        ) : null}
        {whatsappHref ? <a href={whatsappHref}>{whatsappLabel}</a> : null}
        {emailHref ? <a href={emailHref}>{emailLabel}</a> : null}
      </div>
    </section>
    </>
  );
}

/** Published contact band, ask anchor, or an ask CTA already on the page. */
function pageAlreadyHasContactChrome(): boolean {
  if (document.querySelector('a[href$="#talent-ask"], a[href$="#book"]')) {
    return true;
  }
  if (document.querySelector("[data-contact-layer], [data-talent-ask]")) {
    return true;
  }
  for (const a of Array.from(document.querySelectorAll("a"))) {
    const href = a.getAttribute("href") ?? "";
    if (isAskHref(href)) return true;
    if (isAskLabel(a.textContent ?? "")) return true;
  }
  return false;
}

const ASK_LABELS = new Set([
  "hacer una pregunta",
  "ask a question",
  "poser une question",
  "escríbeme",
  "escribeme",
  "inquire",
]);

export function isAskLabel(text: string): boolean {
  return ASK_LABELS.has(text.trim().toLowerCase());
}

/** An ask / inquire control: an ask href, or an ask label on a link or button. */
export function isAskControl(href: string, label: string): boolean {
  return isAskHref(href) || isAskLabel(label);
}

function hideAskControls(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll("a, button"))) {
    if (el.closest("[data-talent-contact-fallback]")) continue;
    if (!isAskControl(el.getAttribute("href") ?? "", el.textContent ?? "")) continue;
    const node = el as HTMLElement;
    if (!node.hidden) {
      node.hidden = true;
      node.style.display = "none";
    }
  }
}

/** `/contact`, `/contacto`, optionally locale-prefixed, with no extra segments. */
const CONTACT_PATH = /^\/(?:[a-z]{2}\/)?contact(?:o)?\/?$/i;

export function isAskHref(href: string): boolean {
  if (href === "#talent-ask" || href.endsWith("#talent-ask")) return true;
  if (href === "#book" || href.endsWith("#book")) return true;
  const path = href.split(/[?#]/)[0] ?? "";
  if (CONTACT_PATH.test(path)) return true;
  if (href.startsWith("mailto:") || href.includes("wa.me") || href.includes("whatsapp.com")) {
    return false;
  }
  return /(?:\?|&)inquire=1(?:&|$)/.test(href);
}

const FALLBACK_CSS = `
.talent-contact-fallback{
  margin:2rem auto 1.5rem;
  max-width:36rem;
  padding:1.25rem 1.25rem 1.35rem;
  border:1px solid var(--token-color-line,#EDE8EB);
  border-radius:16px;
  background:var(--token-color-surface-raised,#fff);
  color:var(--token-color-ink,#241F26);
  text-align:center;
}
.talent-contact-fallback__heading{
  margin:0 0 .35rem;
  font-family:var(--token-font-display,Georgia,serif);
  font-size:1.25rem;
  font-weight:500;
  color:var(--token-color-ink,#241F26);
}
.talent-contact-fallback__truth{
  margin:0 0 1rem;
  font-size:.875rem;
  line-height:1.45;
  color:var(--token-color-muted,#665F6B);
}
.talent-contact-fallback__actions{
  display:flex;
  flex-wrap:wrap;
  gap:.5rem;
  justify-content:center;
}
.talent-contact-fallback__actions button,
.talent-contact-fallback__actions a{
  appearance:none;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:44px;
  padding:0 1rem;
  border-radius:999px;
  border:1px solid var(--token-color-line,#EDE8EB);
  background:var(--token-color-surface-raised,#fff);
  color:var(--token-color-ink,#241F26);
  font:inherit;
  font-size:.875rem;
  font-weight:600;
  text-decoration:none;
  cursor:pointer;
}
.talent-contact-fallback__actions button{
  border-color:var(--token-color-primary,#A82458);
  background:var(--token-color-primary,#A82458);
  color:#fff;
}
`;
