/**
 * Messages v5 kit primitives: icon, avatar, button, pill, chip, channel tag.
 * Presentational only; every colour comes from `tokens.css` classes.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { MessagingChannel, RecordKind } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";

/* ---------- icons (stroke, 24 viewBox, same set as the mockup) ---------- */

const ICONS = {
  chat: "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z",
  cal: "M3.5 5h17v15h-17zM3.5 10h17M8 3v4M16 3v4",
  table: "M3.5 5h17v14h-17zM3.5 10h17M9 10v9M15 10v9",
  bag: "M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2",
  briefcase: "M3.5 7h17v13h-17zM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12h17",
  alert: "M12 4l9 16H3zM12 10v4M12 17v.5",
  tag: "M4 4h7l9 9-7 7-9-9zM8 8h.01",
  ticket: "M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM12 6v12",
  users: "M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM3.5 19a5.5 5.5 0 0 1 11 0M15.5 5a3.5 3.5 0 0 1 0 7M20.5 19a5.5 5.5 0 0 0-4-5.3",
  user: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4.5 20a7.5 7.5 0 0 1 15 0",
  send: "M4 12h16M13 5l7 7-7 7",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  globe: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17",
  search: "M17.5 11a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM20 20l-4.2-4.2",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  back: "M14 6l-6 6 6 6",
  chev: "M8 10l4 4 4-4",
  clip: "M20 11.5l-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6",
  mic: "M9 3.5h6v11H9zM6 11.5a6 6 0 0 0 12 0M12 17.5V21",
  check: "M5 12.5l4.5 4.5L19 7.5",
  clock: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM12 7.5V12l3 2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5",
  file: "M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4",
  pkg: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  hand: "M7 11V7a1.5 1.5 0 0 1 3 0v5M10 7V5a1.5 1.5 0 0 1 3 0v7M13 6a1.5 1.5 0 0 1 3 0v6M16 9a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4 13a1.5 1.5 0 0 1 2.5-1.6L8 13",
  x: "M6 6l12 12M18 6L6 18",
  ban: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM6 6l12 12",
  note: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h5",
  id: "M3 5h18v14H3zM11 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM6 16.5a3 3 0 0 1 6 0M14 10h4M14 13.5h4",
  lock: "M5 10h14v10H5zM8 10V7a4 4 0 0 1 8 0v3",
  refresh: "M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M4 17v-4h4M20 7v4h-4",
  mail: "M3.5 5.5h17v13h-17zM3.5 8l8.5 5.5L20.5 8",
  phone: "M6 3.5h3l1.5 4L8.5 9a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4 6.5a2 2 0 0 1 2-3z",
  wa: "M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0zM8 20.5L5 21l1-3M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z",
  store: "M4 9l1.5-4h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-6h4v6",
  layers: "M12 4l8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5",
  play: "M8 5v14l11-7z",
  sparkle: "M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z",
} as const;

export type IconName = keyof typeof ICONS;
export type IconSize = 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 22 | 24;

export function Icon({ name, size = 16, className }: { name: IconName; size?: IconSize; className?: string }) {
  const sizeClass = size === 16 ? "" : ` i-${size}`;
  return (
    <svg className={`i${sizeClass}${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

export const RECORD_ICON: Record<RecordKind, IconName> = {
  order: "bag",
  appointment: "cal",
  reservation: "table",
  class_enrolment: "users",
  tickets: "ticket",
  project: "briefcase",
  offer: "tag",
};

export const CHANNEL_ICON: Record<MessagingChannel, IconName> = {
  web_chat: "globe",
  whatsapp: "wa",
  email: "mail",
  sms: "phone",
  counter: "store",
};

/* ---------- avatar ---------- */

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, size, me, icon }: { name: string | null; size?: "sm" | "lg"; me?: boolean; icon?: IconName }) {
  const sz = size ? ` ${size}` : "";
  if (icon) {
    return (
      <span className={`avatar${sz}`} aria-hidden="true">
        <Icon name={icon} size={size === "lg" ? 18 : 13} />
      </span>
    );
  }
  if (!name) {
    return (
      <span className={`avatar anon${sz}`} aria-hidden="true">
        <Icon name="user" size={size === "sm" ? 11 : 13} />
      </span>
    );
  }
  return (
    <span className={`avatar${sz}${me ? " me" : ""}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ---------- button ---------- */

export type BtnVariant = "default" | "primary" | "secondary" | "danger" | "ghost";
export type BtnSize = "default" | "xs" | "sm" | "lg" | "xl" | "round";

export type BtnProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  readonly variant?: BtnVariant;
  readonly size?: BtnSize;
  /** In flight: the label stays, the control stops taking clicks. */
  readonly busy?: boolean;
  readonly icon?: IconName;
  readonly iconSize?: IconSize;
  readonly fill?: boolean;
  readonly selfStart?: boolean;
  readonly className?: string;
};

export function Btn({ variant = "default", size = "default", busy, icon, iconSize = 13, fill, selfStart, className, children, type = "button", disabled, ...rest }: BtnProps) {
  const classes = [
    "btn",
    variant !== "default" ? variant : "",
    size !== "default" ? size : "",
    busy ? "busy" : "",
    disabled ? "disabled" : "",
    fill ? "fill" : "",
    selfStart ? "self-start" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} disabled={disabled} aria-busy={busy || undefined} aria-disabled={disabled || busy || undefined} {...rest}>
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
    </button>
  );
}

/* ---------- pill + chip ---------- */

export type PillTone = "needs" | "wait" | "done" | "lost" | "opp" | "won" | "rec" | "money" | "due" | "ch" | "off" | "fail" | "new";

export function Pill({ tone, children, light, title }: { tone: PillTone; children: ReactNode; light?: boolean; title?: string }) {
  return (
    <span className={`pill ${tone}${light ? " light" : ""}`} title={title}>
      {children}
    </span>
  );
}

export function Chip({ on, soft, off, children, onClick, ariaLabel }: { on?: boolean; soft?: boolean; off?: boolean; children: ReactNode; onClick?: () => void; ariaLabel?: string }) {
  const cls = `chip${on ? " on" : ""}${soft ? " soft" : ""}${off ? " off" : ""}`;
  if (!onClick) return <span className={cls}>{children}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={on ?? false} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function ChannelTag({ channel, copy, iconOnly }: { channel: MessagingChannel; copy: KitCopy; iconOnly?: boolean }) {
  return (
    <span className="chan" title={copy.channel[channel]}>
      <Icon name={CHANNEL_ICON[channel]} size={12} />
      {iconOnly ? <span className="sr">{copy.channel[channel]}</span> : copy.channel[channel]}
    </span>
  );
}

/** Relative "when" for inbox rows. Short on purpose: 2m, 1h, Yesterday, Tue, Sep 3. */
export function formatWhen(iso: string | null, now: Date, locale = "en"): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMin = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24 && then.getDate() === now.getDate()) return `${diffH}h`;
  const diffDays = Math.round((now.getTime() - then.getTime()) / 86400000);
  if (diffDays < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(then);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(then);
}
