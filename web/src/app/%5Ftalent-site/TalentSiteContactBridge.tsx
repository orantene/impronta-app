"use client";

import { useEffect, useState } from "react";

import { intentForHref, openIntentFor, type BookEntry } from "@/lib/talent-site/book-entry";
import { isTalentOpenHash } from "@/lib/talent-site/contact-channels";
import { requestTalentOpen } from "@/lib/talent-site/open-intent-client";
import { openDeepLinkFromLocation } from "@/lib/talent-site/open-booking-at-slot";

/** The URL whose fragment already opened the entry: the effect re-runs must not re-open it. */
let coldLoadHandledFor = "";

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
  bookEntry = null,
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
  /**
   * Where `#book` lands (TUL-246): one bookable service opens its booking sheet,
   * several the service picker (the dock), none the plain inquire entry.
   */
  bookEntry?: BookEntry | null;
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
      requestTalentOpen(intentForHref(href, bookEntry) ?? openIntentFor("ask", bookEntry));
    };
    // A cold load or a pasted `...#book` link opens the entry too (the click above only covers
    // links followed on the page).
    // TUL-232: `?book=<offering>&slot=<ISO>#book` opens the booking sheet at that slot. The offering
    // registers when its card mounts, which can be after this effect, so a deep link that cannot
    // resolve yet is retried once; only the final try falls back to the plain entry, and `sheetOpen`
    // stops a retry from resetting an open sheet.
    // TUL-246: the plain entry is queued and handed over when its target (dock or sheet) announces it
    // is listening, so there is no mount-timing retry for it.
    let sheetOpen = false;
    const onSheet = (e: Event) => {
      sheetOpen = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onHash = (final = true) => {
      if (!isTalentOpenHash(window.location.hash)) return;
      const deep = openDeepLinkFromLocation(window.location, { alreadyOpen: () => sheetOpen });
      if (deep === "opened") return;
      if (deep === "unresolved" && !final) {
        timers.push(setTimeout(() => onHash(true), 800));
        return;
      }
      const intent = intentForHref(window.location.hash, bookEntry);
      if (intent) requestTalentOpen(intent);
    };
    // The initial fragment never fires `hashchange`, so a cold load runs the handler once itself.
    if (coldLoadHandledFor !== window.location.href) {
      coldLoadHandledFor = window.location.href;
      onHash(false);
    }
    document.addEventListener("click", onClick, true);
    const onHashChange = () => onHash();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("tulala:maison-sheet", onSheet);
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
      observer?.disconnect();
      timers.forEach(clearTimeout);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("tulala:maison-sheet", onSheet);
    };
  }, [showAsk, bookEntry]);

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
            onClick={() => requestTalentOpen(openIntentFor("ask", bookEntry))}
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
