"use client";

// Shared message-thread UI used by all three shells (client, admin, talent):
//   • firstHttpUrl       — pull the first http(s) URL out of a message body
//   • LinkPreview        — lazy, SSRF-guarded unfurl card (Agent 3's unfurlLink)
//   • TypingRow          — "X is typing…" presence row
//
// Colors are passed in by the caller so each shell keeps its own palette
// (client = blue on white; admin/talent = the shell token constants). This
// component lives OUTSIDE components/admin/shell so its inline styles are not
// part of that surface's eslint-suppression budget.

import React, { useEffect, useRef, useState } from "react";
import { unfurlLink } from "@/lib/messages/unfurl";
import type { LinkUnfurl } from "@/lib/messages/unfurl-types";
import type { TypingUser } from "@/lib/realtime/presence";

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/;

/** First http(s) URL in a body, or null. Mirrors the markdown auto-link regex. */
export function firstHttpUrl(body: string | null | undefined): string | null {
  if (!body) return null;
  const m = URL_RE.exec(body);
  return m ? m[0] : null;
}

// ── Per-render-list cache so the same URL is only fetched once across all the
//    bubbles currently mounted. Module-level WeakMap-ish: a plain Map keyed by
//    URL holding the in-flight promise. Survives re-renders; cheap + bounded by
//    distinct URLs seen this session.
const unfurlCache = new Map<string, Promise<LinkUnfurl>>();

function getUnfurl(url: string): Promise<LinkUnfurl> {
  let p = unfurlCache.get(url);
  if (!p) {
    p = unfurlLink(url).catch(() => ({ ok: false, url }) as LinkUnfurl);
    unfurlCache.set(url, p);
  }
  return p;
}

export type LinkPreviewColors = {
  /** Card background. */
  bg: string;
  /** Card border color. */
  border: string;
  /** Title text color. */
  title: string;
  /** Secondary (site name / description) text color. */
  muted: string;
};

/**
 * Compact link-preview card rendered below a bubble. Fetches lazily on mount,
 * renders nothing while pending or when the unfurl failed.
 */
export function LinkPreview({ url, colors }: { url: string; colors: LinkPreviewColors }) {
  const [data, setData] = useState<LinkUnfurl | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    getUnfurl(url).then((res) => {
      if (active && mounted.current) setData(res);
    });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [url]);

  if (!data || !data.ok) return null;
  const title = data.title?.trim();
  const desc = data.description?.trim();
  const site = data.siteName?.trim();
  if (!title && !desc && !site) return null;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer noopener"
      style={{
        display: "flex",
        gap: 10,
        marginTop: 6,
        maxWidth: 320,
        textDecoration: "none",
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        overflow: "hidden",
        background: colors.bg,
      }}
    >
      {data.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          width={64}
          height={64}
          style={{ width: 64, height: 64, objectFit: "cover", flexShrink: 0 }}
          loading="lazy"
        />
      ) : null}
      <div style={{ minWidth: 0, padding: "8px 10px", flex: 1 }}>
        {site ? (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: colors.muted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {site}
          </div>
        ) : null}
        {title ? (
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: colors.title,
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </div>
        ) : null}
        {desc ? (
          <div
            style={{
              fontSize: 11,
              color: colors.muted,
              marginTop: 2,
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {desc}
          </div>
        ) : null}
      </div>
    </a>
  );
}

/**
 * Subtle "typing…" row between the message list and the composer. Renders
 * nothing when no one is typing.
 */
export function TypingRow({ users, color }: { users: TypingUser[]; color: string }) {
  if (users.length === 0) return null;
  const label =
    users.length === 1
      ? `${users[0]!.name} is typing…`
      : users.length === 2
        ? `${users[0]!.name} and ${users[1]!.name} are typing…`
        : "Several people are typing…";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 14px 4px",
        fontSize: 11,
        color,
        fontStyle: "italic",
      }}
      aria-live="polite"
    >
      <TypingDots color={color} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  );
}

function TypingDots({ color }: { color: string }) {
  // Static three-dot glyph — no @keyframes dependency on globals.css. The
  // staggered opacities read as an ellipsis "in progress" cue.
  return (
    <span style={{ display: "inline-flex", gap: 2 }} aria-hidden>
      <Dot color={color} opacity={0.9} />
      <Dot color={color} opacity={0.6} />
      <Dot color={color} opacity={0.35} />
    </span>
  );
}

function Dot({ color, opacity }: { color: string; opacity: number }) {
  return (
    <span
      style={{
        width: 4,
        height: 4,
        borderRadius: "50%",
        background: color,
        opacity,
      }}
    />
  );
}
