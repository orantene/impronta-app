"use client";

/**
 * Live-preview iframe for the structure composer.
 *
 * V1 scope: renders the tenant's LIVE (published) storefront in an
 * iframe with viewport toggle + manual reload. Draft-state preview
 * requires extending middleware to accept a signed `?preview=<jwt>`
 * query param (today's middleware only reads the preview cookie) —
 * that's a follow-up; committing this v1 unblocks the composer having
 * ANY preview at all.
 *
 * Viewport sizes mirror the most common responsive breakpoints. We
 * change the iframe's width (not scale) so the rendered page uses its
 * real mobile CSS at 375px, not a shrunken desktop.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet, RefreshCw, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<
  Viewport,
  { label: string; width: number; Icon: typeof Monitor }
> = {
  desktop: { label: "Desktop", width: 1280, Icon: Monitor },
  tablet: { label: "Tablet", width: 768, Icon: Tablet },
  mobile: { label: "Mobile", width: 390, Icon: Smartphone },
};

export interface LivePreviewPanelProps {
  /** Tenant storefront origin, e.g. http://midnight.lvh.me:3000 */
  origin: string;
  /** Defaults to "/" (homepage). Pass a relative path to preview other pages. */
  path?: string;
  /**
   * Server-rendered last-published timestamp; when it changes the iframe
   * auto-reloads. Let callers push fresh "last-published" on publish events.
   */
  lastPublishedAt?: string | null;
}

export function LivePreviewPanel({
  origin,
  path = "/",
  lastPublishedAt,
}: LivePreviewPanelProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const src = useMemo(() => {
    const url = new URL(path, origin);
    // Hash-nonce busts the iframe document without also busting CDN caches
    // on the storefront side (query string would flow to fetch keys).
    url.hash = `preview-${nonce}`;
    return url.toString();
  }, [origin, path, nonce]);

  // Auto-reload after a publish event — parent bumps lastPublishedAt.
  useEffect(() => {
    setNonce((n) => n + 1);
  }, [lastPublishedAt]);

  function reload() {
    setNonce((n) => n + 1);
  }

  const current = VIEWPORTS[viewport];

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </span>
          <span className="text-[10px] text-muted-foreground">
            shows published state · reload after you publish
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
            const active = key === viewport;
            const { Icon, label } = VIEWPORTS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setViewport(key)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${
                  active
                    ? "border-foreground bg-foreground/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-muted/30"
                }`}
                aria-pressed={active}
                title={label}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reload}
            title="Reload preview"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href={new URL(path, origin).toString()}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="overflow-hidden rounded-md border border-border/50 bg-background shadow-sm"
          style={{
            width: `min(100%, ${current.width}px)`,
            height: viewport === "mobile" ? 720 : 640,
            transition: "width 220ms ease, height 220ms ease",
          }}
        >
          <iframe
            ref={iframeRef}
            key={src}
            src={src}
            className="h-full w-full"
            title={`Storefront preview (${current.label})`}
            // sandbox kept permissive for the storefront's own interactions;
            // the iframe source is a same-platform host we control, so scripts
            // are allowed.
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
