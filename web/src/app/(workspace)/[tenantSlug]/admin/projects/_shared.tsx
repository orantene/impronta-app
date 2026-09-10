/**
 * Shared presentation for the Projects surface.
 *
 * Server-renderable, no state. Everything here is markup plus a translated
 * string; every judgement it displays was made by `lib/projects/project-record`
 * before it got here.
 *
 * NO COLOUR LITERALS. Tone comes from the admin token classes
 * (`text-muted-foreground`, `border-border`, `bg-card`, `text-destructive`) so
 * this surface follows the workspace theme rather than pinning its own greys.
 */

import * as React from "react";
import Link from "next/link";

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-7 sm:py-10">{children}</main>;
}

export function PageHeading({
  title,
  intro,
  back,
}: {
  title: string;
  intro?: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-7">
      {back ? (
        <Link
          href={back.href}
          className="mb-2 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          {back.label}
        </Link>
      ) : null}
      <h1 className="m-0 text-2xl font-semibold text-foreground sm:text-[26px]">{title}</h1>
      {intro ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{intro}</p> : null}
    </header>
  );
}

/**
 * A refusal, an outage or an absence, said in a sentence.
 *
 * The failure this exists to prevent: a read that came back `ok: false`
 * rendering as an empty list, so a workspace with forty projects reads "none
 * yet". Every non-answer on this surface goes through here.
 */
export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === "warn"
          ? "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          : "rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      }
    >
      {children}
    </p>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`.trim()}
    >
      {title ? (
        <h2 className="m-0 mb-3 text-base font-semibold text-foreground">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}

/** A figure with its own label. `note` carries a value's caveat, never a colour. */
export function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-1 text-lg font-semibold text-foreground">{value}</dd>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Chip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded-full border border-foreground/25 bg-foreground/[0.06] px-3 py-1 text-xs font-medium text-foreground"
          : "inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

/** An ISO instant as a plain calendar date. */
export function isoDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

/** Short, stable handle for a uuid: what an operator reads off a screen. */
export function shortId(value: string): string {
  return value.slice(0, 8);
}
