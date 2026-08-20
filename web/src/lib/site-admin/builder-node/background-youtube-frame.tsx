"use client";

/**
 * background-youtube-frame.tsx — the YouTube lane's iframe, plus the loop.
 *
 * WHY THIS EXISTS AT ALL. A YouTube embed can only loop itself through
 * `loop=1&playlist=<same id>`, and naming a playlist makes the player draw
 * prev / pause / next buttons across the middle of the frame. `controls=0`
 * does not remove them — they are playlist chrome. On a hero background those
 * buttons are simply someone else's UI sitting on the client's film.
 *
 * So the URL drops `playlist` (see `youtubeBackgroundParams`) and the loop
 * happens here: when the player reports ENDED, seek to 0 and play again.
 *
 * WHY POSTMESSAGE AND NOT THE YOUTUBE API SCRIPT. Loading
 * `https://www.youtube.com/iframe_api` would mean a third-party script tag, a
 * `script-src` CSP entry, and a global `onYouTubeIframeAPIReady` singleton
 * shared with every other embed on the page. The API is a documented
 * postMessage protocol; speaking it directly costs ~40 lines and no bytes.
 *
 * THE FALLBACK IS THE POINT. Everything above is a behavior we do not control:
 * if the player never completes the handshake, or reports ENDED and then does
 * not resume, this component puts the OLD playlist-loop URL back. The visible
 * cost of that path is the buttons returning; the cost of not having it is a
 * hero frozen on YouTube's end screen. The failure mode has to be today's
 * behavior, not a broken page.
 *
 * Under `prefers-reduced-motion` the sheet hides the frame outright, so none of
 * this runs — there is nothing to loop when nothing is shown.
 */
import { useEffect, useRef } from "react";

import {
  YOUTUBE_PLAYER_ENDED,
  YOUTUBE_PLAYER_PLAYING,
  youtubeBackgroundLoopFallbackUrl,
  youtubePlayerStateFromMessage,
} from "./background-media";

/** Where commands are sent, and the only origins whose messages are believed. */
const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";
const PLAYER_ORIGINS = new Set([PLAYER_ORIGIN, "https://www.youtube.com"]);

/** How long the handshake gets before we assume the API is not coming. */
const HANDSHAKE_TIMEOUT_MS = 6000;
const HANDSHAKE_RETRY_MS = 750;
/** How long a replay gets to actually start before we stop trusting it. */
const REPLAY_TIMEOUT_MS = 2500;

export function BackgroundYouTubeFrame({
  url,
  sandbox,
}: {
  url: string;
  sandbox: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // The frame is `display:none` under reduced motion. Nothing to drive.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let handshakeTimer = 0;
    let giveUpTimer = 0;
    let replayTimer = 0;
    let heard = false;
    let usedFallback = false;

    const post = (message: Record<string, unknown>) => {
      frame.contentWindow?.postMessage(JSON.stringify(message), PLAYER_ORIGIN);
    };
    const command = (func: string, args: unknown[] = []) =>
      post({ event: "command", func, args, id: 1, channel: "widget" });

    /** Put the no-JS playlist loop back. Once — never a reload cycle. */
    const fallBackToPlaylistLoop = () => {
      if (usedFallback) return;
      usedFallback = true;
      const loopUrl = youtubeBackgroundLoopFallbackUrl(url);
      if (loopUrl) frame.src = loopUrl;
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      if (!PLAYER_ORIGINS.has(event.origin)) return;
      let data: { event?: string; info?: unknown };
      try {
        data =
          typeof event.data === "string"
            ? (JSON.parse(event.data) as typeof data)
            : (event.data as typeof data);
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;

      // Any well-formed message means the player is talking to us.
      if (!heard) {
        heard = true;
        window.clearInterval(handshakeTimer);
        window.clearTimeout(giveUpTimer);
      }

      const state = youtubePlayerStateFromMessage(data);
      if (state === null) return;

      if (state === YOUTUBE_PLAYER_ENDED) {
        command("seekTo", [0, true]);
        command("playVideo");
        window.clearTimeout(replayTimer);
        replayTimer = window.setTimeout(fallBackToPlaylistLoop, REPLAY_TIMEOUT_MS);
      } else if (state === YOUTUBE_PLAYER_PLAYING) {
        window.clearTimeout(replayTimer);
        replayTimer = 0;
      }
    };

    // The handshake is what turns on the event stream. It is repeated because
    // the iframe's `load` can beat the player's own bootstrap, and a message
    // sent before then is simply dropped.
    const handshake = () => post({ event: "listening", id: 1, channel: "widget" });
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", handshake);
    handshake();
    handshakeTimer = window.setInterval(handshake, HANDSHAKE_RETRY_MS);
    giveUpTimer = window.setTimeout(() => {
      window.clearInterval(handshakeTimer);
      if (!heard) fallBackToPlaylistLoop();
    }, HANDSHAKE_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", handshake);
      window.clearInterval(handshakeTimer);
      window.clearTimeout(giveUpTimer);
      window.clearTimeout(replayTimer);
    };
  }, [url]);

  return (
    <iframe
      ref={frameRef}
      className="site-builder-bg-media__frame"
      src={url}
      // An empty title plus aria-hidden is the correct pairing for a purely
      // decorative frame: a NAMED frame would be announced as content.
      title=""
      aria-hidden="true"
      tabIndex={-1}
      loading="lazy"
      sandbox={sandbox}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
