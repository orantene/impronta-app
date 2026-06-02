"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MarketingCopy } from "@/lib/marketing/copy";

/** Signed-in identity, resolved server-side in the shell and passed down. */
export type MarketingAccount = {
  displayName: string;
  email: string;
  /** Absolute URL to the user's dashboard on the app host. */
  dashboardHref: string;
};

/** Initials avatar — the "profile icon" for a signed-in visitor. Falls back
 *  to a person glyph when no usable initials can be derived. */
export function AccountAvatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "lg";
}) {
  const initials =
    name
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") ||
    name[0]?.toUpperCase() ||
    "";
  const dim = size === "lg" ? "h-9 w-9 text-[0.8125rem]" : "h-7 w-7 text-[0.6875rem]";
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ background: "var(--plt-forest)", color: "var(--plt-forest-on)" }}
      aria-hidden
    >
      {initials || <UserGlyph />}
    </span>
  );
}

/** Desktop account control — avatar + name trigger with a dropdown menu. */
export function DesktopAccount({
  account,
  copy,
  signOutAction,
}: {
  account: MarketingAccount;
  copy: MarketingCopy["nav"];
  signOutAction?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-[var(--plt-bg-deep)]"
        style={{
          border: "1px solid var(--plt-hairline-strong)",
          background: "var(--plt-bg-raised)",
        }}
      >
        <AccountAvatar name={account.displayName} />
        <span
          className="max-w-[8.5rem] truncate text-[0.875rem] font-medium leading-none"
          style={{ color: "var(--plt-ink)" }}
        >
          {account.displayName}
        </span>
        <ChevronDownGlyph open={open} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full w-[16.5rem] pt-2 mkt-rise" role="menu">
          <div
            className="overflow-hidden rounded-[18px] p-2"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline-strong)",
              boxShadow:
                "0 28px 64px -28px rgba(15,23,20,0.4), 0 2px 6px -2px rgba(15,23,20,0.08)",
            }}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <AccountAvatar name={account.displayName} size="lg" />
              <div className="min-w-0">
                <p
                  className="truncate text-[0.875rem] font-semibold leading-tight"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {account.displayName}
                </p>
                <p
                  className="truncate text-[0.75rem] leading-tight"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {account.email}
                </p>
              </div>
            </div>
            <div className="my-1 h-px" style={{ background: "var(--plt-hairline)" }} aria-hidden />
            <a
              href={account.dashboardHref}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]"
              style={{ color: "var(--plt-ink)" }}
            >
              <GridGlyph />
              {copy.dashboard}
            </a>
            <Link
              href="/get-started"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <PlusGlyph />
              {copy.newWorkspace}
            </Link>
            {signOutAction ? (
              <>
                <div
                  className="my-1 h-px"
                  style={{ background: "var(--plt-hairline)" }}
                  aria-hidden
                />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    <SignOutGlyph />
                    {copy.signOut}
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChevronDownGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="7"
      viewBox="0 0 10 7"
      fill="none"
      aria-hidden
      className="transition-transform duration-200"
      style={{ transform: open ? "rotate(180deg)" : "none", opacity: 0.7 }}
    >
      <path
        d="M1 1.5L5 5.5L9 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: "var(--plt-forest)" }}
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: "var(--plt-muted)" }}
    >
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SignOutGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: "var(--plt-muted)" }}
    >
      <path
        d="M15 12H4m0 0l4-4m-4 4l4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
