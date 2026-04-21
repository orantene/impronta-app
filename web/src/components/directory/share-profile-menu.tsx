"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

// Phase 5/6 M5 — growth hook: share CTA on the canonical /t/[code] surface.
// The canonical URL is passed from the server (canonicalTalentUrl resolves
// to the app host regardless of which host renders the page), so sharing
// from an agency overlay still points the recipient at the global view.

type ShareProfileMenuProps = {
  talentId: string;
  profileCode: string;
  displayName: string;
  canonicalUrl: string;
  sourcePage: string;
  labels: {
    heading: string;
    copyLink: string;
    copyLinkDone: string;
    shareWhatsapp: string;
    shareSystem: string;
    whatsappTemplate: string;
  };
  className?: string;
};

const WHATSAPP_BASE = "https://wa.me/";

function applyTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export function ShareProfileMenu({
  talentId,
  profileCode,
  displayName,
  canonicalUrl,
  sourcePage,
  labels,
  className,
}: ShareProfileMenuProps) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setCanNativeShare(true);
    }
  }, []);

  const whatsappHref = useMemo(() => {
    const text = applyTemplate(labels.whatsappTemplate, {
      name: displayName,
      url: canonicalUrl,
    });
    return `${WHATSAPP_BASE}?text=${encodeURIComponent(text)}`;
  }, [labels.whatsappTemplate, displayName, canonicalUrl]);

  const track = useCallback(
    (method: "copy_link" | "whatsapp" | "native") => {
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.share_profile, {
        talent_id: talentId,
        profile_code: profileCode,
        source_page: sourcePage,
        share_method: method,
      });
    },
    [talentId, profileCode, sourcePage],
  );

  const onCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(canonicalUrl);
      } else {
        const ta = document.createElement("textarea");
        ta.value = canonicalUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      track("copy_link");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail silently in insecure contexts; WhatsApp + native
      // share remain available.
    }
  }, [canonicalUrl, track]);

  const onWhatsApp = useCallback(() => {
    track("whatsapp");
  }, [track]);

  const onNative = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.share) return;
    try {
      await navigator.share({
        title: displayName,
        text: displayName,
        url: canonicalUrl,
      });
      track("native");
    } catch {
      // User dismissed the native sheet — not an error.
    }
  }, [displayName, canonicalUrl, track]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--impronta-gold-dim)]">
        {labels.heading}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="gap-2 border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
          aria-live="polite"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? labels.copyLinkDone : labels.copyLink}
        </Button>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="gap-2 border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
        >
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWhatsApp}
          >
            <WhatsAppIcon className="size-4" />
            {labels.shareWhatsapp}
          </a>
        </Button>
        {canNativeShare ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onNative}
            className="gap-2 border-[var(--impronta-gold-border)] text-[var(--impronta-muted)] hover:text-[var(--impronta-foreground)]"
          >
            <Share2 className="size-4" />
            {labels.shareSystem}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M20.52 3.48A11.76 11.76 0 0 0 12.05 0C5.49 0 .14 5.34.14 11.91a11.84 11.84 0 0 0 1.6 5.94L0 24l6.3-1.65a11.93 11.93 0 0 0 5.75 1.47h.01c6.56 0 11.91-5.34 11.91-11.91a11.8 11.8 0 0 0-3.45-8.43ZM12.06 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.74.98 1-3.64-.24-.38a9.86 9.86 0 0 1-1.52-5.26c0-5.46 4.45-9.9 9.92-9.9a9.86 9.86 0 0 1 7 2.9 9.82 9.82 0 0 1 2.9 7c0 5.46-4.45 9.9-9.91 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.09 4.49.71.3 1.26.49 1.69.63.71.22 1.35.19 1.86.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}
