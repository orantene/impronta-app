"use client";

/**
 * ProfileShareRow — premium, icon-based sharing for the public talent profile.
 *
 * Replaces the old text-button ShareProfileMenu. Real social share intents
 * (X / Facebook / LinkedIn / WhatsApp), copy-link, a "share to Instagram"
 * helper (IG has no web share-intent, so we copy the link + open IG), and a
 * Print button (window.print()). Icon set mirrors the marketing footer SVGs
 * so it reads as a first-class tulala.digital surface.
 *
 * Keeps the existing share analytics (PRODUCT_ANALYTICS_EVENTS.share_profile).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

type ShareMethod =
  | "copy_link"
  | "whatsapp"
  | "x"
  | "facebook"
  | "linkedin"
  | "instagram"
  | "print"
  | "native";

type ProfileShareRowProps = {
  talentId: string;
  profileCode: string;
  displayName: string;
  canonicalUrl: string;
  sourcePage: string;
  labels: {
    heading: string;
    copyLink: string;
    copyLinkDone: string;
    whatsappTemplate: string;
  };
  /** "row" = full labelled share rail (header). "compact" = icon-only (card). */
  variant?: "row" | "compact";
};

export function ProfileShareRow({
  talentId,
  profileCode,
  displayName,
  canonicalUrl,
  sourcePage,
  labels,
  variant = "row",
}: ProfileShareRowProps) {
  const [copied, setCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  const track = useCallback(
    (method: ShareMethod) => {
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.share_profile, {
        talent_id: talentId,
        profile_code: profileCode,
        source_page: sourcePage,
        share_method: method,
      });
    },
    [talentId, profileCode, sourcePage],
  );

  const encodedUrl = useMemo(() => encodeURIComponent(canonicalUrl), [canonicalUrl]);
  const shareText = useMemo(
    () =>
      labels.whatsappTemplate
        ? labels.whatsappTemplate
            .replace(/\{name\}/g, displayName)
            .replace(/\{url\}/g, canonicalUrl)
        : `${displayName} — ${canonicalUrl}`,
    [labels.whatsappTemplate, displayName, canonicalUrl],
  );

  const intents = useMemo(
    () => ({
      x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(displayName)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      instagram: "https://www.instagram.com/",
    }),
    [encodedUrl, displayName, shareText],
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }, []);

  const onCopy = useCallback(async () => {
    const ok = await copyToClipboard(canonicalUrl);
    track("copy_link");
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [canonicalUrl, copyToClipboard, track]);

  // Instagram has no public web share-intent. Copy the link so it can be
  // pasted into a story/bio, then open Instagram in a new tab.
  const onInstagram = useCallback(async () => {
    await copyToClipboard(canonicalUrl);
    track("instagram");
    setIgCopied(true);
    window.setTimeout(() => setIgCopied(false), 2000);
    window.open(intents.instagram, "_blank", "noopener,noreferrer");
  }, [canonicalUrl, copyToClipboard, intents.instagram, track]);

  const onPrint = useCallback(() => {
    track("print");
    if (typeof window !== "undefined") window.print();
  }, [track]);

  const compact = variant === "compact";
  const btnSize = compact ? "h-9 w-9" : "h-10 w-10";

  return (
    <div className="flex flex-col gap-2.5">
      {!compact ? (
        <p
          className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--plt-muted-soft)" }}
        >
          {labels.heading}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          size={btnSize}
          label="Share on WhatsApp"
          href={intents.whatsapp}
          onClick={() => track("whatsapp")}
        >
          <WhatsAppIcon />
        </IconButton>
        <IconButton
          size={btnSize}
          label="Share on X"
          href={intents.x}
          onClick={() => track("x")}
        >
          <XIcon />
        </IconButton>
        <IconButton
          size={btnSize}
          label="Share on Facebook"
          href={intents.facebook}
          onClick={() => track("facebook")}
        >
          <FacebookIcon />
        </IconButton>
        <IconButton
          size={btnSize}
          label="Share on LinkedIn"
          href={intents.linkedin}
          onClick={() => track("linkedin")}
        >
          <LinkedInIcon />
        </IconButton>
        <IconButton
          size={btnSize}
          label={igCopied ? "Link copied for Instagram" : "Copy link for Instagram"}
          onClick={onInstagram}
          highlighted={igCopied}
        >
          {igCopied ? <CheckIcon /> : <InstagramIcon />}
        </IconButton>

        <span
          className="mx-0.5 hidden h-6 w-px sm:inline-block"
          style={{ background: "var(--plt-hairline-strong)" }}
          aria-hidden
        />

        <IconButton
          size={btnSize}
          label={copied ? labels.copyLinkDone : labels.copyLink}
          onClick={onCopy}
          highlighted={copied}
        >
          {copied ? <CheckIcon /> : <LinkIcon />}
        </IconButton>
        <IconButton size={btnSize} label="Print profile" onClick={onPrint}>
          <PrintIcon />
        </IconButton>
        {compact && canNativeShare ? (
          <IconButton
            size={btnSize}
            label="Share…"
            onClick={async () => {
              try {
                await navigator.share({ title: displayName, text: displayName, url: canonicalUrl });
                track("native");
              } catch {
                /* user dismissed */
              }
            }}
          >
            <ShareIcon />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  href,
  onClick,
  size,
  highlighted,
}: {
  children: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  size: string;
  highlighted?: boolean;
}) {
  const base = `group inline-flex ${size} items-center justify-center rounded-full border transition-[transform,color,border-color,background] hover:-translate-y-[1px]`;
  const style: React.CSSProperties = {
    borderColor: highlighted ? "var(--plt-forest)" : "var(--plt-hairline-strong)",
    color: highlighted ? "var(--plt-forest)" : "var(--plt-ink-soft)",
    background: highlighted ? "var(--plt-forest-soft)" : "var(--plt-bg-raised)",
  };
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={label}
        title={label}
        onClick={onClick}
        className={base}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-live="polite"
      onClick={onClick}
      className={base}
      style={style}
    >
      {children}
    </button>
  );
}

/* ── Icons — mirror the marketing footer set + standard brand glyphs ── */

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.52 3.48A11.76 11.76 0 0 0 12.05 0C5.49 0 .14 5.34.14 11.91a11.84 11.84 0 0 0 1.6 5.94L0 24l6.3-1.65a11.93 11.93 0 0 0 5.75 1.47h.01c6.56 0 11.91-5.34 11.91-11.91a11.8 11.8 0 0 0-3.45-8.43ZM12.06 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.64-.24-.38a9.86 9.86 0 0 1-1.52-5.26c0-5.46 4.45-9.9 9.92-9.9a9.86 9.86 0 0 1 7 2.9 9.82 9.82 0 0 1 2.9 7c0 5.46-4.45 9.9-9.91 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.09 4.49.71.3 1.26.49 1.69.63.71.22 1.35.19 1.86.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 4L20 20M20 4L4 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.6C16.6 2.5 15.6 2.5 14.4 2.5c-2.5 0-4.1 1.5-4.1 4.2v1.8H8v3h2.3V21h3.4v-9.5h2.5l.4-3H13.7Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7 10V17M7 7.5V7.5M11 17V13C11 11.3 12.3 10 14 10C15.7 10 17 11.3 17 13V17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.5 14.5L14.5 9.5M10 6.5L11.4 5.1a3.5 3.5 0 0 1 5 5L15 11.5M14 17.5L12.6 18.9a3.5 3.5 0 0 1-5-5L9 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 9V4h10v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4" y="9" width="16" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="14" width="10" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5L10 17.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 10.8L15.8 6.2M8.2 13.2L15.8 17.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
