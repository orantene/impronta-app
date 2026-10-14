"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { sessionHintStorage, writePromoCodeHint } from "@/lib/promos/code-hint";
import {
  audienceVisible, countdownBreakdown, pageAllowed, scheduleOpen, scrollPercent,
} from "@/lib/promos/widgets/model";
import { widgetCopy, type WidgetCopy } from "@/lib/promos/widgets/copy";
import type {
  PromoWidgetAudience, PromoWidgetFrequency, PromoWidgetPagesMode, PromoWidgetPopupStyle, PromoWidgetPosition,
  PromoWidgetTone, PromoWidgetVariant, WidgetView,
} from "@/lib/promos/widgets/types";

import {
  browserStorage, cssVarStyle, popupCap, postPromoEvent, readThemeVars, readViewer, safeGet, safeSet, viewOnce,
} from "./promo-widget-client";

export type PromoWidgetIslandProps = {
  nodeId: string;
  variant: PromoWidgetVariant;
  views: readonly WidgetView[];
  locale: string;
  tone: PromoWidgetTone;
  /** Resolved by the server: the talent's words, or "" for the default. */
  ctaLabel: string;
  /** A same-page anchor or a site path (validated by the block). */
  ctaHref: string;
  audience: PromoWidgetAudience;
  startsAt: string;
  endsAt: string;
  /** The promo's timezone: the block's schedule is read in it. */
  tz: string;
  pagesMode: PromoWidgetPagesMode;
  pages: string;
  /** What the site knows about the visitor; null = unknown (treated as a guest). */
  signedIn: boolean | null;
  dismissible: boolean;
  popupStyle: PromoWidgetPopupStyle;
  delaySec: number;
  scrollPct: number;
  exitIntent: boolean;
  frequency: PromoWidgetFrequency;
  position: PromoWidgetPosition;
  /** Editor canvas: draw it in place, no gates, no events, no fixed positioning. */
  preview: boolean;
};

const DISMISS = (nodeId: string) => `tl_pw_dismiss:${nodeId}`;

function go(href: string): void {
  if (href.startsWith("#")) window.location.hash = href.slice(1);
  else window.location.assign(href);
}

function copyText(text: string): void {
  try {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  } catch {
    // Clipboard blocked: the code is still on screen.
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** "Book with this offer": pins a link offer, hands a code over, or just goes to the menu. */
function BookAction({
  view, label, href, copy, solid, preview, onNote,
}: {
  view: WidgetView;
  label: string;
  href: string;
  copy: WidgetCopy;
  solid?: boolean;
  preview: boolean;
  onNote: (note: string) => void;
}) {
  const run = async (): Promise<void> => {
    if (preview) return;
    if (view.unlock === "code" && view.code) {
      // The cookie only unlocks link offers, so a code rides a 30-minute tab hint
      // that the booking sheet applies once (the server still re-checks it);
      // it is also copied as the fallback for a sheet that is not on this page.
      writePromoCodeHint(sessionHintStorage(), view.code, Date.now());
      copyText(view.code);
      onNote(copy.codeCopiedBook(view.code));
      return;
    }
    if (view.unlock === "link") {
      await Promise.race([postPromoEvent(view.id, "link_open"), sleep(1500)]);
      go(href);
    }
  };
  const onClick = (e: ReactMouseEvent<HTMLAnchorElement>): void => {
    // preventDefault must run in this tick: decide it before the async part starts.
    if (preview || view.unlock === "link") e.preventDefault();
    void run();
  };
  const common = { className: "pw-btn", "data-solid": solid ? "" : undefined, "data-pw-book": "", onClick } as const;
  return href.startsWith("/") ? (
    <Link href={href} {...common}>{label}</Link>
  ) : (
    <a href={href} {...common}>{label}</a>
  );
}

function Countdown({ endsAtMs, nowMs, copy }: { endsAtMs: number; nowMs: number; copy: WidgetCopy }) {
  const b = countdownBreakdown(endsAtMs, nowMs);
  if (!b) return null;
  const tiles: Array<[number, string]> = [[b.d, copy.days], [b.h, copy.hours], [b.m, copy.minutes], [b.s, copy.seconds]];
  return (
    <div className="pw-tiles" role="timer" aria-label={copy.endsIn}>
      {tiles.map(([n, unit]) => (
        <div className="pw-tile" key={unit}>
          <b>{String(n).padStart(2, "0")}</b>
          <small>{unit}</small>
        </div>
      ))}
    </div>
  );
}

function endsText(view: WidgetView, nowMs: number, copy: WidgetCopy): string {
  if (!view.countdown || view.endsAtMs === null) return "";
  const b = countdownBreakdown(view.endsAtMs, nowMs);
  if (!b) return "";
  const t = b.d > 0 ? `${b.d}${copy.days} ${b.h}${copy.hours}` : b.h > 0 ? `${b.h}${copy.hours} ${b.m}${copy.minutes}` : `${b.m}${copy.minutes}`;
  return `${copy.endsIn} ${t}`;
}

function RevealCode({ view, copy, preview }: { view: WidgetView; copy: WidgetCopy; preview: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (view.code === null) return <p className="pw-note">{copy.autoApplied}</p>;
  if (!shown) {
    return (
      <button
        type="button"
        className="pw-btn"
        data-solid=""
        data-pw-reveal=""
        onClick={() => {
          setShown(true);
          if (!preview) void postPromoEvent(view.id, "reveal");
        }}
      >
        {copy.showCode}
      </button>
    );
  }
  return (
    <div className="pw-code">
      <span className="pw-code-box" data-pw-code="" aria-label={copy.codeLabel}>{view.code}</span>
      <button
        type="button"
        className="pw-btn"
        onClick={() => {
          copyText(view.code ?? "");
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? copy.copied : copy.copyCode}
      </button>
    </div>
  );
}

export function PromoWidgetIsland(p: PromoWidgetIslandProps): ReactNode {
  const {
    nodeId, variant, views, locale, tone, ctaHref, audience, startsAt, endsAt, tz, pagesMode, pages, signedIn,
    dismissible, popupStyle, delaySec, scrollPct, exitIntent, frequency, position, preview,
  } = p;
  const copy = useMemo(() => widgetCopy(locale), [locale]);
  const ctaLabel = p.ctaLabel.trim() || copy.bookWithOffer;

  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [popOpen, setPopOpen] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [note, setNote] = useState("");
  const [theme, setTheme] = useState<Record<string, string>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Gates run in the browser: audience, schedule and page need the visitor, the clock and the URL.
  useEffect(() => {
    if (preview) {
      setShown(true);
      setNowMs(Date.now());
      return;
    }
    const now = Date.now();
    const local = browserStorage("local");
    const session = browserStorage("session");
    const viewer = readViewer({ local, session }, signedIn);
    const ok =
      audienceVisible(audience, viewer) &&
      scheduleOpen(now, startsAt, endsAt, tz) &&
      pageAllowed(pagesMode, pages, window.location.pathname);
    setNowMs(now);
    setDismissed(safeGet(session, DISMISS(nodeId)) !== null);
    if (rootRef.current) setTheme(readThemeVars(rootRef.current));
    setShown(ok);
  }, [preview, signedIn, audience, startsAt, endsAt, tz, pagesMode, pages, nodeId]);

  const live = useMemo(
    () => views.filter((v) => v.endsAtMs === null || v.endsAtMs > nowMs),
    [views, nowMs],
  );

  const wantsTick = shown && live.some((v) => v.endsAtMs !== null && (variant === "countdown" || v.countdown));
  useEffect(() => {
    if (!wantsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), variant === "countdown" ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [wantsTick, variant]);

  // One `view` per promo per tab. A pop-up counts when it opens, not when it is armed.
  const viewIds = live.map((v) => v.id).join(",");
  useEffect(() => {
    if (preview || !shown || dismissed || viewIds === "") return;
    if (variant === "popup" && !popOpen) return;
    const session = browserStorage("session");
    for (const id of viewIds.split(",")) viewOnce(id, session);
  }, [preview, shown, dismissed, viewIds, variant, popOpen]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    safeSet(browserStorage("session"), DISMISS(nodeId), "1");
  }, [nodeId]);

  const closePop = useCallback(() => setPopOpen(false), []);

  // Pop-up: arm the triggers (delay, scroll depth, exit intent), first one wins, the cap gates it.
  const popupReady = variant === "popup" && shown && !preview && live.length > 0;
  useEffect(() => {
    if (!popupReady) return;
    const cap = popupCap(frequency, nodeId, { local: browserStorage("local"), session: browserStorage("session") });
    if (!cap.allowed(Date.now())) return;
    let fired = false;
    const cleanups: Array<() => void> = [];
    const open = () => {
      if (fired) return;
      fired = true;
      cap.record(Date.now());
      setPopOpen(true);
      for (const c of cleanups) c();
    };
    const noTrigger = delaySec <= 0 && scrollPct <= 0 && !exitIntent;
    if (noTrigger || delaySec > 0) {
      const t = window.setTimeout(open, Math.max(0, delaySec) * 1000);
      cleanups.push(() => window.clearTimeout(t));
    }
    if (scrollPct > 0) {
      const onScroll = () => {
        const el = document.documentElement;
        if (scrollPercent(window.scrollY, el.scrollHeight, window.innerHeight) >= scrollPct) open();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", onScroll));
    }
    if (exitIntent) {
      const onOut = (e: MouseEvent) => {
        if (e.relatedTarget === null && e.clientY <= 0) open();
      };
      document.addEventListener("mouseout", onOut);
      cleanups.push(() => document.removeEventListener("mouseout", onOut));
    }
    return () => {
      for (const c of cleanups) c();
    };
  }, [popupReady, frequency, nodeId, delaySec, scrollPct, exitIntent]);

  // Open modal: focus in, Escape out, Tab stays inside, focus goes back on close.
  const modalOpen = popOpen && popupStyle === "modal" && !preview;
  useEffect(() => {
    if (!modalOpen) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePop();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [modalOpen, closePop]);

  const hidden = !shown || live.length === 0 || (dismissed && !preview);
  const first = live[0];
  const shell = (children: ReactNode) => (
    <div
      ref={rootRef}
      className="pw"
      data-tone={tone}
      data-promo-widget={variant}
      data-state={hidden ? "hidden" : "shown"}
      hidden={hidden}
    >
      {hidden ? null : children}
    </div>
  );

  if (hidden || !first) return shell(null);

  const book = (v: WidgetView, solid?: boolean) => (
    <BookAction view={v} label={ctaLabel} href={ctaHref} copy={copy} solid={solid} preview={preview} onNote={setNote} />
  );
  const noteEl = note ? <p className="pw-note" role="status" data-pw-note="">{note}</p> : null;

  // ── inline variants ──────────────────────────────────────────────────
  if (variant === "banner") {
    const ends = endsText(first, nowMs, copy);
    return shell(
      <div className="pw-surface pw-banner" role="region" aria-label={copy.regionLabel}>
        <div className="pw-banner-main">
          <p className="pw-h">{first.headline}</p>
          {first.body ? <p className="pw-meta">{first.body}</p> : null}
          {ends ? <p className="pw-meta">{ends}</p> : null}
          {book(first, true)}
          {noteEl}
        </div>
        {dismissible ? (
          <button type="button" className="pw-x" aria-label={copy.close} onClick={dismiss}>×</button>
        ) : null}
      </div>,
    );
  }

  if (variant === "cards") {
    return shell(
      <div className="pw-cards" role="list">
        {live.map((v) => {
          const ends = endsText(v, nowMs, copy);
          return (
            <div className="pw-surface pw-card" role="listitem" key={v.id}>
              <span className="pw-offer">{v.offer}</span>
              <p className="pw-h">{v.headline}</p>
              {v.body ? <p className="pw-p">{v.body}</p> : null}
              {ends ? <p className="pw-meta">{ends}</p> : null}
              {v.leftLabel ? <p className="pw-meta">{v.leftLabel}</p> : null}
              {book(v, true)}
            </div>
          );
        })}
        {noteEl}
      </div>,
    );
  }

  if (variant === "reveal") {
    return shell(
      <div className="pw-surface pw-reveal" role="region" aria-label={copy.regionLabel}>
        <span className="pw-offer">{first.offer}</span>
        <p className="pw-h">{first.headline}</p>
        {first.body ? <p className="pw-p">{first.body}</p> : null}
        <RevealCode view={first} copy={copy} preview={preview} />
        {book(first)}
        {noteEl}
      </div>,
    );
  }

  if (variant === "countdown") {
    return shell(
      <div className="pw-surface pw-count" role="region" aria-label={copy.regionLabel}>
        <span className="pw-offer">{first.offer}</span>
        <p className="pw-h">{first.headline}</p>
        {first.body ? <p className="pw-p">{first.body}</p> : null}
        {first.endsAtMs !== null ? <Countdown endsAtMs={first.endsAtMs} nowMs={nowMs} copy={copy} /> : null}
        {first.leftLabel ? <p className="pw-meta">{first.leftLabel}</p> : null}
        {book(first, true)}
        {noteEl}
      </div>,
    );
  }

  if (variant === "book") {
    return shell(
      <div className="pw-book" data-tone={tone}>
        {book(first, true)}
        {noteEl}
      </div>,
    );
  }

  // ── fixed variants: portalled so no transformed ancestor can pin them ──
  const portal = (node: ReactNode) =>
    preview || typeof document === "undefined"
      ? node
      : createPortal(
          <div className="pw" data-tone={tone} style={cssVarStyle(theme)}>
            {node}
          </div>,
          document.body,
        );
  const fixedClass = preview ? "pw-fixed pw-static" : "pw-fixed pw-in";

  if (variant === "sticky") {
    return shell(
      portal(
        <div className={fixedClass} data-pos={position} data-promo-widget-fixed="sticky">
          <div className="pw-stack">
            {note ? <p className="pw-surface pw-bubble" role="status" data-pw-note="">{note}</p> : null}
            <div className="pw-surface pw-sticky" role="region" aria-label={copy.regionLabel}>
              <BookAction view={first} label={p.ctaLabel.trim() || first.headline} href={ctaHref} copy={copy} preview={preview} onNote={setNote} />
              {dismissible ? <button type="button" className="pw-x" aria-label={copy.close} onClick={dismiss}>×</button> : null}
            </div>
          </div>
        </div>,
      ),
    );
  }

  // popup
  const card = (
    <div
      className="pw-surface pw-pop pw-in"
      ref={dialogRef}
      tabIndex={-1}
      role={popupStyle === "modal" && !preview ? "dialog" : "region"}
      aria-modal={popupStyle === "modal" && !preview ? true : undefined}
      aria-label={first.headline}
    >
      <div className="pw-pop-top">
        <span className="pw-offer">{first.offer}</span>
        {!preview ? <button type="button" className="pw-x" aria-label={copy.close} onClick={closePop}>×</button> : null}
      </div>
      <p className="pw-h">{first.headline}</p>
      {first.body ? <p className="pw-p">{first.body}</p> : null}
      {first.code !== null ? <RevealCode view={first} copy={copy} preview={preview} /> : null}
      {book(first, true)}
      {noteEl}
    </div>
  );
  if (preview) return shell(<div className="pw-fixed pw-static" data-pos={position}>{card}</div>);
  if (!popOpen) return shell(null);
  return shell(
    portal(
      popupStyle === "modal" ? (
        <div className="pw-scrim" data-promo-widget-fixed="popup" onClick={(e) => { if (e.target === e.currentTarget) closePop(); }}>
          {card}
        </div>
      ) : (
        <div className="pw-fixed" data-pos={position} data-promo-widget-fixed="slide">
          {card}
        </div>
      ),
    ),
  );
}
