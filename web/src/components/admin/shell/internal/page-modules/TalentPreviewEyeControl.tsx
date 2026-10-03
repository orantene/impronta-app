"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";
import {
  resolveTalentPublicPreviewDestinations,
  type TalentPublicPreviewKind,
} from "@/lib/talent/public-profile-href";
import { useCurrentOrigin } from "@/lib/talent/use-public-profile-href";

import { useDashboardText } from "../dashboard-i18n";

function EyeGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const KIND_LABEL: Record<TalentPublicPreviewKind, string> = {
  website: "My website",
  hub: "My Tulala profile",
};

/**
 * Top-bar eye: opens the talent's live personal website when one exists,
 * otherwise the hub `/t/<code>` page. When both surfaces exist, a small
 * chooser lists them instead of hard-linking only to the hub.
 */
export function TalentPreviewEyeControl({
  profileCode,
}: {
  profileCode: string | null | undefined;
}) {
  const copy = useDashboardText();
  const origin = useCurrentOrigin();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const publicSiteUrl = siteLoad?.ok ? siteLoad.state.publicSiteUrl : null;
  const { destinations, defaultHref } = resolveTalentPublicPreviewDestinations({
    profileCode,
    publicSiteUrl,
    currentOrigin: origin,
  });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!defaultHref) return null;

  const buttonClass =
    "inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[8px] border border-admin-border-soft bg-white text-admin-ink-muted no-underline hover:border-admin-border hover:text-admin-ink [transition:border-color_var(--transition-admin-micro),color_var(--transition-admin-micro)]";

  if (destinations.length === 1) {
    return (
      <a
        data-testid="talent-preview-eye"
        href={defaultHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={copy.t("Preview site")}
        title={copy.t("Preview public site")}
        className={buttonClass}
      >
        <EyeGlyph />
      </a>
    );
  }

  return (
    <div ref={rootRef} className="relative" data-testid="talent-preview-eye-chooser">
      <button
        type="button"
        data-testid="talent-preview-eye"
        aria-label={copy.t("Preview site")}
        title={copy.t("Preview public site")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
      >
        <EyeGlyph />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={copy.t("Preview public site")}
          className="absolute right-0 top-[calc(100%+6px)] z-[70] min-w-[220px] rounded-[10px] border border-admin-border-soft bg-white p-[4px] shadow-[0_8px_24px_rgba(11,11,13,0.12)]"
        >
          {destinations.map((dest) => (
            <a
              key={dest.kind}
              role="menuitem"
              href={dest.href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`talent-preview-${dest.kind}`}
              onClick={() => setOpen(false)}
              className="block rounded-[7px] px-[10px] py-[8px] no-underline hover:bg-[rgba(11,11,13,0.04)]"
            >
              <span className="block text-[13px] font-medium text-admin-ink">
                {copy.t(KIND_LABEL[dest.kind])}
              </span>
              <span className="mt-px block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-admin-ink-muted">
                {dest.href.replace(/^https?:\/\//, "")}
              </span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
