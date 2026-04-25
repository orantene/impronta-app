"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * SetupKitCard — large gallery card used by the Theme & foundations setup
 * page (and any future kit/preset pickers). Visual contract:
 *
 *   - 16:10 visual area at the top with a CSS gradient (no images
 *     required) that captures the kit's mood.
 *   - Footer pad with eyebrow (kit family) + title (kit name) + meta line
 *     ("Warm · Wedding · 9 starter pages").
 *   - When `inUse` is true, the card pops with an amber inner border and
 *     "In use" badge in place of the demo CTA.
 *   - Click target is the whole card when `onClick` is provided, OR the
 *     "View demo →" link when `demoHref` is provided. The two paths are
 *     mutually exclusive.
 *
 * No tooltips, no shadows-on-hover gimmicks — quiet luxury, low chrome.
 */
export interface SetupKitCardProps {
  eyebrow: string;
  title: string;
  meta: string;
  /** Background CSS for the visual area. Use a gradient, image url, etc. */
  visual: string;
  /** When true, renders as the active selection (amber accent). */
  inUse?: boolean;
  /**
   * "View demo" link target. When `inUse` is true, the link is hidden and
   * an "In use" pill takes its place — the kit is already applied.
   */
  demoHref?: string;
  /**
   * Whole-card click handler (mutually exclusive with `demoHref`). Use
   * this to trigger an action like "apply this preset".
   */
  onClick?: () => void;
  /** Optional sub-text below the title for richer cards. */
  children?: ReactNode;
}

export function SetupKitCard({
  eyebrow,
  title,
  meta,
  visual,
  inUse,
  demoHref,
  onClick,
  children,
}: SetupKitCardProps) {
  const Wrapper: React.ElementType = onClick ? "button" : "div";
  const wrapperProps = onClick
    ? { type: "button" as const, onClick }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "group relative flex flex-col overflow-hidden rounded-[14px] text-left transition-[box-shadow,transform,border-color] duration-150",
        onClick ? "cursor-pointer" : "",
        inUse
          ? "ring-[2px] ring-[#c9a227] ring-offset-2 ring-offset-[#f7f5ee]"
          : "ring-1 ring-[rgba(20,20,24,0.08)] hover:ring-[rgba(20,20,24,0.18)]",
        "bg-white shadow-[0_1px_0_rgba(20,20,24,0.04),0_8px_22px_-18px_rgba(20,20,24,0.18)] hover:-translate-y-px hover:shadow-[0_10px_30px_-18px_rgba(20,20,24,0.30)]",
      ].join(" ")}
    >
      <div
        className="relative aspect-[16/10] w-full"
        style={{ background: visual }}
        aria-hidden
      >
        <div className="absolute inset-x-4 bottom-3">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            {eyebrow}
            {inUse ? (
              <span style={{ color: "#fff" }}>{" · CURRENT"}</span>
            ) : null}
          </p>
          <p
            className="mt-1.5 text-[20px] font-semibold leading-[1.1] tracking-[-0.005em]"
            style={{
              color: "#fff",
              textShadow: "0 1px 2px rgba(0,0,0,0.18)",
            }}
          >
            {title}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-[12px] text-muted-foreground">
          {meta}
        </p>
        {inUse ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{
              backgroundColor: "rgba(201,162,39,0.14)",
              color: "#7a5d12",
            }}
          >
            <Check className="size-2.5" strokeWidth={3} aria-hidden />
            In use
          </span>
        ) : demoHref ? (
          <Link
            href={demoHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-foreground/90 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            View demo
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : (
          <span className="text-[12px] font-medium text-foreground/70 transition-colors group-hover:text-foreground">
            Apply →
          </span>
        )}
      </div>
      {children ? (
        <div className="border-t border-[rgba(20,20,24,0.06)] px-4 py-3 text-[12px] text-muted-foreground">
          {children}
        </div>
      ) : null}
    </Wrapper>
  );
}
