"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Raw author HTML/CSS, isolated in a sandboxed iframe.
 *
 * SECURITY MODEL (why this is safe where a regex sanitizer was not):
 *   - The author markup is delivered via the `srcdoc` attribute. React escapes
 *     attribute values at serialization, so the author cannot break out of the
 *     attribute (a literal `"` becomes `&quot;`) to inject parent-level DOM.
 *   - `sandbox="allow-scripts"` with NO `allow-same-origin` forces a UNIQUE
 *     OPAQUE ORIGIN. Any script the author ships runs there — it cannot read
 *     the parent-scoped `.tulala.digital` cookies, reach `document` of the
 *     parent, or navigate the top frame. We intentionally omit
 *     `allow-same-origin` / `allow-top-navigation` / `allow-popups` /
 *     `allow-forms`. (Pairing `allow-scripts` + `allow-same-origin` would let
 *     framed script remove its own sandbox — never do that here.)
 *   - There is NO DOM-level HTML sanitizer. The shared-apex origin model plus a
 *     `script-src 'unsafe-inline'` CSP means an in-DOM sanitizer has no backstop
 *     and is unsalvageable; the iframe origin boundary is the control.
 *
 * AUTO-HEIGHT: iframes don't grow to content, so the framed document posts its
 * scrollHeight back via `postMessage`. The parent correlates messages by frame
 * identity (`event.source === iframe.contentWindow`) — the message origin is
 * "null" for an opaque-origin frame, so origin matching is impossible and would
 * be the wrong check. `minHeight` is the documented floor used before the first
 * height message arrives (and for no-JS author content).
 */

const HEIGHT_MESSAGE_TYPE = "tulala:builder-code-height";
const MAX_FRAME_HEIGHT = 5000;
const DEFAULT_MIN_HEIGHT = 120;

// Runs INSIDE the sandboxed frame. Reports content height on load and whenever
// it changes. Kept tiny and string-injected (the frame has no module system).
const HEIGHT_REPORTER = `(function(){
  function h(){
    var d=document;
    return Math.max(
      d.documentElement?d.documentElement.scrollHeight:0,
      d.body?d.body.scrollHeight:0,
      d.documentElement?d.documentElement.offsetHeight:0
    );
  }
  function send(){
    try{ parent.postMessage({type:"${HEIGHT_MESSAGE_TYPE}",height:h()},"*"); }catch(e){}
  }
  if(document.readyState!=="loading") send();
  window.addEventListener("load",send);
  window.addEventListener("resize",send);
  if(typeof ResizeObserver!=="undefined"){
    try{ new ResizeObserver(send).observe(document.documentElement); }catch(e){}
  }
  setTimeout(send,300);
})();`;

function buildSrcDoc(html: string): string {
  // `<base target="_blank">` makes author links open in a new tab (the frame is
  // sandboxed without allow-top-navigation, so same-tab navigation would be
  // blocked anyway). Reset + reporter are appended, never the author's job.
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<base target=\"_blank\">" +
    "<style>*{box-sizing:border-box}html,body{margin:0;padding:0}" +
    "body{font:400 16px/1.5 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;color:#111}" +
    "img,video,iframe{max-width:100%}</style></head><body>" +
    html +
    "<script>" +
    HEIGHT_REPORTER +
    "<\/script></body></html>"
  );
}

export interface BuilderNodeCodeFrameProps {
  nodeId: string;
  html: string;
  minHeight?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
  /** Spread of `data-builder-*` style/marker attributes from the renderer. */
  dataAttrs?: Record<string, string | number | boolean | undefined>;
}

export function BuilderNodeCodeFrame({
  nodeId,
  html,
  minHeight,
  title,
  className,
  style,
  dataAttrs,
}: BuilderNodeCodeFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const floor = Math.max(minHeight ?? DEFAULT_MIN_HEIGHT, 40);
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      // Correlate by frame identity, not origin: an opaque-origin sandbox posts
      // with origin "null", so only the source-window check is meaningful.
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== HEIGHT_MESSAGE_TYPE) return;
      const next = Number(data.height);
      if (!Number.isFinite(next) || next <= 0) return;
      setMeasured(Math.min(Math.ceil(next), MAX_FRAME_HEIGHT));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const height = Math.max(measured ?? floor, floor);

  return (
    <iframe
      ref={frameRef}
      data-builder-node-id={nodeId}
      data-builder-node-kind="code"
      data-builder-code-frame=""
      {...dataAttrs}
      className={className}
      title={title ?? "Custom HTML block"}
      loading="lazy"
      // SECURITY: scripts only — never allow-same-origin / top-navigation / popups.
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={buildSrcDoc(html)}
      style={{
        display: "block",
        width: "100%",
        border: 0,
        minHeight: floor,
        height,
        ...style,
      }}
    />
  );
}
