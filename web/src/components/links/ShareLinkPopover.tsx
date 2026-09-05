"use client";

/**
 * The Share popover: one component mounted on every bookable thing.
 *
 * A reservation page, an event, a session, the menu, a table in the seating
 * designer, an appointment service, a talent profile, a receipt. They all hand
 * a person the same object — a tracked link — so they all get the same control
 * rather than each area inventing its own share button. That is the whole
 * reason the link is the object and the QR is a rendering of it.
 *
 * WHAT IS DELIBERATELY MISSING: "Design it" is disabled, with a reason. The
 * print canvas is Q3 and waits on the Page Builder Director. A button that
 * opens nothing is exactly what this PR's sibling removed from the talent
 * publish screen, and shipping another one here would be the same promise
 * broken in a new place.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  displayShortLink,
  mailToHref,
  qrAssetHref,
  whatsAppHref,
} from "@/lib/links/share-targets";

export type ShareLinkPopoverProps = {
  /**
   * The link, or **null when this thing has no link yet.**
   *
   * Null is the NORMAL first state of every subject in the product, not an
   * error: a thing gets its link on FIRST SHARE (CEO ruling 2026-09-05), so
   * until an operator shares it there is nothing to show.
   *
   * An earlier version of this component required `code` and `url`, which
   * deadlocked the ruling: the popover could only open for a subject that
   * already had a link, and a link only existed after a first share, so
   * nothing could ever be shared for the first time. Reported in #1798.
   */
  link: { code: string; url: string; scans30d?: number | null } | null;
  /** Human name, e.g. "Table 7". Used for the label and to suggest a code. */
  name: string;
  /** One line of context used in the shared message. */
  message?: string;
  /**
   * Create the link for this thing. Supplied by the area mounting the popover
   * as a bound server action, so **the mount still writes no `links` row
   * itself** — it hands over a subject and this component asks for the mint.
   * Six areas each inventing a code policy is what that instruction prevents.
   *
   * Omit it and the unminted state renders read-only, which is the honest
   * thing to show a viewer without permission to create one.
   */
  onMint?: () => Promise<{ code: string; url: string }>;
  onClose: () => void;
};

const PRINT_TEMPLATES = [
  { key: "table_tent", labelEn: "Table tent", dims: "10 × 15 cm" },
  { key: "a5", labelEn: "Flyer", dims: "A5" },
  { key: "sticker", labelEn: "Sticker", dims: "5 × 5 cm" },
  { key: "story", labelEn: "Story", dims: "1080 × 1920" },
] as const;

export function ShareLinkPopover({
  link, name, message, onMint, onClose,
}: ShareLinkPopoverProps) {
  const copy = useDashboardText();
  const [copied, setCopied] = useState(false);
  const [minted, setMinted] = useState<{ code: string; url: string } | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // `minted` is this session's result; `link` is what the server knew when the
  // popover opened. After a first share the second is stale and the first wins.
  const active = minted ?? link;
  const shortLink = active ? displayShortLink(active.url) : "";
  const shareMessage = message ?? name;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleMint = useCallback(async () => {
    if (!onMint || minting) return;
    setMinting(true);
    setMintError(null);
    try {
      setMinted(await onMint());
    } catch (err) {
      // Say what happened. A silent failure here leaves the operator clicking
      // a button that appears to do nothing, and the thing still unshared.
      setMintError(err instanceof Error ? err.message : "The link could not be created.");
    } finally {
      setMinting(false);
    }
  }, [onMint, minting]);

  const handleCopy = useCallback(async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.url);
      setCopied(true);
      // The confirmation clears itself; a permanent "Copied" is a lie the
      // moment the user copies something else.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [active]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.t("Share this link")}
      className="rounded-2xl border border-admin-line bg-admin-surface p-5 shadow-lg"
      style={{ maxWidth: 360 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-admin-ink text-base font-semibold">{name}</h2>
          <p className="text-admin-ink-muted font-mono text-xs">
            {active ? shortLink : copy.t("Not shared yet")}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={copy.t("Close")}
          className="text-admin-ink-muted rounded-full px-2 py-1"
        >
          ✕
        </button>
      </div>

      {!active ? (
        <div className="py-6 text-center">
          {/* The first-share state. Every subject in the product starts here:
              a thing gets its link when an operator shares it, not on publish,
              so there are no rows for things nobody ever shared. */}
          <p className="text-admin-ink-muted mb-4 text-sm">
            {copy.t("This does not have a link yet. Create one to share it, print it, or put it on a code.")}
          </p>
          {onMint ? (
            <>
              <button
                type="button"
                onClick={handleMint}
                disabled={minting}
                className="rounded-lg border border-admin-line px-4 py-2 text-sm disabled:opacity-60"
              >
                {minting ? copy.t("Creating…") : copy.t("Create a link")}
              </button>
              {mintError ? (
                <p role="alert" className="mt-3 text-xs text-admin-danger">{mintError}</p>
              ) : null}
            </>
          ) : (
            /* No mint action supplied: the viewer cannot create one. Say so
               rather than showing a button that would fail. */
            <p className="text-admin-ink-muted text-xs">
              {copy.t("Ask someone who can edit this workspace to create it.")}
            </p>
          )}
        </div>
      ) : (
        <>
      {/* The code itself. SVG so it stays sharp at any size, and it is the
          same symbol the print files carry. */}
      <img
        src={qrAssetHref(active.code, "svg")}
        alt={copy.t("QR code for {name}").replace("{name}", name)}
        width={180}
        height={180}
        className="mx-auto my-4 block rounded-lg bg-white"
      />

      <p className="text-admin-ink-muted mb-4 text-center text-xs">
        {copy.t("Tracked link")}
        {typeof active.scans30d === "number" ? ` · ${active.scans30d} ${copy.t("scans · 30d")}` : ""}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={handleCopy} className="rounded-lg border border-admin-line px-2 py-2 text-xs">
          {copied ? copy.t("Copied") : copy.t("Copy")}
        </button>
        <a
          href={whatsAppHref({ url: active.url, message: shareMessage })}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-admin-line px-2 py-2 text-center text-xs"
        >
          {copy.t("WhatsApp")}
        </a>
        <a
          href={mailToHref({ url: active.url, message: shareMessage, subject: name })}
          className="rounded-lg border border-admin-line px-2 py-2 text-center text-xs"
        >
          {copy.t("Email")}
        </a>
        <a
          href={qrAssetHref(active.code, "png", { widthMm: 50 })}
          download={`${active.code}.png`}
          className="rounded-lg border border-admin-line px-2 py-2 text-center text-xs"
        >
          {copy.t("PNG")}
        </a>
        <a
          href={qrAssetHref(active.code, "pdf")}
          className="rounded-lg border border-admin-line px-2 py-2 text-center text-xs"
        >
          {copy.t("Print PDF")}
        </a>
        {/* Instagram has no prefilled share URL — see share-targets.ts. Rather
            than a button that opens Instagram to nothing, the honest control is
            Copy, which is what a Story sticker needs anyway. */}
        <button
          type="button"
          onClick={handleCopy}
          title={copy.t("Copy the link, then paste it into your Story")}
          className="rounded-lg border border-admin-line px-2 py-2 text-xs"
        >
          {copy.t("Instagram")}
        </button>
      </div>

      <div className="mt-5">
        <p className="text-admin-ink-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
          {copy.t("Design it")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PRINT_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled
              title={copy.t("The print designer is not built yet")}
              className="cursor-not-allowed rounded-lg border border-dashed border-admin-line px-2 py-2 text-left text-xs opacity-60"
            >
              <span className="text-admin-ink block">{copy.t(t.labelEn)}</span>
              <span className="text-admin-ink-muted block text-[10px]">{t.dims}</span>
            </button>
          ))}
        </div>
        <p className="text-admin-ink-muted mt-2 text-[11px]">
          {copy.t("Coming soon. For now, use Print PDF.")}
        </p>
      </div>
        </>
      )}
    </div>
  );
}
