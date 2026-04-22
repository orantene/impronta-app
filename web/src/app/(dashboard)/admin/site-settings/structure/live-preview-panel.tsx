"use client";

/**
 * Live-preview iframe for the structure composer.
 *
 * Renders the tenant's draft state (preview mode) or live storefront
 * (fallback / no JWT) in an iframe with viewport toggle + manual
 * reload. A preview token is minted on mount via the server action
 * `mintPreviewTokenAction`; the iframe src carries it as
 * `?preview=<jwt>`. The storefront middleware on the first load
 * verifies the token, sets a tenant-scoped HttpOnly cookie, and
 * 302-redirects to a clean URL — so the JWT never persists in browser
 * history or server access logs.
 *
 * Refresh cycle: tokens are 15-min TTL, we refresh every 10 min (before
 * the TTL hits) so long editing sessions keep the preview alive.
 *
 * Viewport sizes mirror the most common responsive breakpoints. We
 * change the iframe's width (not scale) so the rendered page uses its
 * real mobile CSS at 375px, not a shrunken desktop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, Tablet, RefreshCw, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

import { mintPreviewTokenAction } from "./preview-token-action";

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
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Mint / refresh the preview token. A failed mint degrades to
  // published-state preview — better than a blocking error UI.
  const refreshToken = useCallback(async () => {
    try {
      const result = await mintPreviewTokenAction("homepage");
      if (result.ok && result.token) {
        setPreviewToken(result.token);
        setTokenError(null);
      } else {
        setPreviewToken(null);
        setTokenError(result.error ?? "Preview token unavailable.");
      }
    } catch (e) {
      setPreviewToken(null);
      setTokenError(
        e instanceof Error
          ? e.message
          : "Preview token unavailable — showing published state.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshToken();
    // JWT TTL is 15 min; refresh at 10 min so the iframe never carries
    // an expired token across a long editing session.
    const id = window.setInterval(
      () => {
        void refreshToken();
      },
      10 * 60 * 1000,
    );
    return () => window.clearInterval(id);
  }, [refreshToken]);

  const src = useMemo(() => {
    const url = new URL(path, origin);
    // The first render uses ?preview=<jwt> — middleware strips it + sets
    // the cookie. Subsequent reloads in the iframe run on the cookie.
    if (previewToken) url.searchParams.set("preview", previewToken);
    // Hash-nonce busts the iframe document without also busting CDN caches
    // on the storefront side (query string would flow to fetch keys).
    url.hash = `preview-${nonce}`;
    return url.toString();
  }, [origin, path, nonce, previewToken]);

  // Auto-reload after a publish event — parent bumps lastPublishedAt.
  useEffect(() => {
    setNonce((n) => n + 1);
  }, [lastPublishedAt]);

  function reload() {
    setNonce((n) => n + 1);
  }

  const current = VIEWPORTS[viewport];
  const previewActive = Boolean(previewToken);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              previewActive
                ? "bg-amber-400/20 text-amber-300"
                : "bg-muted/40 text-muted-foreground"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                previewActive ? "bg-amber-300" : "bg-muted-foreground"
              }`}
              aria-hidden
            />
            {previewActive ? "Draft" : "Published"}
          </span>
          {tokenError ? (
            <span
              className="text-[10px] text-destructive"
              title={tokenError}
            >
              token unavailable — showing published state
            </span>
          ) : null}
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
